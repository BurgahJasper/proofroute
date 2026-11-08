export function compareSenderHeaders(text: string, knownDomains: string[]) {
  function domain(header: string) {
    const line = text.match(new RegExp('^' + header + ':([^\\r\\n]*(?:\\r?\\n[ \t]+[^\\r\\n]*)*)', 'im'))?.[1];
    const matches = [...(line ?? '').matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map(m => m[1].toLowerCase().replace(/\.$/, ''));
    return matches.length === 1 ? matches[0] : undefined;
  }
  const from = domain('From'); const replyTo = domain('Reply-To');
  const matches = (value: string) => knownDomains.some(d => value === d.toLowerCase() || value.endsWith('.' + d.toLowerCase()));
  const different = from && replyTo && from !== replyTo;
  const outside = [from, replyTo].filter((d): d is string => Boolean(d)).some(d => !matches(d));
  const observation = !from && !replyTo ? 'No address comparison is available. Paste the From and Reply-To headers or upload the original email.' : !knownDomains.length ? 'No reviewed employer domain is available for comparison.' : [different ? 'Replies go to a different domain from the From address.' : '', outside ? 'At least one header domain differs from the reviewed employer domains.' : 'The available header domains match a reviewed employer domain.'].filter(Boolean).join(' ');
  const consistent = Boolean(from && knownDomains.length && matches(from) && (!replyTo || matches(replyTo)) && !different);
  return { from, replyTo, observation, consistent, hasHeaders: Boolean(from || replyTo) };
}
