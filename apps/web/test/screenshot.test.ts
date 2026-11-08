import test from 'node:test';import assert from 'node:assert/strict';import {createWorker} from 'tesseract.js';import {resolve} from 'node:path';import {matchQuote} from '../src/screenshot.js';
test('OCR reads both fictional screenshots and locates exact request lines',async()=>{
 const worker=await createWorker('eng',1,{langPath:resolve('apps/web/public/ocr/lang')});
 try{
  for(const name of ['recruiting-request','recruiting-benign']){
   const {data}=await worker.recognize(resolve(`apps/web/public/samples/${name}.png`),{}, {text:true,blocks:true});
   const lines=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines));
   assert.match(data.text,/FICTIONAL DEMO/);assert.match(data.text,/Software Engineer Intern/);
   if(name==='recruiting-request')assert.ok(matchQuote(lines,'Keep 200 and transfer the remainder to our supplier.').length);
   else assert.equal(matchQuote(lines,'Keep 200 and transfer the remainder to our supplier.').length,0);
  }
 }finally{await worker.terminate();}
});
test('quote locations span lines without inventing matches',()=>{
 const lines=['Keep 200 and transfer','the remainder to our supplier.'].map((text,i)=>({text,bbox:{x0:10,y0:i*40,x1:200,y1:i*40+30}}));
 assert.deepEqual(matchQuote(lines,'Keep 200 and transfer the remainder to our supplier.'),[0,1]);assert.deepEqual(matchQuote(lines,'send your password now'),[]);assert.deepEqual(matchQuote(lines,'Keep'),[]);
});

test('screenshot file validation rejects unsupported and oversized uploads before decoding',async()=>{
 const {recognizeScreenshot}=await import('../src/screenshot.js');
 await assert.rejects(recognizeScreenshot(new File(['text'],'note.txt',{type:'text/plain'}),()=>{}),/PNG/);
 await assert.rejects(recognizeScreenshot(new File([new Uint8Array(8*1024*1024+1)],'large.png',{type:'image/png'}),()=>{}),/8 MB/);
});

test('explicit source findings locate short employer names and job IDs as whole tokens',()=>{
 const lines=['Figma internship','figma-careers.example','6143238004','161432380040','figmatic'].map(text=>({text,bbox:{x0:0,y0:0,x1:100,y1:20}}));
 assert.deepEqual(matchQuote(lines,'Figma',true),[0,1]);
 assert.deepEqual(matchQuote(lines,'6143238004',true),[2]);
 assert.deepEqual(matchQuote(lines,'fig',true),[]);
 assert.deepEqual(matchQuote(lines,'Figma'),[]);
});
