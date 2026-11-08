import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/catalog.js';
import { lookupPublishedJob } from '../src/greenhouse.js';
import { resolve } from 'node:path';
test('every reviewed employer resolves a live seed and handles a missing ID',async()=>{
 const root=resolve('.');const catalog=loadCatalog(root);
 for(const employer of catalog.employers){
  const response=await fetch(`https://boards-api.greenhouse.io/v1/boards/${employer.board.token}/jobs`);assert.equal(response.ok,true);const body=await response.json() as {jobs:Array<{id:number}>};assert.ok(body.jobs.length);
  const base={root,token:employer.board.token,mode:'live' as const,refresh:true,timeoutMs:10000};
  const hit=await lookupPublishedJob({...base,jobId:String(body.jobs[0].id)});assert.equal(hit.found,true,employer.id);assert.ok(hit.job?.approvedUrl);
  const missing=await lookupPublishedJob({...base,jobId:'999999999999999999'});assert.equal(missing.notFound,true,employer.id);
 }
});
