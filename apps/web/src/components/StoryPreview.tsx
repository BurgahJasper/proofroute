import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useUi } from '../ui';

/** An explicitly illustrative story. Never presented as a result for user input. */
export function StoryPreview() {
  const [followUp, setFollowUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { reduceMotion } = useUi();
  useGSAP(() => {
    if (reduceMotion) return;
    gsap.from('[data-story-change]', { y: 8, opacity: 0, duration: .35, stagger: .06, ease: 'power2.out' });
  }, { scope: root, dependencies: [followUp, reduceMotion], revertOnUpdate: true });
  return <div className="story-preview" ref={root}>
    <div className="story-top"><span className="eyebrow">One offer. Two different questions.</span><span className="preview-label">Illustration</span></div>
    <div className="story-switch" role="group" aria-label="Illustrative conversation">
      <button type="button" aria-pressed={!followUp} onClick={() => setFollowUp(false)}>01 · The offer</button>
      <button type="button" aria-pressed={followUp} onClick={() => setFollowUp(true)}>02 · The follow-up <span aria-hidden="true">↗</span></button>
    </div>
    <div className="story-message" data-story-change><span className="story-avatar" aria-hidden="true">A</span><div><span className="eyebrow">Fictional recruiter</span><p>{followUp ? '“First, pay $189 for your equipment and send me your login code.”' : '“I found your profile. We have an internship with your name on it.”'}</p></div></div>
    <div className="story-evidence"><div><span className="story-status supported">✓</span><span>Public job listing<strong>Can be supported</strong></span></div><span className="story-gap" aria-hidden="true">≠</span><div><span className="story-status uncertain">?</span><span>Who sent it<strong>Still unverified</strong></span></div></div>
    <div className="story-decision" data-risk={followUp} data-story-change aria-live="polite"><span className="eyebrow">{followUp ? 'The next step changes' : 'Keep the opportunity'}</span><p>{followUp ? 'Pause the payment. Protect your login.' : 'Go through the employer’s official route.'}</p><span>{followUp ? 'The listing stays real. The request is the problem.' : 'A genuine vacancy does not authenticate a sender.'}</span></div>
  </div>;
}
