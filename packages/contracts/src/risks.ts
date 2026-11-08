import type { RiskHit } from './types.js';

interface RiskRule {
  category: RiskHit['category'];
  label: string;
  pattern: RegExp;
}

const RULES: RiskRule[] = [
  {
    category: 'password',
    label: 'password',
    pattern:
      /\b(?:send|share|provide|reply with|give|enter|tell)\b[^.\n]{0,60}\b(?:password|passcode|passphrase)\b|\b(?:password|passcode|passphrase)\b[^.\n]{0,60}\b(?:send|share|provide|reply|enter)\b/i,
  },
  {
    category: 'otp',
    label: 'login code',
    pattern:
      /\b(?:login code|one[-\s]?time code|one[-\s]?time password|otp|verification code|sign[-\s]?in code|authenticator code|2fa code)\b/i,
  },
  {
    category: 'check_forwarding',
    label: 'check forwarding',
    pattern: /\b(?:forward|deposit|cash)\b[^.\n]{0,40}\bchecks?\b|\bcheck[-\s]?forward/i,
  },
  {
    category: 'payment',
    label: 'payment',
    pattern:
      /\b(?:wire transfer|venmo|zelle|cash\s?app|gift\s?cards?|processing fee|equipment fee|training fee)\b|\b(?:pay|wire|send)\b[^.\n]{0,80}\b(?:fee|vendor|equipment|payment)\b|\$\s?\d[\d,]*(?:\.\d{2})?[^.\n]{0,40}\b(?:fee|vendor|payment|equipment)\b/i,
  },
  {
    category: 'sensitive_identifier',
    label: 'sensitive identifier',
    pattern:
      /\b(?:send|share|provide|reply with|upload|enter)\b[^.\n]{0,50}\b(?:ssn|social security(?: number)?|passport|routing number|bank account)\b|\b(?:ssn|social security(?: number)?|passport|routing number|bank account)\b/i,
  },
];

const AMBIGUOUS =
  /\b(?:complete (?:your )?onboarding|onboarding (?:paperwork|portal|packet|documents)|identity documents)\b/i;

const STEER_OFF =
  /\b(?:do not|don't|dont)\s+apply\b|\bavoid the (?:public )?careers\b|\buntil I confirm your materials\b/i;

export function detectRisks(text: string): RiskHit[] {
  const hits: RiskHit[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    const match = [...text.matchAll(new RegExp(rule.pattern.source, 'gi'))].find(candidate => {
      const index = candidate.index ?? 0;
      const sentenceStart = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('\n', index - 1), text.lastIndexOf('!', index - 1), text.lastIndexOf(':', index - 1)) + 1;
      const tail = text.slice(sentenceStart).split(/[.!?\n]/, 1)[0].trim();
      // Only suppress standalone protective instructions. A second request in the
      // same sentence ("never share it, but send it here") must still be reviewed.
      const protective = /^(?:never|do not|don't)\s+(?:send|share|provide|give|enter|pay|wire|transfer|upload)\b|^we\s+(?:will\s+)?never\s+ask\b/i.test(tail);
      return !(protective && !/\b(?:but|however|except|instead|then|also|and)\b|[,;:\u2014\u2013]/i.test(tail));
    });
    if (!match || match.index < 0) continue;
    if (seen.has(rule.category)) continue;
    seen.add(rule.category);
    const quote = match[0].slice(0, 240);
    hits.push({
      category: rule.category,
      label: rule.label,
      quote,
      start: match.index,
      end: match.index + quote.length,
    });
  }
  return hits;
}

export function detectAmbiguousRequest(text: string): boolean {
  return AMBIGUOUS.test(text);
}

export function detectSteersOffOfficialRoute(text: string): boolean {
  return STEER_OFF.test(text);
}

export function spanForQuote(text: string, quote: string): { start: number; end: number; quote: string } | null {
  const start = text.indexOf(quote);
  if (start < 0 || !quote) return null;
  return { start, end: start + quote.length, quote };
}
