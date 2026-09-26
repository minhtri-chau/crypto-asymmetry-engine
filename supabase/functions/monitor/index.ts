import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const ASSETS: Record<string,string> = {AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome-finance",AKT:"akash-network",LINK:"chainlink",TAO:"bittensor",ONDO:"ondo-finance",TIA:"celestia",SUI:"sui"};
const LLAMA: Record<string,string> = {AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",ONDO:"ondo-finance"};
const n=(v:unknown)=>v===null||v===undefined||v===""?null:Number(v);
const keyOf=(u:string,s:string,t:string)=>`${u}:${s}:${t}`;
function secretKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
function configuredRules(p:any){
  const out:string[]=[];
  if(n(p.buy_price)!=null)out.push("buy_price");
  if(n(p.take_profit)!=null)out.push("take_profit");
  if(n(p.stop_loss)!=null)out.push("stop_loss");
  if(n(p.max_fdv_tvl)!=null)out.push("fdv_tvl");
  if(n(p.entry_fees_30d)!=null&&n(p.fee_drop)!=null)out.push("fee_drop");
  return out;
}
async function resolveOpen(db:any,userId:string,symbol:string,type:string,at:string){
  await db.from("monitor_events").update({resolved_at:at}).eq("user_id",userId).eq("symbol",symbol).eq("rule_type",type).is("resolved_at",null);
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const expected=Deno.env.get("MONITOR_CRON_SECRET");
  if(!expected||req.headers.get("x-monitor-secret")!==expected)return new Response("Unauthorized",{status:401});
  const url=Deno.env.get("SUPABASE_URL"),key=secretKey();
  if(!url||!key)return Response.json({error:"Supabase server credentials unavailable"},{status:500});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const now=new Date().toISOString();
  const [{data:plans,error:pe},{data:states,error:se}]=await Promise.all([
    db.from("plans").select("*"),
    db.from("monitor_state").select("*")
  ]);
  if(pe)throw pe;if(se)throw se;

  const allPlans=plans||[],allStates=states||[];
  const validKeys=new Set<string>();
  for(const p of allPlans)for(const type of configuredRules(p))validKeys.add(keyOf(p.user_id,p.symbol,type));

  // Resolve and remove state for deleted plans or removed rules.
  let staleResolved=0;
  for(const st of allStates){
    if(validKeys.has(keyOf(st.user_id,st.symbol,st.rule_type)))continue;
    if(st.is_active){await resolveOpen(db,st.user_id,st.symbol,st.rule_type,now);staleResolved++}
    await db.from("monitor_state").delete().eq("user_id",st.user_id).eq("symbol",st.symbol).eq("rule_type",st.rule_type);
  }
  if(!allPlans.length)return Response.json({ok:true,plans:0,rulesChecked:0,eventsCreated:0,staleResolved,at:now});

  const symbols=[...new Set(allPlans.map((p:any)=>p.symbol).filter((s:string)=>ASSETS[s]))];
  const ids=symbols.map(s=>ASSETS[s]).join(",");
  const cgHeaders:Record<string,string>={accept:"application/json"};
  const cgKey=Deno.env.get("COINGECKO_DEMO_API_KEY");
  if(cgKey)cgHeaders["x-cg-demo-api-key"]=cgKey;
  const mr=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false`,{headers:cgHeaders});
  if(!mr.ok)return Response.json({error:`CoinGecko ${mr.status}`},{status:502});
  const markets=Object.fromEntries((await mr.json()).map((x:any)=>[x.id,x]));

  // Fetch DefiLlama only for symbols whose saved rules actually need TVL or fees.
  const needsFund=[...new Set(allPlans.filter((p:any)=>LLAMA[p.symbol]&&(n(p.max_fdv_tvl)!=null||(n(p.entry_fees_30d)!=null&&n(p.fee_drop)!=null))).map((p:any)=>p.symbol))];
  const fund:Record<string,any>={};
  await Promise.all(needsFund.map(async s=>{
    const slug=LLAMA[s];
    const needTvl=allPlans.some((p:any)=>p.symbol===s&&n(p.max_fdv_tvl)!=null);
    const needFees=allPlans.some((p:any)=>p.symbol===s&&n(p.entry_fees_30d)!=null&&n(p.fee_drop)!=null);
    const [protocol,fees]=await Promise.all([
      needTvl?fetch(`https://api.llama.fi/protocol/${slug}`).then(r=>r.ok?r.json():null).catch(()=>null):Promise.resolve(null),
      needFees?fetch(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`).then(r=>r.ok?r.json():null).catch(()=>null):Promise.resolve(null)
    ]);
    fund[s]={tvl:protocol?.tvl??null,fees30d:fees?.total30d??null};
  }));

  const stateMap=new Map(allStates.filter((x:any)=>validKeys.has(keyOf(x.user_id,x.symbol,x.rule_type))).map((x:any)=>[keyOf(x.user_id,x.symbol,x.rule_type),x]));
  let created=0,checked=0,thresholdResets=0;
  for(const p of allPlans){
    const m=markets[ASSETS[p.symbol]],f=fund[p.symbol]||{};
    if(!m)continue;
    const rules:any[]=[];
    if(n(p.buy_price)!=null)rules.push(["buy_price",m.current_price<=n(p.buy_price)!,m.current_price,n(p.buy_price),"Buy zone hit",`Price ${m.current_price} is at or below saved buy threshold ${p.buy_price}.`]);
    if(n(p.take_profit)!=null)rules.push(["take_profit",m.current_price>=n(p.take_profit)!,m.current_price,n(p.take_profit),"Take-profit price hit",`Price ${m.current_price} is at or above saved take-profit threshold ${p.take_profit}.`]);
    if(n(p.stop_loss)!=null)rules.push(["stop_loss",m.current_price<=n(p.stop_loss)!,m.current_price,n(p.stop_loss),"Stop-loss price hit",`Price ${m.current_price} is at or below saved stop-loss threshold ${p.stop_loss}.`]);
    const fdvTvl=m.fully_diluted_valuation&&f.tvl?m.fully_diluted_valuation/f.tvl:null;
    if(n(p.max_fdv_tvl)!=null&&fdvTvl!=null)rules.push(["fdv_tvl",fdvTvl<=n(p.max_fdv_tvl)!,fdvTvl,n(p.max_fdv_tvl),"FDV / TVL zone hit",`FDV / TVL ${fdvTvl.toFixed(2)} is at or below saved threshold ${p.max_fdv_tvl}.`]);
    const feeFloor=n(p.entry_fees_30d)!=null&&n(p.fee_drop)!=null?n(p.entry_fees_30d)!*(1-n(p.fee_drop)!/100):null;
    if(feeFloor!=null&&f.fees30d!=null)rules.push(["fee_drop",f.fees30d<=feeFloor,f.fees30d,feeFloor,"Fee deterioration rule hit",`30d fees ${f.fees30d} are at or below the saved thesis-break floor ${feeFloor.toFixed(2)}.`]);

    for(const [type,active,value,threshold,title,details] of rules){
      checked++;
      const k=keyOf(p.user_id,p.symbol,type),stored=stateMap.get(k) as any;
      const changed=stored?.threshold!=null&&Number(stored.threshold)!==Number(threshold);
      let prev=stored;
      if(changed){
        if(stored?.is_active)await resolveOpen(db,p.user_id,p.symbol,type,now);
        prev={...stored,is_active:false};
        thresholdResets++;
      }
      if(active&&!prev?.is_active){
        const{error}=await db.from("monitor_events").insert({user_id:p.user_id,symbol:p.symbol,rule_type:type,title,details,observed_value:value,threshold});
        if(!error)created++;
      }
      if(!active&&prev?.is_active)await resolveOpen(db,p.user_id,p.symbol,type,now);
      await db.from("monitor_state").upsert({user_id:p.user_id,symbol:p.symbol,rule_type:type,is_active:!!active,last_value:value,threshold,checked_at:now},{onConflict:"user_id,symbol,rule_type"});
    }
  }
  return Response.json({ok:true,plans:allPlans.length,rulesChecked:checked,eventsCreated:created,staleResolved,thresholdResets,coinGeckoDemoKey:!!cgKey,at:now});
});
