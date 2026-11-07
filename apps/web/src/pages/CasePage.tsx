import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { redactText } from '@proofroute/contracts/browser';
import {
  appendMessage,
  deleteCase,
  ensureSession,
  exportHref,
  getCase,
  getScenarios,
  startRun,
  type Assessment,
  type CaseSnapshot,
  type EvidenceItem,
  type Finding,
} from '../api';
import { AnalysisBadge, ModeBadge, StatusPill, analysisNote, useUi } from '../ui';

const STEPS = ['Read', 'Check sources', 'Compare', 'Next step'] as const;

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
  const pathRef = useRef<SVGSVGElement>(null);
  const claimButton = useRef<HTMLButtonElement | null>(null);
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Finding | null>(null);
  const closeSources = useCallback(() => setSelected(null), []);
  const [followUp, setFollowUp] = useState('');
  const [sampleFollowUp, setSampleFollowUp] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);

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
  const listingSupported = assessment?.findings.some((finding) => finding.claimKey === 'listing' && finding.status === 'supported');
  useGSAP(
    () => {
      if (reduceMotion || !listingSupported || !pathRef.current) return;
      const path = pathRef.current.querySelector('[data-path="listing"]');
      if (!path) return;
      gsap.fromTo(path, { strokeDasharray: 110, strokeDashoffset: 110 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' });
    },
    { scope: pathRef, dependencies: [listingSupported, reduceMotion], revertOnUpdate: true },
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

  async function addFollowUp() {
    if (!snapshot) return;
    setBusy(true);
    setError('');
    try {
      const redacted = redactText(followUp).text;
      await appendMessage(caseId, redacted, snapshot.version.version);
      await startRun(caseId);
      setFollowUp('');
      setSnapshot(await getCase(caseId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The follow-up could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
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
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex min-h-11 items-center rounded-control border border-ink px-3 no-underline" to="/">
            New check
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-control border border-ink px-3"
            onClick={() => {
              void deleteCase(caseId).then(() => navigate('/'));
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

      <div className="case-workspace mt-6">
        <MessagePane text={message} quotes={quotes} />
        <section className="order-2" aria-label="Evidence">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">What the sources show</h2>
            {assessment ? (
              <p className="text-sm text-muted">
                {assessment.coverageAnswered} of {assessment.coverageTotal} questions answered. This is coverage, not a safety score.
              </p>
            ) : (
              <p className="text-sm text-muted">{loading ? 'Loading this check.' : 'Waiting for the check.'}</p>
            )}
          </div>
          <ProofPath
            svgRef={pathRef}
            listingSupported={Boolean(listingSupported)}
            employerSupported={Boolean(assessment?.findings.some((finding) => finding.claimKey === 'employer_route' && finding.status === 'supported'))}
          />
          <div className="space-y-3">
            {(assessment?.findings ?? []).map((finding) => (
              <article
                key={finding.claimId}
                className={`evidence-card rounded-panel border bg-surface p-4 ${assessment?.changeSummary?.changedClaimKeys.includes(finding.claimKey) ? 'border-caution' : 'border-line'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{finding.question}</h3>
                  <StatusPill status={finding.status} />
                </div>
                <p className="mt-2 max-w-prose">{finding.explanation}</p>
                {finding.claimKey === 'listing' && finding.status === 'supported' ? (
                  <p className="mt-2 text-sm font-medium">This does not verify the sender.</p>
                ) : null}
                {finding.claimKey === 'sender' ? (
                  <p className="mt-2 text-sm font-medium">We have not confirmed that this sender represents the employer.</p>
                ) : null}
                <button
                  type="button"
                  className="mt-3 min-h-11 underline"
                  ref={finding.claimKey === 'listing' ? claimButton : undefined}
                  onClick={(event) => {
                    claimButton.current = event.currentTarget;
                    setSelected(finding);
                  }}
                >
                  View sources
                </button>
              </article>
            ))}
          </div>
        </section>
        <aside className="order-1 min-[1100px]:order-3">
          <div className="recommendation-card rounded-panel border border-line bg-surface p-5" data-paused={assessment?.recommendedAction === 'pause_sensitive_action'}>
            <p className="text-sm text-muted">What matters now</p>
            <h2 className="mt-1 font-editorial text-3xl leading-tight" data-testid="recommendation">
              {assessment?.headline || (loading ? 'Loading this check.' : 'The check is still running.')}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {(assessment?.reasons ?? (loading ? [] : ['Findings will appear here when the check finishes.'])).slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {assessment ? (
              <>
            <h3 className="mt-5 text-sm font-medium">What remains unknown</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {assessment.unresolvedQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
              </>
            ) : null}
            {assessment?.approvedRoute ? (
              <a
                className="mt-5 inline-flex min-h-11 items-center rounded-control bg-action px-4 text-action-ink no-underline"
                data-testid="official-route"
                href={assessment.approvedRoute.url}
                target="_blank"
                rel="noreferrer"
              >
                {assessment.approvedRoute.label}. Opens outside ProofRoute.
              </a>
            ) : assessment ? (
              <p className="mt-5 text-sm">No approved route is available for this version.</p>
            ) : null}
            {assessment?.careersRoute && assessment.careersRoute.url !== assessment.approvedRoute?.url ? (
              <a className="mt-3 block text-sm underline" href={assessment.careersRoute.url} target="_blank" rel="noreferrer">
                {assessment.careersRoute.label}. Opens outside ProofRoute.
              </a>
            ) : null}
            {assessment ? <p className="mt-4 text-sm">We couldn't identify a recruiting verification contact. Nothing is sent automatically.</p> : null}
            <Link className="mt-4 inline-flex min-h-11 items-center underline" to={`/cases/${caseId}/brief`}>
              Open the decision brief
            </Link>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'md')}>
                Download Markdown
              </a>
              <a className="inline-flex min-h-11 items-center underline" href={exportHref(caseId, 'json')}>
                Download JSON
              </a>
            </div>
            {assessment ? (
              <p className="mt-4 text-sm text-muted" data-testid="analysis-note">
                {analysisNote({
                  analysisMode: assessment.analysisMode,
                  modelId: assessment.modelId,
                  sourceMode: assessment.sourceMode,
                  errorCode: assessment.errorCode,
                  providerConfigured: Boolean(snapshot?.providerConfigured),
                })}
              </p>
            ) : null}
          </div>
          {assessment?.changeSummary ? (
            <p className="mt-3 rounded-control bg-caution-soft px-3 py-2 text-sm text-caution">{assessment.changeSummary.headline}</p>
          ) : null}
          <form
            className="mt-4 rounded-panel border border-line bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void addFollowUp();
            }}
          >
            <h3 className="font-medium">Add the next message</h3>
            <label className="mt-2 block text-sm" htmlFor="follow-up">
              Reviewed follow-up
            </label>
            <textarea
              id="follow-up"
              className="mt-2 min-h-28 w-full rounded-control border border-ink/30 p-3"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className="min-h-11 rounded-control bg-action px-4 text-action-ink" disabled={busy || !followUp.trim()}>
                Check the new message
              </button>
              {sampleFollowUp ? (
                <button type="button" className="min-h-11 rounded-control border border-ink px-3" onClick={() => setFollowUp(sampleFollowUp)}>
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

function MessagePane({ text, quotes }: { text: string; quotes: string[] }) {
  const body = (
    <p className="whitespace-pre-wrap break-words">
      {highlighted(text, quotes).map((piece, index) =>
        piece.marked ? (
          <mark key={index} className="bg-caution-soft">
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

function ProofPath({
  svgRef,
  listingSupported,
  employerSupported,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  listingSupported: boolean;
  employerSupported: boolean;
}) {
  return (
    <div className="mb-4 hidden min-[1100px]:block">
      <svg ref={svgRef} viewBox="0 0 360 92" className="w-full" role="img" aria-label="Relationship sketch. The detailed evidence is in the list below.">
        <line x1="40" y1="46" x2="150" y2="46" stroke={employerSupported ? '#16634a' : '#6a4400'} strokeWidth="2" />
        <line data-path="listing" x1="190" y1="46" x2="300" y2="46" stroke={listingSupported ? '#16634a' : '#6a4400'} strokeWidth="2" strokeDasharray={listingSupported ? '0' : '5 6'} />
        <line x1="110" y1="58" x2="180" y2="78" stroke="#6a4400" strokeWidth="2" className="path-dash" />
        <circle cx="28" cy="46" r="8" fill="#17201f" />
        <circle cx="170" cy="46" r="8" fill={employerSupported ? '#16634a' : 'none'} stroke="#17201f" />
        <circle cx="312" cy="46" r="8" fill={listingSupported ? '#16634a' : 'none'} stroke="#17201f" />
        <circle cx="190" cy="80" r="7" fill="none" stroke="#6a4400" strokeDasharray="2 2" />
        <text x="20" y="28" fontSize="11">Message</text>
        <text x="146" y="28" fontSize="11">Employer</text>
        <text x="292" y="28" fontSize="11">Listing</text>
        <text x="204" y="86" fontSize="11">Sender unresolved</text>
      </svg>
    </div>
  );
}

function Activity({ events }: { events: CaseSnapshot['events'] }) {
  const rows = events.filter((event) => event.type.startsWith('tool.') || event.type === 'claims.extracted');
  if (!rows.length) return null;
  return (
    <details className="mt-4 rounded-panel border border-line bg-surface p-4">
      <summary className="min-h-11 cursor-pointer font-medium">Activity</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((event) => (
          <li key={event.sequence}>
            <span className="font-mono text-xs">{event.type}</span>{' '}
            {String(event.payload.tool || event.payload.analysisMode || '')} {String(event.payload.purpose || event.payload.message || '')}
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
    const items = () => [...root.querySelectorAll<HTMLElement>('button, a')];
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
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-ink/30" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="source-title" className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-xl">
        <button type="button" className="min-h-11 underline" onClick={onClose}>
          Close sources
        </button>
        <h2 id="source-title" className="mt-4 text-xl font-semibold">
          {finding.question}
        </h2>
        <p className="mt-2">{finding.explanation}</p>
        {finding.inputSpan?.quote ? <blockquote className="mt-3 border-l-2 border-ink pl-3 text-sm">"{finding.inputSpan.quote}"</blockquote> : null}
        {evidence.length === 0 ? <p className="mt-4 text-sm">No source record is attached. The question stays unresolved.</p> : null}
        {evidence.map((item) => (
          <article key={item.id} className="mt-4 border-t border-line pt-3 text-sm">
            <p>
              {item.scope} · {item.sourceMode} · {item.freshness || 'unspecified'} freshness
            </p>
            <p className="mt-2">{item.excerpt}</p>
            <p className="mt-2 font-mono text-xs break-all">Retrieved {localTime(item.retrievedAt)}</p>
            {item.sourceUrl ? (
              <a className="mt-2 inline-flex min-h-11 items-center underline break-all" href={item.sourceUrl} target="_blank" rel="noreferrer">
                Open source. Leaves ProofRoute. {item.sourceUrl}
              </a>
            ) : null}
            <ul className="mt-2 list-disc pl-5">
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
