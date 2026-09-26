const PROTOCOLS={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",LINK:"chainlink",ONDO:"ondo-finance"};
const CHAINS={TAO:"Bittensor",TIA:"Celestia",SUI:"Sui"};
const num=v=>v==null||v===""?null:Number(v);
const pct=(a,b)=>a!=null&&b!=null&&b!==0?(a/b-1)*100:null;
async function j(url){try{const r=await fetch(url);if(!r.ok)return null;return await r.json()}catch{return null}}
function latestChange(rows,days){
 if(!Array.isArray(rows)||!rows.length)return null;
 const clean=rows.map(x=>({date:num(x.date??x[0]),tvl:num(x.tvl??x[1])})).filter(x=>x.date!=null&&x.tvl!=null).sort((a,b)=>a.date-b.date);
 if(clean.length<2)return null;const now=clean[clean.length-1],target=now.date-days*86400;
 let old=null;for(const x of clean){if(x.date<=target)old=x;else break}
 return old?pct(now.tvl,old.tvl):null
}
function summaryFields(fees,rev,holders){
 return {fees30d:num(fees?.total30d),fees7d:num(fees?.total7d),fees7dChange:num(fees?.change_7dover7d),
 revenue30d:num(rev?.total30d),revenue7d:num(rev?.total7d),revenue7dChange:num(rev?.change_7dover7d),
 holdersRevenue30d:num(holders?.total30d)}
}
async function feeBundle(slug){
 const [fees,rev,holders]=await Promise.all([
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`),
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`),
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyHoldersRevenue`)
 ]);return summaryFields(fees,rev,holders)
}
async function protocolAsset(sym,slug,bySlug){
 const p=bySlug[slug]||{},x=await feeBundle(slug);
 return [sym,{tvl:num(p.tvl),tvl1d:num(p.change_1d),tvl7d:num(p.change_7d),tvl1m:num(p.change_1m),...x,
  decisionEligible:[num(p.change_7d),x.fees7dChange,x.revenue7dChange].filter(v=>v!=null).length>=1,
  sourceNote:"DefiLlama protocol fundamentals · 7D activity change compares current 7D with the prior 7D"}]
}
async function chainAsset(sym,chain,feeSlug){
 const [hist,x]=await Promise.all([j(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`),feeBundle(feeSlug)]);
 const rows=Array.isArray(hist)?hist:[],last=rows.length?rows[rows.length-1]:null;
 const tvl=num(last?.tvl??last?.[1]),tvl7d=latestChange(rows,7),tvl1m=latestChange(rows,30);
 return [sym,{tvl,tvl1d:null,tvl7d,tvl1m,...x,
  decisionEligible:[tvl7d,x.fees7dChange,x.revenue7dChange].filter(v=>v!=null).length>=1,
  sourceNote:`DefiLlama ${chain} chain TVL + ${feeSlug} activity · 7D activity change compares current 7D with the prior 7D`}]
}
async function akash(){
 const providers=await j("https://console-api.akash.network/v1/providers");
 const list=Array.isArray(providers)?providers:Array.isArray(providers?.data)?providers.data:[];
 let active=0,total=0,online=0;
 for(const p of list){if(p?.isOnline)online++;for(const k of["cpu","gpu"]){active+=num(p?.stats?.[k]?.active)||0;total+=num(p?.stats?.[k]?.total)||0}}
 const util=total>0?active/total*100:null;
 return ["AKT",{tvl:null,tvl1d:null,tvl7d:null,tvl1m:null,fees30d:null,fees7d:null,fees7dChange:null,revenue30d:null,revenue7d:null,revenue7dChange:null,
  decisionEligible:false,extraLabel:"Provider CPU/GPU utilization",extraDisplay:util==null?"—":`${util.toFixed(1)}% · ${online}/${list.length} online`,
  sourceNote:"Akash public Console API · live provider CPU/GPU utilization; no historical growth series is inferred"}]
}
export default async function handler(req,res){
 try{
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  const protocols=await j("https://api.llama.fi/protocols");const bySlug={};(protocols||[]).forEach(p=>bySlug[p.slug]=p);
  const tasks=Object.entries(PROTOCOLS).map(([s,l])=>protocolAsset(s,l,bySlug));
  tasks.push(chainAsset("TIA","Celestia","celestia"),chainAsset("SUI","Sui","sui"));
  // TAO uses chain TVL plus Chutes paid AI-compute revenue as an ecosystem activity proxy, clearly labeled.
  tasks.push((async()=>{const [sym,x]=await chainAsset("TAO","Bittensor","chutes");x.sourceNote="DefiLlama Bittensor chain TVL + Chutes paid AI-compute revenue proxy · not total TAO token economics";return[sym,x]})());
  tasks.push(akash());
  const entries=await Promise.all(tasks);return res.status(200).json({assets:Object.fromEntries(entries),at:new Date().toISOString()});
 }catch(e){return res.status(500).json({error:"Fundamentals adapter failed"})}
}
