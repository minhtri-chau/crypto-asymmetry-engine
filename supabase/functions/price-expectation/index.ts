import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
// v10.2 Price Expectation: asset-specific, distance-weighted outcome ranges of this asset's past replay states that
// resemble TODAY (same vector, distance and "today" computation as similarity-engine v9.7). Empirical scenario
// references only: no cross-asset data, no fundamentals/regime/AI, never feeds posture, Setup or Thesis.
const V="price-expectation-v10.2",H=[7,30,90],K=40;
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
const DAY=86400000,date=(t:number)=>new Date(t).toISOString().slice(0,10),dms=(d:string)=>Date.parse(d+"T00:00:00Z");
// Replay observations stop 90 days before the latest price (they need matured outcomes), so the newest one is NOT today.
// Today's vector is computed from persisted Coinbase closes with the same formulas as historical-replay.
function sma(xs:any[],k:number){if(xs.length<k)return null;return xs.slice(-k).reduce((s,x)=>s+x.p,0)/k}
function rsi(rows:any[],k=14){if(rows.length<k+1)return null;const x=rows.slice(-(k+1));let up=0,dn=0;for(let i=1;i<x.length;i++){const d=x[i].p-x[i-1].p;if(d>0)up+=d;else dn-=d}if(dn===0)return 100;const rs=(up/k)/(dn/k);return 100-100/(1+rs)}
function trend(p:number,m50:any,m200:any){if(m50==null||m200==null)return"INSUFFICIENT";if(p>=m50&&p>=m200)return"ABOVE_50_200";if(p>=m50)return"ABOVE_50_ONLY";if(p>=m200)return"ABOVE_200_ONLY";return"BELOW_50_200"}
function nearest(rows:any[],t:number,gap:number){let b:any=null,g=Infinity;for(const x of rows){const d=Math.abs(x.t-t);if(d<g){g=d;b=x}}return g<=gap?b:null}
function ret(rows:any[],t:number,d:number,p:number){const x=nearest(rows,t-d*DAY,3*DAY);return x?.p>0?(p/x.p-1)*100:null}
function dd90(rows:any[],p:number){const x=rows.slice(-90);if(!x.length)return null;const hi=Math.max(...x.map(z=>z.p));return hi>0?(p/hi-1)*100:null}
function today(px:any[],btc:any[]){if(px.length<60)return null;const x=px[px.length-1];if(Date.now()-x.t>4*DAY)return null;const m50=sma(px,50),m200=sma(px,200),b=nearest(btc,x.t,2*DAY),r30=ret(px,x.t,30,x.p),br30=b?ret(btc,x.t,30,b.p):null;
 return{as_of:date(x.t),price:x.p,return_7d:ret(px,x.t,7,x.p),return_30d:r30,rsi_14:rsi(px),price_vs_ma50_pct:m50?(x.p/m50-1)*100:null,price_vs_ma200_pct:m200?(x.p/m200-1)*100:null,drawdown_90d_pct:dd90(px,x.p),btc_relative_30d:r30!=null&&br30!=null?r30-br30:null,trend_state:trend(x.p,m50,m200)}}
