import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { redactText } from '@proofroute/contracts/browser';
import {
  appendMessage,
  deleteCase,
  ensureSession,
  getCase,
  getScenarios,
  startRun,
  type CaseSnapshot,
  type EvidenceItem,
  type Finding,
} from '../api';
import { AnalysisBadge, ModeBadge, StatusPill, useUi } from '../ui';
import { EvidenceMap, DecisionChange } from '../components/EvidenceMap';
import { NextStep } from '../components/NextStep';

const STEPS = ['Read', 'Check sources', 'Compare', 'Next step'] as const;
const CLAIM_TITLES = { employer_route: 'Employer route', listing: 'Published role', sender: 'Sender identity', request: 'Requested action' };

function stageIndex(snapshot: CaseSnapshot | null): number {
  if (!snapshot?.run) return 0;
  if (['complete', 'partial', 'interrupted', 'cancelled'].includes(snapshot.run.status)) return 3;
  const types = snapshot.events.map((event) => event.type);
  if (types.includes('tool.completed') || types.includes('tool.failed')) return 2;
  if (types.includes('tool.started') || types.includes('claims.extracted')) return 1;
  return 0;
}

function localTime(value?: string | null): string {
  if (!value) return 'Not finished';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function highlighted(text: string, quotes: string[]) {
  const ranges = quotes
    .filter(Boolean)
    .map((quote) => ({ quote, start: text.indexOf(quote) }))
    .filter((range) => range.start >= 0)
    .sort((a, b) => a.start - b.start);
  const pieces: Array<{ text: string; marked: boolean }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) pieces.push({ text: text.slice(cursor, range.start), marked: false });
    pieces.push({ text: range.quote, marked: true });
    cursor = range.start + range.quote.length;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), marked: false });
  return pieces;
}

