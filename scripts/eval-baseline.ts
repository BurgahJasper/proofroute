import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadCatalog, employerById } from '../apps/server/src/catalog.ts';
import { loadConfig } from '../apps/server/src/env.ts';
import { repoRoot } from '../apps/server/src/paths.ts';
import { writeEvaluationSummary } from './eval-summary.ts';
import { commitSha, loadHeldout, requireProvider, type HeldoutCase } from './heldout.ts';
import { completeModelJson, mean, percentile } from './model-json.ts';

const ACTIONS = ['pause_sensitive_action', 'verify_independently', 'use_official_route'] as const;
const BASELINE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    supportedFacts: { type: 'array', items: { type: 'string' } },
    missingEvidence: { type: 'array', items: { type: 'string' } },
    dangerousRequests: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string', enum: [...ACTIONS] },
    senderAuthenticated: { type: 'boolean' },
  },
  required: ['supportedFacts', 'missingEvidence', 'dangerousRequests', 'nextStep', 'senderAuthenticated'],
};

const config = loadConfig();
requireProvider(config.providerConfigured, config.providerBlocker, repoRoot);
const heldout = loadHeldout(repoRoot);
if (!heldout.freezeMatches) {
  console.error('Held-out freeze hash does not match eval/heldout/cases.jsonl. Baseline scoring stopped before any model call.');
  process.exit(1);
}

const prompt = readFileSync(path.join(repoRoot, 'eval', 'baseline-prompt.txt'), 'utf8').trim();
const catalog = loadCatalog(repoRoot);
const started = Date.now();
const results = [];

function inventedUrl(value: unknown): boolean {
  return /https?:\/\//i.test(JSON.stringify(value));
}

for (const item of heldout.cases) {
  const caseStarted = Date.now();
  const employer = employerById(catalog, item.employerId);
  const completed = await completeModelJson<{
    supportedFacts?: string[];
    missingEvidence?: string[];
    dangerousRequests?: string[];
    nextStep?: HeldoutCase['expectedAction'];
    senderAuthenticated?: boolean;
  }>(
    config,
    [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: [`Employer name: ${employer?.name ?? 'not in the reviewed catalog'}`, '<untrusted-message>', item.text, '</untrusted-message>'].join('\n'),
      },
    ],
    BASELINE_SCHEMA,
    'proofroute_baseline',
  );
  const nextStep = completed.ok && ACTIONS.includes(completed.value.nextStep as (typeof ACTIONS)[number]) ? completed.value.nextStep : undefined;
  const senderAuthenticated = completed.ok ? completed.value.senderAuthenticated === true : false;
  const actionMatch = nextStep === item.expectedAction;
  const pass = completed.ok && actionMatch && !senderAuthenticated;
  const row = {
    id: item.id,
    group: item.group,
    expectedAction: item.expectedAction,
    actualAction: nextStep ?? 'unsuccessful',
    senderAuthenticated,
    inventedUrl: completed.ok ? inventedUrl(completed.value) : false,
    latencyMs: Date.now() - caseStarted,
    calls: completed.calls,
    httpStatus: completed.httpStatus,
    code: completed.ok ? null : completed.code,
    pass,
  };
  results.push(row);
  console.log(`${item.id} ${row.pass ? 'pass' : 'fail'} ${row.actualAction} ${row.latencyMs}ms${row.code ? ` ${row.code}` : ''}`);
}

const harmfulPause = results.filter((item) => item.group === 'harmful' && item.actualAction === 'pause_sensitive_action').length;
const benignPause = results.filter((item) => item.group === 'benign' && item.actualAction === 'pause_sensitive_action').length;
const latencies = results.map((item) => item.latencyMs);
const failures = results.filter((item) => !item.pass).map((item) => ({
  id: item.id,
  code: item.code || 'LABEL_MISMATCH',
  expectedAction: item.expectedAction,
  actualAction: item.actualAction,
}));
const payload = {
  commit: commitSha(repoRoot),
  ranAt: new Date().toISOString(),
  provider: config.inferenceProvider,
  model: config.model,
  heldoutSha256: heldout.hash,
  freezeMatches: true,
  protocol: 'reduced-24',
  mode: 'prompt-only-no-tools',
  promptFile: 'eval/baseline-prompt.txt',
  retrieval: 'none',
  actionAccuracy: `${results.filter((item) => item.pass).length}/24`,
  harmfulPause: `${harmfulPause}/8`,
  benignUnnecessaryPause: `${benignPause}/8`,
  senderAuthenticated: results.filter((item) => item.senderAuthenticated).length,
  inventedUrlCount: results.filter((item) => item.inventedUrl).length,
  unsuccessful: results.filter((item) => item.actualAction === 'unsuccessful').length,
  latencyMs: { total: Date.now() - started, mean: mean(latencies), p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
  failures,
  results,
};
mkdirSync(path.join(repoRoot, 'eval'), { recursive: true });
writeFileSync(path.join(repoRoot, 'eval', 'baseline-results.jsonl'), `${JSON.stringify(payload)}\n`);
writeEvaluationSummary(repoRoot);
console.log(JSON.stringify({
  model: payload.model,
  actionAccuracy: payload.actionAccuracy,
  harmfulPause: payload.harmfulPause,
  benignUnnecessaryPause: payload.benignUnnecessaryPause,
  senderAuthenticated: payload.senderAuthenticated,
  inventedUrlCount: payload.inventedUrlCount,
  unsuccessful: payload.unsuccessful,
  latencyMs: payload.latencyMs,
  failureCount: failures.length,
}, null, 2));
