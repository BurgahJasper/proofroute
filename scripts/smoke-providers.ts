import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../apps/server/src/paths.ts';
import { loadConfig } from '../apps/server/src/env.ts';
import { lookupPublishedJob } from '../apps/server/src/greenhouse.ts';
import { SMOKE_SCHEMA, chatComplete, extractJsonObject } from '../apps/server/src/inference.ts';

const config = loadConfig();
const report: Record<string, unknown> = {
  ranAt: new Date().toISOString(),
  provider: config.inferenceProvider,
  model: config.model || null,
  baseUrl: config.inferenceProvider === 'brev_nim' ? config.nimBaseUrl : config.nvidiaBaseUrl,
  checks: {} as Record<string, unknown>,
};

function record(name: string, result: Record<string, unknown>) {
  (report.checks as Record<string, unknown>)[name] = result;
  console.log(`${name}: ${String(result.status)} ${result.latencyMs ?? ''} ${result.detail ?? ''}`.trim());
}

const greenhouseStarted = Date.now();
const listing = await lookupPublishedJob({
  root: repoRoot,
  token: 'figma',
  jobId: '6143238004',
  mode: 'live',
  refresh: true,
  timeoutMs: config.externalTimeoutMs,
});
record('published_job', {
  status: listing.found ? 'pass' : 'fail',
  latencyMs: Date.now() - greenhouseStarted,
  title: listing.job?.title ?? null,
  jobId: listing.job?.id ?? null,
  url: listing.job?.approvedUrl ?? null,
  detail: listing.error ?? (listing.found ? 'employer-linked listing retrieved' : 'listing was not found'),
});

if (!config.providerConfigured) {
  for (const name of ['text', 'structured', 'tool_round_trip']) {
    record(name, { status: 'blocked', detail: config.providerBlocker });
  }
  const out = path.join(repoRoot, 'eval', 'provider-smoke.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  console.log('Hosted NVIDIA inference is not configured.');
  console.log(`Set NVIDIA_API_KEY in ${path.join(repoRoot, '.env')}.`);
  if (!config.model || config.model === 'REPLACE_WITH_TESTED_MODEL_ID') {
    console.log(`Set NEMOTRON_MODEL in the same file. The documented candidate is nvidia/nemotron-3.5-super-vl-120b-a12b.`);
  }
  console.log('Do not paste the key into chat.');
  process.exit(2);
}

const textStarted = Date.now();
const text = await chatComplete(
  config,
  [
    { role: 'system', content: 'Reply with one short sentence.' },
    { role: 'user', content: 'Say hello from ProofRoute smoke test.' },
  ],
  { maxTokens: 80 },
);
record('text', {
  status: text.httpStatus === 200 && text.content ? 'pass' : 'fail',
  latencyMs: text.latencyMs || Date.now() - textStarted,
  httpStatus: text.httpStatus,
  detail: text.error || text.content.slice(0, 180),
});

const structuredStarted = Date.now();
const structured = await chatComplete(
  config,
  [
    { role: 'system', content: 'Return only JSON matching the schema.' },
    { role: 'user', content: 'Set ok to true and token to proofroute-schema.' },
  ],
  { jsonSchema: SMOKE_SCHEMA, schemaName: 'smoke', maxTokens: 80 },
);
let structuredPass = false;
let structuredDetail = structured.error || structured.content.slice(0, 180);
try {
  const parsed = extractJsonObject(structured.content) as { ok?: boolean; token?: string };
  structuredPass = structured.httpStatus === 200 && parsed.ok === true && parsed.token === 'proofroute-schema';
  structuredDetail = structuredPass ? 'schema matched' : structuredDetail;
} catch (error) {
  structuredDetail = error instanceof Error ? error.message : structuredDetail;
}
record('structured', {
  status: structuredPass ? 'pass' : 'fail',
  latencyMs: structured.latencyMs || Date.now() - structuredStarted,
  httpStatus: structured.httpStatus,
  detail: structuredDetail,
});

const toolStarted = Date.now();
const first = await chatComplete(
  config,
  [
    { role: 'system', content: 'You must call local_echo exactly once.' },
    { role: 'user', content: 'Call local_echo with token ping-proofroute.' },
  ],
  {
    maxTokens: 120,
    toolChoice: 'required',
    tools: [
      {
        type: 'function',
        function: {
          name: 'local_echo',
          description: 'Return the supplied token unchanged. Harmless local stub.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: { token: { type: 'string' } },
            required: ['token'],
          },
        },
      },
    ],
  },
);
const call = first.toolCalls.find((item) => item.name === 'local_echo');
let echoed = '';
try {
  echoed = String((JSON.parse(call?.arguments || '{}') as { token?: string }).token || '');
} catch {
  echoed = '';
}
const stub = echoed === 'ping-proofroute' ? { echo: 'ping-proofroute' } : { echo: echoed || 'missing' };
const second = call
  ? await chatComplete(
      config,
      [
        { role: 'system', content: 'Reply with the tool result only.' },
        { role: 'user', content: 'Call local_echo with token ping-proofroute.' },
        { role: 'assistant', content: '', tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }] },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(stub) },
      ],
      { maxTokens: 80 },
    )
  : null;
const toolPass = Boolean(call && stub.echo === 'ping-proofroute' && second && second.httpStatus === 200 && second.content.includes('ping-proofroute'));
record('tool_round_trip', {
  status: toolPass ? 'pass' : 'fail',
  latencyMs: (first.latencyMs || 0) + (second?.latencyMs || 0) || Date.now() - toolStarted,
  httpStatus: second?.httpStatus ?? first.httpStatus,
  detail: toolPass ? 'local_echo returned ping-proofroute' : first.error || second?.error || first.content.slice(0, 180) || 'tool call was not returned',
});

writeFileSync(path.join(repoRoot, 'eval', 'provider-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
const failed = Object.values(report.checks as Record<string, { status: string }>).some((item) => item.status === 'fail');
process.exit(failed ? 1 : 0);
