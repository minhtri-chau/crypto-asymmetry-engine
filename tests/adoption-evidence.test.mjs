import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptionEvidence} from '../src/adoption-evidence.mjs';
const now=Date.parse('2026-10-01T12:00:00Z');
const point=(date,value,extra={})=>({date,value,definition:'Unique interacting addresses',scope:'Project contracts',period_days:1,source_ids:['s1'],...extra});
const data=(observations,metric='active_addresses')=>({sources:[{id:'s1',url:'https://example.org/data',title:'Data'}],adoption_development:[{metric,note:'Address proxy',observations}]});
test('missing legacy records remain unknown with no numeric substitute',()=>assert.ok(adoptionEvidence({},now).every(r=>!r.current&&r.changes.every(c=>c.value===null))));
test('comparable 30/90-day observations produce growth, including zero current',()=>{
 const r=adoptionEvidence(data([point('2026-10-01',200),point('2026-09-01',100),point('2026-07-03',50)]),now)[0];
 assert.deepEqual(r.changes.map(c=>c.value),[100,300]);
 assert.equal(adoptionEvidence(data([point('2026-10-01',0),point('2026-09-01',100)]),now)[0].changes[0].value,-100);
});
test('different scope, period, definition and zero baseline do not produce growth',()=>{
 for(const extra of [{scope:'Other chain'},{period_days:30},{definition:'Monthly users'},{value:0}]){
 const r=adoptionEvidence(data([point('2026-10-01',200),point('2026-09-01',100,extra)]),now)[0];assert.equal(r.changes[0].value,null);
 }
});
test('unsupported, future, impossible dates and unsourced data excluded',()=>{
 const points=[point('2026-99-99',4),point('2026-02-30',4),point('2026-10-02',4),point('2026-09-01',4,{source_ids:['missing']}),point('2026-09-01',NaN)];
 assert.equal(adoptionEvidence(data(points),now)[0].current,undefined);
});
test('developer windows use 3/6 months and stale observations remain visible',()=>{
 const r=adoptionEvidence(data([point('2026-07-01',20),point('2026-04-02',10),point('2026-01-02',5)],'monthly_active_developers'),now).find(r=>r.key==='monthly_active_developers');
 assert.deepEqual(r.changes.map(c=>[c.days,c.value]),[[90,100],[180,300]]);assert.equal(r.stale,true);
});
test('out-of-range retention percentage excluded',()=>{
 const r=adoptionEvidence(data([point('2026-10-01',101)],'developer_retention'),now).find(r=>r.key==='developer_retention');assert.equal(r.current,undefined);
});
