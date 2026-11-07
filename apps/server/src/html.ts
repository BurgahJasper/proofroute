export function htmlToText(input: string): string {
  const decoded = input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  const withoutActive = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return withoutActive.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
