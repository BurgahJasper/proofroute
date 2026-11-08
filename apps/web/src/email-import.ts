import PostalMime from 'postal-mime';
import { Parser } from 'htmlparser2';

export const MAX_EMAIL_BYTES = 2 * 1024 * 1024;

// Parse HTML as data, never as a browser document: no images, scripts or network requests.
export function emailHtmlToText(html: string): string {
  let output = '';
  let ignored = 0;
  const hidden = new Set(['script', 'style', 'head', 'iframe', 'object', 'svg']);
  const links: string[] = [];
  const parser = new Parser({
    onopentag(name, attrs) {
      if (hidden.has(name)) ignored++;
      if (ignored) return;
      if (['p', 'div', 'br', 'li', 'tr', 'blockquote'].includes(name)) output += '\n';
      if (name === 'a') links.push(/^https?:\/\//i.test(attrs.href ?? '') ? attrs.href : '');
    },
    ontext(value) { if (!ignored) output += value; },
    onclosetag(name) {
      if (hidden.has(name)) { ignored = Math.max(0, ignored - 1); return; }
      if (ignored) return;
      if (name === 'a') { const href = links.pop(); if (href) output += ` (${href})`; }
      if (['p', 'div', 'li', 'tr', 'blockquote'].includes(name)) output += '\n';
    },
  }, { decodeEntities: true });
  parser.end(html);
  return output.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

export async function parseEmailFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>) {
  if (!/\.eml$/i.test(file.name)) throw new Error('Choose an .eml email file. For other formats, paste the message instead.');
  if (file.size > MAX_EMAIL_BYTES) throw new Error('Choose an email smaller than 2 MB, or paste its message text.');
  const raw = await file.arrayBuffer();
  if (raw.byteLength > MAX_EMAIL_BYTES) throw new Error('This email is larger than 2 MB.');
  const prefix = new TextDecoder().decode(raw.slice(0, 65536));
  if (!/^(From|Subject|MIME-Version|Content-Type|Date):/im.test(prefix)) throw new Error('This does not look like an exported email. Choose an .eml file or paste the text.');
  let email;
  try {
    email = await PostalMime.parse(raw, { maxNestingDepth: 20, maxHeadersSize: 65536, maxPartCount: 100, forceRfc822Attachments: true });
  } catch {
    throw new Error('This email could not be read. Try another export, or paste the message text.');
  }
  const body = (email.text?.trim() || emailHtmlToText(email.html ?? '')).replace(/\u0000/g, '');
  if (!body) throw new Error('No readable message was found. Attachments are not read; paste the message instead.');
  const headers = email.headers.filter(h => ['from', 'reply-to', 'subject', 'date'].includes(h.key));
  const text = ['Imported email — header values are unverified claims.', ...headers.map(h => `${h.originalKey}: ${h.key === 'subject' ? email.subject ?? h.value : h.value}`), '', body].join('\n');
  if (text.length > 20000) throw new Error('The message exceeds 20,000 characters. Paste the relevant conversation instead; nothing was truncated.');
  return { text, attachmentCount: email.attachments.length };
}
