import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareSenderHeaders as compare} from '../src/sender-comparison.js';
test('compares From and Reply-To with domain boundaries',()=>{
 const c=compare('From: Person <[LOCAL]@figma-careers.example>\nReply-To: <[LOCAL]@supplier.example>',['figma.com']);assert.equal(c.from,'figma-careers.example');assert.match(c.observation,/different domain/);
 assert.match(compare('From: <x@evilfigma.com>',['figma.com']).observation,/differs/);
 assert.match(compare('From: <x@mail.figma.com>',['figma.com']).observation,/match/);
});
test('does not infer headers from prose or choose among ambiguous addresses',()=>{
 assert.equal(compare('They mentioned x@figma.com', ['figma.com']).hasHeaders,false);
 assert.equal(compare('From: a@figma.com, b@other.example',['figma.com']).from,undefined);
 assert.match(compare('From: x@foo.example',[]).observation,/No reviewed/);
});

test('positive consistency requires a known From domain and no conflicting Reply-To',()=>{
 assert.equal(compare('From: x@figma.com\nReply-To: x@figma.com',['figma.com']).consistent,true);
 assert.equal(compare('From: x@figma.com',['figma.com']).consistent,true);
 assert.equal(compare('Reply-To: x@figma.com',['figma.com']).consistent,false);
 assert.equal(compare('From: x@figma.com\nReply-To: x@other.example',['figma.com']).consistent,false);
 assert.equal(compare('From: x@figma.com',[]).consistent,false);
});
