import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface HeldoutCase {
  id: string;
  group: 'harmful' | 'benign' | 'ambiguous';
  text: string;
  employerId: string | null;
  listing: 'found' | 'missing' | 'unchecked';
  jobId?: string;
  expectedAction: 'pause_sensitive_action' | 'verify_independently' | 'use_official_route';
  expectedSender: 'unresolved';
  expectListingSupported: boolean;
}

export function loadHeldout(root: string): { cases: HeldoutCase[]; hash: string; freezeMatches: boolean } {
  const raw = readFileSync(path.join(root, 'eval', 'heldout', 'cases.jsonl'), 'utf8').trim();
  const hash = createHash('sha256').update(raw).digest('hex');
  const freeze = JSON.parse(readFileSync(path.join(root, 'eval', 'heldout', 'freeze.json'), 'utf8')) as { sha256: string };
  return {
    cases: raw.split(/\r?\n/).map((line) => JSON.parse(line) as HeldoutCase),
    hash,
    freezeMatches: freeze.sha256 === hash,
  };
}

export function commitSha(root: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'uncommitted';
  } catch {
    return 'uncommitted';
  }
}

export function requireProvider(configured: boolean, blocker: string | undefined, root: string): void {
  if (configured) return;
  console.log(blocker || 'NVIDIA_API_KEY is missing or still a placeholder.');
  console.log(`Set NVIDIA_API_KEY in ${path.join(root, '.env')}. Do not paste the key into chat.`);
  process.exit(2);
}
