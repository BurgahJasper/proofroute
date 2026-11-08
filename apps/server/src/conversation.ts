import { z } from 'zod';
import { detectRisks, type RiskHit, type ListingCandidate } from '@proofroute/contracts';

export const MAX_CONVERSATION_CHARS = 60_000;
export const MAX_CONVERSATION_MESSAGES = 20;
export interface Message { version: number; reviewed_text: string }
export interface RequestTrace extends RiskHit {
  messageVersion: number;
  origin: 'pattern' | 'model';
  actor: string;
  action: string;
  asset: string;
  destination: string;
}
export function conversationText(messages: Message[]): string {
  return messages.map(m => `Message ${m.version}\n${m.reviewed_text}`).join('\n\n');
}
const requestSchema = z.object({
  messageVersion: z.number().int().positive(),
  category: z.enum(['password', 'otp', 'payment', 'check_forwarding', 'sensitive_identifier']),
  quote: z.string().min(1).max(600),
  actor: z.string().min(1).max(120), action: z.string().min(1).max(180),
  asset: z.string().max(120), destination: z.string().max(180),
});
const labels = { password: 'password', otp: 'login code', payment: 'payment', check_forwarding: 'check forwarding', sensitive_identifier: 'sensitive identifier' };

// Model findings may add a pause, never authenticate a sender or remove a past pause.
// Quotes must belong to the named message, not merely appear elsewhere in the case.
export function validateRequests(raw: unknown, messages: Message[]): RequestTrace[] {
  if (!Array.isArray(raw)) return [];
  const text = conversationText(messages);
  return raw.slice(0, 30).flatMap(value => {
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success) return [];
    const r = parsed.data;
    const message = messages.find(m => m.version === r.messageVersion);
    if (!message?.reviewed_text.includes(r.quote)) return [];
    const prefix = conversationText(messages.filter(m => m.version < r.messageVersion));
    const start = (prefix ? prefix.length + 2 : 0) + `Message ${r.messageVersion}\n`.length + message.reviewed_text.indexOf(r.quote);
    if (text.slice(start, start + r.quote.length) !== r.quote) return [];
    // Keep the category consistent with a grounded money-transfer request even
    // when the model assigns another enum value. Context must mention funds;
    // transferring documents or source code alone is not payment evidence.
    const moneyTransfer = /\b(?:transfer|wire|remit|pay)\b/i.test(r.quote)
      && /\b(?:funds|money|cash|dollars|balance)\b/i.test(r.asset)
      && /\b(?:funds|money|cash|dollars)\b/i.test(text.slice(0, start + r.quote.length));
    const category = moneyTransfer ? 'payment' : r.category;
    return [{ ...r, category, label: labels[category], start, end: start + r.quote.length, origin: 'model' as const }];
  });
}

export function collectRequests(messages: Message[], modelRequests: unknown, retained: unknown = []): RequestTrace[] {
  let offset = 0;
  const patterns = messages.flatMap(message => {
    offset += `Message ${message.version}\n`.length;
    const hits = detectRisks(message.reviewed_text).map(hit => ({
      ...hit, start: hit.start + offset, end: hit.end + offset,
      messageVersion: message.version, origin: 'pattern' as const,
      actor: 'Message sender', action: `Requests ${hit.label}`, asset: hit.label, destination: 'Not established',
    }));
    offset += message.reviewed_text.length + 2;
    return hits;
  });
  const all = [...validateRequests(retained, messages), ...validateRequests(modelRequests, messages), ...patterns];
  const seen = new Set<string>();
  return all.filter(r => {
    const key = `${r.messageVersion}:${r.category}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.messageVersion - b.messageVersion || a.start - b.start);
}

export interface CandidateDecision { jobId: string; ambiguous: boolean; reason: string }
export function validateCandidateDecision(raw: unknown, candidates: ListingCandidate[]): CandidateDecision | null {
  const parsed = z.object({ jobId: z.string(), ambiguous: z.boolean(), reason: z.string().min(1).transform(value => value.slice(0, 300)) }).safeParse(raw);
  if (!parsed.success || parsed.data.ambiguous || !candidates.some(c => c.jobId === parsed.data.jobId)) return null;
  return parsed.data;
}

// Bound model context without discarding a role simply because it was late in a board response.
export function rankCandidates(candidates: ListingCandidate[], role: string): ListingCandidate[] {
  const words = role.toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 2) ?? [];
  const score = (c: ListingCandidate) => words.reduce((n, w) => n + (c.title.toLowerCase().includes(w) ? 1 : 0), 0);
  return [...candidates].sort((a, b) => score(b) - score(a)).slice(0, 12);
}
