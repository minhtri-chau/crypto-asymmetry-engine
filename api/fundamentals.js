// Self-contained Vercel handler: no runtime import from frontend source.
const DAY=86400000, iso=t=>new Date(t).toISOString().slice(0,10), finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function observationsFromDaily(rows,{metric,scope,source,period=1,now=Date.now()}){
 const daily=new Map();for(const row of rows||[]){const t=Number(Array.isArray(row)?row[0]:row.date)*1000,v=Array.isArray(row)?row[1]:row.totalLiquidityUSD;if(Number.isFinite(t)&&finite(v)&&t<Math.floor(now/DAY)*DAY)daily.set(iso(t),v);}
 const dates=[...daily.keys()].sort(),out=[];
 for(const offset of [0,30,90,180]){const end=dates.at(-1);if(!end)continue;const target=Date.parse(end)-DAY*offset,date=iso(target);if(!daily.has(date))continue;let sum=0,complete=true;for(let k=0;k<period;k++){const d=iso(target-k*DAY);if(!daily.has(d)){complete=false;break}sum+=daily.get(d);}if(complete)out.push({date,value:sum,period_days:period,definition:period===1?'USD TVL snapshot':`Trailing ${period}-day ${metric}`,scope,source_ids:[source]});}return out;
}
function githubRepo(url){try{const u=new URL(url),p=u.pathname.split('/').filter(Boolean);return u.protocol==='https:'&&u.hostname==='github.com'&&p.length===2&&p.every(x=>/^[a-zA-Z0-9_.-]+$/.test(x))?p.join('/').replace(/\.git$/,''):null}catch{return null}}
function mergeEvidence(records){const sources=new Map(),metrics=new Map();for(const r of records.filter(Boolean)){for(const s of r.sources||[])if(!sources.has(s.id))sources.set(s.id,s);for(const m of r.adoption_development||[]){if(!metrics.has(m.metric))metrics.set(m.metric,{...m,observations:[]});const target=metrics.get(m.metric);for(const o of m.observations||[])if(!target.observations.some(p=>p.date===o.date&&p.scope===o.scope&&p.definition===o.definition&&p.period_days===o.period_days))target.observations.push(o);}}return{sources:[...sources.values()],adoption_development:[...metrics.values()]};}
async function collectDirectAdoption(id,{fetchJson,now=Date.now()}){
 const diagnostics=[],sources=[],metrics=[];
 const load=async(url,headers)=>{try{return await fetchJson(url,headers)}catch{diagnostics.push(`Unavailable: ${new URL(url).hostname}${new URL(url).pathname}`);return null}};
 const [coin,protocols,lite]=await Promise.all([load(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`),load('https://api.llama.fi/protocols'),load('https://api.llama.fi/lite/protocols2')]);
 // DefiLlama usually puts the CoinGecko ID on the PARENT protocol (lite/protocols2 parentProtocols), not on its children
 // (e.g. parent#pendle, parent#chainlink), so match both lists by exact ID.
 const matches=Array.isArray(protocols)?protocols.filter(p=>p.gecko_id===id):[],parents=Array.isArray(lite?.parentProtocols)?lite.parentProtocols.filter(p=>p.gecko_id===id&&String(p.id||'').startsWith('parent#')).map(p=>p.id.slice(7)):[],families=[...new Set([...matches.map(p=>p.parentProtocol?.startsWith('parent#')?p.parentProtocol.slice(7):p.slug),...parents])].filter(x=>/^[a-z0-9-]+$/i.test(x));
 if(families.length===1){const slug=families[0],scope=`DefiLlama protocol family ${slug}`,urls=[`https://api.llama.fi/protocol/${slug}`,`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`,`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`],payloads=await Promise.all(urls.map(u=>load(u)));
  for(let i=0;i<3;i++){const metric=['tvl_usd','fees_usd','revenue_usd'][i],sid=`direct-llama-${slug}-${metric}`,rows=i===0?payloads[i]?.tvl:payloads[i]?.totalDataChart;sources.push({id:sid,url:urls[i],title:`DefiLlama ${slug} ${metric}`,publisher:'DefiLlama',source_type:'DATA_PROVIDER'});metrics.push({metric,note:i===0?'USD TVL includes price effects, not net deposits.':'Provider-reported economics, not token-holder accrual. Complete 30-day windows required.',observations:observationsFromDaily(Array.isArray(rows)?rows:[],{metric,scope,source:sid,period:i===0?1:30,now})});}
 }else diagnostics.push(families.length?'Ambiguous protocol family; fundamentals not guessed.':'No CoinGecko-ID protocol match.');
 const repos=[...new Set((coin?.links?.repos_url?.github||[]).map(githubRepo).filter(Boolean))];
 // An archived repository (e.g. Aave's v1 repo, the only one CoinGecko lists) would report 0 commits as if development
 // stopped; use the first listed repository that is not archived, checking at most three.
 let repo=null,archived=[];for(const r of repos.slice(0,3)){const meta=await load(`https://api.github.com/repos/${r}`,{accept:'application/vnd.github+json','User-Agent':'crypto-asymmetry-engine'});if(meta?.archived===true){archived.push(r);continue}if(!meta)diagnostics.push(`Archive status of ${r} unverified.`);repo=r;break}
 if(!repo&&archived.length){diagnostics.push(`Listed repositories are archived (${archived.join(', ')}); commit activity not reported.`);metrics.push({metric:'github_commits',note:`CoinGecko lists only archived repositories (${archived.join(', ')}); current development happens elsewhere, so commit activity is unknown.`,observations:[]})}
 if(repo){const sid=`direct-github-${repo}-commits`,stats=await load(`https://api.github.com/repos/${repo}/stats/commit_activity`,{accept:'application/vnd.github+json','User-Agent':'crypto-asymmetry-engine'});sources.push({id:sid,url:`https://github.com/${repo}/graphs/commit-activity`,title:`GitHub commit activity: ${repo}`,publisher:'GitHub',source_type:'DATA_PROVIDER'});
  const days=[];for(const w of Array.isArray(stats)?stats:[])if(Number.isFinite(w.week)&&Array.isArray(w.days)&&w.days.length===7)w.days.forEach((v,i)=>days.push([w.week+i*86400,v]));
  metrics.push({metric:'github_commits',note:`One CoinGecko-listed repository (${repo}); activity proxy, not unique developers, retention or whole-project coverage.`,observations:observationsFromDaily(days,{metric:'reported repository commits',scope:`GitHub repository ${repo}`,source:sid,period:28,now})});if(!Array.isArray(stats))diagnostics.push('GitHub activity pending, rate-limited or unavailable; retry later.');
 }else if(!repos.length)diagnostics.push('No public repository URL supplied by CoinGecko.');
 return{sources,adoption_development:metrics,diagnostics,collected_at:new Date(now).toISOString()};
}

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
