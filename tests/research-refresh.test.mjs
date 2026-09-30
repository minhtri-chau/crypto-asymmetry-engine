import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {runResearchRefresh} from '../src/research-refresh.mjs';
const apiSource=readFileSync(new URL('../api/research-refresh.js',import.meta.url),'utf8').replace('export default async function handler','async function handler');
const workerSource=transformSync(readFileSync(new URL('../supabase/functions/research-monitor/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/,''),{loader:'ts'}).code;
function apiHarness(fetch){const context={fetch,process:{env:{VITE_SUPABASE_URL:'https://db.test',VITE_SUPABASE_PUBLISHABLE_KEY:'public',MONITOR_CRON_SECRET:'private-secret'}},AbortSignal};vm.createContext(context);vm.runInContext(apiSource,context);return async(req)=>{const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};await context.handler(req,res);return res}}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('pipeline feeds fresh evaluation and sources into downstream steps',async()=>{
 const calls=[],updates=[],fresh={asset:{id:23},latest:{id:99}},qualitative={summary:'fresh sources'};
 const result=await runResearchRefresh({evaluate:async()=>{calls.push('quant');return fresh},source:async ctx=>{assert.equal(ctx.latest.id,99);calls.push('source');return qualitative},events:async ctx=>{assert.equal(ctx.qualitative,qualitative);calls.push('events')},assess:async ctx=>{assert.equal(ctx.qualitative,qualitative);assert.equal(ctx.asset.id,23);calls.push('ai')},onUpdate:s=>updates.push(s)});
 assert.equal(result.ok,true);assert.deepEqual(calls,['quant','source','events','ai']);assert.ok(result.steps.every(s=>s.status==='Complete'));assert.equal(updates[0][0].status,'Running…');
});
test('pipeline retains completed stages and skips dependents on failure',async()=>{
 let downstream=0;const result=await runResearchRefresh({evaluate:async()=>({asset:{id:23}}),source:async()=>{throw new Error('upstream timeout')},events:async()=>downstream++,assess:async()=>downstream++,onUpdate:()=>{}});
 assert.equal(result.ok,false);assert.equal(downstream,0);assert.equal(result.steps[0].status,'Complete');assert.match(result.steps[1].status,/timeout/);assert.match(result.steps[2].status,/Skipped/);
});
test('API rejects unauthenticated and invalid target before any network request',async()=>{
 const run=apiHarness(()=>{throw new Error('unexpected request')});
 assert.equal((await run({method:'POST',headers:{},body:{research_asset_id:23}})).code,401);
 assert.equal((await run({method:'POST',headers:{authorization:'Bearer token'},body:{research_asset_id:'23'}})).code,400);
});
test('API refuses an asset not owned by caller',async()=>{
 let n=0;const run=apiHarness(async()=>{n++;return response(n===1?{id:'user-a'}:[])});
 assert.equal((await run({method:'POST',headers:{authorization:'Bearer token'},body:{research_asset_id:23,user_id:'victim'}})).code,404);assert.equal(n,2);
});
test('API passes only verified identity to worker and keeps secret server-side',async()=>{
 let n=0;const run=apiHarness(async(url,opts)=>{n++;if(n===1)return response({id:'user-a'});if(n===2){assert.match(url,/user_id=eq.user-a/);return response([{id:23}])}if(n===3){assert.equal(opts.method,'GET');return response({targeted_research_version:'v10.6'})}assert.deepEqual(JSON.parse(opts.body),{research_asset_id:23,user_id:'user-a'});assert.equal(opts.headers['x-monitor-secret'],'private-secret');return response({ok:true,evaluated:1})});
 const res=await run({method:'POST',headers:{authorization:'Bearer token'},body:{research_asset_id:23,user_id:'victim'}});assert.equal(res.code,200);assert.equal(res.body.evaluated,1);assert.ok(!JSON.stringify(res.body).includes('private-secret'));
});
function workerHarness({failInsert=false}={}){
 const assets=[{id:23,user_id:'user-a',coingecko_id:'lido-dao',symbol:'LDO',stage:'research'},{id:24,user_id:'user-a',coingecko_id:'aave',symbol:'AAVE',stage:'research'},{id:25,user_id:'user-b',coingecko_id:'lido-dao',symbol:'LDO',stage:'research'}],writes=[];
 const db={from(table){let operation='select',payload,filters=[];const query={select(){return query},neq(k,v){filters.push(x=>x[k]!==v);return query},eq(k,v){filters.push(x=>x[k]===v);return query},order(){return query},limit(){return query},maybeSingle(){return query},update(row){operation='update';payload=row;return query},insert(row){operation='insert';payload=row;return query},then(resolve,reject){let result;if(operation==='select')result={data:table==='research_assets'?assets.filter(x=>filters.every(f=>f(x))):null,error:null};else{writes.push({table,operation,payload,ids:assets.filter(x=>filters.every(f=>f(x))).map(x=>x.id)});result={error:failInsert&&operation==='insert'?{message:'insert failed'}:null}}return Promise.resolve(result).then(resolve,reject)}};return query}};
 let handler;const context={createClient:()=>db,Response,Request,console,Deno:{env:{get:k=>({MONITOR_CRON_SECRET:'secret',SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'key'})[k]},serve:fn=>{handler=fn}},fetch:async url=>response(url.includes('coingecko')?['lido-dao','aave'].map(id=>({id,current_price:1,market_cap:1e9,fully_diluted_valuation:1e9,total_volume:1e8,price_change_percentage_7d_in_currency:2,price_change_percentage_30d_in_currency:3})):[])};
 vm.createContext(context);vm.runInContext(workerSource,context);
 return{writes,run:body=>handler(new Request('https://worker.test',{method:'POST',headers:{'x-monitor-secret':'secret'},body}))};
}
test('worker targets exactly one asset and owner without affecting another coin',async()=>{const h=workerHarness();const r=await h.run(JSON.stringify({research_asset_id:23,user_id:'user-a'}));assert.equal(r.status,200);assert.equal((await r.json()).evaluated,1);assert.equal(h.writes.length,2);assert.deepEqual(h.writes[0].ids,[23]);assert.equal(h.writes[1].payload.research_asset_id,23)});
test('worker malformed target cannot fall back to full scan',async()=>{for(const body of ['{',JSON.stringify({research_asset_id:null,user_id:'user-a'}),JSON.stringify({research_asset_id:23}),JSON.stringify({research_asset_id:'23',user_id:'user-a'})]){const h=workerHarness();assert.equal((await h.run(body)).status,400);assert.equal(h.writes.length,0)}});
test('scheduled empty body still evaluates the universe',async()=>{const h=workerHarness();assert.equal((await(await h.run('')).json()).evaluated,3)});
test('targeted worker reports persistence failure',async()=>{const h=workerHarness({failInsert:true});assert.equal((await h.run(JSON.stringify({research_asset_id:23,user_id:'user-a'}))).status,500)});

test('API will not invoke an older full-universe worker',async()=>{let n=0;const run=apiHarness(async(url,opts)=>{n++;if(n===1)return response({id:'user-a'});if(n===2)return response([{id:23}]);assert.equal(opts.method,'GET');return response({},405)});const res=await run({method:'POST',headers:{authorization:'Bearer token'},body:{research_asset_id:23}});assert.equal(res.code,503);assert.equal(n,3)});
