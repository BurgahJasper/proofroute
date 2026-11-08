import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildApp } from '../apps/server/src/app.js';
import { resetLimits } from '../apps/server/src/limits.js';

// Separate smoke evidence; never overwrites the frozen evaluation artifacts.
const { app, config } = await buildApp({ silent: true, config: { databasePath: `./data/live-conversation-${Date.now()}.sqlite`, production: false } });
assert.ok(config.providerConfigured, 'Configure a Nemotron provider before running this live check.');
const results: Array<Record<string, unknown>> = [];
try {
  const session = await app.inject({ method: 'POST', url: '/api/session' });
  const headers = { cookie: String(session.headers['set-cookie']).split(';')[0], 'x-csrf-token': session.json().csrfToken };
  let sequence = 0;
  async function create(text: string) {
    const response = await app.inject({ method: 'POST', url: '/api/cases', headers: { ...headers, 'idempotency-key': `live-conversation-create-${++sequence}` }, payload: { reviewedText: text, employerId: 'figma', inputMode: 'synthetic', sourcePreference: 'live', syntheticAttestation: true } });
    assert.equal(response.statusCode, 201, response.body);
    return response.json().caseId as string;
  }
  async function run(id: string, label: string) {
    resetLimits();
    const started = Date.now();
    const response = await app.inject({ method: 'POST', url: `/api/cases/${id}/runs`, headers: { ...headers, 'idempotency-key': `live-conversation-run-${++sequence}` }, payload: {} });
    assert.equal(response.statusCode, 202, response.body);
    for (let i = 0; i < 240; i++) {
      const snapshot = (await app.inject({ url: `/api/cases/${id}`, headers })).json();
      if (snapshot.assessment && !['queued', 'running'].includes(snapshot.run?.status)) {
        const a = snapshot.assessment;
        results.push({ label, durationMs: Date.now() - started, status: a.status, analysisMode: a.analysisMode, action: a.recommendedAction, firstSensitiveVersion: a.conversation?.firstSensitiveVersion, requests: a.conversation?.requests, matchedBy: a.matchedBy, candidateCount: a.candidateChoices?.length, listing: a.findings.find((f: { claimKey: string }) => f.claimKey === 'listing'), tools: snapshot.events.filter((e: { type: string }) => e.type.startsWith('tool.')) });
        console.log(JSON.stringify({ label, status: a.status, action: a.recommendedAction, firstSensitiveVersion: a.conversation?.firstSensitiveVersion, matchedBy: a.matchedBy }));
        assert.equal(a.analysisMode, 'nemotron');
        assert.equal(a.status, 'complete');
        return a;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Live run exceeded polling deadline');
  }
  const id = await create('Synthetic recruiting conversation: I am contacting you about the Software Engineer Intern (Summer 2027) role at Figma in San Francisco. We will send funds for your workstation.');
  const first = await run(id, 'Role lookup without a requisition');
  assert.equal(first.matchedBy, 'model');
  assert.equal(first.findings.find((f: { claimKey: string }) => f.claimKey === 'listing').status, 'supported');
  for (const [expectedVersion, text] of [[1, 'Keep 200 and transfer the remainder to our supplier.'], [2, 'Thanks, understood.']] as const) {
    const added = await app.inject({ method: 'POST', url: `/api/cases/${id}/messages`, headers, payload: { reviewedText: text, expectedVersion, syntheticAttestation: true } });
    assert.equal(added.statusCode, 201, added.body);
    const a = await run(id, expectedVersion === 1 ? 'Indirect transfer request' : 'Harmless reply retains pause');
    assert.equal(a.recommendedAction, 'pause_sensitive_action');
    assert.equal(a.conversation.firstSensitiveVersion, 2);
    assert.ok(a.conversation.requests.some((request: { category: string; messageVersion: number }) => request.messageVersion === 2 && request.category === 'payment'));
  }
  const warning = await create('Synthetic message: Never share your login code with anyone. You may read the Software Engineer Intern (Summer 2027) listing in San Francisco on the Figma careers site.');
  const benign = await run(warning, 'Protective warning');
  assert.notEqual(benign.recommendedAction, 'pause_sensitive_action');
  assert.equal(benign.conversation.firstSensitiveVersion, null);
} finally {
  mkdirSync('verification', { recursive: true });
  writeFileSync('verification/conversation-live.json', JSON.stringify({ measuredAt: new Date().toISOString(), model: config.model, kind: 'Four synthetic smoke steps, not a benchmark or accuracy estimate', results }, null, 2));
  await app.close();
}
