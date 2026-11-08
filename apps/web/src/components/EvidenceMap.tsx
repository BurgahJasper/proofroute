import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { Assessment, Finding } from '../api';
import { useUi } from '../ui';

const labels = { employer_route: 'Employer', listing: 'Job listing', sender: 'Sender', request: 'The request' };
const actions: Record<string, string> = { use_official_route: 'Use the official route', verify_independently: 'Verify independently', pause_sensitive_action: 'Pause the sensitive request' };
export function EvidenceMap({ assessment, onSelect, onTrace, activeKey }: { assessment: Assessment; onSelect: (finding: Finding) => void; onTrace: (key: Finding['claimKey'] | null) => void; activeKey: Finding['claimKey'] | null }) {
  const root = useRef<HTMLDivElement>(null);
  const { reduceMotion } = useUi();
  useGSAP(() => {
    if (reduceMotion) return;
    const timeline = gsap.timeline();
    timeline.from('.map-node', { y: 10, opacity: 0, duration: .3, stagger: .09, ease: 'power2.out' });
    timeline.from('.map-connector', { scaleX: 0, transformOrigin: 'left', duration: .4 }, .15);
  }, { scope: root, dependencies: [assessment.version, reduceMotion], revertOnUpdate: true });
  return <div className="evidence-map" ref={root}>
    <div className="story-top"><span className="eyebrow">Your Proof Path</span><span className="preview-label">Version {assessment.version}</span></div>
    <div className="map-nodes">
      {(['employer_route', 'listing', 'sender', 'request'] as const).map((key, index) => {
        const finding = assessment.findings.find(item => item.claimKey === key);
        const risk = key === 'request' && assessment.recommendedAction === 'pause_sensitive_action';
        return <div className="map-stop" key={key}>
          {index > 0 ? <span className={`map-connector ${key === 'sender' || key === 'request' ? 'uncertain' : ''}`} aria-hidden="true" /> : null}
          <button className="map-node" data-active={activeKey === key} disabled={!finding} onMouseEnter={() => onTrace(key)} onMouseLeave={() => onTrace(null)} onFocus={() => onTrace(key)} onBlur={() => onTrace(null)} onClick={() => finding && onSelect(finding)} aria-label={`${labels[key]}: ${risk ? 'risk detected' : finding?.status ?? 'unresolved'}. Inspect evidence.`}>
            <span className="map-symbol" data-status={risk ? 'contradicted' : finding?.status}>{risk ? '!' : finding?.status === 'supported' ? '✓' : finding?.status === 'contradicted' ? '!' : '?'}</span><strong>{labels[key]}</strong><span>{risk ? 'Risk detected' : finding?.status ?? 'Unresolved'}</span>
          </button>
        </div>;
      })}
    </div>
    <p className="map-caption">Follow any point to its evidence. The sender’s connection stays unverified.</p>
  </div>;
}

export function DecisionChange({ assessment, previous }: { assessment: Assessment; previous?: Assessment | null }) {
  const change = assessment.changeSummary;
  if (!change) return null;
  return <section className="decision-change" aria-labelledby="change-title">
    <div><p className="eyebrow">New message · Version {assessment.version}</p><h2 id="change-title">{change.actionChanged ? 'One new request changes the next step.' : 'New information. Same careful approach.'}</h2></div>
    <div className="change-comparison"><div><span>Before</span><p>{actions[change.previousAction ?? ''] ?? 'No previous recommendation'}</p></div><span className="change-arrow" aria-hidden="true">→</span><div><span>Now</span><p>{actions[assessment.recommendedAction] ?? assessment.headline}</p></div></div>
    <p>{change.headline}</p>
    {assessment.findings.some(item => item.claimKey === 'listing' && item.status === 'supported') ? <p className="change-anchor">✓ The listing is still supported. Sender identity is still unresolved.</p> : null}
    {previous ? <details className="previous-decision"><summary>Revisit the previous decision <span>Version {previous.version}</span></summary><div><h3>{previous.headline}</h3><ul>{previous.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>This is the saved earlier assessment. Use the current version for your next step.</p></div></details> : null}
  </section>;
}
