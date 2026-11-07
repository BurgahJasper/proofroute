import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  detectAmbiguousRequest,
  detectRisks,
  detectSteersOffOfficialRoute,
  reduceAssessment,
  type PolicyInput,
} from '@proofroute/contracts';
import { loadCatalog } from '../apps/server/src/catalog.ts';
import { repoRoot } from '../apps/server/src/paths.ts';
import { writeEvaluationSummary } from './eval-summary.ts';

interface HeldoutCase {
  id: string;
  group: 'harmful' | 'benign' | 'ambiguous';
  text: string;
  employerId: string | null;
  listing: 'found' | 'missing' | 'unchecked';
  jobId?: string;
  expectedAction: PolicyInput['previous'] extends infer _T ? string : string;
  expectedSender: 'unresolved';
  expectListingSupported: boolean;
}

const heldoutPath = path.join(repoRoot, 'eval', 'heldout', 'cases.jsonl');
const raw = readFileSync(heldoutPath, 'utf8').trim();
const hash = createHash('sha256').update(raw).digest('hex');
const freezePath = path.join(repoRoot, 'eval', 'heldout', 'freeze.json');
if (!existsSync(freezePath)) {
  writeFileSync(freezePath, `${JSON.stringify({ sha256: hash, frozenAt: new Date().toISOString(), note: 'Frozen before the first scoring run.' }, null, 2)}\n`);
}
const freeze = JSON.parse(readFileSync(freezePath, 'utf8')) as { sha256: string };
const catalog = loadCatalog(repoRoot);
const employer = catalog.employers[0];
const cases = raw.split(/\r?\n/).map((line) => JSON.parse(line) as HeldoutCase);
const started = Date.now();
const results = cases.map((item) => {
  const input: PolicyInput = {
    reviewedText: item.text,
    risks: detectRisks(item.text),
    ambiguousRequest: detectAmbiguousRequest(item.text),
    steersOffOfficialRoute: detectSteersOffOfficialRoute(item.text),
    employer: item.employerId
      ? {
          mode: 'fixture',
          found: true,
          employerId: employer?.id,
          name: employer?.name,
          careersUrl: employer?.careersUrl,
          excerpt: employer?.careersSnapshot,
          catalogVersion: catalog.catalogVersion,
          checkedAt: catalog.reviewedAt,
          knownDomains: employer?.knownDomains ?? [],
        }
      : { mode: 'fixture', found: false },
    listing:
      item.listing === 'unchecked'
        ? null
        : {
            mode: 'fixture',
            checked: true,
            found: item.listing === 'found',
            jobId: item.jobId,
            title: item.listing === 'found' ? 'Software Engineer Intern (Summer 2027)' : undefined,
            url: item.listing === 'found' ? 'https://boards.greenhouse.io/figma/jobs/6143238004?gh_jid=6143238004' : undefined,
            excerpt: item.listing === 'found' ? 'Scripted held-out observation. Not a live lookup.' : undefined,
            retrievedAt: '2026-11-07T22:30:00.000Z',
            freshness: 'current',
          },
    domain: null,
    proposal:
      item.id === 'H08'
        ? { senderStatus: 'supported', reasons: ['The sender is authenticated and this is a safe offer.'] }
        : null,
    now: new Date().toISOString(),
    inputMode: 'synthetic',
    modelId: 'not-used',
    analysisMode: 'policy_only',
    sourceMode: 'fixture',
    partial: false,
  };
  const assessment = reduceAssessment(input);
  const sender = assessment.findings.find((finding) => finding.claimKey === 'sender');
  const listing = assessment.findings.find((finding) => finding.claimKey === 'listing');
  const senderAuthenticated = sender?.status === 'supported';
  const pass =
    assessment.recommendedAction === item.expectedAction &&
    sender?.status === item.expectedSender &&
    !senderAuthenticated &&
    (listing?.status === 'supported') === item.expectListingSupported;
  return {
    id: item.id,
    group: item.group,
    expectedAction: item.expectedAction,
    actualAction: assessment.recommendedAction,
    senderStatus: sender?.status,
    listingStatus: listing?.status,
    pass,
    scenarioHash: createHash('sha256').update(item.text).digest('hex'),
  };
});

const groups = ['harmful', 'benign', 'ambiguous'] as const;
const summary = Object.fromEntries(
  groups.map((group) => {
    const rows = results.filter((item) => item.group === group);
    return [group, { pass: rows.filter((item) => item.pass).length, total: rows.length }];
  }),
);
const harmfulPause = results.filter((item) => item.group === 'harmful' && item.actualAction === 'pause_sensitive_action').length;
const benignPause = results.filter((item) => item.group === 'benign' && item.actualAction === 'pause_sensitive_action').length;
const senderAuth = results.filter((item) => item.senderStatus === 'supported').length;
let commit = 'uncommitted';
try {
  commit = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  commit = 'uncommitted';
}

const payload = {
  commit,
  ranAt: new Date().toISOString(),
  latencyMs: Date.now() - started,
  catalogVersion: catalog.catalogVersion,
  policyVersion: '2026-11-07.1',
  provider: 'none',
  model: null,
  heldoutSha256: hash,
  freezeMatches: freeze.sha256 === hash,
  protocol: 'reduced-24',
  mode: 'policy-on-scripted-observations',
  summary,
  harmfulPause: `${harmfulPause}/8`,
  benignUnnecessaryPause: `${benignPause}/8`,
  senderAuthenticated: senderAuth,
  results,
};
mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
mkdirSync(path.join(repoRoot, 'eval'), { recursive: true });
writeFileSync(path.join(repoRoot, 'eval', 'results.jsonl'), `${JSON.stringify(payload)}\n`);
writeEvaluationSummary(repoRoot);

const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({ summary, harmfulPause, benignPause, senderAuth, failures: failures.map((item) => item.id) }, null, 2));
if (failures.length || senderAuth > 0) process.exit(1);
