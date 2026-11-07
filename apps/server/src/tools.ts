import { getDomain } from 'tldts';
import type { DomainObservation, SourceMode } from '@proofroute/contracts';

export const TOOL_NAMES = [
  'resolveEmployer',
  'listPublishedJobs',
  'getPublishedJob',
  'getApprovedRecruitingPage',
  'compareClaimedDomain',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface PlannedTool {
  tool: ToolName;
  purpose: string;
  proposedBy: 'model' | 'server';
  jobId?: string;
  domain?: string;
}

export interface ToolContext {
  employerId?: string;
  userJobId?: string;
  extractedDomain?: string;
}

const EXTERNAL = new Set<ToolName>(['listPublishedJobs', 'getPublishedJob']);

export function isExternalTool(tool: ToolName): boolean {
  return EXTERNAL.has(tool);
}

export function validateToolPlan(
  calls: Array<{ tool?: string; purpose?: string; jobId?: string; domain?: string }>,
  ctx: ToolContext,
): { accepted: PlannedTool[]; rejected: Array<{ tool: string; reason: string }> } {
  const accepted: PlannedTool[] = [];
  const rejected: Array<{ tool: string; reason: string }> = [];
  for (const call of calls) {
    const tool = call.tool ?? '';
    if (!TOOL_NAMES.includes(tool as ToolName)) {
      rejected.push({ tool, reason: 'Tool is not allowlisted.' });
      continue;
    }
    const name = tool as ToolName;
    if (!ctx.employerId && name !== 'compareClaimedDomain') {
      rejected.push({ tool: name, reason: 'No reviewed employer was confirmed.' });
      continue;
    }
    let jobId = call.jobId?.trim() || undefined;
    if (jobId && !/^\d{5,20}$/.test(jobId)) {
      rejected.push({ tool: name, reason: 'Job ID was not a board identifier.' });
      continue;
    }
    if (ctx.userJobId && jobId && jobId !== ctx.userJobId) {
      rejected.push({ tool: name, reason: 'Job ID did not match the confirmed reference.' });
      continue;
    }
    if (name === 'getPublishedJob') jobId = ctx.userJobId || jobId;
    let domain = call.domain?.trim().toLowerCase() || undefined;
    if (name === 'compareClaimedDomain') {
      if (!ctx.extractedDomain || (domain && domain !== ctx.extractedDomain)) {
        rejected.push({ tool: name, reason: 'Domain was not present in the reviewed text.' });
        continue;
      }
      domain = ctx.extractedDomain;
    }
    accepted.push({
      tool: name,
      purpose: (call.purpose || 'Check an approved source.').slice(0, 180),
      proposedBy: 'model',
      jobId,
      domain,
    });
  }
  return { accepted, rejected };
}

export function defaultPlan(ctx: ToolContext): PlannedTool[] {
  const plan: PlannedTool[] = [];
  if (ctx.employerId) {
    plan.push({ tool: 'resolveEmployer', purpose: 'Read the reviewed employer catalog entry.', proposedBy: 'server' });
    plan.push({
      tool: 'getApprovedRecruitingPage',
      purpose: 'Read the reviewed careers-page snapshot.',
      proposedBy: 'server',
    });
    if (ctx.userJobId) {
      plan.push({
        tool: 'getPublishedJob',
        purpose: 'Look up the confirmed job ID on the employer-linked board.',
        proposedBy: 'server',
        jobId: ctx.userJobId,
      });
    } else {
      plan.push({
        tool: 'listPublishedJobs',
        purpose: 'List published jobs because no exact job ID was confirmed.',
        proposedBy: 'server',
      });
    }
  }
  if (ctx.extractedDomain) {
    plan.push({
      tool: 'compareClaimedDomain',
      purpose: 'Compare the pasted address domain with the catalog domain.',
      proposedBy: 'server',
      domain: ctx.extractedDomain,
    });
  }
  return plan;
}

export function mergePlans(modelPlan: PlannedTool[], serverPlan: PlannedTool[]): PlannedTool[] {
  const merged: PlannedTool[] = [];
  const seen = new Set<string>();
  for (const call of [...modelPlan, ...serverPlan]) {
    const key = `${call.tool}:${call.jobId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(call);
  }
  return merged;
}

export function compareDomains(domain: string | undefined, known: string[], mode: SourceMode): DomainObservation {
  if (!domain) {
    return {
      mode,
      knownDomains: known,
      registrableMatch: false,
      note: 'No sender domain was available in the reviewed text.',
    };
  }
  const submitted = getDomain(domain);
  const knownRegs = known.map((item) => getDomain(item)).filter((item): item is string => Boolean(item));
  const registrableMatch = Boolean(submitted && knownRegs.includes(submitted));
  return {
    mode,
    submittedDomain: domain,
    knownDomains: known,
    registrableMatch,
    note: registrableMatch
      ? `The domain string ${domain} shares a registrable domain with the catalog (${known.join(', ')}). This is not authenticated email.`
      : `The domain string ${domain} does not share a registrable domain with ${known.join(', ') || 'the catalog'}. A mismatch is not proof of fraud.`,
  };
}
