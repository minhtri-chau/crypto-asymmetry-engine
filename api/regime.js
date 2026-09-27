const CG="https://api.coingecko.com/api/v3";
const avg=(a,n)=>a?.length>=n?a.slice(-n).reduce((s,x)=>s+x,0)/n:null,ret=(a,b)=>a>0&&b>0?(b/a-1)*100:null,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
async function j(url,h={accept:"application/json"}){try{const r=await fetch(url,{headers:h});return r.ok?await r.json():null}catch{return null}}
export default async function handler(req,res){try{
 const h={accept:"application/json"};if(process.env.COINGECKO_DEMO_API_KEY)h["x-cg-demo-api-key"]=process.env.COINGECKO_DEMO_API_KEY;
 const [btc,eth,global,stables,breadthRows]=await Promise.all([
  j(`${CG}/coins/bitcoin/market_chart?vs_currency=usd&days=210&interval=daily`,h),
  j(`${CG}/coins/ethereum/market_chart?vs_currency=btc&days=40&interval=daily`,h),
  j(`${CG}/global`,h),j("https://stablecoins.llama.fi/stablecoincharts/all"),
  j(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=7d,30d`,h)
 ]);
 if(!btc?.prices?.length)throw new Error("BTC history unavailable");
 const p=btc.prices.map(x=>x[1]),price=p.at(-1),ma50=avg(p,50),ma200=avg(p,200),btcTrend=price>ma50&&ma50>ma200?"CONSTRUCTIVE":price<ma50&&ma50<ma200?"DEFENSIVE":"MIXED";
 const ep=(eth?.prices||[]).map(x=>x[1]),ethBtc30d=ep.length>30?ret(ep[ep.length-31],ep.at(-1)):null;
 let stablecoin30d=null;if(Array.isArray(stables)&&stables.length>30){const val=x=>Number(x?.totalCirculatingUSD?.peggedUSD??x?.totalCirculatingUSD??0),last=val(stables.at(-1)),old=val(stables[Math.max(0,stables.length-31)]);if(last>0&&old>0)stablecoin30d=ret(old,last)}
 const g=global?.data||{},btcDominance=Number(g.market_cap_percentage?.btc??NaN),totalMarket24h=Number(g.market_cap_change_percentage_24h_usd??NaN);
 const breadth=(Array.isArray(breadthRows)?breadthRows:[]).filter(x=>x.id!=="bitcoin"&&x.id!=="tether"&&x.id!=="usd-coin");
 const breadth7d=breadth.length?Math.round(100*breadth.filter(x=>Number(x.price_change_percentage_7d_in_currency)>0).length/breadth.length):null;
 const breadth30d=breadth.length?Math.round(100*breadth.filter(x=>Number(x.price_change_percentage_30d_in_currency)>0).length/breadth.length):null;
 let score=50;score+=btcTrend==="CONSTRUCTIVE"?22:btcTrend==="DEFENSIVE"?-22:0;if(ethBtc30d!=null)score+=ethBtc30d>5?10:ethBtc30d>0?5:ethBtc30d<-8?-10:ethBtc30d<0?-4:0;if(stablecoin30d!=null)score+=stablecoin30d>3?10:stablecoin30d>0?5:stablecoin30d<-2?-10:stablecoin30d<0?-4:0;if(Number.isFinite(totalMarket24h))score+=totalMarket24h>3?5:totalMarket24h<-3?-5:0;score=Math.round(clamp(score,0,100));
 const label=score>=70?"FAVORABLE / RISK-ON":score>=55?"CONSTRUCTIVE":score>=45?"MIXED":score>=30?"DEFENSIVE":"RISK-OFF";
 let rotation="MIXED / NO CLEAR ROTATION",altRiskBudget="SELECTIVE";
 if(btcTrend==="DEFENSIVE"&&score<45){rotation="DEFENSIVE / CAPITAL PRESERVATION";altRiskBudget="LOW"}
 else if((ethBtc30d??0)>3&&(breadth7d??0)>=55){rotation=(breadth30d??0)>=55?"BROAD ALT ROTATION":"EARLY ALT ROTATION";altRiskBudget=score>=55?"EXPANDING":"SELECTIVE"}
 else if((ethBtc30d??0)>0){rotation="ETH LEADERSHIP / EARLY ROTATION";altRiskBudget="SELECTIVE"}
 else if(Number.isFinite(btcDominance)&&btcDominance>=55){rotation="BTC CONCENTRATION";altRiskBudget=score>=55?"SELECTIVE":"LOW"}
 else if((breadth7d??0)>=60){rotation="LARGE / BROAD ALT PARTICIPATION";altRiskBudget=score>=55?"EXPANDING":"SELECTIVE"}
 res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
 res.status(200).json({label,score,rotation,altRiskBudget,btc:{price,ma50,ma200,trend:btcTrend},ethBtc30d,stablecoin30d,btcDominance:Number.isFinite(btcDominance)?btcDominance:null,totalMarket24h:Number.isFinite(totalMarket24h)?totalMarket24h:null,breadth7d,breadth30d,note:"Regime and rotation are separate. Regime estimates broad risk conditions; Rotation describes where participation appears concentrated. Breadth uses the current top-100 market sample and is not treated as direct capital-flow proof."})
}catch(e){res.status(502).json({error:e.message||"regime unavailable"})}}