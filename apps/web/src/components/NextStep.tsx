import { Link } from 'react-router';
import type { Assessment } from '../api';
import { analysisNote } from '../ui';

export function NextStep({ assessment, caseId, loading, providerConfigured }: { assessment?: Assessment | null; caseId: string; loading: boolean; providerConfigured: boolean }) {
  const paused = assessment?.recommendedAction === 'pause_sensitive_action';
  return <section className="next-step recommendation-card" data-paused={paused} aria-labelledby="next-step-title">
    <div className="next-step-kicker"><span className="next-step-icon" aria-hidden="true">{paused ? 'Ⅱ' : '↗'}</span><span className="eyebrow">Your next move</span>{assessment ? <span className="next-step-version">V{assessment.version}</span> : null}</div>
    <h2 id="next-step-title" data-testid="recommendation">{assessment?.headline || (loading ? 'Opening your evidence desk.' : 'Following the evidence…')}</h2>
    {assessment ? <>
      <ul className="decision-reasons">{assessment.reasons.slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul>
      <div className="route-destination">
        <p className="eyebrow">An independent way forward</p>
        {assessment.approvedRoute ? <><a className="official-route-button" data-testid="official-route" title={assessment.approvedRoute.label} href={assessment.approvedRoute.url} target="_blank" rel="noreferrer">{assessment.approvedRoute.kind === 'application' ? 'Open official application' : 'Open employer’s official route'}<span aria-hidden="true">↗</span></a><p className="route-caption">{new URL(assessment.approvedRoute.url).hostname} · Opens a new tab</p></> : <p className="mt-2 text-sm">No approved route is available. Seek an independent contact through the employer.</p>}
      </div>
      <details className="decision-limits"><summary>What this check cannot confirm</summary><ul>{assessment.unresolvedQuestions.map(item => <li key={item}>{item}</li>)}</ul><p>No recruiting verification contact was identified. Nothing is sent automatically.</p></details>
      <Link className="brief-button" to={`/cases/${caseId}/brief`}>Save or share your evidence <span aria-hidden="true">→</span></Link>
      <p className="next-step-footnote">Sender identity remains unverified.</p>
      <details className="analysis-disclosure"><summary>About this analysis</summary><p data-testid="analysis-note">{analysisNote({analysisMode: assessment.analysisMode,modelId:assessment.modelId,sourceMode:assessment.sourceMode,errorCode:assessment.errorCode,providerConfigured})}</p></details>
    </> : <p className="mt-4 text-sm text-muted">We’re checking the claims against the available sources. No conclusion yet.</p>}
  </section>;
}
