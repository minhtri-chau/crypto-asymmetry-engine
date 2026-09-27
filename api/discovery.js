const STABLE=new Set(["USDC","USDT","DAI","PYUSD","EURC","GUSD","USDS","USDG","USDP","TUSD","FDUSD","USD1","RLUSD","USDE","FRAX","LUSD","GHO","CRVUSD"]);
const pegged=x=>x.current_price>0.97&&x.current_price<1.03&&Math.abs(x.price_change_percentage_7d_in_currency??0)<1&&Math.abs(x.price_change_percentage_30d_in_currency??0)<1.5;
const EXCLUDE=new Set(["USD","EUR","GBP","CAD","AUD","USDT","USDC","DAI"]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),num=v=>v==null||v===""?null:Number(v);
const cgHeaders=()=>{const h={accept:"application/json"},k=process.env.COINGECKO_DEMO_API_KEY;if(k)h["x-cg-demo-api-key"]=k;return h};
async function j(url,headers={accept:"application/json"}){const r=await fetch(url,{headers});if(!r.ok)throw new Error(`${r.status}`);return r.json()}
async function safe(url){try{return await j(url)}catch{return null}}
function chart7dOver7d(s){const c=(s?.totalDataChart||[]).filter(p=>Array.isArray(p)&&p.length===2);if(c.length<14)return null;const sum=a=>a.reduce((t,p)=>t+(num(p[1])||0),0),last=sum(c.slice(-7)),prev=sum(c.slice(-14,-7));return prev>0?(last/prev-1)*100:null}
// Identity safety: CoinGecko id first. Symbol fallback is accepted only for child protocols
// belonging to a named parent family. Generic ticker matches are deliberately rejected.
// Aggregate child/version protocols into the whole parent project family before matching.
function familyMap(ps){const g=new Map();for(const p of ps||[]){const k=String(p?.parentProtocol||"");if(k.startsWith("parent#")&&num(p.tvl)>0){if(!g.has(k))g.set(k,[]);g.get(k).push(p)}}const out=new Map();for(const[k,kids]of g){const tvl=kids.reduce((t,p)=>t+num(p.tvl),0),old=kids.some(p=>num(p.change_7d)==null)?null:kids.reduce((t,p)=>t+num(p.tvl)/(1+num(p.change_7d)/100),0);out.set(k,{slug:k.slice(7),tvl,change7d:old>0?(tvl/old-1)*100:null})}return out}
function protocolMap(ps){const fam=familyMap(ps),byId=new Map(),bySym=new Map(),keep=(m,k,r)=>{const c=m.get(k);if(!c||(r.tvl||0)>(c.tvl||0))m.set(k,r)};for(const p of ps||[]){if(!p?.slug||p.category==="Treasury")continue;const r=(p.parentProtocol&&fam.get(p.parentProtocol))||{slug:p.slug,tvl:num(p.tvl),change7d:num(p.change_7d)};if(p.gecko_id)keep(byId,p.gecko_id,r);const s=String(p.symbol||"").toUpperCase();if(s&&p.parentProtocol)keep(bySym,s,r)}return{get:x=>byId.get(x.id)||bySym.get(x.symbol)}}
function enrichmentPriority(x){const liq=x.volumeToMarketCap==null?0:Math.min(x.volumeToMarketCap,.2)*100,size=x.marketCap>0?Math.max(0,Math.min(20,(Math.log10(x.marketCap)-7)*6)):0,extension=Math.max(Math.abs(x.return7d||0)>40?15:0,Math.abs(x.return30d||0)>80?15:0);return liq+size-extension}
async function addFundamentals(rows,ps,priorityIds=new Set()){
 const m=protocolMap(ps),matched=[];
 for(const x of rows){const p=m.get(x);if(!p)continue;x.fundamentals={slug:p.slug,tvl:p.tvl,tvl7d:p.change7d,fees7d:null,fees30d:null,fees7dChange:null,feeStatus:"NOT_QUERIED"};matched.push({x,p})}
 const targets=matched.sort((a,b)=>(priorityIds.has(b.x.id)?1000:0)+enrichmentPriority(b.x)-(priorityIds.has(a.x.id)?1000:0)-enrichmentPriority(a.x)).slice(0,60);
 for(let i=0;i<targets.length;i+=10){await Promise.all(targets.slice(i,i+10).map(async({x,p})=>{if(!p.slug){x.fundamentals.feeStatus="NO_SLUG";return}x.fundamentals.feeStatus="QUERIED";const f=await safe(`https://api.llama.fi/summary/fees/${p.slug}?dataType=dailyFees`);if(f){x.fundamentals.fees7d=num(f.total7d);x.fundamentals.fees30d=num(f.total30d);x.fundamentals.fees7dChange=num(f.change_7dover7d)??chart7dOver7d(f);x.fundamentals.feeStatus=[x.fundamentals.fees7d,x.fundamentals.fees30d,x.fundamentals.fees7dChange].some(v=>v!=null)?"AVAILABLE":"NO_DATA"}else{x.fundamentals.feeStatus="FETCH_FAILED"}}))}
 return{matched:matched.length,feeEnriched:targets.length}
}
function extensionPenalty(r7,r30){const p7=r7>60?30:r7>40?23:r7>25?14:r7>15?5:0,p30=r30>150?40:r30>100?32:r30>70?24:r30>45?15:r30>30?8:0;return Math.max(p7,p30)}
function scoreParts(x){
 const vol=x.volumeToMarketCap||0,r7=x.return7d||0,r30=x.return30d||0,d=x.dilution;
 const liquidity=clamp(vol/.10,0,1)*18;
 const size=x.marketCap>0?clamp((Math.log10(x.marketCap)-7.3)/2.7,0,1)*10:0;
 const supply=d==null?3:d<=1.2?10:d<=1.5?8:d<=2?5:d<=3?2:0;
 const confirmation=(r7>=-8&&r7<=15?8:r7>15&&r7<=25?5:r7<-8?2:0)+(r30>=-15&&r30<=30?7:r30>30&&r30<=45?3:r30<-15?1:0);
 const f=x.fundamentals||{},hasFundamental=[f.tvl,f.fees7d,f.fees30d].some(v=>v!=null);
 let fundamental=0;
 if(hasFundamental){
  if(f.tvl7d!=null)fundamental+=f.tvl7d>15?10:f.tvl7d>5?8:f.tvl7d>0?5:f.tvl7d>-10?2:0;
  if(f.fees7dChange!=null)fundamental+=f.fees7dChange>30?12:f.fees7dChange>10?10:f.fees7dChange>0?6:f.fees7dChange>-15?2:0;
  if(f.fees30d!=null&&x.fdv>0){const y=f.fees30d*12/x.fdv;fundamental+=y>.15?8:y>.07?6:y>.03?4:y>.01?2:0}
 }
 const penalty=extensionPenalty(r7,r30);
 // Normalize quality over evidence actually queried/observed so the fee-call budget itself cannot lower quality.
 // Coverage remains the confidence gate: a market-only asset can look strong on observed dimensions but cannot masquerade as well researched.
 const feeQueried=f.feeStatus&&f.feeStatus!=="NOT_QUERIED",feeObserved=[f.fees7dChange,f.fees30d].some(v=>v!=null),availableMax=!hasFundamental?83:18+10+10+15+(f.tvl7d!=null?10:0)+(["NOT_QUERIED","FETCH_FAILED"].includes(f.feeStatus)?0:20);
 // Only the fee-call budget (NOT_QUERIED) or a transient fetch failure is excluded from the denominator. An asset with
 // no observed DefiLlama TVL/fees keeps the full 83-point scale, so market-only assets cannot reach a high Evidence score by default.
 const raw=liquidity+size+supply+confirmation+fundamental-penalty;
 const evidenceScore=Math.round(clamp(raw/Math.max(availableMax,1)*100,0,100));
 const observed=[x.volumeToMarketCap,x.marketCap,x.dilution,x.return7d,x.return30d,f.tvl7d,feeObserved?f.fees7dChange:null,feeObserved?f.fees30d:null];
 const evidenceCoverage=Math.round(observed.filter(v=>v!=null).length/observed.length*100);
 return{rawScore:raw,evidenceScore,evidenceCoverage,extensionPenalty:penalty,hasFundamental,
  scoreParts:{liquidity:Math.round(liquidity),size:Math.round(size),supply:Math.round(supply),confirmation:Math.round(confirmation),fundamental:Math.round(fundamental),extensionPenalty:penalty}}
}
function rankCandidates(rows){const s=[...rows].sort((a,b)=>b.rawScore-a.rawScore||b.evidenceCoverage-a.evidenceCoverage||b.volume24h-a.volume24h),n=s.length;s.forEach((x,i)=>{x.rank=i+1;x.priorityPercentile=n<=1?100:Math.round(100*(1-i/(n-1)));delete x.rawScore});return s}
export default async function handler(req,res){try{
 const products=await j("https://api.exchange.coinbase.com/products"),pages=[];
 for(const page of[1,2,3,4])pages.push(await j(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=7d,30d`,cgHeaders()));
 const cb=new Set((Array.isArray(products)?products:[]).filter(p=>p&&p.status==="online"&&!p.trading_disabled&&["USD","USDC"].includes(p.quote_currency)).map(p=>String(p.base_currency||"").toUpperCase()).filter(Boolean)),best=new Map();
 for(const x of pages.flat()){const s=String(x.symbol||"").toUpperCase();if(!cb.has(s)||STABLE.has(s)||EXCLUDE.has(s)||pegged(x)||!x.market_cap||!x.total_volume)continue;const prev=best.get(s);if(!prev||x.market_cap>prev.market_cap)best.set(s,x)}
 let rows=[...best.values()].map(x=>({symbol:String(x.symbol).toUpperCase(),id:x.id,name:x.name,price:x.current_price,marketCap:x.market_cap,fdv:x.fully_diluted_valuation,volume24h:x.total_volume,volumeToMarketCap:x.market_cap>0?x.total_volume/x.market_cap:null,return7d:x.price_change_percentage_7d_in_currency??null,return30d:x.price_change_percentage_30d_in_currency??null,dilution:x.fully_diluted_valuation>0&&x.market_cap>0?x.fully_diluted_valuation/x.market_cap:null,fundamentals:null})).filter(x=>x.marketCap>=25e6&&x.volume24h>=2e6);
 const priorityIds=new Set(String(req.query.priority||"").split(",").map(x=>x.trim()).filter(Boolean).slice(0,100));
 const enrichment=await addFundamentals(rows,await safe("https://api.llama.fi/protocols")||[],priorityIds);
 rows.forEach(x=>Object.assign(x,scoreParts(x)));
 const ranked=rankCandidates(rows);
 ranked.forEach(x=>{const f=x.fundamentals||{},r=[];if(f.fees7dChange!=null&&f.fees7dChange>10)r.push(`fees +${Math.round(f.fees7dChange)}% vs prior 7D`);if(f.tvl7d!=null&&f.tvl7d>5)r.push(`TVL +${Math.round(f.tvl7d)}% 7D`);if(x.return30d!=null&&x.return30d<=30&&x.return30d>=-15)r.push("price not heavily repriced");if(x.volumeToMarketCap!=null&&x.volumeToMarketCap>=.06)r.push("liquid");if(x.dilution!=null&&x.dilution<=1.5)r.push("limited FDV overhang");if(x.extensionPenalty>=15)r.push("already repriced");if(!x.hasFundamental)r.push("fundamentals not matched");else if(f.feeStatus==="NOT_QUERIED")r.push("fee history not queried");else if(f.feeStatus==="NO_DATA")r.push("fee history queried; no data");x.reasons=r.slice(0,4)});
 const candidates=ranked;
 res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
 res.status(200).json({candidates,universe:{coinbaseSpotSymbols:cb.size,screened:best.size,eligible:rows.length,returned:candidates.length},
  methodology:"Research Priority is relative rank within today's eligible Coinbase universe. Asymmetry Evidence is an absolute 0-100 evidence score and is not guaranteed to be high. Large recent gains are penalized; identity-safe DefiLlama project-family TVL evidence is attached across the eligible universe, with fee enrichment capped at 60 calls and prioritized for followed assets plus market-quality candidates. `NOT_QUERIED` is distinct from `NO_DATA`, and an asset is not quality-penalized merely for falling outside the fee-call budget. Missing fundamentals reduce evidence coverage rather than being treated as zero.",
  fundamentalsEnrichment:enrichment,coinGeckoDemoKey:!!process.env.COINGECKO_DEMO_API_KEY,at:new Date().toISOString()});
 }catch(e){res.status(502).json({error:"discovery feed unavailable"})}}
