const CG="https://api.coingecko.com/api/v3";
export default async function handler(req,res){
 try{
  const raw=String(req.query.ids||"").split(",").map(x=>x.trim()).filter(Boolean);
  const ids=[...new Set(raw)].slice(0,100);
  if(!ids.length)return res.status(200).json({assets:{}});
  const h={accept:"application/json"};if(process.env.COINGECKO_DEMO_API_KEY)h["x-cg-demo-api-key"]=process.env.COINGECKO_DEMO_API_KEY;
  const r=await fetch(`${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&sparkline=false&price_change_percentage=24h,7d,30d`,{headers:h});
  if(!r.ok)throw new Error(`CoinGecko ${r.status}`);
  const rows=await r.json(),assets={};for(const x of rows)assets[x.id]=x;
  res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=300");
  return res.status(200).json({assets,coinGeckoDemoKey:!!process.env.COINGECKO_DEMO_API_KEY});
 }catch(e){return res.status(500).json({error:e.message||"research market unavailable"})}
}