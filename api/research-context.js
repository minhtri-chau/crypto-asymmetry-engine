const CG="https://api.coingecko.com/api/v3";
const num=v=>v==null||v===""?null:Number(v),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),ret=(a,b)=>a>0&&b>0?(b/a-1)*100:null,avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const headers=()=>{const h={accept:"application/json"},k=process.env.COINGECKO_DEMO_API_KEY;if(k)h["x-cg-demo-api-key"]=k;return h};
async function j(url,h={accept:"application/json"}){try{const r=await fetch(url,{headers:h});return r.ok?await r.json():null}catch{return null}}
function rsi(xs,n=14){if(xs.length<n+1)return null;let g=0,l=0;for(let i=xs.length-n;i<xs.length;i++){const d=xs[i]-xs[i-1];if(d>=0)g+=d;else l-=d}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-100/(1+rs)}
function stats(prices,btc){const p=prices.map(x=>x[1]).filter(Number.isFinite),b=btc.map(x=>x[1]).filter(Number.isFinite);if(p.length<31)return null;const last=p.at(-1),at=n=>p[Math.max(0,p.length-1-n)],ma=n=>p.length>=n?avg(p.slice(-n)):null,m20=ma(20),m50=ma(50),m200=ma(200),r7=ret(at(7),last),r30=ret(at(30),last),r90=ret(at(90),last),r180=ret(at(180),last),br30=b.length>=31?ret(b[b.length-31],b.at(-1)):null,br90=b.length>=91?ret(b[b.length-91],b.at(-1)):null,hi90=Math.max(...p.slice(-Math.min(90,p.length))),dd90=hi90>0?(last/hi90-1)*100:null,dist50=m50?ret(m50,last):null,dist200=m200?ret(m200,last):null,rv=rsi(p);let pattern="MIXED";if(m50&&m200&&last>m50&&m50>m200)pattern="UPTREND";else if(m200&&last<m200)pattern="BELOW 200D";else if(m50&&last>m50)pattern="ABOVE 50D";const extended=(r30!=null&&r30>35)||(dist50!=null&&dist50>22)||(rv!=null&&rv>72),constructive=!extended&&(pattern==="UPTREND"||pattern==="ABOVE 50D")&&(rv==null||rv<70),pullback=pattern==="UPTREND"&&dist50!=null&&dist50>=-8&&dist50<=8&&rv!=null&&rv>=38&&rv<=62;return{price:last,ma20:m20,ma50:m50,ma200:m200,rsi14:rv,return7d:r7,return30d:r30,return90d:r90,return180d:r180,relative30d:br30==null?null:r30-br30,relative90d:br90==null?null:r90-br90,drawdown90d:dd90,distance50d:dist50,distance200d:dist200,pattern,extended,constructive,pullback}}
function familyMap(ps){const g=new Map();for(const p of ps||[]){const k=String(p?.parentProtocol||"");if(k.startsWith("parent#")&&num(p.tvl)>0){if(!g.has(k))g.set(k,[]);g.get(k).push(p)}}return g}
function weightedChange(rows){let tvl=0,old=0,ok=0;for(const p of rows||[]){const t=num(p.tvl),c=num(p.change_7d);if(!(t>0)||c==null||c<=-99)continue;tvl+=t;old+=t/(1+c/100);ok++}return ok&&old>0?(tvl/old-1)*100:null}
export default async function handler(req,res){try{
 const id=String(req.query.id||"").trim();if(!/^[a-z0-9-]{1,100}$/i.test(id))return res.status(400).json({error:"invalid id"});
 const h=headers();
 // One browser endpoint supplies both price-action and research-intelligence panels.
 // The asset's 365D history is fetched once instead of separately by two endpoints.
 const [coin,trending,hist,btc,protocols]=await Promise.all([
  j(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,h),
  j(`${CG}/search/trending`,h),
  j(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=365&interval=daily`,h),
  j(`${CG}/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily`,h),
  j("https://api.llama.fi/protocols")
 ]);
 if(!hist?.prices?.length)return res.status(502).json({error:"asset history unavailable"});
 const priceAction=stats(hist.prices||[],btc?.prices||[]);
 const trendCoins=(trending?.coins||[]).map((x,i)=>({id:x?.item?.id,rank:i+1})),tr=trendCoins.find(x=>x.id===id),cats=(coin?.categories||[]).filter(Boolean).slice(0,6);
 const vols=(hist?.total_volumes||[]).map(x=>num(x[1])).filter(x=>x!=null),recent=avg(vols.slice(-7)),prior=avg(vols.slice(-14,-7)),volumeAcceleration=recent!=null&&prior>0?(recent/prior-1)*100:null;
 let attention=35,attentionObserved=0;if(tr){attention+=Math.max(10,35-tr.rank*3);attentionObserved++}if(volumeAcceleration!=null){attention+=volumeAcceleration>50?25:volumeAcceleration>20?15:volumeAcceleration>0?7:volumeAcceleration<-30?-10:0;attentionObserved++}
 attention=Math.round(clamp(attention,0,100));const attentionCoverage=Math.round(attentionObserved/2*100);
 let competitive={status:"NOT MATCHED",category:null,marketShare:null,projectTvl7d:null,sectorTvl7d:null,relativeMomentum:null};
 if(Array.isArray(protocols)){const fam=familyMap(protocols),children=[];for(const p of protocols){if(p?.gecko_id===id&&p.parentProtocol&&fam.has(p.parentProtocol)){children.push(...fam.get(p.parentProtocol));break}else if(p?.gecko_id===id)children.push(p)}if(children.length){const category=children.find(x=>x.category)?.category||null,projectTvl=children.reduce((s,x)=>s+(num(x.tvl)||0),0),projectTvl7d=weightedChange(children),sector=(protocols||[]).filter(x=>x.category===category&&num(x.tvl)>0),sectorTvl=sector.reduce((s,x)=>s+(num(x.tvl)||0),0),sectorTvl7d=weightedChange(sector);competitive={status:"OBSERVED",category,marketShare:sectorTvl>0?projectTvl/sectorTvl*100:null,projectTvl7d,sectorTvl7d,relativeMomentum:projectTvl7d!=null&&sectorTvl7d!=null?projectTvl7d-sectorTvl7d:null}}}
 const narrativeState=tr?"TRENDING / HIGH ATTENTION":volumeAcceleration!=null&&volumeAcceleration>25?"ATTENTION ACCELERATING":volumeAcceleration!=null&&volumeAcceleration<-25?"ATTENTION COOLING":"NO STRONG ATTENTION SIGNAL";
 res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
 return res.status(200).json({id,priceAction,categories:cats,narrative:{state:narrativeState,attentionScore:attention,coverage:attentionCoverage,trendingRank:tr?.rank??null,volumeAcceleration7dVsPrior7d:volumeAcceleration,note:"Attention is observational, not a thesis or buy score. Trending presence and trading-volume acceleration are proxies, not proof of durable capital inflow."},competitive,catalystQuality:{status:"PENDING VERIFIED SOURCE INGESTION",note:"Catalyst quality is not inferred from unsourced headlines."},coinGeckoDemoKey:!!process.env.COINGECKO_DEMO_API_KEY,at:new Date().toISOString()});
}catch(e){return res.status(502).json({error:"research context unavailable"})}}
