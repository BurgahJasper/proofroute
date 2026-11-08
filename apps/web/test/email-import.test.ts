import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEmailFile, emailHtmlToText, MAX_EMAIL_BYTES } from '../src/email-import.js';
const file = (text: string, name = 'test.eml') => { const bytes = new TextEncoder().encode(text); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer }; };
test('fictional email imports claims and excludes recipient headers', async () => {
 const input = await readFile(new URL('../public/samples/fictional-recruiting.eml', import.meta.url), 'utf8');
 const result = await parseEmailFile(file(input));
 assert.match(result.text, /figma-careers.example/); assert.match(result.text, /Reply-To:/); assert.match(result.text, /funds for your workstation/); assert.doesNotMatch(result.text, /student@example.com/);
});
test('quoted printable and UTF-8 body decode', async () => {
 const r = await parseEmailFile(file('Subject: Demo\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nKeep 200=20and transfer the remainder. Caf=C3=A9'));
 assert.match(r.text, /Keep 200 and transfer/); assert.match(r.text, /Café/);
});
test('HTML is parsed without executing markup and retains destinations', async () => {
 const r = await parseEmailFile(file('Subject: Demo\nContent-Type: text/html\n\n<style>secret</style><script>alert(1)</script><p>Open <a href="https://example.com/job">job</a></p><img src="https://example.com/tracker">'));
 assert.match(r.text, /job \(https:\/\/example.com\/job\)/); assert.doesNotMatch(r.text, /secret|alert|tracker/);
});
test('attachments excluded, plain text preferred to alternate HTML', async () => {
 const raw = 'Subject: Demo\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=x\n\n--x\nContent-Type: text/plain\n\nMessage body\n--x\nContent-Type: text/plain\nContent-Disposition: attachment; filename="secret.txt"\n\nATTACHMENT SECRET\n--x--';
 const r = await parseEmailFile(file(raw));assert.equal(r.attachmentCount,1);assert.doesNotMatch(r.text,/ATTACHMENT SECRET/);
});
test('wrong format, oversized files, empty and overlong bodies fail clearly', async () => {
 await assert.rejects(parseEmailFile(file('Subject: X\n\nbody','x.msg')), /\.eml/);
 await assert.rejects(parseEmailFile({...file(''),size:MAX_EMAIL_BYTES+1}),/2 MB/);
 await assert.rejects(parseEmailFile(file('not an email')),/exported email/);
 await assert.rejects(parseEmailFile(file('Subject: X\n\n')),/No readable/);
 await assert.rejects(parseEmailFile(file('Subject: X\n\n'+'a'.repeat(20001))),/nothing was truncated/);
});
test('HTML nested ignored content does not escape into review',()=>{
 assert.equal(emailHtmlToText('<head><style>x</style></head><p>Safe &amp; readable</p>'),'Safe & readable');
});

test('all matching-domain demo email files import with clear fictional labels', async () => {
 for(const company of ['figma','gitlab','cloudflare']) {
  const raw=await readFile(new URL(`../public/samples/matching-domain-${company}.eml`,import.meta.url),'utf8');
  const result=await parseEmailFile(file(raw));
  assert.match(result.text,/FICTIONAL DEMO/);assert.match(result.text,new RegExp('@'+company+'\\.com'));assert.match(result.text,/never sent/);
 }
});
