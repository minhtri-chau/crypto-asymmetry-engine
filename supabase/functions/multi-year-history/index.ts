import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const DAY=86400000, OVERLAP_DAYS=3, REVERIFY_DAYS=30;
function secretKey(){const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(k)return k;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function allRows(q:()=>any){const out:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out}
async function products(){const r=await fetch("https://api.exchange.coinbase.com/products",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase products ${r.status}`);return await r.json()}
async function candles(product:string,start:Date,end:Date){const u=new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles`);u.searchParams.set("granularity","86400");u.searchParams.set("start",start.toISOString());u.searchParams.set("end",end.toISOString());const r=await fetch(u,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)throw Error(`Coinbase candles ${product} ${r.status}`);return await r.json()}
function norm(s:any){return String(s||"").trim().toUpperCase()}
const nameKey=(s:any)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const namesAgree=(a:any,b:any)=>{const x=nameKey(a),y=nameKey(b);return !!x&&!!y&&(x.includes(y)||y.includes(x))};
async function currencyNames(){try{const r=await fetch("https://api.exchange.coinbase.com/currencies",{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)return new Map<string,string>();const j=await r.json();return new Map<string,string>((j||[]).map((c:any)=>[norm(c.id),String(c.name||"")]))}catch{return new Map<string,string>()}}
async function geckoPrices(ids:string[]){const out=new Map<string,number>(),h:Record<string,string>={accept:"application/json"},k=Deno.env.get("COINGECKO_DEMO_API_KEY");if(k)h["x-cg-demo-api-key"]=k;for(let i=0;i<ids.length;i+=100){try{const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.slice(i,i+100).join(","))}&vs_currencies=usd`,{headers:h});if(r.ok){const j=await r.json();for(const[id,v]of Object.entries(j||{})){const p=Number((v as any)?.usd);if(p>0)out.set(id,p)}}}catch{}}return out}
async function coinbasePrice(product:string){try{const r=await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`,{headers:{accept:"application/json","user-agent":"crypto-asymmetry-engine"}});if(!r.ok)return null;const p=Number((await r.json())?.price);return p>0?p:null}catch{return null}}
async function resolve(a:any,usd:any[],names:Map<string,string>,gecko:Map<string,number>){const sym=norm(a.symbol),matches=usd.filter((p:any)=>norm(p.base_currency)===sym);if(!matches.length)return{status:"NO_USD_PRODUCT",note:`No active Coinbase USD product with base currency ${sym}`};if(matches.length>1)return{status:"AMBIGUOUS",note:`${matches.length} active Coinbase USD products share base currency ${sym}`};const p=matches[0],cb=await coinbasePrice(p.id),cg=gecko.get(a.coingecko_id),cname=names.get(sym)||"";if(cb!=null&&cg!=null){const diff=Math.abs(cb/cg-1)*100;return diff<=10?{status:"VERIFIED",product:p.id,note:`Unique Coinbase USD product; price agrees with CoinGecko ${a.coingecko_id} (${cb} vs ${cg}, ${diff.toFixed(1)}%)${cname?`; Coinbase name ${cname}`:""}`}:{status:"AMBIGUOUS",note:`Coinbase ${p.id} price ${cb} differs ${diff.toFixed(0)}% from CoinGecko ${a.coingecko_id} ${cg}; ticker likely refers to a different asset`}}if(namesAgree(a.name,cname))return{status:"VERIFIED",product:p.id,note:`Unique Coinbase USD product; Coinbase name ${cname} matches ${a.name} (no price comparison available)`};return{status:"UNRESOLVED",note:`Could not confirm identity of ${p.id}: no price comparison and Coinbase name "${cname||"unknown"}" does not match ${a.name}`}}
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return new Response('{"error":"unauthorized"}',{status:401,headers:{"content-type":"application/json"}});
 const url=Deno.env.get("SUPABASE_URL"),sk=secretKey();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 let body:any={};try{body=await req.json()}catch{}const years=Math.min(10,Math.max(2,Number(body.years)||5)),dry=body.dry_run===true,onlyId=Number(body.research_asset_id)||null,forceFull=body.force_full===true;
 let assets=await allRows(()=>db.from("research_assets").select("id,user_id,symbol,name,coingecko_id,coinbase_product_id,history_provider,history_mapping_status,history_verified_at").neq("stage","archived").order("id"));if(onlyId)assets=assets.filter((a:any)=>a.id===onlyId);
 const ps=await products(),usd=ps.filter((p:any)=>p.quote_currency==="USD"&&!p.trading_disabled);
 // Re-resolve unmapped assets. Revalidate an existing identity only monthly, not nightly.
 const now=Date.now(),needsIdentity=assets.filter((a:any)=>!a.coinbase_product_id||!a.history_verified_at||(now-Date.parse(a.history_verified_at))>=REVERIFY_DAYS*DAY);
 const names=needsIdentity.length?await currencyNames():new Map<string,string>(),gecko=await geckoPrices([...new Set(needsIdentity.map((a:any)=>a.coingecko_id).filter(Boolean))] as string[]);
 let imported=0,mapped=0,incremental=0,full=0;const report:any[]=[];
 for(const a of assets){
  let product=a.coinbase_product_id,status=a.history_mapping_status,note="";
  const dueIdentity=!product||!a.history_verified_at||(now-Date.parse(a.history_verified_at))>=REVERIFY_DAYS*DAY;
  if(product&&!dueIdentity){status="VERIFIED";note="Persisted verified mapping; identity revalidation not due"}
  else if(product){const live=usd.find((p:any)=>p.id===product);if(!live){status="ERROR";note=`Persisted product ${product} is not an active Coinbase USD product`}else{const r=await resolve(a,usd,names,gecko);if(r.status==="VERIFIED"&&r.product===product){status="VERIFIED";note=`Monthly revalidation: ${r.note}`}else{status=r.status;note=`Revalidation failed for persisted ${product}: ${r.note}`;product=null}}}
  else{const r=await resolve(a,usd,names,gecko);status=r.status;product=r.product||null;note=r.note;if(status==="VERIFIED")mapped++}
  if(!dry){const patch:any={history_mapping_status:status,history_mapping_note:note,history_last_attempt_at:new Date().toISOString()};if(status==="VERIFIED"&&product){patch.coinbase_product_id=product;patch.history_provider="coinbase";if(dueIdentity)patch.history_verified_at=new Date().toISOString()}const{error}=await db.from("research_assets").update(patch).eq("id",a.id).eq("user_id",a.user_id);if(error)throw error}
  if(status!=="VERIFIED"||!product){report.push({id:a.id,symbol:a.symbol,status,note});continue}
  if(dry){report.push({id:a.id,symbol:a.symbol,product,status:"VERIFIED_READY",note});continue}
  const{data:last,error:lastErr}=await db.from("historical_price_daily").select("price_date").eq("user_id",a.user_id).eq("research_asset_id",a.id).eq("source","coinbase_exchange").order("price_date",{ascending:false}).limit(1);if(lastErr)throw lastErr;
  const end=new Date();let begin:Date,mode:string;
  if(!forceFull&&last?.[0]?.price_date){begin=new Date(Date.parse(last[0].price_date+"T00:00:00Z")-OVERLAP_DAYS*DAY);mode="INCREMENTAL";incremental++}
  else{begin=new Date(end.getTime()-years*365.25*DAY);mode="FULL_BACKFILL";full++}
  // Nothing useful to fetch if the overlap start somehow lies in the future.
  if(begin.getTime()>end.getTime())begin=new Date(end.getTime()-OVERLAP_DAYS*DAY);
  let rows:any[]=[];
  // For normal incremental sync this is usually one tiny request. Full backfill uses contiguous 250-day windows
  // (at most 251 daily buckets, under Coinbase's 300 limit); the shared boundary candle is de-duplicated below.
  for(let s=begin.getTime();s<=end.getTime();s+=250*DAY){const st=new Date(s),en=new Date(Math.min(end.getTime(),s+250*DAY)),c=await candles(product,st,en);for(const x of c||[]){if(!Array.isArray(x)||x.length<6)continue;const t=Number(x[0])*1000,p=Number(x[4]);if(!(p>0))continue;rows.push({user_id:a.user_id,research_asset_id:a.id,price_date:new Date(t).toISOString().slice(0,10),price:p,low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),volume:Number(x[5]),source:"coinbase_exchange",source_symbol:product,imported_at:new Date().toISOString()})}await new Promise(r=>setTimeout(r,120))}
  rows=[...new Map(rows.map(x=>[x.price_date,x])).values()];
  for(let i=0;i<rows.length;i+=500){const{error}=await db.from("historical_price_daily").upsert(rows.slice(i,i+500),{onConflict:"user_id,research_asset_id,price_date,source"});if(error)throw error}
  imported+=rows.length;report.push({id:a.id,symbol:a.symbol,product,status:"IMPORTED",sync_mode:mode,from:begin.toISOString().slice(0,10),days_received:rows.length,last_existing:last?.[0]?.price_date||null});
 }
 return new Response(JSON.stringify({ok:true,version:"history-sync-v9.3.4",years,overlap_days:OVERLAP_DAYS,reverify_days:REVERIFY_DAYS,dry_run:dry,force_full:forceFull,assets:assets.length,newly_mapped:mapped,full_backfills:full,incremental_syncs:incremental,imported_rows:imported,report}),{headers:{"content-type":"application/json"}});
}catch(e){console.error(e);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}})
