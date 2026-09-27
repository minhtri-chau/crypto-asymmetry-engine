const CG="https://api.coingecko.com/api/v3",num=v=>v==null||v===""?null:Number(v),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const headers=()=>{const h={accept:"application/json"},k=process.env.COINGECKO_DEMO_API_KEY;if(k)h["x-cg-demo-api-key"]=k;return h};
async function j(url,h={accept:"application/json"}){try{const r=await fetch(url,{headers:h});return r.ok?await r.json():null}catch{return null}}
function familyMap(ps){const g=new Map();for(const p of ps||[]){const k=String(p?.parentProtocol||"");if(k.startsWith("parent#")&&num(p.tvl)>0){if(!g.has(k))g.set(k,[]);g.get(k).push(p)}}return g}
function weightedChange(rows){let tvl=0,old=0,ok=0;for(const p of rows||[]){const t=num(p.tvl),c=num(p.change_7d);if(!(t>0)||c==null||c<=-99)continue;tvl+=t;old+=t/(1+c/100);ok++}return ok&&old>0?(tvl/old-1)*100:null}
export default async function handler(req,res){try{
 const id=String(req.query.id||"").trim();if(!id)return res.status(400).json({error:"id required"});
 const h=headers(),[coin,trending,hist,protocols]=await Promise.all([
  j(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,h),
  j(`${CG}/search/trending`,h),
  j(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=35&interval=daily`,h),
  j("https://api.llama.fi/protocols")
 ]);
 const trendCoins=(trending?.coins||[]).map((x,i)=>({id:x?.item?.id,rank:i+1})),tr=trendCoins.find(x=>x.id===id),cats=(coin?.categories||[]).filter(Boolean).slice(0,6);
 const vols=(hist?.total_volumes||[]).map(x=>num(x[1])).filter(x=>x!=null),avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 const recent=avg(vols.slice(-7)),prior=avg(vols.slice(-14,-7)),volumeAcceleration=recent!=null&&prior>0?(recent/prior-1)*100:null;
 let attention=35,attentionObserved=0;if(tr){attention+=Math.max(10,35-tr.rank*3);attentionObserved++}if(volumeAcceleration!=null){attention+=volumeAcceleration>50?25:volumeAcceleration>20?15:volumeAcceleration>0?7:volumeAcceleration<-30?-10:0;attentionObserved++}
 attention=Math.round(clamp(attention,0,100));const attentionCoverage=Math.round(attentionObserved/2*100);
 let competitive={status:"NOT MATCHED",category:null,marketShare:null,projectTvl7d:null,sectorTvl7d:null,relativeMomentum:null};
 if(Array.isArray(protocols)){
  const fam=familyMap(protocols),children=[];for(const p of protocols){if(p?.gecko_id===id&&p.parentProtocol&&fam.has(p.parentProtocol)){children.push(...fam.get(p.parentProtocol));break}else if(p?.gecko_id===id)children.push(p)}
  if(children.length){const category=children.find(x=>x.category)?.category||null,projectTvl=children.reduce((s,x)=>s+(num(x.tvl)||0),0),projectTvl7d=weightedChange(children),sector=(protocols||[]).filter(x=>x.category===category&&num(x.tvl)>0),sectorTvl=sector.reduce((s,x)=>s+(num(x.tvl)||0),0),sectorTvl7d=weightedChange(sector);competitive={status:"OBSERVED",category,marketShare:sectorTvl>0?projectTvl/sectorTvl*100:null,projectTvl7d,sectorTvl7d,relativeMomentum:projectTvl7d!=null&&sectorTvl7d!=null?projectTvl7d-sectorTvl7d:null}}
 }
 const narrativeState=tr?"TRENDING / HIGH ATTENTION":volumeAcceleration!=null&&volumeAcceleration>25?"ATTENTION ACCELERATING":volumeAcceleration!=null&&volumeAcceleration<-25?"ATTENTION COOLING":"NO STRONG ATTENTION SIGNAL";
 res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
 res.status(200).json({id,categories:cats,narrative:{state:narrativeState,attentionScore:attention,coverage:attentionCoverage,trendingRank:tr?.rank??null,volumeAcceleration7dVsPrior7d:volumeAcceleration,note:"Attention is observational, not a thesis or buy score. Trending presence and trading-volume acceleration are proxies, not proof of durable capital inflow."},competitive,catalystQuality:{status:"PENDING VERIFIED SOURCE INGESTION",note:"v8.9 does not infer catalyst quality from unsourced headlines. Structural commitments, buybacks, integrations and regulatory catalysts require verified provenance before scoring."},at:new Date().toISOString()})
}catch(e){res.status(502).json({error:"research intelligence unavailable"})}}