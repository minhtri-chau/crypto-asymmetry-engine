// Add as api/catalyst-intelligence.js on CURRENT main.
// Reuses v9.1 qualitative auth pattern. One Vercel function slot.
const MODEL=process.env.OPENAI_QUAL_MODEL||process.env.OPENAI_MODEL||"gpt-5.6-sol",MAX_BODY=25000;
async function user(req){const a=req.headers.authorization||"";if(!a.startsWith("Bearer "))return null;const r=await fetch(`${process.env.VITE_SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:a,apikey:process.env.VITE_SUPABASE_PUBLISHABLE_KEY}});if(!r.ok)return null;const u=await r.json(),ok=(process.env.AI_ALLOWED_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);return ok.includes(String(u.email||"").toLowerCase())?u:null}
const item={type:"object",additionalProperties:false,properties:{event_key:{type:"string"},event_type:{type:"string",enum:["CATALYST","UNLOCK","EMISSION","GOVERNANCE","SECURITY","REGULATORY","TOKENOMICS","OTHER"]},title:{type:"string"},event_date:{type:["string","null"]},date_precision:{type:"string",enum:["DAY","MONTH","QUARTER","WINDOW","UNKNOWN"]},status:{type:"string",enum:["UPCOMING","ONGOING","COMPLETED","DELAYED","CANCELLED","UNCONFIRMED"]},impact_direction:{type:"string",enum:["POSITIVE","NEGATIVE","MIXED","UNCLEAR"]},importance:{type:"string",enum:["LOW","MEDIUM","HIGH"]},amount_tokens:{type:["number","null"]},amount_usd:{type:["number","null"]},pct_circulating:{type:["number","null"]},pct_total_supply:{type:["number","null"]},source_quality:{type:"string",enum:["PRIMARY","STRONG_SECONDARY","SECONDARY","WEAK"]},confidence:{type:"string",enum:["HIGH","MODERATE","LOW"]},summary:{type:"string"},source_ids:{type:"array",items:{type:"string"}},conflict_state:{type:"string",enum:["NONE","CONFLICTED"]},conflict_note:{type:["string","null"]}},required:["event_key","event_type","title","event_date","date_precision","status","impact_direction","importance","amount_tokens","amount_usd","pct_circulating","pct_total_supply","source_quality","confidence","summary","source_ids","conflict_state","conflict_note"]};
const schema={type:"object",additionalProperties:false,properties:{summary:{type:"string"},catalyst_state:{type:"string",enum:["ACTIVE","UPCOMING","QUIET","UNCERTAIN"]},unlock_state:{type:"string",enum:["LOW_CONCERN","WATCH","ELEVATED","UNKNOWN"]},coverage_state:{type:"string",enum:["STRONG","PARTIAL","WEAK"]},events:{type:"array",maxItems:12,items:item},sources:{type:"array",maxItems:20,items:{type:"object",additionalProperties:false,properties:{id:{type:"string"},title:{type:"string"},url:{type:"string"},publisher:{type:"string"},published_at:{type:["string","null"]},source_type:{type:"string",enum:["OFFICIAL","GOVERNANCE","REGULATORY","DATA_PROVIDER","REPUTABLE_REPORTING","OTHER"]}},required:["id","title","url","publisher","published_at","source_type"]}},missing_evidence:{type:"array",items:{type:"string"}}},required:["summary","catalyst_state","unlock_state","coverage_state","events","sources","missing_evidence"]};
// Server-side guards so nothing unsourced or malformed reaches the database: HTTPS sources only, every event keeps
// only source_ids that resolve (events with none are dropped), stable slug keys, real calendar dates or UNKNOWN,
// and supply percentages within 0-100.
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/,MONTH_RE=/^\d{4}-\d{2}$/;
function realDay(s){if(!DAY_RE.test(s))return false;const d=new Date(s+"T00:00:00Z");return !isNaN(d)&&d.toISOString().slice(0,10)===s}
const pct=v=>typeof v==="number"&&v>=0&&v<=100?v:null,nonneg=v=>typeof v==="number"&&v>=0?v:null;
function clean(x){const sources=(x.sources||[]).filter(s=>/^https:\/\//i.test(String(s.url||""))),ids=new Set(sources.map(s=>s.id)),seen=new Set(),events=[];
 for(const e of x.events||[]){const source_ids=(e.source_ids||[]).filter(i=>ids.has(i));if(!source_ids.length)continue;
  const key=String(e.event_key||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);if(!key||seen.has(key))continue;seen.add(key);
  let date=typeof e.event_date==="string"?e.event_date.trim():null,prec=e.date_precision;
  if(date&&MONTH_RE.test(date)){date+="-01";if(prec==="DAY")prec="MONTH"}
  if(!date||!realDay(date)||prec==="UNKNOWN"){date=null;prec="UNKNOWN"}
  const conflicted=e.conflict_state==="CONFLICTED";
  events.push({...e,conflict_state:conflicted?"CONFLICTED":"NONE",conflict_note:conflicted?String(e.conflict_note||"Conflicting sourced evidence; exact claim unresolved.").slice(0,1000):null,event_key:key,event_date:date,date_precision:prec,amount_tokens:nonneg(e.amount_tokens),amount_usd:nonneg(e.amount_usd),pct_circulating:pct(e.pct_circulating),pct_total_supply:pct(e.pct_total_supply),source_ids})}
 return{...x,events,sources,dropped_events:(x.events||[]).length-events.length}}
function outputFailure(j,x){if(j?.status==="incomplete")return{code:"INCOMPLETE_OUTPUT",detail:j?.incomplete_details?.reason||"Response incomplete"};if(!x)return{code:"NO_STRUCTURED_OUTPUT",detail:"No output_text returned"};try{JSON.parse(x);return null}catch(e){return{code:"JSON_PARSE_FAILED",detail:String(e?.message||e)}}}
async function callOpenAI(body){const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify(body)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{ok:r.ok,status:r.status,j}}
const REPAIR=`Repair the supplied Crypto Asymmetry Engine event-intelligence output into
the required JSON schema. Do not research, browse, add facts, infer missing
dates, invent sources, or change factual claims. Preserve uncertainty.
If a field cannot be recovered, use conservative UNKNOWN/null/LOW values
allowed by the schema. Every event must retain at least one source_id
already present in the supplied material.`;
function txt(j){if(typeof j.output_text==="string")return j.output_text;for(const o of j.output||[])for(const c of o.content||[])if(c.type==="output_text")return c.text;return null}
export default async function handler(req,res){try{if(req.method!=="POST")return res.status(405).json({error:"POST only"});const u=await user(req);if(!u)return res.status(403).json({error:"Not authorized"});const raw=JSON.stringify(req.body||{});if(raw.length>MAX_BODY)return res.status(413).json({error:"Request too large"});if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY is not configured"});const a=req.body?.asset;if(!a?.symbol||!a?.name||!a?.coingecko_id)return res.status(400).json({error:"Missing asset identity"});
const instructions=`You are the event-intelligence layer of Crypto Asymmetry Engine. Research only the named crypto asset using web search.
Find material forward-looking catalysts and supply events: protocol/product launches, upgrades, governance executions, integrations, regulatory milestones, token unlocks, vesting, emissions/inflation changes, burns/buybacks and material security events.
Prefer primary official documentation, governance proposals/executions, token issuer/foundation disclosures and regulatory sources. Reputable data providers/reporting may supplement them.
Do not invent exact dates or unlock sizes. A date inferred only from a vague roadmap must use MONTH/QUARTER/WINDOW/UNKNOWN, never DAY.
Only populate amount/pct fields when a source supports the number or it can be directly calculated from sourced quantities supplied in the same evidence.
Distinguish scheduled unlock from ongoing emissions. Do not call protocol growth a token catalyst unless the mechanism is clear.
event_key must be stable and semantic, e.g. "unlock-2026-10-15-team" or "upgrade-v4-launch", not random.
Every event must cite source_ids. If evidence is conflicting or stale, lower confidence/status and explain it.
When credible sources materially disagree about an unlock date, size,
emission schedule, or event status, set conflict_state=CONFLICTED,
explain the disagreement in conflict_note, lower confidence as appropriate,
and do not choose a disputed exact value as fact. Otherwise use NONE/null.
impact_direction describes plausible mechanical/research direction, not a price prediction. No buy/sell command, ranking, price target or return forecast.`;
const input=`Today is ${new Date().toISOString().slice(0,10)}. Asset: ${a.name} (${a.symbol}), CoinGecko id ${a.coingecko_id}. Current supply context (orientation only): ${JSON.stringify(req.body?.supply||{})}. Existing qualitative context (not authoritative for new facts): ${JSON.stringify(req.body?.qualitative||{})}. Previously recorded events for this asset (reuse the SAME event_key when you find the same event again; change status only with sourced evidence): ${JSON.stringify((req.body?.known_events||[]).slice(0,40))}. Focus on events from the next 180 days plus recently completed events from the prior 30 days that materially change the thesis.`;
const format={type:"json_schema",name:"catalyst_unlock_intelligence",strict:true,schema};
// max_output_tokens includes reasoning tokens; web-search runs that hit 8000 end as truncated (incomplete) JSON.
const first=await callOpenAI({model:MODEL,reasoning:{effort:"medium"},max_output_tokens:16000,instructions,input,tools:[{type:"web_search"}],text:{format}});
if(!first.ok||!first.j)return res.status(502).json({error:"Event intelligence failed",failure_code:"UPSTREAM_HTTP_ERROR",detail:first.j?.error?.message||`OpenAI HTTP ${first.status}`});
const original=txt(first.j)||"";let x=original,fail=outputFailure(first.j,x),repair_used=false,repair_response_id=null,repair_sources_dropped=0;
if(fail){// One repair of serialization/shape only: same schema, NO web_search, no new facts.
 const rep=await callOpenAI({model:MODEL,reasoning:{effort:"low"},max_output_tokens:8000,instructions:REPAIR,input:`Malformed first output (${fail.code}):\n${String(x||"").slice(0,60000)}`,text:{format}});
 if(!rep.ok||!rep.j)return res.status(502).json({error:"Structured output could not be recovered",failure_code:"REPAIR_HTTP_ERROR",detail:rep.j?.error?.message||`OpenAI HTTP ${rep.status}`,original_failure:fail});
 const rx=txt(rep.j),rf=outputFailure(rep.j,rx);if(rf)return res.status(502).json({error:"Structured output could not be recovered",failure_code:"REPAIR_FAILED",detail:rf.detail,original_failure:fail});
 x=rx;repair_used=true;repair_response_id=rep.j.id||null}
let parsed=JSON.parse(x);
// A truncated first output may have lost its sources; the repair model must not supply new ones. Keep only source
// URLs that appear verbatim in the original first output; clean() then drops events left without a source.
if(repair_used){const kept=(parsed.sources||[]).filter(s=>s?.url&&original.includes(String(s.url)));repair_sources_dropped=(parsed.sources||[]).length-kept.length;parsed={...parsed,sources:kept}}
const intelligence=clean(parsed);
return res.status(200).json({intelligence,model:MODEL,model_version:"event-intel-v10.1",response_id:first.j.id||null,repair_used,repair_response_id,ingestion_diagnostics:{repair_used,dropped_events:intelligence.dropped_events||0,repair_sources_dropped},generated_at:new Date().toISOString()})}catch(e){return res.status(500).json({error:e?.message||"Event intelligence failed",failure_code:"SERVER_ERROR"})}}
