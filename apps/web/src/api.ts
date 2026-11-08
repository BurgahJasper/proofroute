export interface SessionInfo {
  demoMode: boolean;
  csrfToken: string;
  providerConfigured: boolean;
  provider: string;
  model: string | null;
}

export interface EmployerOption {
  id: string;
  name: string;
  careersUrl: string;
  boardToken: string;
  knownDomains: string[];
  verificationContact: null;
}

export interface Scenario {
  id: string;
  title: string;
  banner: string;
  employerId: string | null;
  jobId: string;
  whatItShows: string;
  text: string;
  followUpText: string;
  label: string;
}

export interface Finding {
  claimId: string;
  claimKey: 'employer_route' | 'listing' | 'sender' | 'request';
  question: string;
  status: 'supported' | 'contradicted' | 'unresolved' | 'conflicting';
  explanation: string;
  inputSpan?: { start: number; end: number; quote: string };
  evidenceIds: string[];
}

export interface EvidenceItem {
  id: string;
  scope: string;
  sourceType: string;
  sourceMode: string;
  sourceUrl?: string;
  excerpt: string;
  retrievedAt: string;
  freshUntil?: string;
  limitations: string[];
  freshness?: string;
  cacheStatus?: string;
}

export interface RouteLink {
  id: string;
  url: string;
  label: string;
  kind: string;
}

export interface Assessment {
  headline: string;
  recommendedAction: string;
  reasons: string[];
  unresolvedQuestions: string[];
  findings: Finding[];
  approvedRoute: RouteLink | null;
  careersRoute: RouteLink | null;
  verificationDraft: string;
  verificationContactAvailable: false;
  sourceMode: string;
  analysisMode: string;
  modelId: string;
  policyVersion: string;
  status: string;
  createdAt: string;
  coverageAnswered: number;
  coverageTotal: number;
  limitations: string[];
  label?: string;
  errorCode?: string | null;
  inputMode: string;
  version: number;
  changeSummary?: {
    actionChanged: boolean;
    previousAction: string | null;
    changedClaimKeys: string[];
    newRiskLabels: string[];
    headline: string;
  } | null;
}

export interface CaseSnapshot {
  case: {
    id: string;
    title: string;
    scenarioId: string | null;
    inputMode: string;
    sourcePreference: string;
    createdAt: string;
    expiresAt: string;
  };
  version: {
    version: number;
    reviewedText: string;
    employerId: string | null;
    roleReference: string | null;
    inputMode: string;
    createdAt: string;
  };
  run: {
    id: string;
    status: string;
    version: number;
    modelId: string | null;
    errorCode: string | null;
    sourceMode: string | null;
    analysisMode: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  evidence: EvidenceItem[];
  assessment: Assessment | null;
  previousAssessment?: Assessment | null;
  events: Array<{ sequence: number; type: string; payload: Record<string, unknown> }>;
  latestSequence: number;
  demoMode: boolean;
  providerConfigured: boolean;
}

let csrf = '';

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export async function ensureSession(): Promise<SessionInfo> {
  const response = await fetch('/api/session', { method: 'POST' });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as SessionInfo;
  csrf = body.csrfToken;
  return body;
}

function jsonHeaders(idempotency?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-csrf-token': csrf,
    ...(idempotency ? { 'idempotency-key': idempotency } : {}),
  };
}

export async function getEmployers(): Promise<EmployerOption[]> {
  const response = await fetch('/api/employers');
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { employers: EmployerOption[] };
  return body.employers;
}

export async function getScenarios(): Promise<Scenario[]> {
  const response = await fetch('/api/scenarios');
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { scenarios: Scenario[] };
  return body.scenarios;
}

export async function createCase(input: {
  reviewedText: string;
  employerId: string | null;
  roleReference?: string;
  inputMode: 'synthetic' | 'user_supplied';
  scenarioId?: string;
  sourcePreference: 'live' | 'fixture';
}): Promise<{ caseId: string; version: number }> {
  const response = await fetch('/api/cases', {
    method: 'POST',
    headers: jsonHeaders(crypto.randomUUID()),
    body: JSON.stringify({ ...input, syntheticAttestation: true }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { caseId: string; version: number };
}

export async function startRun(caseId: string, input: { refresh?: boolean; jobId?: string } = {}): Promise<{ runId: string }> {
  const response = await fetch(`/api/cases/${caseId}/runs`, {
    method: 'POST',
    headers: jsonHeaders(crypto.randomUUID()),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { runId: string };
}

export async function getCase(caseId: string): Promise<CaseSnapshot> {
  const response = await fetch(`/api/cases/${caseId}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CaseSnapshot;
}

export async function appendMessage(caseId: string, reviewedText: string, expectedVersion: number): Promise<{ version: number }> {
  const response = await fetch(`/api/cases/${caseId}/messages`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ reviewedText, expectedVersion, syntheticAttestation: true }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { version: number };
}

export async function deleteCase(caseId: string): Promise<void> {
  const response = await fetch(`/api/cases/${caseId}`, { method: 'DELETE', headers: jsonHeaders() });
  if (!response.ok && response.status !== 204) throw new Error(await readError(response));
}

export function exportHref(caseId: string, format: 'md' | 'json'): string {
  return `/api/cases/${caseId}/export?format=${format}`;
}
