const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata.google.internal.']);

export function isIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isIpLiteral(host)) return true;
  return false;
}

export function classifyDestination(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
  if (url.username || url.password) return { ok: false, reason: 'userinfo' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'port' };
  if (isBlockedHostname(url.hostname)) return { ok: false, reason: 'blocked-host' };
  return { ok: true, url };
}

export function greenhouseBoardUrl(token: string, jobId?: string): string {
  if (!/^[a-z0-9-]+$/i.test(token)) {
    throw new Error('SOURCE_BLOCKED');
  }
  if (jobId && !/^\d{1,20}$/.test(jobId)) {
    throw new Error('SOURCE_BLOCKED');
  }
  const path = jobId
    ? `/v1/boards/${encodeURIComponent(token)}/jobs/${jobId}`
    : `/v1/boards/${encodeURIComponent(token)}/jobs`;
  const url = `https://boards-api.greenhouse.io${path}`;
  const checked = classifyDestination(url);
  if (!checked.ok || checked.url.hostname !== 'boards-api.greenhouse.io') {
    throw new Error('SOURCE_BLOCKED');
  }
  return url;
}

export function redirectIsAllowed(location: string | null): boolean {
  if (!location) return false;
  const checked = classifyDestination(location);
  if (!checked.ok) return false;
  return checked.url.hostname === 'boards-api.greenhouse.io' && checked.url.pathname.startsWith('/v1/boards/');
}

export const GREENHOUSE_FETCH_INIT = { redirect: 'manual' as const };
