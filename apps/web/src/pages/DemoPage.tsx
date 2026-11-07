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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-editorial text-4xl">Synthetic samples</h1>
      <p className="mt-3 max-w-prose">Each sample is labeled. Public listing data, when a live check is used, is separate from the fictional sender.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      <ul className="mt-8 space-y-4">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="rounded-panel border border-line bg-surface p-5">
            <p className="text-sm font-medium">Synthetic scenario</p>
            <h2 className="mt-1 text-xl">{scenario.title}</h2>
            <p className="mt-2 text-sm">{scenario.banner}</p>
            <p className="mt-2 max-w-prose">{scenario.whatItShows}</p>
            <Link className="mt-4 inline-flex min-h-11 items-center rounded-control bg-action px-4 text-action-ink no-underline" to={`/?scenario=${scenario.id}`}>
              Use this sample
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
