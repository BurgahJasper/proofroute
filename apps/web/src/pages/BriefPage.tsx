import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ensureSession, exportHref, getCase, type CaseSnapshot } from '../api';
import { AnalysisBadge, ModeBadge, analysisNote, useUi } from '../ui';

export function BriefPage() {
  const { caseId = '' } = useParams();
  const root = useRef<HTMLDivElement>(null);
  const { reduceMotion } = useUi();
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [includeSender, setIncludeSender] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnapshot(null);
    setError('');
    const refresh = async () => {
      const next = await getCase(caseId);
      if (stopped) return;
      setSnapshot(next);
      if (next.run && ['queued', 'running'].includes(next.run.status)) {
        timer = setTimeout(() => { void refresh().catch(() => undefined); }, 1500);
      }
    };
    void ensureSession()
      .then(refresh)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The brief could not be opened.'));
    return () => { stopped = true; clearTimeout(timer); };
  }, [caseId]);

  const assessment = snapshot?.assessment;
  useGSAP(() => { if (!reduceMotion && assessment) gsap.from('[data-brief-reveal]', { y:8, opacity:0, duration:.35, stagger:.05, ease:'power2.out', clearProps:'transform,opacity' }); }, {scope:root, dependencies:[assessment?.version,reduceMotion],revertOnUpdate:true});
  const sender = snapshot?.version.reviewedText.match(/\[LOCAL\]@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const draft = assessment
    ? `${assessment.verificationDraft}${includeSender && sender ? ` Sender address as reviewed: ${sender}.` : ''}`
    : '';

  if (!assessment) return <div className="brief-sheet mx-auto max-w-3xl" ref={root}>
    <div className="brief-masthead"><p>ProofRoute / Evidence brief</p><Link className="text-sm underline" to={`/cases/${caseId}`}>Back to the evidence</Link></div>
    <h1 className="mt-2 font-editorial text-4xl leading-tight">{error ? 'The brief could not open' : snapshot?.run && ['queued', 'running'].includes(snapshot.run.status) ? 'The check is still running' : snapshot ? 'No completed check yet' : 'Opening your evidence'}</h1>
    <p className="mt-4 text-sm text-muted" role="status">{error || (snapshot?.run && ['queued', 'running'].includes(snapshot.run.status) ? 'Your brief will appear here when the check finishes.' : 'Return to the evidence to run or review this check.')}</p>
  </div>;

  return (
    <div className="brief-sheet mx-auto max-w-3xl" ref={root}>
      <div className="brief-masthead" data-brief-reveal><p>ProofRoute / Evidence brief</p><Link className="text-sm underline" to={`/cases/${caseId}`}>
        Back to the evidence
      </Link></div>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {assessment ? <ModeBadge mode={assessment.sourceMode} /> : <span>{snapshot ? 'Live' : 'Loading'}</span>}
        {assessment ? <AnalysisBadge mode={assessment.analysisMode} /> : null}
        <span>
          {assessment?.inputMode === 'synthetic' ? 'Synthetic input' : snapshot ? 'User-supplied text' : ''}
          {assessment ? ` · version ${assessment.version}` : ''}
        </span>
      </div>
      {assessment ? (
        <details className="brief-analysis"><summary>About this analysis</summary><p className="mt-3 text-sm text-muted" data-testid="analysis-note">
          {analysisNote({
            analysisMode: assessment.analysisMode,
            modelId: assessment.modelId,
            sourceMode: assessment.sourceMode,
            errorCode: assessment.errorCode,
            providerConfigured: Boolean(snapshot?.providerConfigured),
          })}
        </p></details>
      ) : null}
      <h1 className="mt-2 font-editorial text-4xl leading-tight" data-testid="recommendation" data-brief-reveal>
        {assessment?.headline || (snapshot ? 'Brief not ready' : 'Loading this brief.')}
      </h1>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        {(assessment?.reasons ?? []).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Still unknown</h2>
      <ul className="mt-2 list-disc pl-5">
        {(assessment?.unresolvedQuestions ?? []).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Next step</h2>
      {assessment?.approvedRoute ? (
        <a className="official-route-button brief-official-route" title={assessment.approvedRoute.label} href={assessment.approvedRoute.url} target="_blank" rel="noreferrer" data-testid="official-route">
          {assessment.approvedRoute.kind === 'application' ? 'Open official application' : 'Open employer’s official route'} <span aria-hidden="true">↗</span>
        </a>
      ) : null}
      {assessment?.approvedRoute ? <p className="brief-route-caption">{assessment.approvedRoute.label} · Opens a new tab</p> : null}
      {assessment ? <p className="mt-4">We couldn't identify a recruiting verification contact.</p> : null}
      <label className="mt-4 block text-sm font-medium" htmlFor="draft">
        Verification draft. ProofRoute does not send it.
      </label>
      <textarea id="draft" className="mt-2 min-h-32 w-full rounded-control border border-ink/30 p-3" readOnly value={draft} />
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={includeSender} onChange={(event) => setIncludeSender(event.target.checked)} />
        Include the reviewed sender address
      </label>
      <button
        type="button"
        className="brief-copy-button"
        onClick={() => {
          void navigator.clipboard.writeText(draft).then(() => setCopied('Draft copied.')).catch(() => setCopied('Clipboard unavailable. Select and copy the draft above.'));
        }}
        disabled={!assessment}
      >
        Copy draft
      </button>
      {copied ? <p className="mt-2 text-sm" role="status">{copied}</p> : null}
      {assessment ? <><h2 className="mt-8 text-lg font-semibold">Evidence attached</h2><p className="mt-2 text-sm text-muted">Each source has a limited scope. None authenticates the sender.</p><ul className="mt-4 space-y-3">{snapshot.evidence.map(item => <li key={item.id} className="rounded-control border border-line p-3"><p className="eyebrow">{item.scope.replaceAll('_', ' ')} · {item.sourceMode}</p><p className="mt-2 text-sm">{item.limitations[0]}</p>{item.sourceUrl ? <a className="mt-2 block break-all text-sm underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}</a> : <p className="mt-2 text-sm">Source: the reviewed message.</p>}</li>)}</ul></> : null}
      <h2 className="mt-8 text-lg font-semibold">For a career adviser</h2>
      <p className="mt-2 max-w-prose">
        Share the downloaded brief if you want help. It records what was checked, what is unresolved, and the official route. It does not say the sender was verified, and it does not include an unredacted original.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'md')}>
          Download Markdown
        </a>
        <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'json')}>
          Download JSON
        </a>
        <button
          type="button"
          className="brief-print-button"
          onClick={() => window.print()}
          disabled={!assessment}
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
