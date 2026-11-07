import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function newId(): string {
  return randomBytes(16).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
