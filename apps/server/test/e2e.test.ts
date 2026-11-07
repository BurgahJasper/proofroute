import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { resetLimits } from '../src/limits.js';

const secret = 'test-secret-test-secret-test-secret-test';
const scenario = JSON.parse(readFileSync(path.resolve('data/scenarios/real-listing.json'), 'utf8')) as {
  text: string;
  followUpText: string;
  employerId: string;
  jobId: string;
};

async function boot(databasePath: string, runDeadlineMs = 45_000) {
  const built = await buildApp({
    silent: true,
    config: { databasePath, sessionSecret: secret, demoMode: true, runDeadlineMs, providerConfigured: false },
  });
  const url = await built.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...built, url };
}

async function openSession(url: string) {
  const response = await fetch(`${url}/api/session`, { method: 'POST' });
  const body = (await response.json()) as { csrfToken: string };
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, csrf: body.csrfToken };
}

async function createCase(url: string, session: { cookie: string; csrf: string }, input: Record<string, unknown>, key: string) {
  const response = await fetch(`${url}/api/cases`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      'idempotency-key': key,
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { caseId?: string; error?: { code: string } };
  return { status: response.status, body };
}

async function startRun(url: string, session: { cookie: string; csrf: string }, caseId: string, key: string) {
  const response = await fetch(`${url}/api/cases/${caseId}/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
      'idempotency-key': key,
    },
    body: '{}',
  });
  return { status: response.status, body: (await response.json()) as { runId?: string; error?: { message: string } } };
}

async function snapshot(url: string, session: { cookie: string; csrf: string }, caseId: string) {
  const response = await fetch(`${url}/api/cases/${caseId}`, { headers: { cookie: session.cookie } });
  const body = (await response.json()) as {
    run: { status: string; errorCode: string | null; analysisMode: string | null } | null;
    assessment: null | {
      recommendedAction: string;
      headline: string;
      sourceMode: string;
      analysisMode: string;
      findings: Array<{ claimKey: string; status: string; explanation: string }>;
      approvedRoute: { url: string; label: string } | null;
      verificationContactAvailable: boolean;
      changeSummary: { actionChanged: boolean; headline: string } | null;
    };
    version: { reviewedText: string; version: number };
    evidence: Array<{ scope: string; sourceMode: string; sourceUrl?: string }>;
  };
  return { status: response.status, body };
}

async function waitFor(url: string, session: { cookie: string; csrf: string }, caseId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await snapshot(url, session, caseId);
    if (current.body.run && !['queued', 'running'].includes(current.body.run.status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('run did not finish');
}

test('fixture journey, follow-up, export, and session boundary', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proofroute-'));
  const databasePath = path.join(dir, 'app.sqlite');
  const running = await boot(databasePath);
  t.after(async () => {
    await running.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  resetLimits();
  const health = await fetch(`${running.url}/healthz`);
  assert.equal((await health.json() as { ok: boolean }).ok, true);

  const session = await openSession(running.url);
  const other = await openSession(running.url);
  const originalFetch = globalThis.fetch;
  let greenhouseCalls = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const target = String(args[0]);
    if (target.includes('greenhouse')) greenhouseCalls += 1;
    return originalFetch(...args);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const created = await createCase(
    running.url,
    session,
    {
      reviewedText: `${scenario.text}\npassword is hunter2`,
      employerId: scenario.employerId,
      roleReference: scenario.jobId,
      inputMode: 'synthetic',
      scenarioId: 'scn-real-listing',
      sourcePreference: 'fixture',
      syntheticAttestation: true,
    },
    'case-fixture-1',
  );
  assert.equal(created.status, 201);
  const caseId = created.body.caseId || '';
  const repeat = await createCase(running.url, session, { reviewedText: 'ignored', employerId: 'figma', inputMode: 'synthetic', syntheticAttestation: true }, 'case-fixture-1');
  assert.equal(repeat.body.caseId, caseId);

  const blocked = await createCase(
    running.url,
    session,
    {
      reviewedText: scenario.text,
      employerId: 'figma',
      roleReference: 'http://127.0.0.1/latest',
      inputMode: 'synthetic',
      syntheticAttestation: true,
    },
    'case-blocked-url',
  );
  assert.equal(blocked.status, 400);

  assert.equal((await startRun(running.url, session, caseId, 'run-fixture-1')).status, 202);
  const first = await waitFor(running.url, session, caseId);
  assert.equal(greenhouseCalls, 0);
  assert.equal(first.body.assessment?.recommendedAction, 'use_official_route');
  assert.equal(first.body.assessment?.findings.find((finding) => finding.claimKey === 'listing')?.status, 'supported');
  assert.equal(first.body.assessment?.findings.find((finding) => finding.claimKey === 'sender')?.status, 'unresolved');
  assert.equal(first.body.assessment?.sourceMode, 'fixture');
  assert.equal(first.body.assessment?.analysisMode, 'policy_only');
  assert.match(first.body.assessment?.approvedRoute?.url || '', /boards\.greenhouse\.io\/figma\/jobs\/6143238004/);
  assert.equal(first.body.assessment?.verificationContactAvailable, false);
  assert.equal(first.body.version.reviewedText.includes('hunter2'), false);
  assert.equal(JSON.stringify(first.body).toLowerCase().includes('sender is authenticated'), false);

  const denied = await fetch(`${running.url}/api/cases/${caseId}`, { headers: { cookie: other.cookie } });
  assert.equal(denied.status, 404);
  const deniedExport = await fetch(`${running.url}/api/cases/${caseId}/export?format=json`, { headers: { cookie: other.cookie } });
  assert.equal(deniedExport.status, 404);

  const conflict = await fetch(`${running.url}/api/cases/${caseId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf },
    body: JSON.stringify({ reviewedText: scenario.followUpText, expectedVersion: 9, syntheticAttestation: true }),
  });
  assert.equal(conflict.status, 409);

  resetLimits();
  const appended = await fetch(`${running.url}/api/cases/${caseId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf },
    body: JSON.stringify({ reviewedText: scenario.followUpText, expectedVersion: 1, syntheticAttestation: true }),
  });
  assert.equal(appended.status, 201);
  assert.equal((await startRun(running.url, session, caseId, 'run-fixture-2')).status, 202);
  const second = await waitFor(running.url, session, caseId);
  assert.equal(second.body.version.version, 2);
  assert.equal(second.body.assessment?.recommendedAction, 'pause_sensitive_action');
  assert.equal(second.body.assessment?.findings.find((finding) => finding.claimKey === 'listing')?.status, 'supported');
  assert.equal(second.body.assessment?.findings.find((finding) => finding.claimKey === 'sender')?.status, 'unresolved');
  assert.equal(second.body.assessment?.changeSummary?.actionChanged, true);
  assert.match(second.body.assessment?.headline || '', /payment/i);

  const markdown = await fetch(`${running.url}/api/cases/${caseId}/export?format=md`, { headers: { cookie: session.cookie } });
  const md = await markdown.text();
  assert.equal(markdown.headers.get('cache-control'), 'no-store');
  assert.match(md, /Pause this payment request/);
  assert.match(md, /FIXTURE|fixture/);
  assert.equal(md.includes('hunter2'), false);
  const jsonExport = await fetch(`${running.url}/api/cases/${caseId}/export?format=json`, { headers: { cookie: session.cookie } });
  const record = await jsonExport.text();
  assert.equal(record.includes('hunter2'), false);

  const removed = await fetch(`${running.url}/api/cases/${caseId}`, {
    method: 'DELETE',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
  });
  assert.equal(removed.status, 204);
  assert.equal((await fetch(`${running.url}/api/cases/${caseId}`, { headers: { cookie: session.cookie } })).status, 404);
});

test('live board lookup keeps the sender unresolved', { timeout: 30_000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proofroute-live-'));
  const running = await boot(path.join(dir, 'live.sqlite'));
  t.after(async () => {
    await running.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  resetLimits();
  const session = await openSession(running.url);
  const created = await createCase(
    running.url,
    session,
    {
      reviewedText: scenario.text,
      employerId: 'figma',
      roleReference: 'https://boards.greenhouse.io/figma/jobs/6143238004?gh_jid=6143238004',
      inputMode: 'synthetic',
      sourcePreference: 'live',
      syntheticAttestation: true,
    },
    'case-live-1',
  );
  assert.equal(created.status, 201);
  assert.equal((await startRun(running.url, session, created.body.caseId || '', 'run-live-1')).status, 202);
  const result = await waitFor(running.url, session, created.body.caseId || '');
  assert.equal(result.body.run?.analysisMode, 'policy_only');
  assert.equal(result.body.assessment?.sourceMode, 'live');
  assert.equal(result.body.assessment?.findings.find((finding) => finding.claimKey === 'listing')?.status, 'supported');
  assert.equal(result.body.assessment?.findings.find((finding) => finding.claimKey === 'sender')?.status, 'unresolved');
  assert.equal(result.body.assessment?.recommendedAction, 'use_official_route');
  assert.match(result.body.assessment?.approvedRoute?.url || '', /^https:\/\/boards\.greenhouse\.io\/figma\/jobs\/6143238004/);
  assert.equal(result.body.evidence.some((item) => item.scope === 'listing' && item.sourceMode === 'live'), true);
});

test('an expired deadline does not invent a listing', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proofroute-deadline-'));
  const running = await boot(path.join(dir, 'deadline.sqlite'), -1);
  t.after(async () => {
    await running.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  resetLimits();
  const session = await openSession(running.url);
  const created = await createCase(
    running.url,
    session,
    {
      reviewedText: scenario.text,
      employerId: 'figma',
      roleReference: scenario.jobId,
      inputMode: 'synthetic',
      sourcePreference: 'live',
      syntheticAttestation: true,
    },
    'case-deadline',
  );
  assert.equal((await startRun(running.url, session, created.body.caseId || '', 'run-deadline')).status, 202);
  const result = await waitFor(running.url, session, created.body.caseId || '');
  assert.equal(result.body.run?.status, 'partial');
  assert.equal(result.body.run?.errorCode, 'RUN_EXPIRED');
  assert.equal(result.body.assessment?.findings.find((finding) => finding.claimKey === 'listing')?.status, 'unresolved');
  assert.equal(result.body.assessment?.findings.find((finding) => finding.claimKey === 'sender')?.status, 'unresolved');
});

test('restart marks an abandoned run interrupted', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proofroute-restart-'));
  const databasePath = path.join(dir, 'restart.sqlite');
  const first = await boot(databasePath);
  const session = await openSession(first.url);
  const created = await createCase(
    first.url,
    session,
    {
      reviewedText: 'Synthetic note about a role.',
      employerId: 'figma',
      inputMode: 'synthetic',
      sourcePreference: 'fixture',
      syntheticAttestation: true,
    },
    'case-restart',
  );
  const caseId = created.body.caseId || '';
  first.store.run(
    `INSERT INTO runs (id, case_id, version, status, started_at) VALUES ('run-abandoned', ?, 1, 'running', ?)`,
    caseId,
    new Date().toISOString(),
  );
  await first.app.close();
  const second = await boot(databasePath);
  t.after(async () => {
    await second.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const row = second.store.get<{ status: string; error_code: string }>('SELECT status, error_code FROM runs WHERE id = ?', 'run-abandoned');
  assert.equal(row?.status, 'interrupted');
  assert.equal(row?.error_code, 'INTERRUPTED');
});
