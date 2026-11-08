import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectRisks } from '@proofroute/contracts';
import { collectRequests, conversationText, rankCandidates, validateCandidateDecision, validateRequests } from '../src/conversation.js';
import { buildApp } from '../src/app.js';
import { clearGreenhouseCache } from '../src/greenhouse.js';
import { resetLimits } from '../src/limits.js';

const quote = 'Keep 200 and transfer the remainder to our supplier.';
const request = { messageVersion: 2, category: 'payment', quote, actor: 'Sender', action: 'Transfer the remaining funds', asset: 'Money', destination: 'Supplier named by sender' };
const messages = [{ version: 1, reviewed_text: 'We will send funds for your workstation.' }, { version: 2, reviewed_text: quote }, { version: 3, reviewed_text: 'Thanks, understood.' }];

test('cross-message requests require real quotes in the named message and survive later replies', () => {
  const risks = collectRequests(messages, [request]);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].messageVersion, 2);
  assert.equal(conversationText(messages).slice(risks[0].start, risks[0].end), quote);
  assert.equal(collectRequests(messages, [], risks)[0].messageVersion, 2);
  assert.equal(validateRequests([{ ...request, messageVersion: 1 }], messages).length, 0);
  assert.equal(validateRequests([{ ...request, quote: 'Invented evidence' }], messages).length, 0);
  assert.equal(validateRequests([{ ...request, category: 'safe' }], messages).length, 0);
  const mislabeled = validateRequests([{ ...request, category: 'sensitive_identifier', asset: 'funds' }], messages);
  assert.equal(mislabeled[0].category, 'payment');
  assert.equal(mislabeled[0].label, 'payment');
  const documents = [{ version: 1, reviewed_text: 'Transfer the source code to the repository.' }];
  assert.equal(validateRequests([{ ...request, messageVersion: 1, quote: documents[0].reviewed_text, category: 'sensitive_identifier', asset: 'source code' }], documents)[0].category, 'sensitive_identifier', 'do not infer money from transfer alone');
});

test('protective warnings are distinct from requests, including mixed instructions', () => {
  for (const warning of ['Never share your login code with anyone.', 'Reminder: Never share your login code with anyone.', 'Do not send your password.', 'We will never ask for a processing fee.']) assert.equal(detectRisks(warning).length, 0, warning);
  for (const risky of ['Never share your login code, but send it to me.', 'Never share your login code. Send your login code to me.', 'Never share your login code and transfer the equipment fee.', 'Never share your login code — send it to me.']) assert.ok(detectRisks(risky).length, risky);
  const risks = collectRequests([{ version: 1, reviewed_text: 'Send your login code.' }, { version: 2, reviewed_text: 'Thanks.' }], []);
  assert.equal(risks[0].messageVersion, 1);
});

test('candidate selection rejects invented IDs and ambiguity, ranking includes late board entries', () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({ jobId: String(10000 + i), title: i === 39 ? 'Software Engineer Intern Summer 2027' : 'Account Manager', url: 'https://boards.greenhouse.io/figma' }));
  const ranked = rankCandidates(candidates, 'Software Engineer Intern');
  assert.equal(ranked[0].jobId, '10039');
  assert.equal(validateCandidateDecision({ jobId: '99999', ambiguous: false, reason: 'Fits' }, ranked), null);
  assert.equal(validateCandidateDecision({ jobId: '10039', ambiguous: true, reason: 'Two fit' }, ranked), null);
  assert.equal(validateCandidateDecision({ jobId: '10039', ambiguous: false, reason: 'Fits' }, ranked)?.jobId, '10039');
});

