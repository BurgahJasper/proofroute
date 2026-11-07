import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface PolicyFile {
  ranAt?: string;
  policyVersion?: string;
  catalogVersion?: string;
  commit?: string;
  freezeMatches?: boolean;
  harmfulPause?: string;
  benignUnnecessaryPause?: string;
  senderAuthenticated?: number;
  results?: Array<{ pass?: boolean; id?: string; expectedAction?: string; actualAction?: string }>;
}

interface LiveFile {
  ranAt?: string;
  model?: string | null;
  provider?: string;
  decisionAccuracy?: string;
  harmfulPause?: string;
  benignUnnecessaryPause?: string;
  senderUnresolved?: string;
  senderAuthenticatedByProduct?: number;
  modelSaidSenderAuthenticated?: number;
  modelCalls?: number;
  modelCallFailures?: number;
  latencyMs?: { total?: number; mean?: number; p50?: number; p95?: number };
  failures?: Array<{ id: string; code: string; expectedAction?: string; actualAction?: string }>;
  results?: Array<{ latencyMs?: number }>;
}

interface BaselineFile {
  ranAt?: string;
  model?: string | null;
  provider?: string;
  actionAccuracy?: string;
  harmfulPause?: string;
  benignUnnecessaryPause?: string;
  senderAuthenticated?: number;
  inventedUrlCount?: number;
  unsuccessful?: number;
  latencyMs?: { total?: number; mean?: number; p50?: number; p95?: number };
  failures?: Array<{ id: string; code?: string; expectedAction?: string; actualAction?: string }>;
  results?: Array<{ latencyMs?: number }>;
}

function slowest(rows: Array<{ latencyMs?: number }> | undefined): number | null {
  const values = (rows ?? []).map((row) => row.latencyMs).filter((value): value is number => typeof value === 'number');
  return values.length ? Math.max(...values) : null;
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').trim().split(/\r?\n/).pop();
  if (!text) return null;
  return JSON.parse(text) as T;
}

