// v9.1.1 replacement for api/qualitative-research.js
const MODEL=process.env.OPENAI_QUAL_MODEL||process.env.OPENAI_MODEL||"gpt-5.6-sol";
const MAX_BODY=20000;
async function allowedUser(req){
 const auth=req.headers.authorization||"";if(!auth.startsWith("Bearer "))return null;
 const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error("Supabase server env is missing");
 const r=await fetch(`${url}/auth/v1/user`,{headers:{Authorization:auth,apikey:key}});
 if(!r.ok)return null;
 const u=await r.json(),allow=(process.env.AI_ALLOWED_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allow.length||!allow.includes(String(u.email||"").toLowerCase()))return null;return u;
}
const schema={type:"object",additionalProperties:false,properties:{
 summary:{type:"string"},catalyst_state:{type:"string",enum:["SUPPORTED","MIXED","WEAK","NONE_FOUND","INSUFFICIENT_EVIDENCE"]},
 value_capture_state:{type:"string",enum:["SUPPORTED","PARTIAL","UNRESOLVED","WEAK","INSUFFICIENT_EVIDENCE"]},
 dilution_state:{type:"string",enum:["LOW_CONCERN","MODERATE_CONCERN","HIGH_CONCERN","INSUFFICIENT_EVIDENCE"]},
 risk_state:{type:"string",enum:["NORMAL","ELEVATED","HIGH","INSUFFICIENT_EVIDENCE"]},
 catalysts:{type:"array",maxItems:6,items:{type:"object",additionalProperties:false,properties:{claim:{type:"string"},status:{type:"string"},date:{type:["string","null"]},source_ids:{type:"array",items:{type:"string"}}},required:["claim","status","date","source_ids"]}},
 value_capture:{type:"array",maxItems:6,items:{type:"object",additionalProperties:false,properties:{claim:{type:"string"},source_ids:{type:"array",items:{type:"string"}}},required:["claim","source_ids"]}},
 tokenomics_unlocks:{type:"array",maxItems:6,items:{type:"object",additionalProperties:false,properties:{claim:{type:"string"},source_ids:{type:"array",items:{type:"string"}}},required:["claim","source_ids"]}},
 competitive_changes:{type:"array",maxItems:6,items:{type:"object",additionalProperties:false,properties:{claim:{type:"string"},source_ids:{type:"array",items:{type:"string"}}},required:["claim","source_ids"]}},
 risks:{type:"array",maxItems:6,items:{type:"object",additionalProperties:false,properties:{claim:{type:"string"},source_ids:{type:"array",items:{type:"string"}}},required:["claim","source_ids"]}},
 missing_evidence:{type:"array",maxItems:6,items:{type:"string"}},
 sources:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,properties:{id:{type:"string"},title:{type:"string"},url:{type:"string"},publisher:{type:"string"},published_at:{type:["string","null"]},source_type:{type:"string",enum:["OFFICIAL","GOVERNANCE","REGULATORY","DATA_PROVIDER","REPUTABLE_REPORTING","OTHER"]}},required:["id","title","url","publisher","published_at","source_type"]}}
},required:["summary","catalyst_state","value_capture_state","dilution_state","risk_state","catalysts","value_capture","tokenomics_unlocks","competitive_changes","risks","missing_evidence","sources"]};
function outText(j){if(typeof j.output_text==="string")return j.output_text;for(const o of j.output||[])for(const c of o.content||[])if(c.type==="output_text"&&typeof c.text==="string")return c.text;return null}
async function safeJson(r){const t=await r.text();try{return{json:JSON.parse(t),text:t}}catch{return{json:null,text:t}}}
export default async function handler(req,res){try{
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 const user=await allowedUser(req);if(!user)return res.status(403).json({error:"AI qualitative research is not authorized"});
 const raw=JSON.stringify(req.body||{});if(raw.length>MAX_BODY)return res.status(413).json({error:"Request too large"});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY is not configured"});
 const asset=req.body?.asset;if(!asset?.symbol||!asset?.name||!asset?.coingecko_id)return res.status(400).json({error:"Missing asset identity"});
 const instructions=`You are the sourced qualitative-intelligence layer of Crypto Asymmetry Engine.
Research ONLY the named crypto asset. Use web search. Prefer primary/official protocol docs, governance forums/proposals, foundation/company posts, regulatory filings, and reputable data providers/reporting.
Current factual claims about catalysts, tokenomics, unlocks, governance, security, value capture, and competition must be supported by web evidence from this run.
Never infer token-holder value capture merely from protocol fees/revenue. Distinguish protocol economics from token accrual.
Never invent an unlock date, catalyst, partnership, governance change, or source. If evidence conflicts or is missing, say so.
No buy/sell commands, rankings, price targets, or return forecasts. Each factual claim must cite source_ids from the returned sources array. Use canonical HTTPS URLs.`;
 const input=`Asset: ${asset.name} (${asset.symbol}), CoinGecko id: ${asset.coingecko_id}.
Quantitative orientation only, not a source for qualitative claims: ${JSON.stringify(req.body?.quant||{})}
Find current sourced evidence for catalysts, token value capture, tokenomics/unlocks/emissions, competitive changes, and material protocol/security/regulatory risks.`;
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({
  model:MODEL,reasoning:{effort:"medium"},max_output_tokens:7000,instructions,input,tools:[{type:"web_search"}],
  text:{format:{type:"json_schema",name:"qualitative_intelligence",strict:true,schema}}
 })});
 const upstream=await safeJson(r);
 if(!r.ok){
  console.error("OpenAI qualitative error",r.status,upstream.text.slice(0,1000));
  return res.status(502).json({error:"Qualitative research failed",detail:upstream.json?.error?.message||`OpenAI returned HTTP ${r.status}`});
 }
 if(!upstream.json){
  console.error("OpenAI non-JSON success",upstream.text.slice(0,1000));
  return res.status(502).json({error:"OpenAI returned an unexpected response"});
 }
 const txt=outText(upstream.json);if(!txt)return res.status(502).json({error:"No structured qualitative output"});
 let intelligence;try{intelligence=JSON.parse(txt)}catch{console.error("Invalid structured output",txt.slice(0,1000));return res.status(502).json({error:"AI returned invalid structured output"})}
 return res.status(200).json({intelligence,model:MODEL,model_version:"qualitative-v9.1.1",response_id:upstream.json.id||null,generated_at:new Date().toISOString()});
}catch(e){console.error("qualitative-research",e);return res.status(500).json({error:e?.message||"Qualitative research failed"})}}
