import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const H=[7,30,90];
function key(){const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(x)return x;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function all(q:any){const o:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;o.push(...(data||[]));if(!data||data.length<1000)break}return o}
const n=(x:any)=>x==null?null:Number(x),med=(a:number[])=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
function stats(rows:any[]){return{n:rows.length,median_return_pct:med(rows.map(x=>n(x.asset_return_pct)).filter(Number.isFinite) as number[]),median_btc_relative_pct:med(rows.map(x=>n(x.btc_relative_return_pct)).filter(Number.isFinite) as number[]),median_mfe_pct:med(rows.map(x=>n(x.max_favorable_excursion_pct)).filter(Number.isFinite) as number[]),median_max_drawdown_pct:med(rows.map(x=>n(x.max_drawdown_pct)).filter(Number.isFinite) as number[])}}
const DAY=86400000,date=(t:number)=>new Date(t).toISOString().slice(0,10);
// Same point-in-time features and cohort predicates as historical-replay / evidence-calibration, so today's state
// selects only the calibration cohorts it actually belongs to (not every cohort for the asset).
function sma(xs:any[],k:number){if(xs.length<k)return null;return xs.slice(-k).reduce((s,x)=>s+x.p,0)/k}
function rsi(rows:any[],k=14){if(rows.length<k+1)return null;const x=rows.slice(-(k+1));let up=0,dn=0;for(let i=1;i<x.length;i++){const d=x[i].p-x[i-1].p;if(d>0)up+=d;else dn-=d}if(dn===0)return 100;const rs=(up/k)/(dn/k);return 100-100/(1+rs)}
function trend(p:number,m50:any,m200:any){if(m50==null||m200==null)return"INSUFFICIENT";if(p>=m50&&p>=m200)return"ABOVE_50_200";if(p>=m50)return"ABOVE_50_ONLY";if(p>=m200)return"ABOVE_200_ONLY";return"BELOW_50_200"}
function nearest(rows:any[],t:number,gap:number){let b:any=null,g=Infinity;for(const x of rows){const d=Math.abs(x.t-t);if(d<g){g=d;b=x}}return g<=gap?b:null}
function ret(rows:any[],t:number,d:number,p:number){const x=nearest(rows,t-d*DAY,3*DAY);return x?.p>0?(p/x.p-1)*100:null}
const C:[string,(x:any)=>boolean][]=[
 ["trend_above_50_200",x=>x.trend_state==="ABOVE_50_200"],
 ["rsi_45_65",x=>x.rsi_14!=null&&x.rsi_14>=45&&x.rsi_14<=65],
 ["btc_relative_positive",x=>x.btc_relative_30d!=null&&x.btc_relative_30d>0],
 ["pullback_30d",x=>x.return_30d!=null&&x.return_30d<0],
 ["trend_plus_rsi",x=>x.trend_state==="ABOVE_50_200"&&x.rsi_14!=null&&x.rsi_14>=45&&x.rsi_14<=65],
 ["trend_plus_relative",x=>x.trend_state==="ABOVE_50_200"&&x.btc_relative_30d!=null&&x.btc_relative_30d>0],
 ["pullback_above_200",x=>x.return_30d!=null&&x.return_30d<0&&(x.trend_state==="ABOVE_50_200"||x.trend_state==="ABOVE_200_ONLY")]];
function features(px:any[],btc:any[]){if(px.length<60)return null;const last=px[px.length-1];if(Date.now()-last.t>4*DAY)return null;const b=nearest(btc,last.t,2*DAY),r30=ret(px,last.t,30,last.p),br30=b?ret(btc,last.t,30,b.p):null;
 return{as_of:date(last.t),price:last.p,trend_state:trend(last.p,sma(px,50),sma(px,200)),rsi_14:rsi(px),return_30d:r30,btc_relative_30d:r30!=null&&br30!=null?r30-br30:null}}