async function btcDaily(){const o=new Map<number,number>(),end=Date.now();for(let st=end-260*DAY;st<end;st+=250*DAY){const u=new URL("https://api.exchange.coinbase.com/products/BTC-USD/candles");u.searchParams.set("granularity","86400");u.searchParams.set("start",new Date(st).toISOString());u.searchParams.set("end",new Date(Math.min(end,st+250*DAY)).toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase BTC-USD candles ${r.status}`);for(const c of await r.json()){const t=Number(c?.[0])*1000,p=Number(c?.[4]);if(Number.isFinite(t)&&p>0)o.set(t,p)}}return[...o].map(([t,p])=>({t,p})).sort((x,y)=>x.t-y.t)}
const usd=(p:number,r:any)=>r==null?null:p*(1+r/100);
Deno.serve(async req=>{try{const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return Response.json({error:"unauthorized"},{status:401});const url=Deno.env.get("SUPABASE_URL"),sk=key();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
const [assets,obs,outs]=await Promise.all([all(()=>db.from("research_assets").select("id,user_id,symbol,stage").neq("stage","archived").order("id")),all(()=>db.from("historical_replay_observations").select("*").order("observed_date")),all(()=>db.from("historical_replay_outcomes").select("*").order("id"))]);
const om=new Map<number,any[]>();for(const o of outs){if(!om.has(o.replay_observation_id))om.set(o.replay_observation_id,[]);om.get(o.replay_observation_id)!.push(o)}let written=0,errors:any[]=[];const btc=await btcDaily().catch(e=>{console.error(String(e));return[] as any[]}),since=date(Date.now()-260*DAY);
for(const a of assets){try{let r=obs.filter((x:any)=>x.user_id===a.user_id&&x.research_asset_id===a.id),multi=r.some((x:any)=>x.replay_version==="replay-v9.3.1-multiyear");r=r.filter((x:any)=>x.replay_version===(multi?"replay-v9.3.1-multiyear":"replay-v9.2"));if(r.length<2)continue;
 const px=(await all(()=>db.from("historical_price_daily").select("price_date,price").eq("user_id",a.user_id).eq("research_asset_id",a.id).eq("source","coinbase_exchange").gte("price_date",since).order("price_date"))).map((x:any)=>({t:dms(x.price_date),p:Number(x.price)})).filter((x:any)=>Number.isFinite(x.t)&&x.p>0);
 const cur=today(px,btc);if(!cur){errors.push({symbol:a.symbol,error:"no fresh Coinbase price history for today's state"});continue}
 const cv=vec(cur),asOf=dms(cur.as_of),price=cur.price,rank=r.map((x:any)=>({x,d:dist(cv,vec(x))})).filter(q=>q.d!=null).sort((x,y)=>x.d!-y.d!);const horizons:any={};
 for(const h of H){
  // Only analogs whose h-day outcome had fully matured by today's as-of date.
  const c=rank.map(q=>({q,o:(om.get(q.x.id)||[]).find((o:any)=>o.horizon_days===h)})).filter(x=>x.o&&dms(x.q.x.observed_date)+h*DAY<=asOf).slice(0,K);
  const w=c.map(x=>({v:n(x.o.asset_return_pct) as number,b:n(x.o.btc_relative_return_pct) as number,w:1/Math.pow(.15+(x.q.d as number),2)}));
  const q25=wq(w,.25),mid=wq(w,.5),q75=wq(w,.75),btcRel=wq(w.map(x=>({v:x.b,w:x.w})),.5),md=med(c.map(x=>x.q.d as number)),ind=periods(c.map(x=>x.q.x.observed_date),h),iqr=q25!=null&&q75!=null?q75-q25:null;
  horizons[h]={state:pstate(q25,mid,q75),confidence:pconf(c.length,ind,md,iqr),n:c.length,independent_periods:ind,median_distance:md,q25_return_pct:q25,central_return_pct:mid,q75_return_pct:q75,median_btc_relative_pct:btcRel,downside_price:usd(price,q25),central_price:usd(price,mid),upside_price:usd(price,q75),
   method:"asset-specific nearest 40 replay analogs by v9.7 distance to today; weights 1/(0.15+distance)^2; weighted q25/median/q75 of matured outcomes",
   neighbors:c.slice(0,10).map(x=>({observed_date:x.q.x.observed_date,distance:x.q.d,outcome_return_pct:x.o.asset_return_pct,outcome_btc_relative_pct:x.o.btc_relative_return_pct}))}}
 const row={user_id:a.user_id,research_asset_id:a.id,current_price:price,current_features:{as_of:cur.as_of,price,...cv,trend_state:cur.trend_state},horizons,engine_version:V};const{error}=await db.from("price_expectations").upsert(row,{onConflict:"user_id,research_asset_id,observed_date,engine_version"});if(error)throw error;written++}catch(e){errors.push({symbol:a.symbol,error:String(e).slice(0,180)})}}
return Response.json({ok:true,version:V,written,errors,note:"Empirical scenario references only; not a price target or probability. Does not change any decision rule."})}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}})
