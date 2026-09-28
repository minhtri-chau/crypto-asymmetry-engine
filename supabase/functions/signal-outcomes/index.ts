import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HORIZONS=[7,30,90];
const DAY=86400000;
const num=(v:any)=>v==null?null:Number(v);
const dateOnly=(d:Date)=>d.toISOString().slice(0,10);
const daysBetween=(a:string,b:string)=>Math.floor((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/DAY);

function nearest(rows:any[],target:number,maxGapDays=3){
  let best:any=null,gap=Infinity;
  for(const r of rows||[]){if(!Array.isArray(r)||!Number.isFinite(Number(r[1])))continue;const g=Math.abs(Number(r[0])-target);if(g<gap){gap=g;best=r}}
  return best&&gap<=maxGapDays*DAY?{t:Number(best[0]),p:Number(best[1])}:null;
}
function windowRows(rows:any[],start:number,end:number){return(rows||[]).filter(r=>Array.isArray(r)&&Number(r[0])>=start&&Number(r[0])<=end&&Number.isFinite(Number(r[1]))).map(r=>({t:Number(r[0]),p:Number(r[1])}))}
function metrics(asset:any[],btc:any[],observedDate:string,horizon:number,observedPrice:any){
  const startTs=Date.parse(observedDate+"T00:00:00Z"),endTs=startTs+horizon*DAY;
  const a0=nearest(asset,startTs),a1=nearest(asset,endTs),b0=nearest(btc,startTs),b1=nearest(btc,endTs);
  const entry=num(observedPrice)>0?num(observedPrice):a0?.p??null;
  if(!(entry!>0)||!a1||!b0||!b1)return null;
  const win=windowRows(asset,a0?.t??startTs,a1.t);if(win.length<Math.max(3,Math.floor(horizon*.55)))return null;
  const assetRet=(a1.p/entry!-1)*100,btcRet=(b1.p/b0.p-1)*100;
  let hi=entry!,mfe=-Infinity,mae=Infinity,maxDd=0;
  for(const x of win){mfe=Math.max(mfe,(x.p/entry!-1)*100);mae=Math.min(mae,(x.p/entry!-1)*100);hi=Math.max(hi,x.p);maxDd=Math.min(maxDd,(x.p/hi-1)*100)}
  return{entry_price:entry,exit_price:a1.p,asset_return_pct:assetRet,btc_return_pct:btcRet,btc_relative_return_pct:assetRet-btcRet,max_favorable_excursion_pct:Number.isFinite(mfe)?mfe:null,max_adverse_excursion_pct:Number.isFinite(mae)?mae:null,max_drawdown_pct:maxDd,sample_days:win.length};
}
async function cg(id:string,key:string){
 const h:any={accept:"application/json"};if(key)h["x-cg-demo-api-key"]=key;
 const r=await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=365&interval=daily`,{headers:h});
 if(!r.ok)throw new Error(`CoinGecko ${id} ${r.status}`);return await r.json();
}
Deno.serve(async req=>{
 try{
  const secret=Deno.env.get("MONITOR_CRON_SECRET")||"",provided=req.headers.get("x-monitor-secret")||"";
  if(!secret||provided!==secret)return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{"content-type":"application/json"}});
  const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,cgKey=Deno.env.get("COINGECKO_DEMO_API_KEY")||"";
  const db=createClient(url,service,{auth:{persistSession:false}});
  const today=dateOnly(new Date()),cutoff=dateOnly(new Date(Date.now()-360*DAY));
  const {data:obs,error:oe}=await db.from("signal_observations").select("id,user_id,research_asset_id,observed_date,price,signal_mode,signal_label").gte("observed_date",cutoff).order("observed_date",{ascending:true});
  if(oe)throw oe;
  const ids=[...new Set((obs||[]).map((x:any)=>x.research_asset_id))];
  const {data:assets,error:ae}=ids.length?await db.from("research_assets").select("id,coingecko_id,symbol").in("id",ids):{data:[],error:null};if(ae)throw ae;
  const amap=new Map((assets||[]).map((x:any)=>[x.id,x]));
  const existingResult=(obs||[]).length?await db.from("signal_outcomes").select("signal_observation_id,horizon_days").in("signal_observation_id",(obs||[]).map((x:any)=>x.id)):{data:[],error:null};const {data:existing,error:ee}=existingResult;if(ee)throw ee;
  const done=new Set((existing||[]).map((x:any)=>`${x.signal_observation_id}:${x.horizon_days}`));
  const pending=(obs||[]).flatMap((o:any)=>HORIZONS.filter(h=>daysBetween(o.observed_date,today)>=h&&!done.has(`${o.id}:${h}`)).map(h=>({o,h})));
  const coinIds=[...new Set(pending.map((x:any)=>amap.get(x.o.research_asset_id)?.coingecko_id).filter(Boolean))];
  const histories=new Map<string,any[]>();
  const btc=(await cg("bitcoin",cgKey)).prices||[];
  for(let i=0;i<coinIds.length;i+=5){await Promise.all(coinIds.slice(i,i+5).map(async id=>{try{histories.set(id,(await cg(id,cgKey)).prices||[])}catch(e){console.error(String(e));histories.set(id,[])}}))}
  const rows:any[]=[];
  for(const {o,h} of pending){const a:any=amap.get(o.research_asset_id),hist=a?histories.get(a.coingecko_id):null;if(!hist?.length)continue;const m=metrics(hist,btc,o.observed_date,h,o.price);if(!m)continue;rows.push({user_id:o.user_id,signal_observation_id:o.id,research_asset_id:o.research_asset_id,horizon_days:h,matured_at:dateOnly(new Date(Date.parse(o.observed_date+"T00:00:00Z")+h*DAY)),...m,outcome_version:"outcome-v1",calculated_at:new Date().toISOString()})}
  if(rows.length){const {error}=await db.from("signal_outcomes").upsert(rows,{onConflict:"signal_observation_id,horizon_days"});if(error)throw error}
  return new Response(JSON.stringify({ok:true,observations:(obs||[]).length,pending:pending.length,inserted:rows.length,assets:coinIds.length,outcomeVersion:"outcome-v1"}),{status:200,headers:{"content-type":"application/json"}});
 }catch(e){console.error(e);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}
});
