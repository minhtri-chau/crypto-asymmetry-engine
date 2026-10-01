import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ADOPTION_METRICS} from '../src/adoption-evidence.mjs';
test('sourced API requests strict adoption evidence and returns it in existing intelligence',async()=>{
 const originalFetch=globalThis.fetch,keys=['OPENAI_API_KEY','AI_ALLOWED_EMAILS','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'],prior=keys.map(k=>process.env[k]);
 keys.forEach((k,i)=>process.env[k]=['test-key','tester@example.org','https://test.supabase.co','test-public'][i]);
 let packet;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({email:'tester@example.org'})};
  packet=JSON.parse(options.body);
  return {ok:true,text:async()=>JSON.stringify({output_text:JSON.stringify({adoption_development:[],sources:[],summary:'Unsupported metrics'})})};
 };
 try{
  const source=await fs.readFile(new URL('../api/qualitative-research.js',import.meta.url),'utf8');
  const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source.replace('import {ADOPTION_METRICS} from "../src/adoption-evidence.mjs";',`const ADOPTION_METRICS=${JSON.stringify(ADOPTION_METRICS)};`)).toString('base64'));
  const res={status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await handler({method:'POST',headers:{authorization:'Bearer test'},body:{asset:{symbol:'TEST',name:'Test',coingecko_id:'test'}}},res);
  assert.equal(res.code,200);assert.deepEqual(res.body.intelligence.adoption_development,[]);
  assert.equal(res.body.model_version,'qualitative-v10.7');
  const schema=packet.text.format.schema;
  assert.ok(schema.required.includes('adoption_development'));
  assert.equal(schema.properties.adoption_development.items.additionalProperties,false);
  assert.ok(packet.instructions.includes('never subtract USD TVL snapshots'));
 }finally{globalThis.fetch=originalFetch;keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);}
});
