import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const DAY=86400000;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>v==null||v===""?null:Number(v);
const avg=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const ret=(a:number,b:number)=>a>0&&b>0?(b/a-1)*100:null;
const dateOnly=(d=new Date())=>d.toISOString().slice(0,10);
function secretKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function fj(url:string,h:Record<string,string>={accept:"application/json"}){try{const r=await fetch(url,{headers:h});return r.ok?await r.json():null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let from=0;;from+=1000){const{data,error}=await q().range(from,from+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}

function rsi(xs:number[],n=14){if(xs.length<n+1)return null;let g=0,l=0;for(let i=xs.length-n;i<xs.length;i++){const d=xs[i]-xs[i-1];if(d>=0)g+=d;else l-=d}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-100/(1+rs)}
function priceAction(prices:any[],btc:any[]){
 const p=(prices||[]).map(x=>Number(x?.[1])).filter(Number.isFinite),b=(btc||[]).map(x=>Number(x?.[1])).filter(Number.isFinite);if(p.length<31)return null;
 const last=p.at(-1)!,at=(n:number)=>p[Math.max(0,p.length-1-n)],ma=(n:number)=>p.length>=n?avg(p.slice(-n)):null,m50=ma(50),m200=ma(200),r30=ret(at(30),last),dist50=m50?ret(m50,last):null,rv=rsi(p);
 let pattern="MIXED";if(m50&&m200&&last>m50&&m50>m200)pattern="UPTREND";else if(m200&&last<m200)pattern="BELOW 200D";else if(m50&&last>m50)pattern="ABOVE 50D";
 const extended=(r30!=null&&r30>35)||(dist50!=null&&dist50>22)||(rv!=null&&rv>72),constructive=!extended&&(pattern==="UPTREND"||pattern==="ABOVE 50D")&&(rv==null||rv<70),pullback=pattern==="UPTREND"&&dist50!=null&&dist50>=-8&&dist50<=8&&rv!=null&&rv>=38&&rv<=62;
 return{price:last,rsi14:rv,pattern,extended,constructive,pullback}
}
function ema(vals:number[],n:number){if(vals.length<n)return null;const k=2/(n+1);let e=avg(vals.slice(0,n))!;for(let i=n;i<vals.length;i++)e=vals[i]*k+e*(1-k);return e}
function weeklyCloses(prices:any[]){const out:any[]=[];for(const row of prices||[]){if(!Array.isArray(row)||!Number.isFinite(Number(row[1])))continue;const d=new Date(row[0]),day=(d.getUTCDay()+6)%7,start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day);if(!out.length||out.at(-1).week!==start)out.push({week:start,close:Number(row[1])});else out[out.length-1]={week:start,close:Number(row[1])}}return out}
function structuralState(prices:any[],pa:any){
 const vals=(prices||[]).map(x=>Number(x?.[1])).filter(Number.isFinite);if(vals.length<210)return null;const last=vals.at(-1)!,weeks=weeklyCloses(prices),now=new Date(),todayDay=(now.getUTCDay()+6)%7,currentWeek=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-todayDay),weekly=weeks.filter(x=>x.week<currentWeek).map(x=>x.close),prior=weekly.slice(-54,-2),recent26=prior.slice(-26),resistance=recent26.length?Math.max(...recent26):null,ema200=ema(vals,200),distance=resistance?ret(resistance,last):null;
 const consecutive=resistance?(()=>{let n=0;for(let i=weekly.length-1;i>=0&&weekly[i]>resistance;i--)n++;return n})():0,broke=!!resistance&&last>resistance,near=!!resistance&&distance!>=-8&&distance!<=3,retest=broke&&distance!<=8&&distance!>=0&&consecutive>=1,extended=pa?.extended||(distance!=null&&distance>22);
 let stage="BELOW STRUCTURAL RESISTANCE";if(extended&&broke)stage="EXTENDED";else if(retest&&consecutive>=2)stage="SUPPORT HELD";else if(retest)stage="RETEST / HOLD";else if(broke&&consecutive>=2)stage="CONFIRMED BREAKOUT";else if(broke)stage="BREAKOUT ATTEMPT";else if(near)stage="NEAR BREAKOUT";else if(ema200&&last>ema200)stage="EARLY STRUCTURE";
 return{stage,weeklyConfirmation:consecutive>=2?"CONFIRMED":consecutive===1?"ONE WEEK CLOSE":"UNCONFIRMED"}
}
function downsideBeta(prices:any[],btc:any[]){
 const a=(prices||[]).filter(x=>Array.isArray(x)&&Number.isFinite(Number(x[1]))),b=(btc||[]).filter(x=>Array.isArray(x)&&Number.isFinite(Number(x[1])));if(a.length<100||b.length<100)return null;
 const am=new Map(a.map(x=>[new Date(x[0]).toISOString().slice(0,10),Number(x[1])])),bm=new Map(b.map(x=>[new Date(x[0]).toISOString().slice(0,10),Number(x[1])])),dates=[...bm.keys()].filter(d=>am.has(d)).sort(),events:any[]=[];
 for(let i=7;i<dates.length;i++){const d0=dates[i-7],d1=dates[i],br=ret(bm.get(d0)!,bm.get(d1)!);if(br!=null&&br<=-5){const ar=ret(am.get(d0)!,am.get(d1)!);if(ar!=null)events.push({date:d1,br,ar,beta:ar/br})}}
 const picked:any[]=[];for(const e of events){const prev=picked.at(-1);if(!prev||Date.parse(e.date)-Date.parse(prev.date)>14*DAY)picked.push(e);else if(e.br<prev.br)picked[picked.length-1]=e}
 const betas=picked.slice(-8).map(x=>x.beta).filter(Number.isFinite);return betas.length?avg(betas):null
}
async function regime(h:Record<string,string>){
 const [btc,eth,global,stables,breadthRows]=await Promise.all([fj("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=210&interval=daily",h),fj("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=btc&days=40&interval=daily",h),fj("https://api.coingecko.com/api/v3/global",h),fj("https://stablecoins.llama.fi/stablecoincharts/all"),fj("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=7d,30d",h)]);
 if(!btc?.prices?.length)return{score:null,rotation:null,btcPrices:[]};const p=btc.prices.map((x:any)=>Number(x[1])),price=p.at(-1),ma50=p.length>=50?avg(p.slice(-50)):null,ma200=p.length>=200?avg(p.slice(-200)):null,btcTrend=price>ma50!&&ma50!>ma200!?"CONSTRUCTIVE":price<ma50!&&ma50!<ma200!?"DEFENSIVE":"MIXED",ep=(eth?.prices||[]).map((x:any)=>Number(x[1])),ethBtc30d=ep.length>30?ret(ep[ep.length-31],ep.at(-1)):null;
 let stablecoin30d=null;if(Array.isArray(stables)&&stables.length>30){const val=(x:any)=>Number(x?.totalCirculatingUSD?.peggedUSD??x?.totalCirculatingUSD??0),last=val(stables.at(-1)),old=val(stables[Math.max(0,stables.length-31)]);if(last>0&&old>0)stablecoin30d=ret(old,last)}
 const g=global?.data||{},btcDominance=Number(g.market_cap_percentage?.btc??NaN),totalMarket24h=Number(g.market_cap_change_percentage_24h_usd??NaN),breadth=(Array.isArray(breadthRows)?breadthRows:[]).filter((x:any)=>!["bitcoin","tether","usd-coin"].includes(x.id)),breadth7d=breadth.length?Math.round(100*breadth.filter((x:any)=>Number(x.price_change_percentage_7d_in_currency)>0).length/breadth.length):null,breadth30d=breadth.length?Math.round(100*breadth.filter((x:any)=>Number(x.price_change_percentage_30d_in_currency)>0).length/breadth.length):null;
 let score=50;score+=btcTrend==="CONSTRUCTIVE"?22:btcTrend==="DEFENSIVE"?-22:0;if(ethBtc30d!=null)score+=ethBtc30d>5?10:ethBtc30d>0?5:ethBtc30d<-8?-10:ethBtc30d<0?-4:0;if(stablecoin30d!=null)score+=stablecoin30d>3?10:stablecoin30d>0?5:stablecoin30d<-2?-10:stablecoin30d<0?-4:0;if(Number.isFinite(totalMarket24h))score+=totalMarket24h>3?5:totalMarket24h<-3?-5:0;score=Math.round(clamp(score,0,100));
 let rotation="MIXED / NO CLEAR ROTATION";if(btcTrend==="DEFENSIVE"&&score<45)rotation="DEFENSIVE / CAPITAL PRESERVATION";else if((ethBtc30d??0)>3&&(breadth7d??0)>=55)rotation=(breadth30d??0)>=55?"BROAD ALT ROTATION":"EARLY ALT ROTATION";else if((ethBtc30d??0)>0)rotation="ETH LEADERSHIP / EARLY ROTATION";else if(Number.isFinite(btcDominance)&&btcDominance>=55)rotation="BTC CONCENTRATION";else if((breadth7d??0)>=60)rotation="LARGE / BROAD ALT PARTICIPATION";
 return{score,rotation,btcPrices:btc.prices||[]}
}
function planHits(plan:any,e:any,price:number|null){
 if(!plan)return[];const hits:string[]=[];if(num(plan.take_profit)&&price!=null&&price>=num(plan.take_profit)!)hits.push("profit");if(num(plan.stop_loss)&&price!=null&&price<=num(plan.stop_loss)!)hits.push("risk");if(num(plan.max_fdv_tvl)&&num(e?.fdv)&&num(e?.tvl)&&num(e.fdv)!/num(e.tvl)!<=num(plan.max_fdv_tvl)!)hits.push("buy");if(num(plan.fee_drop)&&num(plan.entry_fees_30d)&&num(e?.fees_30d)!=null&&num(e.fees_30d)!<=num(plan.entry_fees_30d)!*(1-num(plan.fee_drop)!/100))hits.push("risk");return hits
}
function decision(a:any,e:any,pa:any,plan:any,regimeScore:number|null){
 const owned=!!(a.is_owned||plan?.is_owned),thesis=num(a.thesis_strength),thesisCoverage=num(a.thesis_coverage),setup=num(e?.evidence_score),coverage=num(e?.evidence_coverage),status=e?.status||"research_needed",price=pa?.price??num(e?.price),hits=planHits(plan,e,price),regimeDefensive=regimeScore!=null&&regimeScore<45;
 if(owned){const thesisMature=thesisCoverage!=null&&thesisCoverage>=65,severe=["reduce_exit_review","archive_candidate"].includes(status);if(hits.includes("risk"))return["position","EXIT REVIEW"];if(severe&&thesisMature)return["position","EXIT REVIEW"];if(hits.includes("profit"))return["position","PROFIT-TAKING REVIEW"];if(severe&&!thesisMature)return["position","REASSESS POSITION"];if(thesis!=null&&thesis<45&&thesisMature)return["position","REASSESS POSITION"];if(status==="reassess"||pa?.extended||regimeDefensive)return["position","REASSESS POSITION"];return["position","HOLD / MONITOR"]}
 if(thesis==null||thesisCoverage==null||thesisCoverage<55)return["entry","RESEARCH NEEDED"];if(thesis<60)return["entry","WAIT"];if(coverage==null||coverage<75||status==="research_needed")return["entry","RESEARCH NEEDED"];if(["reassess","archive_candidate","reduce_exit_review"].includes(status)||pa?.extended)return["entry","WAIT / OVEREXTENDED"];if(regimeDefensive)return["entry","WATCH ENTRY"];if(setup!=null&&setup>=65&&thesis>=70&&pa?.constructive&&(pa.rsi14==null||pa.rsi14<=68))return["entry","ATTRACTIVE ENTRY SETUP"];if(setup!=null&&setup>=55&&pa?.constructive)return["entry","WATCH ENTRY"];return["entry","WAIT"]
}

