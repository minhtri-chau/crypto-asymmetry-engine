import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const DAY=86400000;
function secretKey(){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}
async function products(){const r=await fetch("https://api.exchange.coinbase.com/products",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase products ${r.status}`);return await r.json()}
async function candles(product:string,start:Date,end:Date){const u=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`);u.searchParams.set("granularity","86400");u.searchParams.set("start",start.toISOString());u.searchParams.set("end",end.toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase candles ${product} ${r.status}`);return await r.json()}
function norm(s:any){return String(s||"").trim().toUpperCase()}
function resolve(a:any,usd:any[]){
 // Resolution is dynamic, but conservative. Coinbase base currency must equal the research symbol.
 // Product identity is also checked against the live Coinbase product catalog. We never manufacture a product ID.
 const sym=norm(a.symbol),matches=usd.filter((p:any)=>norm(p.base_currency)===sym);
 if(matches.length===0)return{status:"NO_USD_PRODUCT",note:`No active Coinbase USD product with base currency ${sym}`};
 if(matches.length>1)return{status:"AMBIGUOUS",note:`${matches.length} active Coinbase USD products share base currency ${sym}`};
 const p=matches[0];
 // Name is supporting evidence only. Some legitimate product display names differ from CoinGecko project names,
 // so a mismatch does not cause an unsafe guess; it is recorded for audit.
 const rn=String(a.name||"").toLowerCase(),bn=String(p.base_name||p.display_name||"").toLowerCase();
 return{status:"VERIFIED",product:p.id,note:rn&&bn&&!bn.includes(rn)&&!rn.includes(bn)?`Verified by unique live Coinbase base symbol; names differ: research=${a.name}, coinbase=${p.base_name||p.display_name||p.id}`:"Unique active Coinbase USD base-symbol match"};
}
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return new Response('{"error":"unauthorized"}',{status:401,headers:{"content-type":"application/json"}});
 const url=Deno.env.get("SUPABASE_URL"),sk=secretKey();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 let body:any={};try{body=await req.json()}catch{}const years=Math.min(10,Math.max(2,Number(body.years)||5)),dry=body.dry_run===true,onlyId=Number(body.research_asset_id)||null;
 let assets=await allRows(()=>db.from("research_assets").select("id,user_id,symbol,name,coingecko_id,coinbase_product_id,history_provider,history_mapping_status").neq("stage","archived").order("id"));
 if(onlyId)assets=assets.filter((a:any)=>a.id===onlyId);
 const ps=await products(),usd=ps.filter((p:any)=>p.quote_currency==="USD"&&!p.trading_disabled);
 let imported=0,mapped=0;const report:any[]=[];
 for(const a of assets){
  let product=a.coinbase_product_id,status=a.history_mapping_status,note="";
  if(product){
   const live=usd.find((p:any)=>p.id===product);
   if(!live){status="ERROR";note=`Persisted product ${product} is not an active Coinbase USD product`}
   else{status="VERIFIED";note="Existing mapping revalidated against live Coinbase catalog"}
  }else{
   const r=resolve(a,usd);status=r.status;product=r.product||null;note=r.note;
   if(status==="VERIFIED")mapped++;
  }
  if(!dry){
   const patch:any={history_mapping_status:status,history_mapping_note:note,history_last_attempt_at:new Date().toISOString()};
   if(status==="VERIFIED"&&product){patch.coinbase_product_id=product;patch.history_provider="coinbase";patch.history_verified_at=new Date().toISOString()}
   const{error}=await db.from("research_assets").update(patch).eq("id",a.id).eq("user_id",a.user_id);if(error)throw error;
  }
  if(status!=="VERIFIED"||!product){report.push({id:a.id,symbol:a.symbol,status,note});continue}
  if(dry){report.push({id:a.id,symbol:a.symbol,product,status:"VERIFIED_READY",note});continue}
  const end=new Date(),begin=new Date(end.getTime()-years*365.25*DAY);let rows:any[]=[];
  for(let e=end.getTime();e>begin.getTime();e-=250*DAY){
   const s=new Date(Math.max(begin.getTime(),e-249*DAY)),en=new Date(e),c=await candles(product,s,en);
   for(const x of c||[]){if(!Array.isArray(x)||x.length<6)continue;const t=Number(x[0])*1000,p=Number(x[4]);if(!(p>0))continue;rows.push({user_id:a.user_id,research_asset_id:a.id,price_date:new Date(t).toISOString().slice(0,10),price:p,low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),volume:Number(x[5]),source:"coinbase_exchange",source_symbol:product,imported_at:new Date().toISOString()})}
   await new Promise(r=>setTimeout(r,120));
  }
  rows=[...new Map(rows.map(x=>[x.price_date,x])).values()];
  for(let i=0;i<rows.length;i+=500){const{error}=await db.from("historical_price_daily").upsert(rows.slice(i,i+500),{onConflict:"user_id,research_asset_id,price_date,source"});if(error)throw error}
  imported+=rows.length;report.push({id:a.id,symbol:a.symbol,product,status:"IMPORTED",days:rows.length,first:rows.length?rows.reduce((m:any,x:any)=>x.price_date<m?x.price_date:m,rows[0].price_date):null,last:rows.length?rows.reduce((m:any,x:any)=>x.price_date>m?x.price_date:m,rows[0].price_date):null});
 }
 return new Response(JSON.stringify({ok:true,version:"history-onboard-v9.3.2",years,dry_run:dry,assets:assets.length,newly_mapped:mapped,imported_rows:imported,report}),{headers:{"content-type":"application/json"}});
}catch(e){console.error(e);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}})
