import test from 'node:test';
import assert from 'node:assert/strict';
import {removeResearchAsset,visibleResearchAssets} from '../src/research-lifecycle.mjs';
function mock(responses){
 const calls=[];
 return {calls,from(table){const call={table,filters:[]};calls.push(call);const q={select(v){call.select=v;return q},eq(k,v){call.filters.push([k,v]);return q},update(v){call.update=v;return q},single(){return Promise.resolve(responses.shift())},maybeSingle(){return Promise.resolve(responses.shift())}};return q}};
}
const asset={id:7,symbol:'AAVE',is_owned:false};
test('removal preserves records and scopes the inactive update to an unowned user asset',async()=>{
 const db=mock([{data:asset},{data:{is_owned:false}},{data:{id:7}}]);
 assert.deepEqual(await removeResearchAsset(db,'user',7),{ok:true});
 assert.equal(db.calls[2].update.stage,'archived');
 assert.deepEqual(db.calls[2].filters,[['id',7],['user_id','user'],['is_owned',false]]);
 assert.equal(db.calls.length,3);
});
for(const [name,a,p] of [['asset',true,false],['plan',false,true]])test(`owned ${name} blocks removal`,async()=>{
 const db=mock([{data:{...asset,is_owned:a}},{data:{is_owned:p}}]);
 assert.equal((await removeResearchAsset(db,'user',7)).ok,false);
 assert.equal(db.calls.some(c=>c.update),false);
});
test('database errors do not report success',async()=>{
 for(const responses of [[{error:{message:'asset failure'}}],[{data:asset},{error:{message:'plan failure'}}],[{data:asset},{data:null},{error:{message:'save failure'}}]]){
  assert.equal((await removeResearchAsset(mock(responses),'user',7)).ok,false);
 }
});
test('ownership change before save blocks a false success',async()=>{
 assert.equal((await removeResearchAsset(mock([{data:asset},{data:null},{data:null}]),'user',7)).ok,false);
});
test('previously removed coins stay hidden; legacy archived owned assets remain reachable',()=>{
 const rows=[{id:1,stage:'research'},{id:2,stage:'watch'},{id:3,stage:'archived',is_owned:false},{id:4,stage:'archived',is_owned:true}];
 assert.deepEqual(visibleResearchAssets(rows).map(x=>x.id),[1,2,4]);
 assert.deepEqual(visibleResearchAssets(null),[]);
});