Deno.serve(async req=>{
 try{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const expected=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!expected||req.headers.get("x-monitor-secret")!==expected)return new Response("Unauthorized",{status:401});
  const url=Deno.env.get("SUPABASE_URL"),key=secretKey();if(!url||!key)return Response.json({error:"Supabase server credentials unavailable"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),cg=Deno.env.get("COINGECKO_DEMO_API_KEY")||"",h:Record<string,string>={accept:"application/json"};if(cg)h["x-cg-demo-api-key"]=cg;
  const assets=await allRows(()=>db.from("research_assets").select("*").neq("stage","archived").order("id",{ascending:true}));if(!assets.length)return Response.json({ok:true,captured:0});
  const evaluations=await allRows(()=>db.from("research_evaluations").select("*").order("evaluated_at",{ascending:false}).order("id",{ascending:false})),latest=new Map<number,any>();for(const e of evaluations)if(!latest.has(e.research_asset_id))latest.set(e.research_asset_id,e);
  const plans=await allRows(()=>db.from("plans").select("*").order("id",{ascending:true})),planMap=new Map(plans.map((p:any)=>[`${p.user_id}:${p.symbol}`,p]));
  const tx=await allRows(()=>db.from("position_transactions").select("user_id,research_asset_id,token_amount,price_usd").order("id",{ascending:true})),pos=new Map<string,{tokens:number,cost:number}>();for(const t of tx){const k=`${t.user_id}:${t.research_asset_id}`,x=pos.get(k)||{tokens:0,cost:0};x.tokens+=Number(t.token_amount)||0;x.cost+=(Number(t.token_amount)||0)*(Number(t.price_usd)||0);pos.set(k,x)}
  const rg=await regime(h);if(rg.score==null)return Response.json({error:"Market regime unavailable; no observations written"},{status:502});
  const rows:any[]=[];let skipped=0;
  for(let i=0;i<assets.length;i+=5){
   const batch=assets.slice(i,i+5);
   const histories=await Promise.all(batch.map(async(a:any)=>({a,hist:await fj(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(a.coingecko_id)}/market_chart?vs_currency=usd&days=365&interval=daily`,h)})));
   for(const {a,hist} of histories){const e=latest.get(a.id);if(!e||!hist?.prices?.length){skipped++;continue}const pa=priceAction(hist.prices,rg.btcPrices);if(!pa){skipped++;continue}const plan=planMap.get(`${a.user_id}:${a.symbol}`),[mode,label]=decision(a,e,pa,plan,rg.score),structure=structuralState(hist.prices,pa),beta=downsideBeta(hist.prices,rg.btcPrices),position=pos.get(`${a.user_id}:${a.id}`),tokens=position?.tokens||0,cost=position?.cost||0,average=tokens>0?cost/tokens:null,current=pa.price,currentValue=tokens>0?tokens*current:null,gain=currentValue!=null?currentValue-cost:null,gainPct=cost>0&&gain!=null?gain/cost*100:null;
    rows.push({user_id:a.user_id,research_asset_id:a.id,observed_date:dateOnly(),signal_mode:mode,signal_label:label,price:current,thesis_strength:a.thesis_strength??null,thesis_coverage:a.thesis_coverage??null,setup_evidence:e.evidence_score??null,setup_coverage:e.evidence_coverage??null,setup_scoring_version:e.scoring_version??"setup-v3",regime_score:rg.score,rotation_state:rg.rotation,price_pattern:pa.pattern,structure_stage:structure?.stage??null,weekly_breakout_confirmation:structure?.weeklyConfirmation??null,btc_downside_beta:beta,position_token_amount:tokens||null,position_average_cost:average,position_cost_basis:cost||null,position_unrealized_pnl:gain,position_unrealized_pnl_pct:gainPct,capture_source:"server_daily",signal_model_version:"decision-v8.9.6"});
   }
  }
  if(rows.length){const{error}=await db.from("signal_observations").upsert(rows,{onConflict:"user_id,research_asset_id,observed_date,signal_mode"});if(error)throw error}
  return Response.json({ok:true,captured:rows.length,skipped,regimeScore:rg.score,at:new Date().toISOString(),captureSource:"server_daily",signalModelVersion:"decision-v8.9.6"})
 }catch(e){console.error(e);return Response.json({ok:false,error:String(e)},{status:500})}
});
