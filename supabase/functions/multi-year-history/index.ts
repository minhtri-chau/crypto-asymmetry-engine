import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const DAY=86400000;
function secretKey(){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}
async function products(){const r=await fetch("https://api.exchange.coinbase.com/products",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase products ${r.status}`);return await r.json()}
async function candles(product:string,start:Date,end:Date){const u=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`);u.searchParams.set("granularity","86400");u.searchParams.set("start",start.toISOString());u.searchParams.set("end",end.toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase candles ${product} ${r.status}`);return await r.json()}
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return new Response('{"error":"unauthorized"}',{status:401,headers:{"content-type":"application/json"}});
 const url=Deno.env.get("SUPABASE_URL"),sk=secretKey();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 let body:any={};try{body=await req.json()}catch{}const years=Math.min(10,Math.max(2,Number(body.years)||5)),dry=body.dry_run===true;
 const assets=await allRows(()=>db.from("research_assets").select("id,user_id,symbol,name,coinbase_product_id,history_provider").neq("stage","archived").order("id"));
 const ps=await products(),activeUSD=new Set(ps.filter((p:any)=>p.quote_currency==="USD"&&!p.trading_disabled).map((p:any)=>p.id));
 let imported=0;const report:any[]=[];
 for(const a of assets){
  // Safety: never infer a product from ticker inside the importer. Mapping must already be explicitly persisted.
  const product=a.coinbase_product_id;
  if(!product){report.push({symbol:a.symbol,status:"NEEDS_VERIFIED_MAPPING"});continue}
  if(!activeUSD.has(product)){report.push({symbol:a.symbol,product,status:"PRODUCT_NOT_ACTIVE_USD"});continue}
  if(dry){report.push({symbol:a.symbol,product,status:"VERIFIED_READY"});continue}
  const end=new Date(),begin=new Date(end.getTime()-years*365.25*DAY);let rows:any[]=[];
  // Coinbase Exchange candles are windowed; use conservative 250-day chunks (<300 daily buckets).
  for(let e=end.getTime();e>begin.getTime();e-=250*DAY){
   const s=new Date(Math.max(begin.getTime(),e-249*DAY)),en=new Date(e);const c=await candles(product,s,en);
   for(const x of c||[]){if(!Array.isArray(x)||x.length<6)continue;const t=Number(x[0])*1000,p=Number(x[4]);if(!(p>0))continue;rows.push({user_id:a.user_id,research_asset_id:a.id,price_date:new Date(t).toISOString().slice(0,10),price:p,low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),volume:Number(x[5]),source:"coinbase_exchange",source_symbol:product,imported_at:new Date().toISOString()})}
   await new Promise(r=>setTimeout(r,120));
  }
  // de-dupe overlapping boundary candles
  rows=[...new Map(rows.map(x=>[x.price_date,x])).values()];
  for(let i=0;i<rows.length;i+=500){const{error}=await db.from("historical_price_daily").upsert(rows.slice(i,i+500),{onConflict:"user_id,research_asset_id,price_date,source"});if(error)throw error}
  await db.from("research_assets").update({history_provider:"coinbase",history_verified_at:new Date().toISOString()}).eq("id",a.id).eq("user_id",a.user_id);
  imported+=rows.length;report.push({symbol:a.symbol,product,status:"IMPORTED",days:rows.length,first:rows.at(-1)?.price_date||null,last:rows[0]?.price_date||null});
 }
 return new Response(JSON.stringify({ok:true,years,dry_run:dry,assets:assets.length,imported_rows:imported,report}),{headers:{"content-type":"application/json"}});
}catch(e){console.error(e);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}})
