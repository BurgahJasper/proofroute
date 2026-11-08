import type { EmployerOption } from '../api';
import { compareSenderHeaders } from '../sender-comparison';

export function SenderComparison({ text, employer }: { text: string; employer?: EmployerOption }) {
  const guidance = employer?.id === 'figma' ? {url:'https://help.figma.com/hc/en-us/articles/32242981110679-What-are-Figma-s-official-email-addresses',label:'Figma’s official email guidance'} : employer?.id === 'gitlab' ? {url:'https://about.gitlab.com/blog/new-wave-of-fake-job-scams-impersonating-recruiters/',label:'GitLab’s recruiting safety guidance'} : null;
  const comparison = compareSenderHeaders(text, employer?.knownDomains ?? []);
  const rows: Array<[string, string]> = [
    ['Claimed employer', employer?.name ?? 'Not established'],
    ['From domain', comparison.from ?? 'Not present in reviewed headers'],
    ['Reply-To domain', comparison.replyTo ?? 'Not present in reviewed headers'],
    ['Reviewed employer domains', employer?.knownDomains.join(', ') || 'Not available'],
  ];
  if (comparison.channelCue) rows.push(['Channel cue', comparison.channelCue]);
  return <details className="sender-comparison" open={comparison.hasHeaders || Boolean(comparison.channelCue)} data-consistent={comparison.consistent}>
    <summary>{comparison.consistent ? "Consistent with the employer’s published information" : "Who is this message from?"}<span>{comparison.consistent ? "Positive indicator · Domain match" : comparison.channelCue ? "Channel & address comparison" : "Address comparison"}</span></summary>
    <p className="sender-intro">{comparison.consistent ? `The available address domains match the reviewed domains for ${employer?.name}. This supports consistency with the company’s published information.` : `The selected employer is ${employer?.name ?? 'outside the reviewed catalog'}. Compare the address and channel details below.`}</p>
    <dl>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="sender-observation">{comparison.observation}</p>
    <p className="sender-limit">A match does not verify the sender. A difference can have legitimate explanations, including recruiting agencies.</p>
    {guidance ? <p className="sender-limit"><a href={guidance.url} target="_blank" rel="noreferrer" className="underline">{guidance.label} ↗</a><br />Company-published guidance. It does not verify this message or identify its author.</p> : null}
  </details>;
}
