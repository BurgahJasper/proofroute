import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { approveBoardJobUrl } from '@proofroute/contracts';
import { htmlToText } from './html.js';
import { GREENHOUSE_FETCH_INIT, greenhouseBoardUrl, redirectIsAllowed } from './url-safety.js';

const FRESH_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; payload: string }>();

export interface NormalizedJob {
  id: string;
  title: string;
  location?: string;
  absoluteUrl: string;
  approvedUrl: string | null;
  excerpt: string;
  retrievedAt: string;
  freshUntil: string;
  cacheStatus: 'miss' | 'hit' | 'bypass';
}

export interface JobLookupResult {
  checked: boolean;
  found: boolean;
  notFound: boolean;
  latencyMs: number;
  error?: string;
  job?: NormalizedJob;
  candidates?: Array<{ jobId: string; title: string; location?: string; url: string }>;
  retrievedAt: string;
  cacheStatus?: 'miss' | 'hit' | 'bypass';
}

interface FixtureJob {
  id: string;
  title: string;
  location?: string;
  absoluteUrl: string;
  excerpt: string;
  capturedAt: string;
  label: string;
}

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > FRESH_MS) return undefined;
  return hit.payload;
}

async function fetchGreenhouse(url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...GREENHOUSE_FETCH_INIT,
        signal: combined,
        headers: {
          accept: 'application/json',
          'user-agent': 'ProofRoute/0.1 (hackathon synthetic demo)',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!redirectIsAllowed(location)) {
          throw new Error('redirect rejected');
        }
        throw new Error('redirect rejected');
      }
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        lastError = new Error(`status ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !(error instanceof Error && error.message === 'redirect rejected')) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('lookup failed');
}

async function readBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > 1_000_000) throw new Error('response too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 1_000_000) throw new Error('response too large');
  return buffer.toString('utf8');
}

function normalizeJob(raw: Record<string, unknown>, token: string, retrievedAt: string, cacheStatus: NormalizedJob['cacheStatus']): NormalizedJob | null {
  const id = String(raw.id ?? '');
  if (!/^\d{1,20}$/.test(id)) return null;
  const title = String(raw.title ?? 'Untitled role');
  const location = typeof (raw.location as { name?: string } | undefined)?.name === 'string'
    ? (raw.location as { name: string }).name
    : undefined;
  const absoluteUrl = String(raw.absolute_url ?? '');
  const approvedUrl = approveBoardJobUrl(absoluteUrl, token, id);
  const text = htmlToText(String(raw.content ?? '')).slice(0, 4000);
  const excerpt = `${title}${location ? `, ${location}` : ''}. ${text}`.replace(/\s+/g, ' ').trim().slice(0, 1500);
  return {
    id,
    title,
    location,
    absoluteUrl,
    approvedUrl,
    excerpt,
    retrievedAt,
    freshUntil: new Date(Date.parse(retrievedAt) + FRESH_MS).toISOString(),
    cacheStatus,
  };
}

export function readFixtureJob(root: string, jobId: string): FixtureJob | null {
  const file = path.join(root, 'data', 'fixtures', `figma-${jobId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureJob;
}

export async function lookupPublishedJob(options: {
  root: string;
  token: string;
  jobId?: string;
  mode: 'live' | 'fixture';
  refresh: boolean;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<JobLookupResult> {
  const started = Date.now();
  const retrievedAt = new Date().toISOString();
  if (options.mode === 'fixture') {
    if (!options.jobId) {
      return { checked: true, found: false, notFound: true, latencyMs: Date.now() - started, retrievedAt, candidates: [] };
    }
    const fixture = readFixtureJob(options.root, options.jobId);
    if (!fixture) {
      return { checked: true, found: false, notFound: true, latencyMs: Date.now() - started, retrievedAt };
    }
    const approvedUrl = approveBoardJobUrl(fixture.absoluteUrl, options.token, fixture.id);
    return {
      checked: true,
      found: Boolean(approvedUrl),
      notFound: !approvedUrl,
      latencyMs: Date.now() - started,
      retrievedAt: fixture.capturedAt,
      job: {
        id: fixture.id,
        title: fixture.title,
        location: fixture.location,
        absoluteUrl: fixture.absoluteUrl,
        approvedUrl,
        excerpt: fixture.excerpt,
        retrievedAt: fixture.capturedAt,
        freshUntil: fixture.capturedAt,
        cacheStatus: 'bypass',
      },
    };
  }

  try {
    if (options.jobId) {
      const url = greenhouseBoardUrl(options.token, options.jobId);
      const key = `job:${options.token}:${options.jobId}`;
      const cached = options.refresh ? undefined : cacheGet(key);
      const cacheStatus = cached ? 'hit' : options.refresh ? 'bypass' : 'miss';
      const body = cached ?? (await (async () => {
        const response = await fetchGreenhouse(url, options.signal, options.timeoutMs);
        if (response.status === 404) return 'NOT_FOUND';
        if (!response.ok) throw new Error(`status ${response.status}`);
        const text = await readBody(response);
        cache.set(key, { at: Date.now(), payload: text });
        return text;
      })());
      if (body === 'NOT_FOUND') {
        return { checked: true, found: false, notFound: true, latencyMs: Date.now() - started, retrievedAt, cacheStatus };
      }
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const job = normalizeJob(parsed, options.token, cached ? new Date(cache.get(key)?.at ?? Date.now()).toISOString() : retrievedAt, cacheStatus);
      if (!job?.approvedUrl) {
        return {
          checked: true,
          found: false,
          notFound: false,
          latencyMs: Date.now() - started,
          retrievedAt,
          error: 'The board response did not include an allowlisted application URL.',
        };
      }
      return { checked: true, found: true, notFound: false, latencyMs: Date.now() - started, retrievedAt: job.retrievedAt, cacheStatus, job };
    }

    const url = greenhouseBoardUrl(options.token);
    const response = await fetchGreenhouse(url, options.signal, options.timeoutMs);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const parsed = JSON.parse(await readBody(response)) as { jobs?: Array<Record<string, unknown>> };
    const candidates = (parsed.jobs ?? []).slice(0, 1000).flatMap((job) => {
      const normalized = normalizeJob(job, options.token, retrievedAt, 'miss');
      if (!normalized?.approvedUrl) return [];
      return [{ jobId: normalized.id, title: normalized.title, location: normalized.location, url: normalized.approvedUrl }];
    });
    return {
      checked: true,
      found: false,
      notFound: candidates.length === 0,
      latencyMs: Date.now() - started,
      retrievedAt,
      candidates,
      cacheStatus: 'miss',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lookup failed';
    return {
      checked: true,
      found: false,
      notFound: false,
      latencyMs: Date.now() - started,
      retrievedAt,
      error: message === 'redirect rejected' ? 'The job board redirected to an unapproved host.' : 'The job-board lookup failed.',
    };
  }
}

export function clearGreenhouseCache(): void {
  cache.clear();
}
