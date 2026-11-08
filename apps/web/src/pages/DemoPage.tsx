import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useUi } from '../ui';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ensureSession, getScenarios, type Scenario } from '../api';

export function DemoPage() {
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
    gsap.from('.sample-tile', { y: 16, opacity: 0, duration: .5, stagger: .08, ease: 'power2.out' });
  }, { scope: root, dependencies: [scenarios.length, reduceMotion], revertOnUpdate: true });
  return (
    <div className="sample-page" ref={root}>
      <p className="eyebrow">The field guide / Fictional conversations</p>
      <h1>A convincing message.<br /><span className="text-action">An important distinction.</span></h1>
      <p className="mt-5 max-w-prose text-muted">Explore the gray areas of a recruiting conversation. Start with a sample, inspect the evidence, then add a follow-up to see what changes.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      {!scenarios.length && !error ? <p className="sample-loading" role="status">Opening the case index...</p> : null}
      <ul className="sample-grid">
        {scenarios.map((scenario, index) => (
          <li key={scenario.id} className="sample-tile">
            <div className="sample-number" aria-hidden="true">0{index + 1}</div>
            <div><span className="eyebrow">Case 0{index + 1} · Synthetic</span><h2>{scenario.title}</h2><p>{scenario.whatItShows}</p></div>
            <div className="sample-tile-actions"><Link to={`/?scenario=${scenario.id}`}>Explore this case <span aria-hidden="true">↗</span></Link>{scenario.id.startsWith('scn-matching-domain-') ? <a href={`/samples/matching-domain-${scenario.employerId}.eml`} download>Download fictional email ↓</a> : null}</div>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-prose text-sm text-muted">Fictional senders, no employer affiliation. Live checks read public listing data; fixture replay uses labeled recorded evidence. This demo never authenticates the sender.</p>
    </div>
  );
}
