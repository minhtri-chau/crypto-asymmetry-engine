import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
// v10.3.1: ONE asset per call (explicit {symbol} or {research_asset_id}; otherwise the active asset whose validation is
// missing or oldest), loading only that asset's replay rows, because the all-asset v10.3 run hit WORKER_RESOURCE_LIMIT
// (HTTP 546). Math is unchanged. Cross-asset rows are no longer recomputed here (reporting-only, whole-universe cost).
// v10.3: replays the exact v10.2 price-expectation method at every past replay anchor using only outcomes that had
// matured by that anchor date, then scores it against zero and unconditional baselines. Research label only:
// nothing here feeds posture, Setup, Thesis, AI or the expectation itself.
const V="price-validation-v10.3",H=[7,30,90],K=40,DAY=86400000,dms=(d:string)=>Date.parse(d+"T00:00:00Z");
function key(){const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(x)return x;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function all(q:any){const o:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;o.push(...(data||[]));if(!data||data.length<1000)break}return o}
const n=(x:any)=>x==null?null:Number(x),fin=(x:any):x is number=>Number.isFinite(x);
function med(a:number[]){a=a.filter(fin).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
// Weighted quantile: smallest value whose cumulative weight reaches p of the total (monotonic in p, so q25<=median<=q75).
function wq(z:{v:number,w:number}[],p:number){const a=z.filter(x=>fin(x.v)&&x.w>0).sort((x,y)=>x.v-y.v),tot=a.reduce((s,x)=>s+x.w,0);if(!a.length||!(tot>0))return null;let c=0;for(const x of a){c+=x.w;if(c>=p*tot-1e-12)return x.v}return a[a.length-1].v}
// Non-overlapping periods among the analogs used: observation dates at least h days apart.
function periods(dates:string[],h:number){let c=0,last=-Infinity;for(const t of dates.map(d=>Date.parse(d+"T00:00:00Z")).sort((x,y)=>x-y))if(t-last>=h*86400000){c++;last=t}return c}
function pstate(q25:any,m:any,q75:any){if(m==null)return"INSUFFICIENT_EVIDENCE";if(q25!=null&&q25>0)return"CONSTRUCTIVE";if(q75!=null&&q75<0)return"CAUTIONARY";if(m>=5)return"SLIGHTLY_CONSTRUCTIVE";if(m<=-5)return"SLIGHTLY_CAUTIONARY";return"MIXED"}
// Never HIGH in v10.2.
function pconf(k:number,ind:number,md:any,iqr:any){if(k<15||ind<3)return"INSUFFICIENT";if(ind>=8&&md!=null&&md<=.65&&iqr!=null&&iqr<=30)return"MODERATE";return"LOW"}
function vec(x:any){return{return_7d:n(x.return_7d),return_30d:n(x.return_30d),rsi_14:n(x.rsi_14),price_vs_ma50_pct:n(x.price_vs_ma50_pct),price_vs_ma200_pct:n(x.price_vs_ma200_pct),drawdown_90d_pct:n(x.drawdown_90d_pct),btc_relative_30d:n(x.btc_relative_30d)}}
const S:any={return_7d:12,return_30d:25,rsi_14:20,price_vs_ma50_pct:18,price_vs_ma200_pct:30,drawdown_90d_pct:25,btc_relative_30d:20};
function dist(a:any,b:any){let s=0,w=0;for(const k of Object.keys(S)){const x=n(a[k]),y=n(b[k]);if(x==null||y==null)continue;const d=(x-y)/S[k];s+=d*d;w++}return w>=5?Math.sqrt(s/w):null}

// One v10.2 prediction from a feature vector and a candidate pool (already leakage-filtered by the caller).
function predict(xv:any,pool:any[],h:number){const c=pool.map(y=>({y,d:dist(xv,y.v)})).filter(q=>q.d!=null).sort((u,v)=>u.d!-v.d!).slice(0,K);
 const w=c.map(q=>({v:n(q.y.out.asset_return_pct) as number,b:n(q.y.out.btc_relative_return_pct) as number,w:1/Math.pow(.15+(q.d as number),2)}));
 const q25=wq(w,.25),mid=wq(w,.5),q75=wq(w,.75),btc=wq(w.map(x=>({v:x.b,w:x.w})),.5),md=med(c.map(q=>q.d as number)),ind=periods(c.map(q=>q.y.obs.observed_date),h),iqr=q25!=null&&q75!=null?q75-q25:null;
 return{n:c.length,q25,mid,q75,btc,confidence:pconf(c.length,ind,md,iqr)}}
const pctOf=(a:any[],f:(x:any)=>boolean)=>a.length?100*a.filter(f).length/a.length:null,imp=(base:any,m:any)=>base!=null&&m!=null&&base>0?100*(base-m)/base:null;
function summarize(t:any[],h:number){const mae=med(t.map(x=>Math.abs(x.mid-x.actual))),zero=med(t.map(x=>Math.abs(x.actual))),unc=med(t.map(x=>Math.abs(x.base-x.actual)));
 return{sample_count:t.length,independent_count:periods(t.map(x=>x.date),h),asset_count:new Set(t.map(x=>x.aid)).size,
  range_coverage_pct:pctOf(t,x=>x.actual>=x.q25&&x.actual<=x.q75),central_mae_pct:mae,central_bias_pct:med(t.map(x=>x.mid-x.actual)),
  directional_agreement_pct:pctOf(t,x=>(x.mid>=0)===(x.actual>=0)),btc_relative_mae_pct:med(t.filter(x=>x.btc!=null&&x.actualBtc!=null).map(x=>Math.abs(x.btc-x.actualBtc))),
  zero_baseline_mae_pct:zero,unconditional_baseline_mae_pct:unc,mae_improvement_vs_zero_pct:imp(zero,mae),mae_improvement_vs_unconditional_pct:imp(unc,mae)}}
function vstate(s:any){if(s.sample_count<30||s.independent_count<8)return"INSUFFICIENT";const ok=(s.mae_improvement_vs_zero_pct??-1)>=5&&(s.mae_improvement_vs_unconditional_pct??-1)>=5&&s.range_coverage_pct!=null&&s.range_coverage_pct>=40&&s.range_coverage_pct<=65&&(s.directional_agreement_pct??0)>=55;return ok?"PROMISING":"WEAK"}
const slice=(t:any[],h:number,c:string)=>{const z=t.filter(x=>x.confidence===c);if(!z.length)return{};const s=summarize(z,h);return{...s,validation_state:vstate(s)}};
async function inBatches(db:any,ids:number[]){const o:any[]=[];for(let i=0;i<ids.length;i+=150){const part=ids.slice(i,i+150);o.push(...await all(()=>db.from("historical_replay_outcomes").select("replay_observation_id,horizon_days,asset_return_pct,btc_relative_return_pct").in("replay_observation_id",part).order("id")))}return o}
Deno.serve(async req=>{try{const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return Response.json({error:"unauthorized"},{status:401});const url=Deno.env.get("SUPABASE_URL"),sk=key();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
let body:any={};try{body=await req.json()}catch{}
const assets=await all(()=>db.from("research_assets").select("id,user_id,symbol,stage").neq("stage","archived").order("id"));
let a:any=null;
if(body?.research_asset_id!=null)a=assets.find((x:any)=>x.id===Number(body.research_asset_id));
else if(body?.symbol)a=assets.find((x:any)=>String(x.symbol).toUpperCase()===String(body.symbol).toUpperCase());
else{// Stateless rotation: missing first, then the oldest calculated_at (no cursor table that another worker could clean up).
 const done=await all(()=>db.from("price_expectation_validation").select("research_asset_id,calculated_at").eq("scope","asset").eq("validation_version",V).order("id")),last=new Map<number,string>();
 for(const r of done){const p=last.get(r.research_asset_id);if(!p||r.calculated_at<p)last.set(r.research_asset_id,r.calculated_at)}
 a=[...assets].sort((x:any,y:any)=>{const px=last.get(x.id),py=last.get(y.id);if(!px&&!py)return x.id-y.id;if(!px)return -1;if(!py)return 1;return px<py?-1:px>py?1:x.id-y.id})[0]||null}
if(!a)return Response.json({ok:false,error:"asset not found or no active assets",requested:body?.symbol??body?.research_asset_id??null},{status:404});
let r=await all(()=>db.from("historical_replay_observations").select("*").eq("user_id",a.user_id).eq("research_asset_id",a.id).order("observed_date"));
const multi=r.some((x:any)=>x.replay_version==="replay-v9.3.1-multiyear");r=r.filter((x:any)=>x.replay_version===(multi?"replay-v9.3.1-multiyear":"replay-v9.2"));
if(r.length<2)return Response.json({ok:true,version:V,asset:a.symbol,written:0,note:"fewer than 2 replay observations"});
const outs=await inBatches(db,r.map((x:any)=>x.id)),om=new Map<number,any[]>();for(const o of outs){if(!om.has(o.replay_observation_id))om.set(o.replay_observation_id,[]);om.get(o.replay_observation_id)!.push(o)}
const diag:any={};let written=0;
for(const h of H){const rows=r.map((o:any)=>({obs:o,v:vec(o),out:(om.get(o.id)||[]).find((u:any)=>u.horizon_days===h)})).filter((x:any)=>x.out&&n(x.out.asset_return_pct)!=null);let insufficient=0,k=0;const t:any[]=[];
 for(const x of rows){const at=dms(x.obs.observed_date);
  // Leakage gate: rows are chronological, so the matured pool (candidate date + h <= anchor date) is a growing prefix.
  while(k<rows.length&&dms(rows[k].obs.observed_date)+h*DAY<=at)k++;const pool=rows.slice(0,k);if(!pool.length)continue;
  const p=predict(x.v,pool,h);if(p.mid==null)continue;if(p.confidence==="INSUFFICIENT"){insufficient++;continue}
  t.push({aid:a.id,uid:a.user_id,date:x.obs.observed_date,actual:n(x.out.asset_return_pct),actualBtc:n(x.out.btc_relative_return_pct),mid:p.mid,q25:p.q25,q75:p.q75,btc:p.btc,base:med(pool.map((y:any)=>n(y.out.asset_return_pct) as number)),confidence:p.confidence})}
 diag[h]={anchors:rows.length,scored:t.length,skipped_insufficient_confidence:insufficient};
 const s=summarize(t,h);await up(db,{user_id:a.user_id,research_asset_id:a.id,scope:"asset",horizon_days:h,...s,low_confidence:slice(t,h,"LOW"),moderate_confidence:slice(t,h,"MODERATE"),validation_state:vstate(s),diagnostics:{anchors:rows.length,skipped_insufficient_confidence:insufficient,method:"exact v10.2 method replayed at each anchor; candidates and baseline matured by the anchor date; INSUFFICIENT-confidence anchors are not scored"},validation_version:V,calculated_at:new Date().toISOString()});written++}
return Response.json({ok:true,version:V,asset:a.symbol,research_asset_id:a.id,written,diagnostics:diag,note:"One asset per call. Validation label only; nothing changes any expectation or decision."})}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}})
async function up(db:any,row:any){const{error}=await db.from("price_expectation_validation").upsert(row,{onConflict:"user_id,scope,research_asset_id,horizon_days,validation_version"});if(error)throw error}
