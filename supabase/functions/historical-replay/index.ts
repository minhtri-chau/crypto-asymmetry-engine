import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const DAY=86400000,HORIZONS=[7,30,90],VERSION="replay-v9.2",VERSION_MULTI="replay-v9.3.1-multiyear",MIN_PERSISTED=260;
// CoinGecko Demo/public keys only serve the past 365 days (error 10012 / HTTP 401 beyond that). Early replay
// points therefore lack a 200D MA and are stored with trend_state INSUFFICIENT rather than failing the whole run.
const HISTORY_DAYS=365;
const num=(v:any)=>v==null?null:Number(v);
const dateOnly=(t:number)=>new Date(t).toISOString().slice(0,10);
function secretKey(){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let from=0;;from+=1000){const{data,error}=await q().range(from,from+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}
async function cg(id:string,key:string,days:number){
 const h:any={accept:"application/json"};if(key)h["x-cg-demo-api-key"]=key;
 const r=await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`,{headers:h});
 if(!r.ok)throw new Error(`CoinGecko ${id} ${r.status}`);const j=await r.json();
 return (j.prices||[]).filter((x:any)=>Array.isArray(x)&&Number.isFinite(Number(x[0]))&&Number.isFinite(Number(x[1]))).map((x:any)=>({t:Number(x[0]),p:Number(x[1])})).sort((a:any,b:any)=>a.t-b.t);
}
// v9.3.1: persisted multi-year Coinbase daily closes (imported by multi-year-history), ascending {t,p}.
async function persisted(db:any,uid:string,assetId:number){const rows=await allRows(()=>db.from("historical_price_daily").select("price_date,price").eq("user_id",uid).eq("research_asset_id",assetId).eq("source","coinbase_exchange").order("price_date",{ascending:true}));return rows.map((x:any)=>({t:Date.parse(x.price_date+"T00:00:00Z"),p:Number(x.price)})).filter((x:any)=>Number.isFinite(x.t)&&x.p>0)}
// Coinbase Exchange daily candles, paged in 250-day windows (API max 300 buckets), ascending {t,p}. Used for the BTC
// benchmark when BTC is not itself a researched asset, so multi-year observations are not dropped for lack of BTC dates.
async function coinbaseDaily(product:string,days:number){const end=Date.now(),begin=end-days*DAY,m=new Map<number,number>();
 for(let e=end;e>begin;e-=250*DAY){const u=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`);u.searchParams.set("granularity","86400");u.searchParams.set("start",new Date(Math.max(begin,e-249*DAY)).toISOString());u.searchParams.set("end",new Date(e).toISOString());
  const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw new Error(`Coinbase candles ${product} ${r.status}`);
  for(const x of await r.json()){const t=Number(x?.[0])*1000,p=Number(x?.[4]);if(Number.isFinite(t)&&p>0)m.set(t,p)}await new Promise(z=>setTimeout(z,120))}
 return [...m.entries()].map(([t,p])=>({t,p})).sort((a,b)=>a.t-b.t)}
