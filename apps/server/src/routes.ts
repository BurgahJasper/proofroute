import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  appendMessageBody,
  createCaseBody,
  createRunBody,
  normalizeRoleReference,
  redactText,
  type ErrorCode,
} from '@proofroute/contracts';
import type { CatalogFile, ScenarioRecord } from './catalog.js';
import { employerById } from './catalog.js';
import { renderBriefMarkdown } from './brief.js';
import type { Store } from './db.js';
import type { AppConfig } from './env.js';
import { newId, tokensMatch } from './ids.js';
import { hashToken } from './ids.js';
import { tryAcquire } from './limits.js';
import { abortRun, enqueueRun, executeRun, markRefresh, releaseRunSlot } from './runner.js';

interface Deps {
  store: Store;
  config: AppConfig;
  catalog: CatalogFile;
  scenarios: ScenarioRecord[];
  root: string;
}

interface SessionRow {
  id_hash: string;
  csrf_token: string;
  expires_at: string;
}

function fail(reply: FastifyReply, status: number, code: ErrorCode, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

function notFound(reply: FastifyReply) {
  return fail(reply, 404, 'NOT_FOUND', 'Not found.');
}

function zodFailure(error: ZodError): { code: ErrorCode; message: string } {
  const attestation = error.issues.some((issue) => issue.path.includes('syntheticAttestation'));
  if (attestation) {
    return { code: 'DEMO_ATTESTATION', message: 'Confirm this message is synthetic before continuing.' };
  }
  const tooBig = error.issues.some((issue) => issue.code === 'too_big');
  if (tooBig) return { code: 'INPUT_TOO_LARGE', message: 'The reviewed text is over 20,000 characters.' };
  return { code: 'VALIDATION', message: 'Check the message, employer, and job reference, then try again.' };
}

function sessionFrom(request: FastifyRequest, store: Store): SessionRow | undefined {
  const token = request.cookies.pr_session;
  if (!token) return undefined;
  const row = store.get<SessionRow>('SELECT id_hash, csrf_token, expires_at FROM sessions WHERE id_hash = ?', hashToken(token));
  if (!row || Date.parse(row.expires_at) <= Date.now()) return undefined;
  return row;
}

function originAllowed(origin: string | undefined, config: AppConfig): boolean {
  if (!origin) return true;
  if (origin === config.appOrigin) return true;
  if (!config.production) return /^https?:\/\/(localhost|127\.0\.0\.1):(3000|5173)$/.test(origin);
  return false;
}

function requireSession(request: FastifyRequest, reply: FastifyReply, deps: Deps, write: boolean): SessionRow | undefined {
  if (!originAllowed(request.headers.origin, deps.config)) {
    fail(reply, 403, 'CSRF', 'This origin is not allowed.');
    return undefined;
  }
  const session = sessionFrom(request, deps.store);
  if (!session) {
    if (write) fail(reply, 401, 'CSRF', 'Start a session and retry.');
    else notFound(reply);
    return undefined;
  }
  if (write) {
    const header = request.headers['x-csrf-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !tokensMatch(token, session.csrf_token)) {
      fail(reply, 403, 'CSRF', 'Refresh the page and try again.');
      return undefined;
    }
  }
  return session;
}

function idempotencyKey(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || key.length > 200) {
    fail(reply, 400, 'VALIDATION', 'Add an Idempotency-Key header.');
    return undefined;
  }
  return key;
}

