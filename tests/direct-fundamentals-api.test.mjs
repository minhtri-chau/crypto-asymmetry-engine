import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
test('direct route validates identity and legacy fundamentals remains unchanged',async()=>{
 const raw=await fs.readFile(new URL('../api/fundamentals.js',import.meta.url),'utf8');const source=raw.replace('export default async function handler',`collectDirectAdoption=async(id)=>({collected_at:'2026-10-01T00:00:00Z',adoption_development:[],sources:[],id});\nexport default async function handler`);
 const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const response=()=>({status(n){this.code=n;return this},setHeader(){},json(body){this.body=body;return this}});
 let res=response();await handler({query:{id:'https://evil.org'}},res);assert.equal(res.code,400);
 res=response();await handler({query:{id:'aave'}},res);assert.equal(res.code,200);assert.equal(res.body.intelligence.id,'aave');
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:false});try{res=response();await handler({query:{}},res);assert.equal(res.code,200);assert.ok(res.body.assets.AAVE);assert.equal(res.body.assets.AAVE.tvl,null)}finally{globalThis.fetch=originalFetch}
});
