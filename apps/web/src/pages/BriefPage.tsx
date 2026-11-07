import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ensureSession, exportHref, getCase, type CaseSnapshot } from '../api';
import { AnalysisBadge, ModeBadge, analysisNote } from '../ui';

export function BriefPage() {
  const { caseId = '' } = useParams();
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [includeSender, setIncludeSender] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void ensureSession()
      .then(() => getCase(caseId))
      .then(setSnapshot)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The brief could not be opened.'));
  }, [caseId]);

  const assessment = snapshot?.assessment;
  const sender = snapshot?.version.reviewedText.match(/\[LOCAL\]@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const draft = assessment
    ? `${assessment.verificationDraft}${includeSender && sender ? ` Sender address as reviewed: ${sender}.` : ''}`
    : '';

  return (
    <div className="brief-sheet mx-auto max-w-3xl">
      <Link className="text-sm underline" to={`/cases/${caseId}`}>
        Back to the evidence
      </Link>
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
        <p className="mt-3 text-sm text-muted" data-testid="analysis-note">
          {analysisNote({
            analysisMode: assessment.analysisMode,
            modelId: assessment.modelId,
            sourceMode: assessment.sourceMode,
            errorCode: assessment.errorCode,
            providerConfigured: Boolean(snapshot?.providerConfigured),
          })}
        </p>
      ) : null}
      <h1 className="mt-2 font-editorial text-4xl leading-tight" data-testid="recommendation">
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
        <a className="mt-3 inline-flex min-h-11 items-center rounded-control bg-action px-4 text-action-ink no-underline" href={assessment.approvedRoute.url} target="_blank" rel="noreferrer" data-testid="official-route">
          {assessment.approvedRoute.label}. Opens outside ProofRoute.
        </a>
      ) : null}
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
        className="mt-3 min-h-11 rounded-control border border-ink px-4"
        onClick={() => {
          void navigator.clipboard.writeText(draft).then(() => setCopied('Draft copied.'));
        }}
      >
        Copy draft
      </button>
      {copied ? <p className="mt-2 text-sm">{copied}</p> : null}
      <h2 className="mt-8 text-lg font-semibold">For a career adviser</h2>
      <p className="mt-2 max-w-prose">
        Share the downloaded brief if you want help. It records what was checked, what is unresolved, and the official route. It does not say the sender was verified, and it does not include an unredacted original.
      </p>
      <div className="mt-4 flex flex-wrap gap-4">
        <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'md')}>
          Download Markdown
        </a>
        <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'json')}>
          Download JSON
        </a>
      </div>
    </div>
  );
}
