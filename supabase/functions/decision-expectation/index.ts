import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const H=[7,30,90];
function key(){const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(x)return x;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function all(q:any){const o:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;o.push(...(data||[]));if(!data||data.length<1000)break}return o}
const n=(x:any)=>x==null?null:Number(x),med=(a:number[])=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
function stats(rows:any[]){return{n:rows.length,median_return_pct:med(rows.map(x=>n(x.asset_return_pct)).filter(Number.isFinite) as number[]),median_btc_relative_pct:med(rows.map(x=>n(x.btc_relative_return_pct)).filter(Number.isFinite) as number[]),median_mfe_pct:med(rows.map(x=>n(x.max_favorable_excursion_pct)).filter(Number.isFinite) as number[]),median_max_drawdown_pct:med(rows.map(x=>n(x.max_drawdown_pct)).filter(Number.isFinite) as number[])}}
function hist(rows:any[],aid:number,h:number){const a=rows.filter(x=>x.scope==="asset"&&x.research_asset_id===aid&&x.horizon_days===h&&x.confidence_state!=="INSUFFICIENT"),c=rows.filter(x=>x.scope==="cross_asset"&&x.horizon_days===h&&x.confidence_state!=="INSUFFICIENT");return{asset:a,cross_asset:c}}
function histState(x:any){const r=[...x.asset,...x.cross_asset].map((z:any)=>n(z.median_return_pct)).filter(Number.isFinite) as number[];if(!r.length)return"INSUFFICIENT_EVIDENCE";const m=med(r)!;return m>=5?"CONSTRUCTIVE":m<=-5?"CAUTIONARY":"MIXED"}
function liveState(rows:any[],aid:number,h:number){const z=rows.filter(x=>x.research_asset_id===aid&&x.horizon_days===h);if(z.length<5)return"INSUFFICIENT_EVIDENCE";const s=stats(z);return s.median_btc_relative_pct!=null&&s.median_btc_relative_pct>=3?"SUPPORTIVE":s.median_btc_relative_pct!=null&&s.median_btc_relative_pct<=-3?"CAUTIONARY":"MIXED"}
function posture(owned:boolean,sig:any,ai:any,h30:any,live30:string){
 const hard=sig?.signal_label||"";
 if(owned){
  if(hard==="EXIT REVIEW")return"EXIT REVIEW";
  if(hard==="PROFIT-TAKING REVIEW")return"REDUCE / PROFIT REVIEW";
  if(hard==="REASSESS POSITION")return"REASSESS / HOLD";
  if(ai?.stance==="CAUTIOUS"&&h30==="CAUTIONARY")return"REASSESS / HOLD";
  if(ai?.stance==="CONSTRUCTIVE"&&["SUPPORTIVE","MIXED"].includes(live30))return"HOLD / ADD WATCH";
  return"HOLD";
 }
 if(["RESEARCH NEEDED","WAIT","WAIT / OVEREXTENDED"].includes(hard))return hard==="RESEARCH NEEDED"?"RESEARCH NEEDED":"WAIT";
 if(hard==="ATTRACTIVE ENTRY SETUP"){
  if(ai?.stance==="CAUTIOUS"||h30==="CAUTIONARY")return"ENTRY WATCH";
  if(live30==="CAUTIONARY")return"ENTRY WATCH";
  return"ENTRY SETUP";
 }
 if(hard==="WATCH ENTRY")return"ENTRY WATCH";
 return"WAIT";
}
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return Response.json({error:"unauthorized"},{status:401});
 const url=Deno.env.get("SUPABASE_URL"),sk=key();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 const [assets,signals,ais,cal,sigOut,aiOut]=await Promise.all([
  all(()=>db.from("research_assets").select("id,user_id,symbol,stage,is_owned,thesis_strength,thesis_coverage").neq("stage","archived").order("id")),
  all(()=>db.from("signal_observations").select("*").order("observed_date",{ascending:false})),
  all(()=>db.from("ai_research_assessments").select("id,user_id,research_asset_id,observed_at,stance,confidence,quant_ai_agreement,summary,assessment").order("observed_at",{ascending:false})),
  all(()=>db.from("calibration_results").select("*").order("id")),
  all(()=>db.from("signal_outcomes").select("*").order("matured_at",{ascending:false})),
  all(()=>db.from("ai_assessment_outcomes").select("*").order("matured_at",{ascending:false}))
 ]);
 let written=0;
 for(const a of assets){
  const sig=signals.find((x:any)=>x.research_asset_id===a.id),ai=ais.find((x:any)=>x.research_asset_id===a.id);
  const horizons:any={};for(const h of H){const he=hist(cal,a.id,h),ls=[...sigOut,...aiOut].filter((x:any)=>x.research_asset_id===a.id&&x.horizon_days===h);horizons[h]={historical_state:histState(he),historical_asset:he.asset,historical_cross_asset:he.cross_asset,live_state:liveState(ls,a.id,h),live:stats(ls)}}
  const owned=!!a.is_owned,post=posture(owned,sig,ai,horizons[30].historical_state,horizons[30].live_state);
  const matureHist=[7,30,90].filter(h=>horizons[h].historical_state!=="INSUFFICIENT_EVIDENCE").length,matureLive=[7,30,90].filter(h=>horizons[h].live_state!=="INSUFFICIENT_EVIDENCE").length;
  const conf=matureHist>=2&&matureLive>=1&&ai?"HIGH":matureHist>=2||ai?"MODERATE":"LOW";
  const exp={posture:post,confidence:conf,horizons,deterministic_signal:sig?{label:sig.signal_label,mode:sig.signal_mode,price:sig.price,thesis_strength:sig.thesis_strength,setup_evidence:sig.setup_evidence,regime_score:sig.regime_score,price_pattern:sig.price_pattern}:null,ai:ai?{stance:ai.stance,confidence:ai.confidence,agreement:ai.quant_ai_agreement,summary:ai.summary,historical_state:ai.assessment?.historical_evidence_state,live_state:ai.assessment?.live_validation_state}:null};
  const summary=`${post}. Historical evidence: ${horizons[30].historical_state}; live validation: ${horizons[30].live_state}; AI: ${ai?.stance||"not available"}.`;
  const row={user_id:a.user_id,research_asset_id:a.id,mode:owned?"position":"entry",posture:post,confidence:conf,summary,expectation:exp,input_snapshot:{signal:sig||null,ai:ai||null,calibration_version:"calibration-v9.3"},engine_version:"decision-v9.6"};
  const{error}=await db.from("decision_expectations").upsert(row,{onConflict:"user_id,research_asset_id,observed_date,mode"});if(error)throw error;written++;
 }
 return Response.json({ok:true,version:"decision-v9.6",assets:assets.length,written,note:"Decision support only. Historical/live evidence remains descriptive; deterministic thresholds are unchanged."});
}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}})