function nearest(rows:any[],t:number,maxGap=2*DAY){let b:any=null,g=Infinity;for(const x of rows){const d=Math.abs(x.t-t);if(d<g){g=d;b=x}}return b&&g<=maxGap?b:null}
function before(rows:any[],t:number){return rows.filter(x=>x.t<=t)}
function sma(xs:any[],n:number){if(xs.length<n)return null;return xs.slice(-n).reduce((s,x)=>s+x.p,0)/n}
function ret(rows:any[],t:number,d:number,p:number){const x=nearest(rows,t-d*DAY,3*DAY);return x?.p>0?(p/x.p-1)*100:null}
function rsi(rows:any[],n=14){if(rows.length<n+1)return null;const x=rows.slice(-(n+1));let up=0,dn=0;for(let i=1;i<x.length;i++){const d=x[i].p-x[i-1].p;if(d>0)up+=d;else dn-=d}if(dn===0)return 100;const rs=(up/n)/(dn/n);return 100-100/(1+rs)}
function dd90(rows:any[],p:number){const x=rows.slice(-90);if(!x.length)return null;const hi=Math.max(...x.map(z=>z.p));return hi>0?(p/hi-1)*100:null}
function trend(p:number,m50:any,m200:any){if(m50==null||m200==null)return"INSUFFICIENT";if(p>=m50&&p>=m200)return"ABOVE_50_200";if(p>=m50)return"ABOVE_50_ONLY";if(p>=m200)return"ABOVE_200_ONLY";return"BELOW_50_200"}
function outcome(asset:any[],btc:any[],t:number,h:number,entry:number){
 const end=nearest(asset,t+h*DAY,3*DAY),b0=nearest(btc,t,3*DAY),b1=nearest(btc,t+h*DAY,3*DAY);
 if(!end||!b0||!b1||!(entry>0))return null;
 const win=asset.filter(x=>x.t>=t&&x.t<=end.t);if(win.length<Math.max(3,Math.floor(h*.55)))return null;
 let hi=entry,mfe=-Infinity,mae=Infinity,maxdd=0;
 for(const x of win){mfe=Math.max(mfe,(x.p/entry-1)*100);mae=Math.min(mae,(x.p/entry-1)*100);hi=Math.max(hi,x.p);maxdd=Math.min(maxdd,(x.p/hi-1)*100)}
 const ar=(end.p/entry-1)*100,br=(b1.p/b0.p-1)*100;
 return{matured_at:dateOnly(t+h*DAY),entry_price:entry,exit_price:end.p,asset_return_pct:ar,btc_return_pct:br,btc_relative_return_pct:ar-br,max_favorable_excursion_pct:mfe,max_adverse_excursion_pct:mae,max_drawdown_pct:maxdd,sample_days:win.length};
}
Deno.serve(async req=>{try{
 const secret=Deno.env.get("MONITOR_CRON_SECRET")||"",provided=req.headers.get("x-monitor-secret")||"";
 if(!secret||provided!==secret)return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{"content-type":"application/json"}});
 const url=Deno.env.get("SUPABASE_URL"),service=secretKey(),key=Deno.env.get("COINGECKO_DEMO_API_KEY")||"";
 if(!url||!service)throw new Error("Supabase server credentials unavailable");
 let body:any={};try{body=await req.json()}catch{}
 const lookback=Math.min(365,Math.max(120,Number(body.lookback_days)||365)),lookbackMulti=Math.min(3650,Math.max(120,Number(body.lookback_days)||1825)),cadence=Math.min(30,Math.max(1,Number(body.cadence_days)||7));
 const db=createClient(url,service,{auth:{persistSession:false}});
 const assets=await allRows(()=>db.from("research_assets").select("id,user_id,symbol,coingecko_id,coinbase_product_id,stage").neq("stage","archived").not("coingecko_id","is",null).order("id",{ascending:true}));
 const btc=await cg("bitcoin",key,HISTORY_DAYS);let obsCount=0,outCount=0,errors:any[]=[];
 // Multi-year BTC benchmark per user: persisted BTC-USD history if BTC is researched, else Coinbase BTC-USD directly.
 const btcMulti=new Map<string,any[]>();let btcCoinbase:any[]|null=null;
 async function multiBtc(uid:string){if(btcMulti.has(uid))return btcMulti.get(uid)!;let series:any[]=[];
  const b=assets.find((x:any)=>x.user_id===uid&&x.coinbase_product_id==="BTC-USD");if(b)series=await persisted(db,uid,b.id);
  if(series.length<MIN_PERSISTED){if(!btcCoinbase){try{btcCoinbase=await coinbaseDaily("BTC-USD",lookbackMulti+210)}catch(e){console.error(String(e));btcCoinbase=[]}}series=btcCoinbase}
  btcMulti.set(uid,series);return series}
 for(let i=0;i<assets.length;i+=4){await Promise.all(assets.slice(i,i+4).map(async(a:any)=>{try{
   // Prefer >=260 persisted multi-year Coinbase days; otherwise the unchanged v9.2 path (CoinGecko Demo, exactly 365 days).
   const saved=await persisted(db,a.user_id,a.id),bm=saved.length>=MIN_PERSISTED?await multiBtc(a.user_id):[],multi=saved.length>=MIN_PERSISTED&&bm.length>=MIN_PERSISTED;
   const hist=multi?saved:await cg(a.coingecko_id,key,HISTORY_DAYS);if(hist.length<60)return;
   const bench=multi?bm:btc,version=multi?VERSION_MULTI:VERSION,span=multi?lookbackMulti:lookback;
   const latestT=hist[hist.length-1].t,start=latestT-span*DAY,rows:any[]=[];
   for(let t=start;t<=latestT-90*DAY;t+=cadence*DAY){
    const x=nearest(hist,t,2*DAY);if(!x)continue;const past=before(hist,x.t),bp=nearest(bench,x.t,2*DAY);if(!bp)continue;
    const m50=sma(past,50),m200=sma(past,200),r7=ret(hist,x.t,7,x.p),r30=ret(hist,x.t,30,x.p),br30=ret(bench,x.t,30,bp.p);
    rows.push({user_id:a.user_id,research_asset_id:a.id,observed_date:dateOnly(x.t),price:x.p,return_7d:r7,return_30d:r30,ma_50:m50,ma_200:m200,price_vs_ma50_pct:m50?(x.p/m50-1)*100:null,price_vs_ma200_pct:m200?(x.p/m200-1)*100:null,rsi_14:rsi(past),drawdown_90d_pct:dd90(past,x.p),btc_return_30d:br30,btc_relative_30d:r30!=null&&br30!=null?r30-br30:null,trend_state:trend(x.p,m50,m200),replay_version:version});
   }
   if(!rows.length)return;
   const{data:stored,error}=await db.from("historical_replay_observations").upsert(rows,{onConflict:"user_id,research_asset_id,observed_date,replay_version"}).select("id,observed_date,price");if(error)throw error;obsCount+=(stored||[]).length;
   const outs:any[]=[];for(const o of stored||[]){const t=Date.parse(o.observed_date+"T00:00:00Z");for(const h of HORIZONS){const m=outcome(hist,bench,t,h,Number(o.price));if(m)outs.push({user_id:a.user_id,replay_observation_id:o.id,research_asset_id:a.id,horizon_days:h,...m,replay_version:version,calculated_at:new Date().toISOString()})}}
   if(outs.length){const{error:oe}=await db.from("historical_replay_outcomes").upsert(outs,{onConflict:"replay_observation_id,horizon_days"});if(oe)throw oe;outCount+=outs.length}
  }catch(e){errors.push({symbol:a.symbol,error:String(e).slice(0,180)})}}))}
 return new Response(JSON.stringify({ok:true,version:VERSION,multiYearVersion:VERSION_MULTI,assets:assets.length,observations:obsCount,outcomes:outCount,errors:errors.slice(0,20),note:"Replay uses only point-in-time price/BTC history. It does not invent historical thesis, fundamentals, qualitative evidence, regime, or AI judgments."}),{headers:{"content-type":"application/json"}});
}catch(e){console.error(e);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}})
