import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useUi } from '../ui';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ensureSession, getScenarios, type Scenario } from '../api';

export function DemoPage() {
  const [showAll, setShowAll] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { reduceMotion } = useUi();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      await ensureSession();
      setScenarios(await getScenarios());
    })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Samples could not load.'));
  }, []);
  useGSAP(() => {
    if (reduceMotion) return;
    gsap.from('.sample-tile', { y: 16, opacity: 0, duration: .4, stagger: .05, ease: 'power2.out', clearProps: 'transform,opacity' });
  }, { scope: root, dependencies: [scenarios.length, reduceMotion], revertOnUpdate: true });
  return (
    <div className="sample-page" ref={root}>
      <p className="eyebrow">The field guide / Fictional conversations</p>
      <h1>A convincing message.<br /><span className="text-action">An important distinction.</span></h1>
      <p className="mt-5 max-w-prose text-muted">Explore the gray areas of a recruiting conversation. Start with a sample, inspect the evidence, then add a follow-up to see what changes.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      {!scenarios.length && !error ? <p className="sample-loading" role="status">Opening the case index...</p> : null}
      <section className="screenshot-samples">
        <p className="eyebrow">Try a source image</p><h2>Start with a screenshot.</h2>
        <p>Choose a fictional conversation. Read it on this device, then review the text before sharing.</p>
        <div className="screenshot-sample-list">
          <div className="screenshot-sample-row"><img className="sample-image-preview" src="/samples/recruiting-request.png" alt="Fictional equipment-payment request preview" loading="lazy" /><Link to="/?sampleImage=request">Equipment request <span aria-hidden="true">↗</span></Link><a href="/samples/recruiting-request.png" download aria-label="Download equipment-request screenshot">Download image ↓</a></div>
          <div className="screenshot-sample-row"><img className="sample-image-preview" src="/samples/recruiting-benign.png" alt="Fictional ordinary recruiting email preview" loading="lazy" /><Link to="/?sampleImage=benign">Ordinary outreach <span aria-hidden="true">↗</span></Link><a href="/samples/recruiting-benign.png" download aria-label="Download ordinary-outreach screenshot">Download image ↓</a></div>
        </div>
      </section>
      <ul className="sample-grid">
        {scenarios.filter(s => showAll || ['scn-matching-domain-figma','scn-conversation-shift','scn-missing-listing'].includes(s.id)).map((scenario, index) => (
          <li key={scenario.id} className="sample-tile">
            <div className="sample-number" aria-hidden="true">0{index + 1}</div>
            <div><span className="eyebrow">Case 0{index + 1} · Synthetic</span><h2>{scenario.title}</h2><p>{scenario.whatItShows}</p></div>
            <div className="sample-tile-actions"><Link to={`/?scenario=${scenario.id}`}>Explore this case <span aria-hidden="true">↗</span></Link>{scenario.id.startsWith('scn-matching-domain-') ? <a href={`/samples/matching-domain-${scenario.employerId}.eml`} download>Download fictional email ↓</a> : null}</div>
          </li>
        ))}
      </ul>
      <button type="button" className="min-h-11 underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show featured examples' : 'More examples'}</button>
      <details className="evaluation-disclosure"><summary>Evaluation and technical details</summary><section className="benchmark-ledger" aria-labelledby="ledger-title">
        <div className="ledger-header">
          <div>
            <p className="eyebrow">Recorded evaluation &amp; security gates</p>
            <h2 id="ledger-title">Beyond a chatbot.<br /><span>Measured on held-out cases.</span></h2>
          </div>
          <p className="ledger-note">
            Evaluated on 24 frozen synthetic cases (8 harmful, 8 benign, 8 ambiguous) with <code>nvidia/nemotron-3.5-super-vl-120b-a12b</code>. These counts measure workflow and official-route resolution on a synthetic gate, not a real-world scam-detection rate.
          </p>
        </div>
        <div className="ledger-grid">
          <article className="ledger-card highlight">
            <span className="eyebrow">Live Nemotron + Greenhouse + Policy</span>
            <div className="ledger-stat">24<span> / 24</span></div>
            <h3>Full workflow decision match</h3>
            <p>Nemotron extracts quote-backed requests and plans allowlisted checks; the server reads the live Greenhouse board and enforces the evidence policy.</p>
            <dl className="ledger-metrics">
              <div><dt>Harmful paused</dt><dd>8 / 8</dd></div>
              <div><dt>False benign pauses</dt><dd>0 / 8</dd></div>
              <div><dt>Sender authenticated</dt><dd>0 / 24</dd></div>
              <div><dt>Median latency</dt><dd>1.84 s</dd></div>
            </dl>
          </article>
          <article className="ledger-card">
            <span className="eyebrow">Prompt-only Nemotron baseline</span>
            <div className="ledger-stat muted">17<span> / 24</span></div>
            <h3>No external tools or board lookup</h3>
            <p>Given the same message and employer name without tools, the baseline paused 8/8 harmful cases but missed all 7 official-route resolutions. It returned no URLs.</p>
            <dl className="ledger-metrics">
              <div><dt>Harmful paused</dt><dd>8 / 8</dd></div>
              <div><dt>Route mismatches</dt><dd>7 cases</dd></div>
              <div><dt>URLs returned</dt><dd>0</dd></div>
              <div><dt>API failures</dt><dd>0</dd></div>
            </dl>
          </article>
          <article className="ledger-card">
            <span className="eyebrow">Adversarial &amp; workflow verification</span>
            <div className="ledger-stat">Tested</div>
            <h3>Hard policy &amp; source guardrails</h3>
            <p>Server-enforced boundaries reject prompt injection, forged quotes, private/loopback SSRF, lookalike domains, and cross-session access.</p>
            <dl className="ledger-metrics">
              <div><dt>Reviewed catalog</dt><dd>3 employers</dd></div>
              <div><dt>Host allowlist</dt><dd>Enforced</dd></div>
              <div><dt>Grok Source Watch</dt><dd>7 / 7 runs ok</dd></div>
              <div><dt>Local OCR / EML</dt><dd>On-device</dd></div>
            </dl>
          </article>
        </div>
      </section></details>
      <p className="mt-6 max-w-prose text-sm text-muted">Fictional senders, no employer affiliation. Live checks read public listing data; fixture replay uses labeled recorded evidence. This demo never authenticates the sender.</p>
    </div>
  );
}
