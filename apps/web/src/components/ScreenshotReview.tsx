import {useEffect,useState,useRef} from 'react';
import {useUi} from '../ui';
import {loadScreenshot,saveScreenshot,matchQuote,type ScreenshotEvidence} from '../screenshot';
export function ScreenshotReview({caseId,quotes,activeQuote}:{caseId:string;quotes:string[];activeQuote?:string}) {
 const imageRef=useRef<HTMLDivElement>(null);const {reduceMotion}=useUi();
 const [evidence,setEvidence]=useState<ScreenshotEvidence|null>(null);const [selected,setSelected]=useState('');
 useEffect(()=>{let active=true;void loadScreenshot(caseId).then(x=>{if(active)setEvidence(x);}).catch(()=>{});return()=>{active=false;};},[caseId]);
 if(!evidence)return null;
 const quote=activeQuote||selected||quotes[0]||'';const hits=matchQuote(evidence.lines,quote,true);
 return <section className="screenshot-evidence"><div className="screenshot-heading"><div><p className="eyebrow">Your source image · On this device</p><h2>See the evidence in context.</h2></div><button type="button" onClick={()=>{void saveScreenshot(caseId,null);setEvidence(null);}}>Remove image</button></div>
 <p>Choose a quoted finding to locate its original text on the screenshot. The image stays in this browser and expires after 24 hours.</p>
 {quotes.length?<div className="image-quote-choices">{quotes.map(q=><button type="button" key={q} aria-pressed={quote===q} onClick={()=>{setSelected(q);imageRef.current?.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'center'});}}>“{q}”</button>)}</div>:<p>No quoted text has been linked to this image.</p>}
 <div className="source-image" ref={imageRef}><img src={evidence.image} alt="Your uploaded recruiting screenshot"/>
 {hits.map(i=>{const b=evidence.lines[i].bbox;return <span key={i} className="source-highlight" style={{left:`${100*b.x0/evidence.width}%`,top:`${100*b.y0/evidence.height}%`,width:`${100*(b.x1-b.x0)/evidence.width}%`,height:`${100*(b.y1-b.y0)/evidence.height}%`}}/>;})}</div>
 {quote?<p role="status">{hits.length?'Highlighted text matches the quoted finding.':'This quote could not be located in the original image. Text may have been edited or misread; inspect the image yourself.'}</p>:null}
 </section>;
}