export function writeEvaluationSummary(root: string): void {
  const policy = readJson<PolicyFile>(path.join(root, 'eval', 'results.jsonl'));
  const live = readJson<LiveFile>(path.join(root, 'eval', 'live-results.jsonl'));
  const baseline = readJson<BaselineFile>(path.join(root, 'eval', 'baseline-results.jsonl'));
  const policyRows = policy?.results ?? [];
  const policyPass = policyRows.filter((item) => item.pass).length;
  const policyFailures = policyRows.filter((item) => item.pass === false);

  const liveSection = live
    ? `Measured ${live.ranAt}. Provider ${live.provider}. Model \`${live.model}\`.

Retrieval is the live Greenhouse board for planned job lookups, plus the reviewed catalog. Nemotron proposes checks. The evidence policy chooses the action. Decision accuracy includes pause, independent verification, and official-route labels. It is not a binary scam-detection score. A model timeout or invalid response is an API failure, stays in the 24-case denominator, and is counted apart from a recommendation mismatch. This run has ${live.modelCallFailures} failed model calls.

| Measure | Measured |
|---|---|
| Decision accuracy (action, sender unresolved, listing support) | ${live.decisionAccuracy} |
| Harmful cases paused | ${live.harmfulPause} |
| Benign cases given an unnecessary pause | ${live.benignUnnecessaryPause} |
| Sender left unresolved by the product | ${live.senderUnresolved} |
| Product rows that marked the sender authenticated | ${live.senderAuthenticatedByProduct} |
| Rows where the model itself said the sender was authenticated | ${live.modelSaidSenderAuthenticated} |
| Model calls | ${live.modelCalls} |
| Model calls that failed | ${live.modelCallFailures} |
| Latency mean / p50 / p95 | ${live.latencyMs?.mean} ms / ${live.latencyMs?.p50} ms / ${live.latencyMs?.p95} ms |
| Total wall time | ${live.latencyMs?.total} ms |
| Slowest case | ${slowest(live.results) ?? 'n/a'} ms |

${live.failures?.length ? `Failures:\n\n${live.failures.map((item) => `- ${item.id} ${item.code}: expected ${item.expectedAction ?? 'n/a'}, got ${item.actualAction ?? 'unsuccessful'}`).join('\n')}` : 'No live decision row failed the frozen labels.'}`
    : 'Not run. npm run eval:live writes eval/live-results.jsonl.';

  const baselineSection = baseline
    ? `Measured ${baseline.ranAt}. Provider ${baseline.provider}. Model \`${baseline.model}\`.

Team-created prompt in eval/baseline-prompt.txt. T-Mobile supplied no baseline. The baseline receives the reviewed message and the employer name. It does not receive tools, the catalog, or job-board results. An invalid response counts as unsuccessful and stays in the denominator. Action match compares recommendation labels. It is not a scam-detection rate. Official-route mismatches are listed separately from API failures. This run has ${baseline.unsuccessful} unsuccessful responses and ${baseline.failures?.length ?? 0} recommendation mismatches.

| Measure | Measured |
|---|---|
| Action match against the same labels | ${baseline.actionAccuracy} |
| Harmful cases paused | ${baseline.harmfulPause} |
| Benign cases given an unnecessary pause | ${baseline.benignUnnecessaryPause} |
| Responses that marked the sender authenticated | ${baseline.senderAuthenticated} |
| Responses that included an http URL | ${baseline.inventedUrlCount} |
| Unsuccessful model responses | ${baseline.unsuccessful} |
| Latency mean / p50 / p95 | ${baseline.latencyMs?.mean} ms / ${baseline.latencyMs?.p50} ms / ${baseline.latencyMs?.p95} ms |
| Total wall time | ${baseline.latencyMs?.total} ms |
| Slowest case | ${slowest(baseline.results) ?? 'n/a'} ms |

${baseline.failures?.length && baseline.failures.every((item) => item.expectedAction === 'use_official_route' && item.actualAction === 'verify_independently') ? 'The recommendation mismatches expected use_official_route and returned verify_independently. That is official-route resolution without a job board, not a scam-detection false negative. No row in this list is an API failure.\n\n' : ''}${baseline.failures?.length ? `Recommendation mismatches:\n\n${baseline.failures.map((item) => `- ${item.id} ${item.code ?? 'mismatch'}: expected ${item.expectedAction ?? 'n/a'}, got ${item.actualAction ?? 'unsuccessful'}`).join('\n')}` : 'Every prompt-only row matched its labeled action.'}`
    : 'Not run. npm run eval:baseline writes eval/baseline-results.jsonl.';

  const doc = `# Evaluation summary

Three measurements share the frozen 24-case file and stay in separate result files. They are not one blended accuracy number.

## Policy on scripted observations

${policy ? `Measured ${policy.ranAt}. Policy ${policy.policyVersion}. Catalog ${policy.catalogVersion}. Commit ${policy.commit}.` : 'Not run.'}

| Measure | Measured | Target |
|---|---|---|
| Sender authenticated by listing or domain evidence | ${policy?.senderAuthenticated ?? 'not run'} | 0 |
| Harmful cases paused | ${policy?.harmfulPause ?? 'not run'} | at least 7/8 |
| Benign cases given an unnecessary pause | ${policy?.benignUnnecessaryPause ?? 'not run'} | at most 1/8 |
| Held-out rows matching their scripted expectation | ${policy ? `${policyPass}/24` : 'not run'} | report the count |

Freeze hash ${policy?.freezeMatches ? 'matches' : policy ? 'does not match' : 'was not checked against'} the current held-out file.

${policyFailures.length ? `Failures:\n\n${policyFailures.map((item) => `- ${item.id} expected ${item.expectedAction}, got ${item.actualAction}`).join('\n')}` : policy ? 'No scripted expectation failed.' : ''}

\`npm run eval:heldout\` does not call Nemotron or Greenhouse. Volunteer task study: not run. See \`eval/user-tasks.csv\`.

## Live Nemotron product path

${liveSection}

## Prompt-only Nemotron baseline

${baselineSection}

These counts are a 24-case synthetic gate. They are not a real-world scam-detection rate.
`;
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs', 'evaluation-summary.md'), doc);
}