const matched=(f:any)=>f?C.filter(([,t])=>t(f)).map(([k])=>k):[];
function hist(rows:any[],aid:number,uid:string,h:number,keys:string[]){const ok=(x:any)=>x.horizon_days===h&&x.confidence_state!=="INSUFFICIENT"&&x.user_id===uid&&keys.includes(x.cohort_key);return{asset:rows.filter(x=>ok(x)&&x.scope==="asset"&&x.research_asset_id===aid),cross_asset:rows.filter(x=>ok(x)&&x.scope==="cross_asset")}}
// Asset-specific and cross-asset cohorts are never averaged together; posture uses the asset's own evidence only.
function histState(rows:any[]){const r=rows.map((z:any)=>n(z.median_return_pct)).filter(Number.isFinite) as number[];if(!r.length)return"INSUFFICIENT_EVIDENCE";const m=med(r)!;return m>=5?"CONSTRUCTIVE":m<=-5?"CAUTIONARY":"MIXED"}
function liveState(z:any[]){if(z.length<5)return"INSUFFICIENT_EVIDENCE";const s=stats(z);return s.median_btc_relative_pct!=null&&s.median_btc_relative_pct>=3?"SUPPORTIVE":s.median_btc_relative_pct!=null&&s.median_btc_relative_pct<=-3?"CAUTIONARY":"MIXED"}
async function btcDaily(){const o=new Map<number,number>(),end=Date.now();for(let st=end-260*DAY;st<end;st+=250*DAY){const u=new URL("https://api.exchange.coinbase.com/products/BTC-USD/candles");u.searchParams.set("granularity","86400");u.searchParams.set("start",new Date(st).toISOString());u.searchParams.set("end",new Date(Math.min(end,st+250*DAY)).toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase BTC-USD candles ${r.status}`);for(const c of await r.json()){const t=Number(c?.[0])*1000,p=Number(c?.[4]);if(Number.isFinite(t)&&p>0)o.set(t,p)}}return[...o].map(([t,p])=>({t,p})).sort((x,y)=>x.t-y.t)}
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
 const sinceDate=date(Date.now()-260*DAY),obsById=new Map(signals.map((x:any)=>[x.id,x]));
 const btc=await btcDaily().catch(e=>{console.error(String(e));return[] as any[]});
 let written=0;
 for(const a of assets){
  const owned=!!a.is_owned,mode=owned?"position":"entry";
  const sig=signals.find((x:any)=>x.research_asset_id===a.id&&x.signal_mode===mode),ai=ais.find((x:any)=>x.research_asset_id===a.id);
  const px=(await all(()=>db.from("historical_price_daily").select("price_date,price").eq("user_id",a.user_id).eq("research_asset_id",a.id).eq("source","coinbase_exchange").gte("price_date",sinceDate).order("price_date"))).map((x:any)=>({t:Date.parse(x.price_date+"T00:00:00Z"),p:Number(x.price)})).filter((x:any)=>Number.isFinite(x.t)&&x.p>0);
  const feat=features(px,btc),keys=matched(feat);
  // Live validation: only past signals of the same mode and label as today's signal; AI outcomes reported separately.
  const sameSig=sig?sigOut.filter((x:any)=>{const o:any=obsById.get(x.signal_observation_id);return x.research_asset_id===a.id&&o&&o.signal_mode===mode&&o.signal_label===sig.signal_label}):[];
  const horizons:any={};for(const h of H){const he=hist(cal,a.id,a.user_id,h,keys),ls=sameSig.filter((x:any)=>x.horizon_days===h),la=aiOut.filter((x:any)=>x.research_asset_id===a.id&&x.horizon_days===h);horizons[h]={historical_state:histState(he.asset),cross_asset_state:histState(he.cross_asset),historical_asset:he.asset,historical_cross_asset:he.cross_asset,live_state:liveState(ls),live:stats(ls),live_ai:stats(la)}}
  const post=posture(owned,sig,ai,horizons[30].historical_state,horizons[30].live_state);
  const matureHist=[7,30,90].filter(h=>horizons[h].historical_state!=="INSUFFICIENT_EVIDENCE").length,matureLive=[7,30,90].filter(h=>horizons[h].live_state!=="INSUFFICIENT_EVIDENCE").length;
  const conf=matureHist>=2&&matureLive>=1&&ai?"HIGH":matureHist>=2||ai?"MODERATE":"LOW";
  const exp={posture:post,confidence:conf,horizons,current_features:feat,matched_cohorts:keys,live_signal_label:sig?.signal_label||null,deterministic_signal:sig?{label:sig.signal_label,mode:sig.signal_mode,price:sig.price,thesis_strength:sig.thesis_strength,setup_evidence:sig.setup_evidence,regime_score:sig.regime_score,price_pattern:sig.price_pattern}:null,ai:ai?{stance:ai.stance,confidence:ai.confidence,agreement:ai.quant_ai_agreement,summary:ai.summary,historical_state:ai.assessment?.historical_evidence_state,live_state:ai.assessment?.live_validation_state}:null};
  const summary=`${post}. Historical evidence: ${horizons[30].historical_state}; live validation: ${horizons[30].live_state}; AI: ${ai?.stance||"not available"}.`;
  const row={user_id:a.user_id,research_asset_id:a.id,mode,posture:post,confidence:conf,summary,expectation:exp,input_snapshot:{signal:sig||null,ai:ai||null,calibration_version:"calibration-v9.3"},engine_version:"decision-v9.6"};
  const{error}=await db.from("decision_expectations").upsert(row,{onConflict:"user_id,research_asset_id,observed_date,mode"});if(error)throw error;written++;
 }
 return Response.json({ok:true,version:"decision-v9.6",assets:assets.length,written,note:"Decision support only. Historical/live evidence remains descriptive; deterministic thresholds are unchanged."});
}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}})
