import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');const target=resolve(root,'apps/web/public/ocr');
await mkdir(target+'/core',{recursive:true});await mkdir(target+'/lang',{recursive:true});
await copyFile(resolve(root,'node_modules/tesseract.js/dist/worker.min.js'),target+'/worker.min.js');
for(const name of await readdir(resolve(root,'node_modules/tesseract.js-core'))) if(name.endsWith('.wasm.js')) await copyFile(resolve(root,'node_modules/tesseract.js-core',name),target+'/core/'+name);
await copyFile(resolve(root,'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),target+'/lang/eng.traineddata.gz');
