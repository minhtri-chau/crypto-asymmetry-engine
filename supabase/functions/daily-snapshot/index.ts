import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const PROTOCOLS:Record<string,string>={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",LINK:"chainlink",ONDO:"ondo-finance"};
const CHAINS:Record<string,{chain:string,fees:string,tvlRule:boolean}>={
 SUI:{chain:"Sui",fees:"sui",tvlRule:true},
 TIA:{chain:"Celestia",fees:"celestia",tvlRule:false},
 TAO:{chain:"Bittensor",fees:"chutes",tvlRule:false}
};
const fn=(v:any)=>v===null||v===undefined||v===""?null:Number(v);
async function fj(url:string){try{const r=await fetch(url);return r.ok?await r.json():null}catch{return null}}
async function fundamentals(symbols:string[]){
 const out:Record<string,any>={};
 await Promise.all(symbols.map(async s=>{
  if(PROTOCOLS[s]){
   const slug=PROTOCOLS[s],[tvl,fees,rev]=await Promise.all([
    fj(`https://api.llama.fi/tvl/${slug}`),
    fj(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`),
    fj(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`)
   ]);
   out[s]={tvl:typeof tvl==="number"?tvl:null,fees30d:fn(fees?.total30d),fees7d:fn(fees?.total7d),revenue30d:fn(rev?.total30d),revenue7d:fn(rev?.total7d),tvlRule:true,feeRule:true};
   return;
  }
  const c=CHAINS[s];
  if(c){
   const[hist,fees,rev]=await Promise.all([
    fj(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(c.chain)}`),
    fj(`https://api.llama.fi/summary/fees/${c.fees}?dataType=dailyFees`),
    fj(`https://api.llama.fi/summary/fees/${c.fees}?dataType=dailyRevenue`)
   ]);
   const rows=Array.isArray(hist)?hist:[],last=rows.at(-1),tvl=fn(last?.tvl??last?.[1]);
   out[s]={tvl,fees30d:fn(fees?.total30d),fees7d:fn(fees?.total7d),revenue30d:fn(rev?.total30d),revenue7d:fn(rev?.total7d),tvlRule:c.tvlRule,feeRule:true};
  }
 }));
 return out;
}

const ASSETS:Record<string,string>={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome-finance",AKT:"akash-network",LINK:"chainlink",TAO:"bittensor",ONDO:"ondo-finance",TIA:"celestia",SUI:"sui"};
function secretKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}

Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const expected=Deno.env.get("MONITOR_CRON_SECRET");
 if(!expected||req.headers.get("x-monitor-secret")!==expected)return new Response("Unauthorized",{status:401});
 const url=Deno.env.get("SUPABASE_URL"),key=secretKey();
 if(!url||!key)return Response.json({error:"Supabase server credentials unavailable"},{status:500});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const cgHeaders:Record<string,string>={accept:"application/json"},cgKey=Deno.env.get("COINGECKO_DEMO_API_KEY");
 if(cgKey)cgHeaders["x-cg-demo-api-key"]=cgKey;
 const ids=Object.values(ASSETS).join(",");
 const mr=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`,{headers:cgHeaders});
 if(!mr.ok)return Response.json({error:`CoinGecko ${mr.status}`},{status:502});
 const markets=Object.fromEntries((await mr.json()).map((x:any)=>[x.id,x]));
 const fund=await fundamentals(Object.keys(ASSETS));
 // auth.users is not exposed through the Data API; list accounts with the Admin API instead.
 const users:{id:string}[]=[];
 for(let page=1;;page++){
   const{data,error:ue}=await db.auth.admin.listUsers({page,perPage:1000});
   if(ue)return Response.json({error:"Unable to enumerate users"},{status:500});
   users.push(...data.users);
   if(data.users.length<1000)break;
 }
 const now=new Date(),dayStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString(),capturedAt=now.toISOString();
 let inserted=0,skipped=0;
 for(const u of users||[]){
   const{data:existing}=await db.from("snapshots").select("symbol").eq("user_id",u.id).gte("captured_at",dayStart);
   const seen=new Set((existing||[]).map((x:any)=>x.symbol));
   const rows:any[]=[];
   for(const[symbol,id]of Object.entries(ASSETS)){
     if(seen.has(symbol)){skipped++;continue}
     const m=markets[id];if(!m)continue;const f=fund[symbol]||{};
     rows.push({user_id:u.id,symbol,captured_at:capturedAt,price:m.current_price,market_cap:m.market_cap,fdv:m.fully_diluted_valuation,tvl:f.tvl??null,fees_30d:f.fees30d??null,fees_7d:f.fees7d??null,revenue_30d:f.revenue30d??null,revenue_7d:f.revenue7d??null,circulating:m.circulating_supply??null,total_supply:m.total_supply??null,max_supply:m.max_supply??null});
   }
   if(rows.length){const{error}=await db.from("snapshots").insert(rows);if(error)return Response.json({error:error.message},{status:500});inserted+=rows.length}
 }
 return Response.json({ok:true,users:(users||[]).length,inserted,skipped,day:dayStart.slice(0,10),at:capturedAt});
});
