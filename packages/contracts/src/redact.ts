export interface RedactionSummaryItem {
  category: string;
  replacement: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  summary: RedactionSummaryItem[];
}

interface Rule {
  category: string;
  replacement: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    category: 'password',
    replacement: '[PASSWORD]',
    pattern: /(?:password|passcode|passphrase|pwd)\s*(?:is|=|:)\s*\S+/gi,
  },
  {
    category: 'otp',
    replacement: '[OTP]',
    pattern:
      /(?:login code|one[-\s]?time code|one[-\s]?time password|otp|verification code|sign[-\s]?in code)\s*(?:is|=|:)?\s*\d{4,8}/gi,
  },
  {
    category: 'ssn',
    replacement: '[SSN]',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: 'bank',
    replacement: '[BANK DETAIL]',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
  },
  {
    category: 'bank-request',
    replacement: '[BANK DETAIL REQUEST]',
    pattern: /(?:account|routing)\s*(?:number|no\.?|#)?\s*[:#]?\s*\d{6,17}/gi,
  },
  {
    category: 'phone',
    replacement: '[PHONE]',
    pattern: /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  {
    category: 'email',
    replacement: '[LOCAL]@$2',
    pattern: /\b([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
  },
];

export function redactText(input: string): RedactionResult {
  let text = input;
  const summary: RedactionSummaryItem[] = [];
  for (const rule of RULES) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const pattern = new RegExp(rule.pattern.source, flags);
    const matches = text.match(pattern);
    if (!matches?.length) continue;
    text = text.replace(pattern, rule.category === 'email' ? '[LOCAL]@$2' : rule.replacement);
    summary.push({
      category: rule.category,
      replacement: rule.category === 'email' ? '[LOCAL]@domain' : rule.replacement,
      count: matches.length,
    });
  }
  return { text, summary };
}

const CANARY_PATTERNS = [
  /hunter2/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /real\.person/i,
  /\b\d{13,19}\b/,
];

export function containsSensitiveCanary(value: string): boolean {
  return CANARY_PATTERNS.some((pattern) => pattern.test(value));
}