export function registerApi(app: FastifyInstance, deps: Deps): void {
  app.post('/api/session', async (request, reply) => {
    if (!originAllowed(request.headers.origin, deps.config)) {
      return fail(reply, 403, 'CSRF', 'This origin is not allowed.');
    }
    const existing = sessionFrom(request, deps.store);
    if (existing) {
      return {
        demoMode: deps.config.demoMode,
        csrfToken: existing.csrf_token,
        expiresAt: existing.expires_at,
        providerConfigured: deps.config.providerConfigured,
        provider: deps.config.inferenceProvider,
        model: deps.config.providerConfigured ? deps.config.model : null,
      };
    }
    const token = newId() + newId();
    const csrf = newId();
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    deps.store.run(
      'INSERT INTO sessions (id_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?)',
      hashToken(token),
      csrf,
      expires.toISOString(),
      now.toISOString(),
    );
    reply.setCookie('pr_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.config.appOrigin.startsWith('https://'),
      maxAge: 24 * 60 * 60,
    });
    return {
      demoMode: deps.config.demoMode,
      csrfToken: csrf,
      expiresAt: expires.toISOString(),
      providerConfigured: deps.config.providerConfigured,
      provider: deps.config.inferenceProvider,
      model: deps.config.providerConfigured ? deps.config.model : null,
    };
  });

  app.get('/api/employers', async (request, reply) => {
    if (!requireSession(request, reply, deps, false)) return;
    return {
      catalogVersion: deps.catalog.catalogVersion,
      reviewedAt: deps.catalog.reviewedAt,
      employers: deps.catalog.employers.map((employer) => ({
        id: employer.id,
        name: employer.name,
        careersUrl: employer.careersUrl,
        boardToken: employer.board.token,
        knownDomains: employer.knownDomains,
        verificationContact: null,
      })),
    };
  });

  app.get('/api/scenarios', async (request, reply) => {
    if (!requireSession(request, reply, deps, false)) return;
    return {
      scenarios: deps.scenarios.map((scenario) => ({
        ...scenario,
        label: 'Synthetic scenario',
      })),
    };
  });

  app.post('/api/cases', async (request, reply) => {
    const session = requireSession(request, reply, deps, true);
    if (!session) return;
    const key = idempotencyKey(request, reply);
    if (!key) return;
    const existing = deps.store.get<{ owner_session: string; response_json: string }>(
      'SELECT owner_session, response_json FROM idempotency_keys WHERE key = ?',
      key,
    );
    if (existing) {
      if (existing.owner_session !== session.id_hash) return notFound(reply);
      return reply.code(200).send(JSON.parse(existing.response_json) as unknown);
    }
    const parsed = createCaseBody.safeParse(request.body);
    if (!parsed.success) {
      const mapped = zodFailure(parsed.error);
      return fail(reply, mapped.code === 'INPUT_TOO_LARGE' ? 413 : 400, mapped.code, mapped.message);
    }
    if (deps.config.demoMode && parsed.data.syntheticAttestation !== true) {
      return fail(reply, 400, 'DEMO_ATTESTATION', 'Confirm this message is synthetic before continuing.');
    }
    const employer = employerById(deps.catalog, parsed.data.employerId);
    if (parsed.data.employerId && !employer) {
      return fail(reply, 400, 'EMPLOYER_UNSUPPORTED', 'That employer is not in the reviewed catalog.');
    }
    const role = normalizeRoleReference(parsed.data.roleReference, employer?.board.token);
    if (role.error) return fail(reply, 400, 'VALIDATION', role.error);
    const reviewed = redactText(parsed.data.reviewedText).text;
    const now = new Date();
    const caseId = newId();
    const scenario = deps.scenarios.find((item) => item.id === parsed.data.scenarioId);
    const title = scenario?.title || `${employer?.name ?? 'Unsupported employer'} check`;
    const response = { caseId, version: 1, title };
    deps.store.transaction(() => {
      deps.store.run(
        `INSERT INTO cases (id, owner_session, title, scenario_id, source_preference, input_mode, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        caseId,
        session.id_hash,
        title,
        parsed.data.scenarioId ?? null,
        parsed.data.sourcePreference === 'fixture' ? 'fixture' : 'live',
        parsed.data.inputMode,
        now.toISOString(),
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      );
      deps.store.run(
        `INSERT INTO case_versions (case_id, version, reviewed_text, employer_id, role_reference, input_mode, created_at)
         VALUES (?, 1, ?, ?, ?, ?, ?)`,
        caseId,
        reviewed,
        employer?.id ?? null,
        role.jobId ?? null,
        parsed.data.inputMode,
        now.toISOString(),
      );
      deps.store.run(
        'INSERT INTO idempotency_keys (key, owner_session, kind, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
        key,
        session.id_hash,
        'case',
        JSON.stringify(response),
        now.toISOString(),
      );
    });
    return reply.code(201).send(response);
  });

  app.post('/api/cases/:id/runs', async (request, reply) => {
    const session = requireSession(request, reply, deps, true);
    if (!session) return;
    const key = idempotencyKey(request, reply);
    if (!key) return;
    const params = request.params as { id: string };
    const owned = ownedCase(deps, params.id, session.id_hash);
    if (!owned) return notFound(reply);
    const existing = deps.store.get<{ owner_session: string; response_json: string }>(
      'SELECT owner_session, response_json FROM idempotency_keys WHERE key = ?',
      key,
    );
    if (existing) {
      if (existing.owner_session !== session.id_hash) return notFound(reply);
      return reply.code(200).send(JSON.parse(existing.response_json) as unknown);
    }
    const parsed = createRunBody.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, 'VALIDATION', 'The check request was not valid.');
    const version = deps.store.get<{ version: number; role_reference: string | null }>(
      'SELECT version, role_reference FROM case_versions WHERE case_id = ? ORDER BY version DESC LIMIT 1',
      params.id,
    );
    if (!version) return notFound(reply);
    if (parsed.data.jobId) {
      const employer = employerById(deps.catalog, owned.employer_id);
      const role = normalizeRoleReference(parsed.data.jobId, employer?.board.token);
      if (role.error || !role.jobId) return fail(reply, 400, 'VALIDATION', role.error || 'Enter a numeric job ID.');
      deps.store.run(
        'UPDATE case_versions SET role_reference = ? WHERE case_id = ? AND version = ?',
        role.jobId,
        params.id,
        version.version,
      );
    }
    const gate = tryAcquire(session.id_hash, request.ip || 'local');
    if (!gate.ok) return fail(reply, 429, 'RATE_LIMITED', gate.message);
    const runId = newId();
    const now = new Date().toISOString();
    const response = { runId, version: version.version };
    try {
      deps.store.transaction(() => {
        deps.store.run(
          `INSERT INTO runs (id, case_id, version, status, heartbeat_at, started_at, idempotency_key)
           VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
          runId,
          params.id,
          version.version,
          now,
          now,
          key,
        );
        deps.store.run(
          'INSERT INTO idempotency_keys (key, owner_session, kind, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
          key,
          session.id_hash,
          'run',
          JSON.stringify(response),
          now,
        );
      });
    } catch (error) {
      releaseRunSlot(runId, session.id_hash);
      throw error;
    }
    if (parsed.data.refresh) markRefresh(runId);
    enqueueRun(params.id, () =>
      executeRun({
        store: deps.store,
        config: deps.config,
        catalog: deps.catalog,
        root: deps.root,
        caseId: params.id,
        runId,
        sessionHash: session.id_hash,
      }),
    );
    return reply.code(202).send(response);
  });

  app.get('/api/cases/:id', async (request, reply) => {
    const session = requireSession(request, reply, deps, false);
    if (!session) return;
    const params = request.params as { id: string };
    const snapshot = buildSnapshot(deps, params.id, session.id_hash);
    if (!snapshot) return notFound(reply);
    return snapshot;
  });

  app.get('/api/cases/:id/runs/:runId/events', async (request, reply) => {
    const session = requireSession(request, reply, deps, false);
    if (!session) return;
    const params = request.params as { id: string; runId: string };
    const run = deps.store.get<{ id: string; case_id: string; status: string }>(
      `SELECT runs.id, runs.case_id, runs.status FROM runs
       JOIN cases ON cases.id = runs.case_id
       WHERE runs.id = ? AND cases.owner_session = ? AND cases.id = ?`,
      params.runId,
      session.id_hash,
      params.id,
    );
    if (!run) return notFound(reply);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const header = request.headers['last-event-id'];
    let last = Number(Array.isArray(header) ? header[0] : header || 0);
    if (!Number.isFinite(last)) last = 0;
    let ticks = 0;
    const push = () => {
      const events = deps.store.all<{ sequence: number; type: string; payload_json: string }>(
        'SELECT sequence, type, payload_json FROM events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC',
        params.runId,
        last,
      );
      for (const event of events) {
        last = Number(event.sequence);
        raw.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${event.payload_json}\n\n`);
      }
      const current = deps.store.get<{ status: string }>('SELECT status FROM runs WHERE id = ?', params.runId);
      return current?.status;
    };
    push();
    const timer = setInterval(() => {
      ticks += 1;
      const status = push();
      if (ticks % 15 === 0) raw.write(': heartbeat\n\n');
      if (status && !['queued', 'running'].includes(status)) {
        clearInterval(timer);
        raw.end();
      }
    }, 1000);
    timer.unref?.();
    raw.on('close', () => clearInterval(timer));
  });

  app.post('/api/cases/:id/messages', async (request, reply) => {
    const session = requireSession(request, reply, deps, true);
    if (!session) return;
    const params = request.params as { id: string };
    const owned = ownedCase(deps, params.id, session.id_hash);
    if (!owned) return notFound(reply);
    const parsed = appendMessageBody.safeParse(request.body);
    if (!parsed.success) {
      const mapped = zodFailure(parsed.error);
      return fail(reply, mapped.code === 'INPUT_TOO_LARGE' ? 413 : 400, mapped.code, mapped.message);
    }
    const current = deps.store.get<{ version: number }>('SELECT MAX(version) AS version FROM case_versions WHERE case_id = ?', params.id);
    if (!current || Number(current.version) !== parsed.data.expectedVersion) {
      return fail(reply, 409, 'VERSION_CONFLICT', 'This case changed. Reload it and try again.');
    }
    const reviewed = redactText(parsed.data.reviewedText).text;
    const next = Number(current.version) + 1;
    const now = new Date().toISOString();
    const active = deps.store.all<{ id: string }>('SELECT id FROM runs WHERE case_id = ? AND status IN (\'queued\', \'running\')', params.id);
    deps.store.transaction(() => {
      for (const run of active) {
        deps.store.run(
          `UPDATE runs SET status = 'cancelled', finished_at = ?, error_code = 'VERSION_CONFLICT' WHERE id = ?`,
          now,
          run.id,
        );
      }
      deps.store.run(
        `INSERT INTO case_versions (case_id, version, reviewed_text, employer_id, role_reference, input_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params.id,
        next,
        reviewed,
        owned.employer_id,
        owned.role_reference,
        parsed.data.syntheticAttestation ? owned.input_mode : owned.input_mode,
        now,
      );
    });
    for (const run of active) {
      abortRun(run.id);
      releaseRunSlot(run.id, session.id_hash);
    }
    return reply.code(201).send({ caseId: params.id, version: next });
  });

  app.post('/api/cases/:id/runs/:runId/cancel', async (request, reply) => {
    const session = requireSession(request, reply, deps, true);
    if (!session) return;
    const params = request.params as { id: string; runId: string };
    const run = deps.store.get<{ id: string; status: string }>(
      `SELECT runs.id, runs.status FROM runs JOIN cases ON cases.id = runs.case_id
       WHERE runs.id = ? AND cases.id = ? AND cases.owner_session = ?`,
      params.runId,
      params.id,
      session.id_hash,
    );
    if (!run) return notFound(reply);
    if (run.status === 'queued' || run.status === 'running') {
      deps.store.run(
        `UPDATE runs SET status = 'cancelled', finished_at = ?, error_code = NULL WHERE id = ?`,
        new Date().toISOString(),
        run.id,
      );
      abortRun(run.id);
      releaseRunSlot(run.id, session.id_hash);
    }
    return { runId: run.id, status: 'cancelled' };
  });

  app.get('/api/cases/:id/export', async (request, reply) => {
    const session = requireSession(request, reply, deps, false);
    if (!session) return;
    const params = request.params as { id: string };
    const snapshot = buildSnapshot(deps, params.id, session.id_hash);
    if (!snapshot?.assessment) return notFound(reply);
    const format = (request.query as { format?: string }).format;
    reply.header('cache-control', 'no-store');
    if (format === 'md') {
      reply.header('content-type', 'text/markdown; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="proofroute-brief.md"');
      return renderBriefMarkdown({
        title: snapshot.case.title,
        reviewedText: snapshot.version.reviewedText,
        assessment: snapshot.assessment as unknown as Parameters<typeof renderBriefMarkdown>[0]['assessment'],
        evidence: snapshot.evidence as unknown as Parameters<typeof renderBriefMarkdown>[0]['evidence'],
      });
    }
    if (format === 'json') {
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="proofroute-record.json"');
      return {
        label: 'Redacted ProofRoute record. The sender is not authenticated.',
        case: snapshot.case,
        version: snapshot.version,
        assessment: snapshot.assessment,
        evidence: snapshot.evidence,
      };
    }
    return fail(reply, 400, 'VALIDATION', 'Use format=md or format=json.');
  });

  app.delete('/api/cases/:id', async (request, reply) => {
    const session = requireSession(request, reply, deps, true);
    if (!session) return;
    const params = request.params as { id: string };
    const owned = ownedCase(deps, params.id, session.id_hash);
    if (!owned) return notFound(reply);
    const active = deps.store.all<{ id: string }>('SELECT id FROM runs WHERE case_id = ? AND status IN (\'queued\', \'running\')', params.id);
    for (const run of active) {
      abortRun(run.id);
      releaseRunSlot(run.id, session.id_hash);
    }
    deps.store.run('DELETE FROM cases WHERE id = ?', params.id);
    return reply.code(204).send();
  });
}

