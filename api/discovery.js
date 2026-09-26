const TRACKED=new Set(["AAVE","PENDLE","AERO","AKT","LINK","TAO","ONDO","TIA","SUI"]);
const STABLE=new Set(["USDC","USDT","DAI","PYUSD","EURC","GUSD","USDS","USDG","USDP","TUSD","FDUSD"]);
const EXCLUDE=new Set(["USD","EUR","GBP","CAD","AUD","USDT","USDC","DAI"]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
async function j(url){const r=await fetch(url,{headers:{accept:"application/json"}});if(!r.ok)throw new Error(`${r.status}`);return r.json()}
function screenScore(x){
 const volRatio=x.market_cap>0?x.total_volume/x.market_cap:0;
 const liquidity=clamp(volRatio/0.12,0,1)*30;
 const r7=Number(x.price_change_percentage_7d_in_currency)||0,r30=Number(x.price_change_percentage_30d_in_currency)||0;
 // Reward constructive participation, but cap momentum so a vertical pump cannot dominate discovery.
 const momentum=clamp((r7+8)/28,0,1)*12+clamp((r30+15)/55,0,1)*13;
 const size=x.market_cap>0?clamp((Math.log10(x.market_cap)-7)/3,0,1)*15:0;
 const dilution=x.fully_diluted_valuation>0&&x.market_cap>0?x.fully_diluted_valuation/x.market_cap:null;
 const supply=dilution==null?5:dilution<=1.25?10:dilution<=1.75?7:dilution<=3?3:0;
 const notExtended=r7>45||r30>100?-12:r7>30||r30>70?-6:0;
 return Math.round(clamp(liquidity+momentum+size+supply+20+notExtended,0,100));
}
export default async function handler(req,res){
 try{
  const [products,...pages]=await Promise.all([
   j("https://api.exchange.coinbase.com/products"),
   ...[1,2,3,4].map(page=>j(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=7d,30d`))
  ]);
  const cb=new Set((Array.isArray(products)?products:[])
   .filter(p=>p&&p.status==="online"&&!p.trading_disabled&&["USD","USDC"].includes(p.quote_currency))
   .map(p=>String(p.base_currency||"").toUpperCase()).filter(Boolean));
  const best=new Map();
  for(const x of pages.flat()){
   const s=String(x.symbol||"").toUpperCase();
   if(!cb.has(s)||TRACKED.has(s)||STABLE.has(s)||EXCLUDE.has(s)||!x.market_cap||!x.total_volume)continue;
   const prev=best.get(s);if(!prev||x.market_cap>prev.market_cap)best.set(s,x);
  }
  const candidates=[...best.values()].map(x=>{
   const score=screenScore(x),r7=x.price_change_percentage_7d_in_currency??null,r30=x.price_change_percentage_30d_in_currency??null;
   const volRatio=x.market_cap>0?x.total_volume/x.market_cap:null;
   const dilution=x.fully_diluted_valuation>0&&x.market_cap>0?x.fully_diluted_valuation/x.market_cap:null;
   const reasons=[];
   if(volRatio!=null&&volRatio>=.08)reasons.push("strong spot liquidity");
   if(r7!=null&&r7>0)reasons.push("positive 7D momentum");
   if(r30!=null&&r30>0)reasons.push("positive 30D momentum");
   if(dilution!=null&&dilution<=1.5)reasons.push("limited FDV overhang");
   if(r7!=null&&r7>30)reasons.push("price already extended");
   return{symbol:String(x.symbol).toUpperCase(),id:x.id,name:x.name,price:x.current_price,marketCap:x.market_cap,fdv:x.fully_diluted_valuation,volume24h:x.total_volume,volumeToMarketCap:volRatio,return7d:r7,return30d:r30,dilution,discoveryScore:score,reasons};
  }).filter(x=>x.marketCap>=25_000_000&&x.volume24h>=2_000_000)
    .sort((a,b)=>b.discoveryScore-a.discoveryScore||b.volume24h-a.volume24h).slice(0,25);
  res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
  res.status(200).json({candidates,universe:{coinbaseSpotSymbols:cb.size,screened:best.size,returned:candidates.length},
   methodology:"Coinbase USD/USDC spot eligibility + CoinGecko market/liquidity/momentum/supply-overhang screen. Discovery Score is a triage score, not a buy ranking.",
   at:new Date().toISOString()});
 }catch(e){res.status(502).json({error:"discovery feed unavailable"})}
}
