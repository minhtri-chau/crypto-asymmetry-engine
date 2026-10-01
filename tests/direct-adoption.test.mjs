import test from 'node:test';import assert from 'node:assert/strict';
import {observationsFromDaily,githubRepo,collectDirectAdoption,mergeEvidence} from '../src/direct-adoption.mjs';
import {runResearchRefresh} from '../src/research-refresh.mjs';
const now=Date.parse('2026-10-01T12:00:00Z'),DAY=86400000;
const history=Array.from({length:220},(_,i)=>[(Date.parse('2026-09-30')-i*DAY)/1000,10]);
test('daily history yields full dated 30-day windows and excludes current unfinished day',()=>{
 const obs=observationsFromDaily([[now/1000,999],...history],{metric:'fees_usd',scope:'protocol a',source:'s',period:30,now});assert.deepEqual(obs.map(x=>x.value),[300,300,300,300]);assert.equal(obs[0].date,'2026-09-30');
});
test('missing daily rows are unknown, not zeros or shortened windows',()=>{
 const obs=observationsFromDaily(history.filter((_,i)=>i!==4),{metric:'fees_usd',scope:'p',source:'s',period:30,now});assert.ok(!obs.some(x=>x.date==='2026-09-30'));
});
test('repo identity rejects off-host URLs and organization-only links',()=>{assert.equal(githubRepo('https://github.com/a/b'),'a/b');for(const u of ['https://github.com/a','http://github.com/a/b','https://github.com.evil/a/b','https://evil.org/a/b','https://github.com/a/b/commits'])assert.equal(githubRepo(u),null)});
test('direct collector matches whole parent family and never calls OpenAI',async()=>{
 const calls=[];const fetchJson=async url=>{calls.push(url);if(url.includes('coingecko'))return{links:{repos_url:{github:['https://github.com/project/core']}}};if(url.endsWith('/protocols'))return[{gecko_id:'aave',slug:'aave-v2',parentProtocol:'parent#aave'},{gecko_id:'aave',slug:'aave-v3',parentProtocol:'parent#aave'}];if(url.includes('/stats/'))throw Error('pending 202');if(url.includes('/protocol/'))return{tvl:history.map(([date,totalLiquidityUSD])=>({date,totalLiquidityUSD}))};return{totalDataChart:history};};
 const j=await collectDirectAdoption('aave',{fetchJson,now});assert.ok(calls.includes('https://api.llama.fi/protocol/aave'));assert.equal(j.adoption_development.find(x=>x.metric==='fees_usd').observations[0].value,300);assert.equal(j.adoption_development.find(x=>x.metric==='github_commits').observations.length,0);assert.ok(calls.every(u=>!u.includes('openai')));
});
test('ambiguous protocol families are not merged or guessed',async()=>{
 const calls=[];const j=await collectDirectAdoption('test',{now,fetchJson:async url=>{calls.push(url);return url.endsWith('/protocols')?[{gecko_id:'test',slug:'a'},{gecko_id:'test',slug:'b'}]:{};}});assert.equal(j.adoption_development.length,0);assert.ok(!calls.some(u=>u.includes('/protocol/')));
});
test('saved evidence retains older dates while newest same-date observations win',()=>{
 const make=(date,value)=>({sources:[{id:'s',url:'https://example.org'}],adoption_development:[{metric:'tvl_usd',observations:[{date,value,scope:'p',definition:'snapshot',period_days:1}]}]});const j=mergeEvidence([make('2026-09-30',20),make('2026-09-30',10),make('2026-08-31',5)]);assert.deepEqual(j.adoption_development[0].observations.map(x=>x.value),[20,5]);assert.equal(j.sources.length,1);
});
test('without-AI pipeline attempts direct data even after quantitative failure',async()=>{
 const calls=[];const r=await runResearchRefresh({includeAI:false,evaluate:async()=>{calls.push('quant');throw Error('failed')},direct:async()=>{calls.push('direct');return{}},source:()=>{throw Error('AI must not run')},onUpdate:()=>{}});assert.deepEqual(calls,['quant','direct']);assert.equal(r.ok,false);assert.equal(r.steps[1].status,'Complete');
});
