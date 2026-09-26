import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const ASSETS: Record<string,string> = {AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome-finance",AKT:"akash-network",LINK:"chainlink",TAO:"bittensor",ONDO:"ondo-finance",TIA:"celestia",SUI:"sui"};
const LLAMA: Record<string,string> = {AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",ONDO:"ondo-finance"};
const n=(v:unknown)=>v===null||v===undefined||v===""?null:Number(v);
function secretKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const expected=Deno.env.get("MONITOR_CRON_SECRET");
  if(!expected||req.headers.get("x-monitor-secret")!==expected)return new Response("Unauthorized",{status:401});
  const url=Deno.env.get("SUPABASE_URL"),key=secretKey();
  if(!url||!key)return Response.json({error:"Supabase server credentials unavailable"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:plans,error:pe}=await db.from("plans").select("*");
  if(pe)throw pe;if(!plans?.length)return Response.json({ok:true,plans:0,events:0});
  const symbols=[...new Set(plans.map(p=>p.symbol).filter(s=>ASSETS[s]))];
  const ids=symbols.map(s=>ASSETS[s]).join(",");
  const mr=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`);
  if(!mr.ok)return Response.json({error:`CoinGecko ${mr.status}`},{status:502});
  const markets=Object.fromEntries((await mr.json()).map((x:any)=>[x.id,x]));
  const protocols=await fetch("https://api.llama.fi/protocols").then(r=>r.ok?r.json():[]).catch(()=>[]);
  const bySlug=Object.fromEntries(protocols.map((x:any)=>[x.slug,x]));
  const fund:Record<string,any>={};
  await Promise.all(symbols.filter(s=>LLAMA[s]).map(async s=>{const slug=LLAMA[s],p=bySlug[slug]||{};const fees=await fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`).then(r=>r.ok?r.json():null).catch(()=>null);fund[s]={tvl:p.tvl??null,fees30d:fees?.total30d??null}}));
  const {data:states}=await db.from("monitor_state").select("*");
  const stateMap=new Map((states||[]).map((x:any)=>[`${x.user_id}:${x.symbol}:${x.rule_type}`,x]));
  let created=0,checked=0;
  for(const p of plans){const m=markets[ASSETS[p.symbol]],f=fund[p.symbol]||{};if(!m)continue;
    const rules:any[]=[];
    if(n(p.buy_price)!=null)rules.push(["buy_price",m.current_price<=n(p.buy_price),m.current_price,n(p.buy_price),"Buy zone hit",`Price ${m.current_price} is at or below saved buy threshold ${p.buy_price}.`]);
    if(n(p.take_profit)!=null)rules.push(["take_profit",m.current_price>=n(p.take_profit),m.current_price,n(p.take_profit),"Take-profit price hit",`Price ${m.current_price} is at or above saved take-profit threshold ${p.take_profit}.`]);
    if(n(p.stop_loss)!=null)rules.push(["stop_loss",m.current_price<=n(p.stop_loss),m.current_price,n(p.stop_loss),"Stop-loss price hit",`Price ${m.current_price} is at or below saved stop-loss threshold ${p.stop_loss}.`]);
    const fdvTvl=m.fully_diluted_valuation&&f.tvl?m.fully_diluted_valuation/f.tvl:null;
    if(n(p.max_fdv_tvl)!=null&&fdvTvl!=null)rules.push(["fdv_tvl",fdvTvl<=n(p.max_fdv_tvl),fdvTvl,n(p.max_fdv_tvl),"FDV / TVL zone hit",`FDV / TVL ${fdvTvl.toFixed(2)} is at or below saved threshold ${p.max_fdv_tvl}.`]);
    const feeFloor=n(p.entry_fees_30d)!=null&&n(p.fee_drop)!=null?n(p.entry_fees_30d)!*(1-n(p.fee_drop)!/100):null;
    if(feeFloor!=null&&f.fees30d!=null)rules.push(["fee_drop",f.fees30d<=feeFloor,f.fees30d,feeFloor,"Fee deterioration rule hit",`30d fees ${f.fees30d} are at or below the saved thesis-break floor ${feeFloor.toFixed(2)}.`]);
    for(const [type,active,value,threshold,title,details] of rules){checked++;const k=`${p.user_id}:${p.symbol}:${type}`,prev=stateMap.get(k);if(active&&!prev?.is_active){const{error}=await db.from("monitor_events").insert({user_id:p.user_id,symbol:p.symbol,rule_type:type,title,details,observed_value:value,threshold});if(!error)created++}
      if(!active&&prev?.is_active)await db.from("monitor_events").update({resolved_at:new Date().toISOString()}).eq("user_id",p.user_id).eq("symbol",p.symbol).eq("rule_type",type).is("resolved_at",null);
      await db.from("monitor_state").upsert({user_id:p.user_id,symbol:p.symbol,rule_type:type,is_active:!!active,last_value:value,threshold,checked_at:new Date().toISOString()},{onConflict:"user_id,symbol,rule_type"});
    }
  }
  return Response.json({ok:true,plans:plans.length,rulesChecked:checked,eventsCreated:created,at:new Date().toISOString()});
});