test('HTTP workflow uses history, retains semantic warnings on model failure, exports history, and branches after board results', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proofroute-conversation-'));
  const { app } = await buildApp({ silent: true, config: { databasePath: path.join(dir, 'test.sqlite'), sessionSecret: 'conversation-test-secret-at-least-32-chars', providerConfigured: true, nvidiaBaseUrl: 'https://model.invalid/v1', model: 'mock-nemotron', nvidiaApiKey: '', inferenceProvider: 'nvidia_hosted' } });
  const original = globalThis.fetch;
  const calls: string[] = [];
  const prompts: string[] = [];
  let failModel = false;
  let ambiguous = false;
  clearGreenhouseCache();
  globalThis.fetch = (async (url, init) => {
    const target = String(url);
    if (target.includes('model.invalid')) {
      if (failModel) return new Response('unavailable', { status: 503 });
      const body = JSON.parse(String(init?.body));
      const name = body.response_format.json_schema.name as string;
      const prompt = JSON.stringify(body.messages);
      calls.push(name); prompts.push(prompt);
      const value = name === 'proofroute_extraction'
        ? { roleTitle: 'Software Engineer Intern', jobId: '', senderDomain: '', requestedActionQuotes: [], requests: prompt.includes('Keep 200') ? [request] : [], toolCalls: [], reasons: [] }
        : name === 'proofroute_candidate'
          ? { jobId: ambiguous ? '' : '6143238004', ambiguous, reason: 'Title and season match.' }
          : { reasons: [], unresolvedQuestions: [], senderAuthenticated: false };
      return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
    }
    if (target.includes('boards-api.greenhouse.io')) {
      const job = { id: 6143238004, title: 'Software Engineer Intern', location: { name: 'San Francisco' }, absolute_url: 'https://boards.greenhouse.io/figma/jobs/6143238004', content: 'Public internship description.' };
      const list = target.endsWith('/jobs');
      calls.push(list ? 'board-list' : 'board-detail');
      return Response.json(list ? { jobs: [job] } : job);
    }
    throw new Error(`Unexpected network call ${target}`);
  }) as typeof fetch;
  t.after(async () => { globalThis.fetch = original; await app.close(); rmSync(dir, { recursive: true, force: true }); });
  resetLimits();
  const session = await app.inject({ method: 'POST', url: '/api/session' });
  const headers = { cookie: String(session.headers['set-cookie']).split(';')[0], 'x-csrf-token': session.json().csrfToken };
  const create = await app.inject({ method: 'POST', url: '/api/cases', headers: { ...headers, 'idempotency-key': 'conversation-create' }, payload: { reviewedText: 'Software Engineer Intern. We will send funds for your workstation.', employerId: 'figma', inputMode: 'synthetic', sourcePreference: 'live', syntheticAttestation: true } });
  assert.equal(create.statusCode, 201);
  const id = create.json().caseId;
  let runNumber = 0;
  async function run(caseId = id) {
    resetLimits();
    const start = await app.inject({ method: 'POST', url: `/api/cases/${caseId}/runs`, headers: { ...headers, 'idempotency-key': `conversation-run-${++runNumber}` }, payload: {} });
    assert.equal(start.statusCode, 202);
    for (let i = 0; i < 100; i++) {
      const response = await app.inject({ url: `/api/cases/${caseId}`, headers });
      const snapshot = response.json();
      if (snapshot.assessment && !['queued', 'running'].includes(snapshot.run.status)) return snapshot;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('No completed assessment');
  }
  const first = await run();
  assert.equal(first.assessment.matchedBy, 'model');
  assert.equal(first.assessment.findings.find((f: { claimKey: string }) => f.claimKey === 'listing').status, 'supported');
  assert.ok(calls.indexOf('board-list') < calls.indexOf('proofroute_candidate'));
  assert.ok(calls.indexOf('proofroute_candidate') < calls.indexOf('board-detail'));
  for (const [version, text] of [[1, quote], [2, 'Thanks, understood.']] as const) {
    const appended = await app.inject({ method: 'POST', url: `/api/cases/${id}/messages`, headers, payload: { reviewedText: text, expectedVersion: version, syntheticAttestation: true } });
    assert.equal(appended.statusCode, 201);
    if (version === 2) failModel = true;
    const current = await run();
    assert.equal(current.assessment.recommendedAction, 'pause_sensitive_action');
    assert.equal(current.assessment.conversation.firstSensitiveVersion, 2);
    assert.equal(current.assessment.conversation.messageCount, version + 1);
    assert.equal(current.assessment.matchedBy, 'model');
    assert.equal(current.assessment.findings.find((f: { claimKey: string }) => f.claimKey === 'listing').status, 'supported');
    assert.equal(current.assessment.findings.find((f: { claimKey: string }) => f.claimKey === 'sender').status, 'unresolved');
  }
  assert.ok(prompts.some(p => p.includes('send funds') && p.includes('Keep 200')));
  const exported = await app.inject({ url: `/api/cases/${id}/export?format=md`, headers });
  assert.match(exported.body, /Message 1/); assert.match(exported.body, /Message 3/); assert.match(exported.body, /First sensitive request: 2/);
  const other = await app.inject({ method: 'POST', url: '/api/session' });
  assert.equal((await app.inject({ url: `/api/cases/${id}`, headers: { cookie: String(other.headers['set-cookie']).split(';')[0] } })).statusCode, 404);
  failModel = false; ambiguous = true; calls.length = 0; clearGreenhouseCache(); resetLimits();
  const second = await app.inject({ method: 'POST', url: '/api/cases', headers: { ...headers, 'idempotency-key': 'ambiguous-create' }, payload: { reviewedText: 'Software Engineer Intern opportunity.', employerId: 'figma', inputMode: 'synthetic', sourcePreference: 'live', syntheticAttestation: true } });
  const unresolved = await run(second.json().caseId);
  assert.equal(unresolved.assessment.candidateChoices.length, 1);
  assert.equal(calls.includes('board-detail'), false);
  assert.equal(unresolved.assessment.findings.find((f: { claimKey: string }) => f.claimKey === 'listing').status, 'unresolved');
  resetLimits();
  const choice = await app.inject({ method: 'POST', url: `/api/cases/${second.json().caseId}/runs`, headers: { ...headers, 'idempotency-key': 'choose-candidate' }, payload: { jobId: '6143238004' } });
  assert.equal(choice.statusCode, 202);
  const pending = (await app.inject({ url: `/api/cases/${second.json().caseId}`, headers })).json();
  assert.equal(pending.run.id, choice.json().runId, 'same-version rechecks must expose the new run');
  for (let i = 0; i < 100; i++) {
    const chosen = (await app.inject({ url: `/api/cases/${second.json().caseId}`, headers })).json();
    if (chosen.assessment) { assert.equal(chosen.assessment.matchedBy, 'reference'); assert.equal(chosen.assessment.candidateChoices.length, 0); break; }
    assert.ok(i < 99, 'chosen role did not finish');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
});
