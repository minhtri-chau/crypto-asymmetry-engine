import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const ASSETS:Record<string,string>={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome-finance",AKT:"akash-network",LINK:"chainlink",TAO:"bittensor",ONDO:"ondo-finance",TIA:"celestia",SUI:"sui"};
const LLAMA:Record<string,string>={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",ONDO:"ondo-finance"};
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
 const fund:Record<string,any>={};
 await Promise.all(Object.entries(LLAMA).map(async([sym,slug])=>{
   const[tvl,fees,rev]=await Promise.all([
    fetch(`https://api.llama.fi/tvl/${slug}`).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`).then(r=>r.ok?r.json():null).catch(()=>null)
   ]);
   fund[sym]={tvl:typeof tvl==="number"?tvl:null,fees30d:fees?.total30d??null,revenue30d:rev?.total30d??null};
 }));
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
     rows.push({user_id:u.id,symbol,captured_at:capturedAt,price:m.current_price,market_cap:m.market_cap,fdv:m.fully_diluted_valuation,tvl:f.tvl??null,fees_30d:f.fees30d??null,revenue_30d:f.revenue30d??null,circulating:m.circulating_supply??null,total_supply:m.total_supply??null,max_supply:m.max_supply??null});
   }
   if(rows.length){const{error}=await db.from("snapshots").insert(rows);if(error)return Response.json({error:error.message},{status:500});inserted+=rows.length}
 }
 return Response.json({ok:true,users:(users||[]).length,inserted,skipped,day:dayStart.slice(0,10),at:capturedAt});
});
