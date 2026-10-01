import {collectDirectAdoption} from "../src/direct-adoption.mjs";
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
// /summary/fees/{slug} does not return change_7dover7d, so derive it from the daily totalDataChart it already includes.
function chart7dOver7d(s){
 const c=(s?.totalDataChart||[]).filter(p=>Array.isArray(p)&&p.length===2);if(c.length<14)return null;
 const sum=a=>a.reduce((t,p)=>t+(num(p[1])||0),0),last=sum(c.slice(-7)),prev=sum(c.slice(-14,-7));
 return prev>0?(last/prev-1)*100:null
}
function summaryFields(fees,rev,holders){
 return {fees30d:num(fees?.total30d),fees7d:num(fees?.total7d),fees7dChange:num(fees?.change_7dover7d)??chart7dOver7d(fees),
 revenue30d:num(rev?.total30d),revenue7d:num(rev?.total7d),revenue7dChange:num(rev?.change_7dover7d)??chart7dOver7d(rev),
 holdersRevenue30d:num(holders?.total30d)}
}
async function feeBundle(slug){
 const [fees,rev,holders]=await Promise.all([
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`),
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`),
  j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyHoldersRevenue`)
 ]);return summaryFields(fees,rev,holders)
}
// These slugs are DefiLlama parent protocols: /protocols lists only their children (parentProtocol "parent#slug").
// Current TVL comes from /tvl/{slug}; period changes are TVL-weighted across children, or null if any child lacks the field.
function parentChanges(protocols,slug){
 const kids=protocols.filter(p=>(p.slug===slug||p.parentProtocol===`parent#${slug}`)&&num(p.tvl)>0);
 const chg=k=>{if(!kids.length||kids.some(p=>num(p[k])==null))return null;const now=kids.reduce((t,p)=>t+num(p.tvl),0),old=kids.reduce((t,p)=>t+num(p.tvl)/(1+num(p[k])/100),0);return old>0?(now/old-1)*100:null};
 return{tvl1d:chg("change_1d"),tvl7d:chg("change_7d"),tvl1m:chg("change_1m")}
}
async function protocolAsset(sym,slug,protocols){
 const[tvl,x]=await Promise.all([j(`https://api.llama.fi/tvl/${slug}`),feeBundle(slug)]),c=parentChanges(protocols,slug);
 return [sym,{tvl:typeof tvl==="number"?tvl:null,...c,...x,
  decisionEligible:[c.tvl7d,x.fees7dChange,x.revenue7dChange].filter(v=>v!=null).length>=1,
  sourceNote:"DefiLlama protocol fundamentals · 7D activity change compares current 7D with the prior 7D"}]
}
async function chainAsset(sym,chain,feeSlug){
 const [hist,x]=await Promise.all([j(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chain)}`),feeBundle(feeSlug)]);
 const rows=Array.isArray(hist)?hist:[],last=rows.length?rows[rows.length-1]:null;
 const tvl=num(last?.tvl??last?.[1]),tvl7d=latestChange(rows,7);
 return [sym,{tvl,tvl1d:null,tvl7d,tvl1m:null,...x,
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
  if(req.query?.id!==undefined){
   const id=String(req.query.id);if(!/^[a-z0-9-]{1,100}$/i.test(id))return res.status(400).json({error:"Invalid coin id"});
   const fetchJson=async(url,extra={})=>{const headers={accept:"application/json",...extra};if(url.startsWith("https://api.coingecko.com/")&&process.env.COINGECKO_DEMO_API_KEY)headers["x-cg-demo-api-key"]=process.env.COINGECKO_DEMO_API_KEY;
    const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});if(r.status!==200)throw new Error(`Provider HTTP ${r.status}`);return r.json();};
   const intelligence=await collectDirectAdoption(id,{fetchJson});res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");return res.status(200).json({id,intelligence,at:intelligence.collected_at});
  }
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  const protocols=(await j("https://api.llama.fi/protocols"))||[];
  const tasks=Object.entries(PROTOCOLS).map(([s,l])=>protocolAsset(s,l,protocols));
  tasks.push(chainAsset("TIA","Celestia","celestia"),chainAsset("SUI","Sui","sui"));
  // TAO uses chain TVL plus Chutes paid AI-compute revenue as an ecosystem activity proxy, clearly labeled.
  tasks.push((async()=>{const [sym,x]=await chainAsset("TAO","Bittensor","chutes");x.sourceNote="DefiLlama Bittensor chain TVL + Chutes paid AI-compute revenue proxy · not total TAO token economics";return[sym,x]})());
  tasks.push(akash());
  const entries=await Promise.all(tasks);return res.status(200).json({assets:Object.fromEntries(entries),at:new Date().toISOString()});
 }catch(e){return res.status(500).json({error:"Fundamentals adapter failed"})}
}