export function CasePage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const { reduceMotion } = useUi();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const claimButton = useRef<HTMLButtonElement | null>(null);
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Finding | null>(null);
  const [tracedKey, setTracedKey] = useState<Finding['claimKey'] | null>(null);
  const closeSources = useCallback(() => setSelected(null), []);
  const [followUp, setFollowUp] = useState('');
  const [sampleFollowUp, setSampleFollowUp] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [followReviewed, setFollowReviewed] = useState(false);

  useEffect(() => {
    let stop = false;
    let source: EventSource | null = null;
    const load = async () => {
      const next = await getCase(caseId);
      if (stop) return;
      setSnapshot(next);
      if (!stop && next.run && ['queued', 'running'].includes(next.run.status) && !source) {
        source = new EventSource(`/api/cases/${caseId}/runs/${next.run.id}/events`);
        const refresh = () => {
          void getCase(caseId).then((value) => {
            if (!stop) setSnapshot(value);
          });
        };
        for (const type of ['run.started', 'claims.extracted', 'tool.started', 'tool.completed', 'tool.failed', 'finding.updated', 'assessment.completed', 'run.partial', 'run.cancelled']) {
          source.addEventListener(type, refresh);
        }
        source.onerror = () => source?.close();
      }
    };
    void ensureSession()
      .then(load)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'This case could not be opened.'));
    const timer = setInterval(() => {
      void getCase(caseId)
        .then((next) => {
          if (!stop) setSnapshot(next);
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
      source?.close();
    };
  }, [caseId]);

  useEffect(() => {
    const id = snapshot?.case.scenarioId;
    if (!id) return;
    void getScenarios()
      .then((rows) => setSampleFollowUp(rows.find((row) => row.id === id)?.followUpText ?? ''))
      .catch(() => undefined);
  }, [snapshot?.case.scenarioId]);

  const assessment = snapshot?.assessment;
  const loading = !snapshot && !error;
  useGSAP(
    () => {
      if (reduceMotion || !assessment || !workspaceRef.current) return;
      gsap.from('.evidence-card, .decision-change', { y: 12, opacity: 0, duration: .4, stagger: .07, ease: 'power2.out' });
    },
    { scope: workspaceRef, dependencies: [assessment?.version, reduceMotion], revertOnUpdate: true },
  );

  useEffect(() => {
    if (!assessment) return;
    setAnnouncement(`${assessment.headline}. Sender remains unresolved.`);
  }, [assessment?.headline, assessment?.version]);

  const stage = stageIndex(snapshot);
  const checkingJobs = snapshot?.events.some((event) => event.type === 'tool.started' && String(event.payload.tool).includes('Job')) && stage < 3;
  const elapsed = snapshot?.run?.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(snapshot.run.startedAt)) / 1000)) : 0;
  const quotes = assessment?.findings.map((finding) => finding.inputSpan?.quote || '') ?? [];
  const message = snapshot?.version.reviewedText ?? '';
  const cache = snapshot?.evidence.find((item) => item.scope === 'listing')?.cacheStatus;
  const mode = assessment?.sourceMode || snapshot?.case.sourcePreference || 'live';
  const running = Boolean(snapshot?.run && ['queued', 'running'].includes(snapshot.run.status));

  async function recheck() {
    if (busy || running || !snapshot) return;
    setBusy(true);
    setError('');
    try {
      await startRun(caseId, { refresh: true });
      setSelected(null);
      setSnapshot(await getCase(caseId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not recheck the sources. Please try again.');
    } finally { setBusy(false); }
  }

  async function addFollowUp() {
    if (!snapshot || busy || running || !followUp.trim()) return;
    if (!followReviewed) {
      setFollowUp(redactText(followUp).text);
      setFollowReviewed(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const redacted = redactText(followUp).text;
      await appendMessage(caseId, redacted, snapshot.version.version);
      await startRun(caseId);
      setFollowUp('');
      setFollowReviewed(false);
      setSnapshot(await getCase(caseId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The follow-up could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6" ref={workspaceRef}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{snapshot?.case.scenarioId ? 'Synthetic scenario' : 'Reviewed message'}</p>
          <h1 className="case-heading">{snapshot?.case.title || 'Check'}</h1>
          {snapshot ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModeBadge mode={mode} cache={cache} />
              {assessment ? <AnalysisBadge mode={assessment.analysisMode} /> : null}
              <span className="text-sm text-muted">Checked {localTime(assessment?.createdAt || snapshot.run?.finishedAt)}</span>
            </div>
          ) : null}
        </div>
        <div className="case-actions flex flex-wrap gap-2">
          <button type="button" className="recheck-button" disabled={!snapshot || running || busy} onClick={() => void recheck()}>{busy ? 'Starting…' : mode === 'fixture' ? 'Replay check' : 'Recheck sources'} <span aria-hidden="true">↻</span></button>
          <Link className="inline-flex min-h-11 items-center rounded-control border border-ink px-3 no-underline" to="/">
            New check
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-control border border-ink px-3"
            onClick={() => {
              void deleteCase(caseId).then(() => navigate('/')).catch(() => setError('Could not reset this check. Please try again.'));
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <ol className="case-progress mt-5 grid gap-2 sm:grid-cols-4" aria-label="Check progress">
        {STEPS.map((step, index) => (
          <li key={step} className={`rounded-control border px-3 py-2 text-sm ${index === stage ? 'border-ink bg-surface' : 'border-line'}`}>
            <span className="text-muted">{index < stage ? 'Done' : index === stage ? 'Now' : 'Later'}</span>
            <div className="font-medium">{step}</div>
          </li>
        ))}
      </ol>
      {checkingJobs ? <p className="mt-3 text-sm">Checking the employer's published jobs… {elapsed}s elapsed.</p> : null}
      {snapshot?.run?.status === 'partial' || snapshot?.run?.status === 'interrupted' ? (
        <p className="mt-3 rounded-control bg-caution-soft px-3 py-2 text-sm text-caution">
          Some checks couldn't finish. These findings are still available.
          {snapshot.run.errorCode ? ` ${snapshot.run.errorCode}.` : ''}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {assessment ? <DecisionChange assessment={assessment} previous={snapshot?.previousAssessment} /> : null}
      <div className="case-workspace mt-6" aria-busy={running}>
        <MessagePane text={message} quotes={quotes} activeQuote={assessment?.findings.find(item => item.claimKey === tracedKey)?.inputSpan?.quote} />
        <section className="order-2" aria-label="Evidence">
          <div className="evidence-section-heading">
            <h2 className="text-lg font-semibold">What the sources show</h2>
            {assessment ? (
              <p className="text-xs text-muted">
                {assessment.coverageAnswered}/{assessment.coverageTotal} answered <span>· Coverage, not a safety score</span>
              </p>
            ) : (
              <p className="text-sm text-muted">{loading ? 'Loading this check.' : 'Waiting for the check.'}</p>
            )}
          </div>
          {assessment ? <EvidenceMap assessment={assessment} onSelect={setSelected} onTrace={setTracedKey} activeKey={tracedKey} /> : <div className="investigation-wait" role="status"><div className="wait-orbit" aria-hidden="true"><span>?</span></div><h3>Building your Proof Path</h3><p>{STEPS[stage]} · Evidence appears after the checks finish.</p><span>No conclusion yet. A match will never verify the sender.</span></div>}
          <div className="space-y-3">
            {(assessment?.findings ?? []).map((finding, index) => (
              <article
                key={finding.claimId}
                className={`evidence-card rounded-panel border bg-surface p-4 ${assessment?.changeSummary?.changedClaimKeys.includes(finding.claimKey) ? 'border-caution' : 'border-line'}`}
                data-changed={assessment?.changeSummary?.changedClaimKeys.includes(finding.claimKey)}
                data-traced={tracedKey === finding.claimKey}
                onMouseEnter={() => setTracedKey(finding.claimKey)}
                onMouseLeave={() => setTracedKey(null)}
                onFocus={() => setTracedKey(finding.claimKey)}
                onBlur={() => setTracedKey(null)}
              >
                {assessment?.changeSummary?.changedClaimKeys.includes(finding.claimKey) ? <p className="eyebrow changed-label">Updated by the new message</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="finding-title"><span>0{index + 1}</span>{CLAIM_TITLES[finding.claimKey]}</h3>
                  {finding.claimKey === 'request' && assessment?.recommendedAction === 'pause_sensitive_action' ? <span className="inline-flex min-h-7 items-center rounded-full bg-danger-soft px-2.5 text-sm font-medium text-danger">Risk detected</span> : <StatusPill status={finding.status} />}
                </div>
                <p className="mt-2 max-w-prose">{finding.explanation}</p>
                {finding.inputSpan?.quote ? <blockquote className="finding-quote"><span>From your message</span><p>“{finding.inputSpan.quote}”</p></blockquote> : null}
                <button
                  type="button"
                  className="mt-3 min-h-11 underline"
                  ref={finding.claimKey === 'listing' ? claimButton : undefined}
                  onClick={(event) => {
                    claimButton.current = event.currentTarget;
                    setSelected(finding);
                  }}
                >
                  {finding.evidenceIds.length ? `Trace ${finding.evidenceIds.length === 1 ? 'the source' : `${finding.evidenceIds.length} sources`}` : 'Why this stays unresolved'} <span aria-hidden="true">↗</span>
                </button>
              </article>
            ))}
          </div>
        </section>
        <aside className="order-1 min-[1100px]:order-3">
          <NextStep assessment={assessment} caseId={caseId} loading={loading} providerConfigured={Boolean(snapshot?.providerConfigured)} />
          <form
            className="follow-up-card mt-4 rounded-panel border border-line bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void addFollowUp();
            }}
          >
            <h3 className="font-medium">Add the next message</h3>
            <p className="mt-2 text-sm text-muted">Conversations change. Keep the evidence, check the new request.</p>
            <label className="mt-2 block text-sm" htmlFor="follow-up">
              {followReviewed ? 'Review the redacted follow-up' : 'Fictional follow-up'}
            </label>
            <textarea
              id="follow-up"
              className="mt-2 min-h-28 w-full rounded-control border border-ink/30 p-3"
              value={followUp}
              maxLength={20000}
              onChange={(event) => { setFollowUp(event.target.value); setFollowReviewed(false); }}
            />
            {followReviewed ? <p className="mt-2 text-sm text-supported" role="status">Review this copy. The next click shares it with our server and AI provider. Use fictional messages only.</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className="min-h-11 rounded-control bg-action px-4 text-action-ink" disabled={busy || running || !assessment || !followUp.trim()}>
                {busy ? 'Starting…' : followReviewed ? 'Check the new message' : 'Review the new message'}
              </button>
              {sampleFollowUp ? (
                <button type="button" className="min-h-11 rounded-control border border-ink px-3" onClick={() => { setFollowUp(sampleFollowUp); setFollowReviewed(false); document.getElementById('follow-up')?.focus(); }}>
                  Use the sample follow-up
                </button>
              ) : null}
            </div>
          </form>
          <Activity events={snapshot?.events ?? []} />
        </aside>
      </div>
      {selected ? (
        <SourceDrawer
          finding={selected}
          evidence={(snapshot?.evidence ?? []).filter((item) => selected.evidenceIds.includes(item.id))}
          onClose={closeSources}
        />
      ) : null}
    </div>
  );
}

function MessagePane({ text, quotes, activeQuote }: { text: string; quotes: string[]; activeQuote?: string }) {
  const body = (
    <p className="whitespace-pre-wrap break-words">
      {highlighted(text, quotes).map((piece, index) =>
        piece.marked ? (
          <mark key={index} className="message-mark bg-caution-soft" data-active={Boolean(activeQuote && (piece.text === activeQuote || piece.text.includes(activeQuote)))}>
            {piece.text}
          </mark>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </p>
  );
  return (
    <>
      <section className="order-3 hidden rounded-panel border border-line bg-surface p-4 md:block min-[1100px]:order-1">
        <h2 className="text-sm font-medium">Reviewed message</h2>
        <div className="mt-3 text-sm">{body}</div>
      </section>
      <details className="order-4 rounded-panel border border-line bg-surface p-4 md:hidden">
        <summary className="min-h-11 cursor-pointer font-medium">Original message</summary>
        <div className="mt-3 text-sm">{body}</div>
      </details>
    </>
  );
}

function Activity({ events }: { events: CaseSnapshot['events'] }) {
  const names: Record<string, string> = { getPublishedJob: 'Read the public job listing', listPublishedJobs: 'Look up published roles', compareClaimedDomain: 'Compare the claimed domain', getEmployerProfile: 'Check the reviewed employer', getApprovedRecruitingPage: 'Find the official careers route' };
  const rows = events.filter((event) => event.type.startsWith('tool.') || event.type === 'claims.extracted');
  if (!rows.length) return null;
  return (
    <details className="mt-4 rounded-panel border border-line bg-surface p-4">
      <summary className="min-h-11 cursor-pointer font-medium">How this check worked</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((event) => (
          <li key={event.sequence} className="border-l border-line pl-3 py-1">
            <p className="font-medium">{event.type === 'claims.extracted' ? 'Read the message and plan checks' : names[String(event.payload.tool)] || String(event.payload.tool || 'Source check')}</p>
            <p className="mt-1 text-xs text-muted">{event.type === 'claims.extracted' ? (event.payload.analysisMode === 'nemotron' ? `Nemotron · ${String(event.payload.modelId || '')}` : 'Evidence policy · no model inference') : `${event.type === 'tool.completed' ? 'Completed' : event.type === 'tool.failed' ? 'Could not complete' : 'Started'}${typeof event.payload.durationMs === 'number' ? ` · ${event.payload.durationMs} ms` : ''}${event.payload.source ? ` · ${String(event.payload.source)}` : ''}${event.payload.proposedBy ? ` · planned by ${String(event.payload.proposedBy)}` : ''}`}</p>
            {event.payload.purpose ? <p className="mt-1 text-xs">{String(event.payload.purpose)}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceDrawer({ finding, evidence, onClose }: { finding: Finding; evidence: EvidenceItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduceMotion } = useUi();
  useGSAP(() => {
    if (!reduceMotion && ref.current) gsap.from(ref.current, { x: 32, opacity: 0, duration: .24, ease: 'power2.out' });
  }, { scope: ref, dependencies: [reduceMotion], revertOnUpdate: true });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const items = () => [...root.querySelectorAll<HTMLElement>('button, a, summary')];
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = items();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="source-overlay fixed inset-0 z-20 flex justify-end bg-ink/30" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="source-title" className="source-drawer h-full w-full max-w-md overflow-y-auto bg-surface shadow-xl">
        <div className="source-drawer-top"><span className="eyebrow">The evidence record</span><button type="button" className="source-close" onClick={onClose}>Close sources <span aria-hidden="true">×</span></button></div>
        <h2 id="source-title" className="mt-4 text-xl font-semibold">
          {finding.question}
        </h2>
        <p className="mt-2">{finding.explanation}</p>
        {finding.inputSpan?.quote ? <blockquote className="mt-3 border-l-2 border-ink pl-3 text-sm">"{finding.inputSpan.quote}"</blockquote> : null}
        {evidence.length === 0 ? <p className="mt-4 text-sm">No source record is attached. The question stays unresolved.</p> : null}
        {evidence.map((item) => (
          <article key={item.id} className="source-record mt-4 text-sm">
            <div className="source-record-meta"><span>{item.scope.replaceAll('_', ' ')}</span><span>{item.sourceMode} · {item.freshness || 'unspecified'} freshness</span></div>
            <p className="mt-2">{item.excerpt.length > 320 ? `${item.excerpt.slice(0, 320)}…` : item.excerpt}</p>
            {item.excerpt.length > 320 ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 underline">Read the full recorded excerpt</summary><p className="mt-2">{item.excerpt}</p></details> : null}
            <p className="mt-2 font-mono text-xs break-all">Retrieved {localTime(item.retrievedAt)}</p>
            {item.sourceUrl ? (
              <a className="source-outbound" href={item.sourceUrl} target="_blank" rel="noreferrer">
                Open {new URL(item.sourceUrl).hostname} <span aria-hidden="true">↗</span><span className="sr-only">. Leaves ProofRoute in a new tab.</span>
              </a>
            ) : null}
            <p className="eyebrow mt-4">What this source can establish</p><ul className="mt-2 list-disc pl-5">
              {item.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
