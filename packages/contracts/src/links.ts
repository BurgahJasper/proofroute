export const APPROVED_JOB_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);

export interface RoleReference {
  jobId?: string;
  error?: string;
}

export function normalizeRoleReference(input: string | undefined, boardToken: string | undefined): RoleReference {
  const value = input?.trim() ?? '';
  if (!value) return {};
  if (/^\d{5,20}$/.test(value)) return { jobId: value };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'Enter a job ID or a full https link from the employer-linked board.' };
  }
  if (url.username || url.password) {
    return { error: 'That link includes credentials and was rejected.' };
  }
  if (url.protocol !== 'https:') {
    return { error: 'Only https links on the employer-linked board can be used.' };
  }
  if (url.port && url.port !== '443') {
    return { error: 'That link uses a port ProofRoute does not accept.' };
  }
  if (!APPROVED_JOB_HOSTS.has(url.hostname)) {
    return {
      error: "That link is not on the employer's reviewed job board. Paste the numeric job ID, or continue without it.",
    };
  }
  if (!boardToken) {
    return { error: 'Choose a reviewed employer before using a board link.' };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0]?.toLowerCase() !== boardToken.toLowerCase()) {
    return { error: "That link points at a different board than the selected employer's reviewed board." };
  }
  const fromQuery = url.searchParams.get('gh_jid') ?? '';
  const fromPath = [...parts].reverse().find((part) => /^\d{5,20}$/.test(part)) ?? '';
  const jobId = /^\d{5,20}$/.test(fromQuery) ? fromQuery : fromPath;
  if (!jobId) return { error: 'That board link does not include a job ID.' };
  return { jobId };
}

export function approveBoardJobUrl(absoluteUrl: string, boardToken: string, jobId: string): string | null {
  let url: URL;
  try {
    url = new URL(absoluteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!APPROVED_JOB_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0]?.toLowerCase() !== boardToken.toLowerCase()) return null;
  if (!url.pathname.includes(jobId) && url.searchParams.get('gh_jid') !== jobId) return null;
  return url.toString();
}
