import { useState } from 'react';
import type { Assessment, CaseSnapshot } from '../api';

export function ConversationTimeline({ assessment, messages, onTrace }: {
  assessment: Assessment;
  messages: NonNullable<CaseSnapshot['messages']>;
  onTrace: (quote: string) => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const trace = assessment.conversation;
  if (!trace) return null;
  const active = selectedVersion && messages.some(m => m.version === selectedVersion)
    ? selectedVersion : trace.firstSensitiveVersion ?? messages.at(-1)?.version;
  const requests = trace.requests.filter(r => r.messageVersion === active);
  const first = trace.firstSensitiveVersion;
  const message = messages.find(m => m.version === active);
  return <section className="conversation-timeline" aria-labelledby="conversation-title">
    <div className="conversation-intro"><div><p className="eyebrow">Follow the conversation</p>
      <h2 id="conversation-title">{first ? `The pause starts at message ${first}.` : 'Reviewed conversation'}</h2></div>
      <span className="preview-label">{trace.messageCount} {trace.messageCount === 1 ? 'message' : 'messages'} reviewed</span></div>
    <div className="conversation-stops" aria-label="Choose a reviewed message">
      {messages.map(m => {
        const sensitive = trace.requests.some(r => r.messageVersion === m.version);
        return <button type="button" key={m.version} aria-pressed={active === m.version} data-sensitive={sensitive} onClick={() => { setSelectedVersion(m.version); onTrace(trace.requests.find(r => r.messageVersion === m.version)?.quote ?? ''); }}>
          <span className="timeline-dot" aria-hidden="true">{sensitive ? '!' : m.version}</span>
          <strong>Message {m.version}</strong><span>{m.version === first ? 'First sensitive request' : sensitive ? 'Sensitive request' : 'No new request flagged'}</span>
        </button>;
      })}
    </div>
    <div className="conversation-detail" aria-live="polite">
      {requests.length ? requests.map((r, i) => <div key={`${r.category}-${i}`}>
        <p className="eyebrow">{r.origin === 'model' ? 'Contextual finding · Nemotron' : 'Request pattern'} · Message {r.messageVersion}</p>
        <button type="button" className="request-quote" onClick={() => onTrace(r.quote)}>“{r.quote}”</button>
        <dl className="request-facts"><div><dt>Who asks</dt><dd>{r.actor}</dd></div><div><dt>Requested action</dt><dd>{r.action}</dd></div><div><dt>Asset</dt><dd>{r.asset || 'Not established'}</dd></div><div><dt>Destination</dt><dd>{r.destination || 'Not established'}</dd></div></dl>
      </div>) : <><p className="eyebrow">Message {active}</p><details className="message-preview"><summary>Read message {active}</summary><p className="timeline-message">{message?.text}</p></details></>}
      {first && active !== first ? <p className="retained-warning">The request from message {first} still needs independent verification. A later reply does not clear it.</p> : null}
    </div>
  </section>;
}
