import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { normalizeRoleReference, redactText } from '@proofroute/contracts/browser';
import { createCase, ensureSession, getEmployers, getScenarios, startRun, type EmployerOption, type Scenario, type SessionInfo } from '../api';
import { useUi } from '../ui';
import { StoryPreview } from '../components/StoryPreview';

export function HomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reduceMotion } = useUi();
  const hero = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [employers, setEmployers] = useState<EmployerOption[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [text, setText] = useState('');
  const [employerId, setEmployerId] = useState('figma');
  const [roleReference, setRoleReference] = useState('');
  const [scenarioId, setScenarioId] = useState<string | undefined>();
  const [banner, setBanner] = useState('');
  const [step, setStep] = useState<'paste' | 'review'>('paste');
  const [summary, setSummary] = useState<Array<{ category: string; count: number }>>([]);
  const [fixture, setFixture] = useState(false);
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputKind, setInputKind] = useState<'paste' | 'email'>('paste');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const importVersion = useRef(0);

  async function importEmail(file?: File) {
    if (!file) return;
    const version = ++importVersion.current;
    setImporting(true);
    setError('');
    try {
      const { parseEmailFile } = await import('../email-import');
      const result = await parseEmailFile(file);
      if (version !== importVersion.current) return;
      setText(result.text);
      setScenarioId(undefined);
      setBanner('');
      setAttested(false);
      setSummary([]);
      setStep('paste');
      setImportNote(`Email opened locally. ${result.attachmentCount ? `${result.attachmentCount} attachment(s) excluded. ` : ''}Sender headers are claims, not proof of identity.`);
    } catch (reason) {
      if (version === importVersion.current) setError(reason instanceof Error ? reason.message : 'The email could not be opened.');
    } finally {
      if (version === importVersion.current) setImporting(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const next = await ensureSession();
      setSession(next);
      const [employerRows, scenarioRows] = await Promise.all([getEmployers(), getScenarios()]);
      setEmployers(employerRows);
      setScenarios(scenarioRows);
      const requested = params.get('scenario');
      const chosen = scenarioRows.find((item) => item.id === requested) ?? null;
      if (chosen) applyScenario(chosen);
    })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The app could not start.'));
  }, [params]);

  useGSAP(
    () => {
      if (reduceMotion || !hero.current) return;
      gsap.from(hero.current.querySelectorAll('[data-reveal]'), {
        y: 12,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.05,
      });
    },
    { scope: hero, dependencies: [reduceMotion], revertOnUpdate: true },
  );

  function applyScenario(scenario: Scenario) {
    importVersion.current++;
    setImporting(false);
    setImportNote('');
    setInputKind('paste');
    setText(scenario.text);
    setEmployerId(scenario.employerId ?? '');
    setRoleReference(scenario.jobId);
    setScenarioId(scenario.id);
    setBanner(scenario.banner);
    setStep('paste');
    setAttested(true);
    setError('');
  }

  const employer = employers.find((item) => item.id === employerId);
  const role = normalizeRoleReference(roleReference, employer?.boardToken);
  const tooLong = text.length > 20_000;

  function review() {
    if (importing) return;
    if (!text.trim()) {
      setError('Add a message before reviewing it.');
      return;
    }
    if (tooLong) {
      setError('Shorten the message to 20,000 characters or fewer.');
      return;
    }
    if (role.error) {
      setError(role.error);
      return;
    }
    const redacted = redactText(text);
    setText(redacted.text);
    setSummary(redacted.summary.map((item) => ({ category: item.category, count: item.count })));
    setStep('review');
    setError('');
  }

  async function checkOffer() {
    if (busy) return;
    if (!text.trim() || tooLong || role.error) {
      setError(role.error || 'Add a message of 20,000 characters or fewer.');
      return;
    }
    if (!attested) {
      setError('Confirm this message is synthetic before continuing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createCase({
        reviewedText: text,
        employerId: employerId || null,
        roleReference: role.jobId,
        inputMode: scenarioId ? 'synthetic' : 'user_supplied',
        scenarioId,
        sourcePreference: fixture ? 'fixture' : 'live',
      });
      await startRun(created.caseId);
      navigate(`/cases/${created.caseId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The check could not start.');
      setBusy(false);
    }
  }

  return (
    <div className="home-shell" ref={hero}>
      {session?.demoMode ? (
        <p className="demo-notice">
          <span className="demo-dot" aria-hidden="true" /> <strong>Interactive demo</strong><span>Use fictional messages. You review what’s shared before any AI check.</span>
        </p>
      ) : null}
      <div className="intake-grid">
      <div className="hero-copy">
        <p className="eyebrow" data-reveal>
          A little evidence. A clearer next step.
        </p>
        <h1 className="hero-title" data-reveal>
          Real job.<br /><span>Wrong person?</span>
        </h1>
        <p className="hero-description" data-reveal>
          Don’t lose a good opportunity to a convincing message. Check the evidence. Keep your next move in your hands.
        </p>
        <StoryPreview />
      </div>

      <form
        className="intake-card" data-reveal
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 'paste') review();
          else void checkOffer();
        }}
      >
        <div className="intake-heading"><div><p className="eyebrow">Your evidence desk</p><h2>{step === 'paste' ? 'Start with the message.' : 'Review before you share.'}</h2></div><span className="step-count">{step === 'paste' ? '01' : '02'}<span> / 02</span></span></div>
        <div className="intake-stepper" aria-label="Message review progress"><span className={step === 'paste' ? 'active' : 'complete'}>1. Add a message</span><span className={step === 'review' ? 'active' : ''}>2. Review & check</span></div>
        {step === 'paste' ? <>
          <div className="input-choice" role="group" aria-label="Choose how to add your message">
            <button type="button" aria-pressed={inputKind === 'paste'} onClick={() => { importVersion.current++; setImporting(false); setInputKind('paste'); setError(''); }}>Paste a message</button>
            <button type="button" aria-pressed={inputKind === 'email'} onClick={() => { setInputKind('email'); setError(''); }}>Upload an email</button>
          </div>
          {inputKind === 'email' ? <div className="email-import">
            <p className="eyebrow">An email. The same evidence check.</p>
            <h3>Bring the conversation.</h3>
            <p>Open an .eml file from your mail app. Read locally, then review what you share.</p>
            <label className="email-file-label" htmlFor="email-file">Choose an email file <span aria-hidden="true">↗</span></label>
            <input id="email-file" type="file" accept=".eml,message/rfc822" disabled={importing} onChange={event => { void importEmail(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
            <p className="email-import-help">Up to 2 MB · Attachments and remote images are not opened.</p>
            <a href="/samples/fictional-recruiting.eml" download>Download a fictional email to try <span aria-hidden="true">↓</span></a>
          </div> : null}
        </> : null}
        {importing ? <p role="status" className="import-status">Opening email locally…</p> : null}
        {importNote ? <p role="status" className="import-status">{importNote}</p> : null}
        {step === 'paste' && inputKind === 'paste' && !text ? <div className="sample-start"><span className="eyebrow">No message? Start here.</span><button type="button" disabled={!scenarios.length} onClick={() => { const sample = scenarios.find(item => item.id === 'scn-conversation-shift'); if (sample) { applyScenario(sample); document.getElementById('offer')?.focus(); } }}>Find the moment the conversation changes <span aria-hidden="true">↗</span></button><p>Fictional sender. A real public job board.</p></div> : null}
        {banner ? <p className="sample-banner" role="status">{banner}</p> : null}
        {step === 'review' ? <p className="mb-3 text-sm text-supported" role="status">Personal details have been checked for redaction. Review the text below before sending it.</p> : null}
        <label className="block text-sm font-medium" htmlFor="offer">
          {step === 'review' ? 'Reviewed message' : 'Recruiting message'}
        </label>
        <textarea
          id="offer"
          disabled={importing}
          className="message-input mt-2 w-full rounded-control border border-line bg-paper p-4"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setAttested(false);
            setScenarioId(undefined);
            setBanner('');
            if (step === 'review') setStep('paste');
          }}
          maxLength={20000}
          placeholder="Paste a fictional recruiting email or message here…"
        />
        <p className="mt-1 text-right font-mono text-[11px] text-muted">{text.length.toLocaleString()} / 20,000</p>
        {step === 'review' && summary.length ? (
          <ul className="mt-3 text-sm">
            {summary.map((item) => (
              <li key={item.category}>
                Replaced {item.count} {item.category} {item.count === 1 ? 'value' : 'values'}. You can edit the result before the check.
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Employer
            <select
              className="mt-2 min-h-11 w-full rounded-control border border-ink/30 bg-paper px-3"
              value={employerId}
              onChange={(event) => { setEmployerId(event.target.value); setStep('paste'); }}
            >
              {employers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="">Not in the reviewed catalog</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Job ID or board link
            <input
              className="mt-2 min-h-11 w-full rounded-control border border-ink/30 bg-paper px-3"
              value={roleReference}
              onChange={(event) => { setRoleReference(event.target.value); setStep('paste'); }}
              placeholder="Optional"
            />
          </label>
        </div>
        <details className="mt-4 text-sm"><summary className="cursor-pointer py-2 text-muted">Demo options</summary>
        <label className="mt-1 flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={fixture} onChange={(event) => setFixture(event.target.checked)} />
          <span>Use fixture replay. The result is labeled fixture and does not read the live job board.</span>
        </label>
        </details>
        {step === 'review' ? (
          <label className="mt-2 flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
            <span>This message is synthetic or fully fictional.</span>
          </label>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="intake-actions">
          {step === 'paste' ? (
            <button type="submit" className="primary-button" disabled={!text.trim() || tooLong || importing}>
              Review this message <span aria-hidden="true">↗</span>
            </button>
          ) : (
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Starting the check…' : 'Check this offer'}
            </button>
          )}
          <button
            type="button"
            className="sample-button"
            disabled={!scenarios.length || busy}
            onClick={() => {
              const sample = scenarios.find((item) => item.id === 'scn-real-listing') ?? scenarios[0];
              if (sample) applyScenario(sample);
            }}
          >
            Try a sample
          </button>
        </div>
        <p className="intake-privacy">
          <svg width="15" height="17" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M3 9V6a7 7 0 0 1 14 0v3M2 9h16v11H2z" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="14" r="1.5" fill="currentColor" /></svg>
          <span>Redaction happens in your browser. Only after <strong>Check this offer</strong> is reviewed text sent to our server and AI provider. Never paste real passwords or login codes.</span>
        </p>
        {session && !session.providerConfigured ? <p className="mt-3 text-sm text-caution">AI is currently unavailable. Checks use the evidence policy and are labeled policy only.</p> : null}
      </form>
      </div>

      <section id="how" className="how-section">
        <div className="how-heading"><p className="eyebrow">From uncertainty to a next step</p><h2 className="font-editorial">Follow the evidence.</h2><p>Every claim has its own answer.<br />No blanket “safe” badge.</p></div>
        <ol className="how-steps">
          <li><span>01 / REVIEW</span><h3>You decide what’s shared.</h3><p>Review a redacted copy first. You stay in control of the message that leaves your browser.</p></li>
          <li><span>02 / TRACE</span><h3>Sources, not assumptions.</h3><p>Inspect the employer’s public job board. A matching listing never authenticates the sender.</p></li>
          <li><span>03 / ACT</span><h3>Keep the opportunity. Pause the risk.</h3><p>Use an official application route, copy a verification draft, or pause a request for money or credentials.</p></li>
        </ol>
      </section>
    </div>
  );
}
