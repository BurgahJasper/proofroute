export interface ImageLine { text: string; bbox: { x0:number; y0:number; x1:number; y1:number } }
export interface ScreenshotEvidence { image:string; width:number; height:number; lines:ImageLine[]; confidence:number; createdAt:number }
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
export function matchQuote(lines:ImageLine[],quote:string,allowShort=false):number[] {
 const needle=normalize(quote);
 if(needle.length<12){
  if(!allowShort || needle.length<4)return [];
  const words=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const phrase=` ${words(quote)} `;
  return lines.flatMap((line,index)=>` ${words(line.text)} `.includes(phrase)?[index]:[]);
 }
 const chunks=lines.map(l=>normalize(l.text));const joined=chunks.join('');const start=joined.indexOf(needle);if(start<0)return [];
 let offset=0;return chunks.flatMap((text,index)=>{const hit=offset<start+needle.length && offset+text.length>start;offset+=text.length;return hit?[index]:[];});
}
export async function recognizeScreenshot(file:File,onProgress:(progress:number)=>void):Promise<{text:string;evidence:ScreenshotEvidence}> {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG or WebP screenshot.');
 if(file.size>8*1024*1024)throw new Error('Choose a screenshot smaller than 8 MB.');
 const bitmap=await createImageBitmap(file);
 try {
 if(bitmap.width*bitmap.height>16_000_000 || bitmap.width<100 || bitmap.height<100)throw new Error('Choose a readable screenshot between 100 pixels and 16 megapixels.');
 const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);
 const image=canvas.toDataURL('image/png');const {createWorker}=await import('tesseract.js');
 const worker=await createWorker('eng',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')onProgress(m.progress);}});
 try {
 const {data}=await worker.recognize(image,{}, {text:true,blocks:true});
 if(!data.text.trim())throw new Error('No readable text was found. Try a sharper screenshot or paste the message.');
 if(data.text.length>20000)throw new Error('The extracted text exceeds 20,000 characters. Crop the screenshot or paste the relevant conversation.');
 const lines=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.map(l=>({text:l.text,bbox:l.bbox}))));
 return {text:data.text,evidence:{image,width:bitmap.width,height:bitmap.height,lines,confidence:data.confidence,createdAt:Date.now()}};
 } finally {await worker.terminate();}
 } finally {bitmap.close();}
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open('proofroute-local-images',1);req.onupgradeneeded=()=>req.result.createObjectStore('images');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function saveScreenshot(caseId:string,value:ScreenshotEvidence|null):Promise<void>{const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('images','readwrite');if(value)tx.objectStore('images').put(value,caseId);else tx.objectStore('images').delete(caseId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function loadScreenshot(caseId:string):Promise<ScreenshotEvidence|null>{const db=await database();let value:ScreenshotEvidence|null;try{value=await new Promise((resolve,reject)=>{const req=db.transaction('images').objectStore('images').get(caseId);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});}finally{db.close();}if(value && Date.now()-value.createdAt>24*3600*1000){await saveScreenshot(caseId,null);return null;}return value;}
