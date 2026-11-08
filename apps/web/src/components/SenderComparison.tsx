import type { EmployerOption } from '../api';
import { compareSenderHeaders } from '../sender-comparison';

export function SenderComparison({ text, employer }: { text: string; employer?: EmployerOption }) {
  const comparison = compareSenderHeaders(text, employer?.knownDomains ?? []);
  return <details className="sender-comparison" open={comparison.hasHeaders}>
    <summary>Who is this message from?<span>Address comparison</span></summary>
    <p className="sender-intro">The selected employer is {employer?.name ?? 'outside the reviewed catalog'}. Email headers describe a claim; they do not authenticate the person.</p>
    <dl>{[['Claimed employer', employer?.name ?? 'Not established'], ['From domain', comparison.from ?? 'Not present in reviewed headers'], ['Reply-To domain', comparison.replyTo ?? 'Not present in reviewed headers'], ['Reviewed employer domains', employer?.knownDomains.join(', ') || 'Not available']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="sender-observation">{comparison.observation}</p>
    <p className="sender-limit">A match does not verify the sender. A difference can have legitimate explanations, including recruiting agencies.</p>
  </details>;
}
