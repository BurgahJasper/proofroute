export function extractDomain(text: string): string | undefined {
  const redacted = text.match(/\[LOCAL\]@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (redacted?.[1]) return redacted[1].toLowerCase();
  const email = text.match(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return email?.[1]?.toLowerCase();
}

export function extractJobId(text: string): string | undefined {
  const labeled = text.match(/\b(?:requisition|gh_jid|job\s*id|job)\s*#?\s*:?\s*(\d{5,20})\b/i);
  if (labeled?.[1]) return labeled[1];
  return text.match(/\b(\d{10})\b/)?.[1];
}

export function excerptAround(text: string, quote: string, radius = 80): string {
  const start = Math.max(0, text.indexOf(quote));
  return text.slice(start, start + quote.length + radius).replace(/\s+/g, ' ').trim();
}