function ownedCase(deps: Deps, caseId: string, sessionHash: string) {
  return deps.store.get<{
    id: string;
    employer_id: string | null;
    role_reference: string | null;
    input_mode: string;
  }>(
    `SELECT cases.id, case_versions.employer_id, case_versions.role_reference, cases.input_mode
     FROM cases JOIN case_versions ON case_versions.case_id = cases.id
     WHERE cases.id = ? AND cases.owner_session = ?
     ORDER BY case_versions.version DESC LIMIT 1`,
    caseId,
    sessionHash,
  );
}

function buildSnapshot(deps: Deps, caseId: string, sessionHash: string) {
  const caseRow = deps.store.get<{
    id: string;
    title: string;
    scenario_id: string | null;
    input_mode: string;
    source_preference: string;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT id, title, scenario_id, input_mode, source_preference, created_at, expires_at
     FROM cases WHERE id = ? AND owner_session = ?`,
    caseId,
    sessionHash,
  );
  if (!caseRow) return undefined;
  const version = deps.store.get<{
    version: number;
    reviewed_text: string;
    employer_id: string | null;
    role_reference: string | null;
    input_mode: string;
    created_at: string;
    latest_run_id: string | null;
  }>(
    `SELECT version, reviewed_text, employer_id, role_reference, input_mode, created_at, latest_run_id
     FROM case_versions WHERE case_id = ? ORDER BY version DESC LIMIT 1`,
    caseId,
  );
  if (!version) return undefined;
  const run = version.latest_run_id
    ? deps.store.get<{
        id: string;
        status: string;
        version: number;
        model_id: string | null;
        error_code: string | null;
        source_mode: string | null;
        analysis_mode: string | null;
        started_at: string;
        finished_at: string | null;
      }>(
        'SELECT id, status, version, model_id, error_code, source_mode, analysis_mode, started_at, finished_at FROM runs WHERE id = ?',
        version.latest_run_id,
      )
    : deps.store.get<{
        id: string;
        status: string;
        version: number;
        model_id: string | null;
        error_code: string | null;
        source_mode: string | null;
        analysis_mode: string | null;
        started_at: string;
        finished_at: string | null;
      }>(
        'SELECT id, status, version, model_id, error_code, source_mode, analysis_mode, started_at, finished_at FROM runs WHERE case_id = ? AND version = ? ORDER BY started_at DESC LIMIT 1',
        caseId,
        version.version,
      );
  const evidence = run
    ? deps.store
        .all<{ payload_json: string }>('SELECT payload_json FROM evidence WHERE run_id = ?', run.id)
        .map((row) => JSON.parse(row.payload_json) as Record<string, unknown>)
    : [];
  const assessmentRow = run
    ? deps.store.get<{ payload_json: string }>('SELECT payload_json FROM assessments WHERE run_id = ?', run.id)
    : undefined;
  const assessment = assessmentRow ? (JSON.parse(assessmentRow.payload_json) as Record<string, unknown>) : null;
  const events = run
    ? deps.store
        .all<{ sequence: number; type: string; payload_json: string }>(
          'SELECT sequence, type, payload_json FROM events WHERE run_id = ? ORDER BY sequence ASC',
          run.id,
        )
        .map((event) => ({ sequence: Number(event.sequence), type: event.type, payload: JSON.parse(event.payload_json) as unknown }))
    : [];
  let previousAssessment: Record<string, unknown> | null = null;
  if (version.version > 1) {
    const prior = deps.store.get<{ latest_run_id: string | null }>(
      'SELECT latest_run_id FROM case_versions WHERE case_id = ? AND version = ?',
      caseId,
      version.version - 1,
    );
    if (prior?.latest_run_id) {
      const priorAssessment = deps.store.get<{ payload_json: string }>(
        'SELECT payload_json FROM assessments WHERE run_id = ?',
        prior.latest_run_id,
      );
      previousAssessment = priorAssessment ? (JSON.parse(priorAssessment.payload_json) as Record<string, unknown>) : null;
    }
  }
  return {
    case: {
      id: caseRow.id,
      title: caseRow.title,
      scenarioId: caseRow.scenario_id,
      inputMode: caseRow.input_mode,
      sourcePreference: caseRow.source_preference,
      createdAt: caseRow.created_at,
      expiresAt: caseRow.expires_at,
    },
    version: {
      version: Number(version.version),
      reviewedText: version.reviewed_text,
      employerId: version.employer_id,
      roleReference: version.role_reference,
      inputMode: version.input_mode,
      createdAt: version.created_at,
    },
    run: run
      ? {
          id: run.id,
          status: run.status,
          version: Number(run.version),
          modelId: run.model_id,
          errorCode: run.error_code,
          sourceMode: run.source_mode,
          analysisMode: run.analysis_mode,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
        }
      : null,
    evidence,
    assessment,
    previousAssessment,
    events,
    latestSequence: events.at(-1)?.sequence ?? 0,
    demoMode: deps.config.demoMode,
    providerConfigured: deps.config.providerConfigured,
  };
}
