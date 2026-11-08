import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ensureSession, getScenarios, type Scenario } from '../api';

export function DemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      await ensureSession();
      setScenarios(await getScenarios());
    })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Samples could not load.'));
  }, []);
  return (
    <div className="sample-page">
      <p className="eyebrow">The field guide / Three fictional conversations</p>
      <h1>A convincing message.<br /><span className="text-action">An important distinction.</span></h1>
      <p className="mt-5 max-w-prose text-muted">Explore the gray areas of a recruiting conversation. Start with a sample, inspect the evidence, then add a follow-up to see what changes.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      <ul className="sample-grid">
        {scenarios.map((scenario, index) => (
          <li key={scenario.id} className="sample-tile">
            <div className="sample-art" aria-hidden="true"><span>0{index + 1}</span><i>→</i><span>?</span></div>
            <div><span className="eyebrow">Case 0{index + 1} · Synthetic</span><h2>{scenario.title}</h2><p>{scenario.whatItShows}</p></div>
            <div className="sample-tile-actions"><Link to={`/?scenario=${scenario.id}`}>Explore this case <span aria-hidden="true">↗</span></Link></div>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-prose text-sm text-muted">Fictional senders, no employer affiliation. Live checks read public listing data; fixture replay uses labeled recorded evidence. This demo never authenticates the sender.</p>
    </div>
  );
}
