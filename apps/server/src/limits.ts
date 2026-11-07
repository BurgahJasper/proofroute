const minuteStarts = new Map<string, number[]>();
const hourStarts = new Map<string, number[]>();
const ipWrites = new Map<string, number[]>();
const activeBySession = new Map<string, number>();
let globalActive = 0;

function prune(values: number[], windowMs: number, now: number): number[] {
  return values.filter((stamp) => now - stamp < windowMs);
}

export function resetLimits(): void {
  minuteStarts.clear();
  hourStarts.clear();
  ipWrites.clear();
  activeBySession.clear();
  globalActive = 0;
}

export function tryAcquire(sessionHash: string, ip: string): { ok: true } | { ok: false; message: string } {
  const now = Date.now();
  if ((activeBySession.get(sessionHash) ?? 0) >= 1) {
    return { ok: false, message: 'A check is already running in this session. Wait for it to finish or cancel it.' };
  }
  if (globalActive >= 4) {
    return { ok: false, message: 'ProofRoute is at its check capacity. Try again in a moment.' };
  }
  const minute = prune(minuteStarts.get(sessionHash) ?? [], 60_000, now);
  const hour = prune(hourStarts.get(sessionHash) ?? [], 60 * 60_000, now);
  if (minute.length >= 5) {
    return { ok: false, message: 'This session started five checks in a minute. Wait and try again.' };
  }
  if (hour.length >= 20) {
    return { ok: false, message: 'This session hit the hourly check limit. Wait and try again.' };
  }
  const writes = prune(ipWrites.get(ip) ?? [], 60_000, now);
  if (writes.length >= 40) {
    return { ok: false, message: 'Too many checks from this network. Wait a moment and try again.' };
  }
  minute.push(now);
  hour.push(now);
  writes.push(now);
  minuteStarts.set(sessionHash, minute);
  hourStarts.set(sessionHash, hour);
  ipWrites.set(ip, writes);
  activeBySession.set(sessionHash, (activeBySession.get(sessionHash) ?? 0) + 1);
  globalActive += 1;
  return { ok: true };
}

export function release(sessionHash: string): void {
  const current = activeBySession.get(sessionHash) ?? 0;
  if (current <= 1) activeBySession.delete(sessionHash);
  else activeBySession.set(sessionHash, current - 1);
  globalActive = Math.max(0, globalActive - 1);
}
