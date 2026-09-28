import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const DAY=86400000;
function secretKey(){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}
async function products(){const r=await fetch("https://api.exchange.coinbase.com/products",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase products ${r.status}`);return await r.json()}
async function candles(product:string,start:Date,end:Date){const u=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`);u.searchParams.set("granularity","86400");u.searchParams.set("start",start.toISOString());u.searchParams.set("end",end.toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase candles ${product} ${r.status}`);return await r.json()}
function norm(s:any){return String(s||"").trim().toUpperCase()}
// Identity verification for automatic mapping. Coinbase /products has no asset-name field (display_name is just "LINK-USD"),
// so a base-symbol match alone is a ticker guess. Require the live Coinbase price to agree with CoinGecko's price for this
// research asset's coingecko_id (within 10%), or, if no CoinGecko price is available, Coinbase's /currencies name to match.
const nameKey=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const namesAgree=(a:any,b:any)=>{const x=nameKey(a),y=nameKey(b);return !!x&&!!y&&(x.includes(y)||y.includes(x))};
async function currencyNames(){try{const r=await fetch("https://api.exchange.coinbase.com/currencies",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)return new Map<string,string>();const j=await r.json();return new Map<string,string>((j||[]).map((c:any)=>[norm(c.id),String(c.name||"")]))}catch{return new Map<string,string>()}}
async function geckoPrices(ids:string[]){const out=new Map<string,number>(),h:Record<string,string>={accept:"application/json"},k=Deno.env.get("COINGECKO_DEMO_API_KEY");if(k)h["x-cg-demo-api-key"]=k;
 for(let i=0;i<ids.length;i+=100){try{const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.slice(i,i+100).join(","))}&vs_currencies=usd`,{headers:h});if(r.ok){const j=await r.json();for(const[id,v] of Object.entries(j||{})){const p=Number((v as any)?.usd);if(p>0)out.set(id,p)}}}catch{}}return out}
async function coinbasePrice(product:string){try{const r=await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)return null;const p=Number((await r.json())?.price);return p>0?p:null}catch{return null}}
async function resolve(a:any,usd:any[],names:Map<string,string>,gecko:Map<string,number>){
 const sym=norm(a.symbol),matches=usd.filter((p:any)=>norm(p.base_currency)===sym);
 if(matches.length===0)return{status:"NO_USD_PRODUCT",note:`No active Coinbase USD product with base currency ${sym}`};
 if(matches.length>1)return{status:"AMBIGUOUS",note:`${matches.length} active Coinbase USD products share base currency ${sym}`};
 const p=matches[0],cb=await coinbasePrice(p.id),cg=gecko.get(a.coingecko_id),cname=names.get(sym)||"";
 if(cb!=null&&cg!=null){const diff=Math.abs(cb/cg-1)*100;
  return diff<=10?{status:"VERIFIED",product:p.id,note:`Unique Coinbase USD product; price agrees with CoinGecko ${a.coingecko_id} (${cb} vs ${cg}, ${diff.toFixed(1)}%)${cname?`; Coinbase name ${cname}`:""}`}
   :{status:"AMBIGUOUS",note:`Coinbase ${p.id} price ${cb} differs ${diff.toFixed(0)}% from CoinGecko ${a.coingecko_id} ${cg}; ticker likely refers to a different asset`}}
 if(namesAgree(a.name,cname))return{status:"VERIFIED",product:p.id,note:`Unique Coinbase USD product; Coinbase name ${cname} matches ${a.name} (no price comparison available)`};
 return{status:"UNRESOLVED",note:`Could not confirm identity of ${p.id}: no price comparison and Coinbase name "${cname||"unknown"}" does not match ${a.name}`};
}
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return new Response('{"error":"unauthorized"}',{status:401,headers:{"content-type":"application/json"}});
 const url=Deno.env.get("SUPABASE_URL"),sk=secretKey();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 let body:any={};try{body=await req.json()}catch{}const years=Math.min(10,Math.max(2,Number(body.years)||5)),dry=body.dry_run===true,onlyId=Number(body.research_asset_id)||null;
 let assets=await allRows(()=>db.from("research_assets").select("id,user_id,symbol,name,coingecko_id,coinbase_product_id,history_provider,history_mapping_status").neq("stage","archived").order("id"));
 if(onlyId)assets=assets.filter((a:any)=>a.id===onlyId);
 const ps=await products(),usd=ps.filter((p:any)=>p.quote_currency==="USD"&&!p.trading_disabled);
 let imported=0,mapped=0;const report:any[]=[];
 const unmapped=assets.filter((a:any)=>!a.coinbase_product_id),names=unmapped.length?await currencyNames():new Map<string,string>(),gecko=await geckoPrices([...new Set(unmapped.map((a:any)=>a.coingecko_id).filter(Boolean))] as string[]);
 for(const a of assets){
  let product=a.coinbase_product_id,status=a.history_mapping_status,note="";
  if(product){
   const live=usd.find((p:any)=>p.id===product);
   if(!live){status="ERROR";note=`Persisted product ${product} is not an active Coinbase USD product`}
   else{status="VERIFIED";note="Existing mapping revalidated against live Coinbase catalog"}
  }else{
   const r=await resolve(a,usd,names,gecko);status=r.status;product=r.product||null;note=r.note;
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
