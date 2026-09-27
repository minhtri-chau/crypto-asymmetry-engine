import { createClient } from "npm:@supabase/supabase-js@2.117.1";
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>v==null||v===""?null:Number(v);
async function fj(url:string,h:Record<string,string>={accept:"application/json"}){try{const r=await fetch(url,{headers:h});return r.ok?await r.json():null}catch{return null}}
function secretKey(){const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
function chart7(s:any){const c=(s?.totalDataChart||[]).filter((p:any)=>Array.isArray(p)&&p.length===2);if(c.length<14)return null;const sum=(a:any[])=>a.reduce((t,p)=>t+(num(p[1])||0),0),last=sum(c.slice(-7)),prev=sum(c.slice(-14,-7));return prev>0?(last/prev-1)*100:null}
// A child protocol (e.g. aave-v2, which carries gecko_id "aave") is only one version of the project. Score the whole
// parent family instead: summed child TVL, TVL-weighted 7D change (null if any child lacks it), fees from the parent slug.
function familyMap(ps:any[]){const g=new Map<string,any[]>();for(const p of ps||[]){const k=String(p?.parentProtocol||"");if(k.startsWith("parent#")&&num(p.tvl)!>0){if(!g.has(k))g.set(k,[]);g.get(k)!.push(p)}}const out=new Map<string,any>();for(const[k,kids]of g){const tvl=kids.reduce((t,p)=>t+num(p.tvl)!,0),old=kids.some(p=>num(p.change_7d)==null)?null:kids.reduce((t,p)=>t+num(p.tvl)!/(1+num(p.change_7d)!/100),0);out.set(k,{slug:k.slice(7),tvl,tvl7d:old&&old>0?(tvl/old-1)*100:null})}return out}
function protocolMap(ps:any[]){const fam=familyMap(ps),byId=new Map(),bySym=new Map(),keep=(m:Map<string,any>,k:string,r:any)=>{const c=m.get(k);if(!c||(r.tvl||0)>(c.tvl||0))m.set(k,r)};for(const p of ps||[]){if(!p?.slug||p.category==="Treasury")continue;const r=(p.parentProtocol&&fam.get(p.parentProtocol))||{slug:p.slug,tvl:num(p.tvl),tvl7d:num(p.change_7d)};if(p.gecko_id)keep(byId,p.gecko_id,r);const s=String(p.symbol||"").toUpperCase();if(s&&p.parentProtocol)keep(bySym,s,r)}return{x:(id:string,s:string)=>byId.get(id)||bySym.get(s)}}
function extensionPenalty(r7:number|null,r30:number|null){const p7=r7==null?0:r7>60?30:r7>40?23:r7>25?14:r7>15?5:0,p30=r30==null?0:r30>150?40:r30>100?32:r30>70?24:r30>45?15:r30>30?8:0;return Math.max(p7,p30)}
function score(x:any,f:any){
 const vol=x.market_cap>0?x.total_volume/x.market_cap:0,r7=num(x.price_change_percentage_7d_in_currency),r30=num(x.price_change_percentage_30d_in_currency),d=x.fully_diluted_valuation>0&&x.market_cap>0?x.fully_diluted_valuation/x.market_cap:null;
 const liquidity=clamp(vol/.10,0,1)*18,size=x.market_cap>0?clamp((Math.log10(x.market_cap)-7.3)/2.7,0,1)*10:0,supply=d==null?3:d<=1.2?10:d<=1.5?8:d<=2?5:d<=3?2:0;
 const confirmation=(r7==null?0:r7>=-8&&r7<=15?8:r7>15&&r7<=25?5:r7<-8?2:0)+(r30==null?0:r30>=-15&&r30<=30?7:r30>30&&r30<=45?3:r30<-15?1:0);
 let fundamental=0;if(f){if(f.tvl7d!=null)fundamental+=f.tvl7d>15?10:f.tvl7d>5?8:f.tvl7d>0?5:f.tvl7d>-10?2:0;if(f.fees7dChange!=null)fundamental+=f.fees7dChange>30?12:f.fees7dChange>10?10:f.fees7dChange>0?6:f.fees7dChange>-15?2:0;if(f.fees30d!=null&&x.fully_diluted_valuation>0){const y=f.fees30d*12/x.fully_diluted_valuation;fundamental+=y>.15?8:y>.07?6:y>.03?4:y>.01?2:0}}
 const penalty=extensionPenalty(r7,r30),raw=liquidity+size+supply+confirmation+fundamental-penalty,evidence=Math.round(clamp(raw/83*100,0,100));
 const observed=[vol,x.market_cap,d,r7,r30,f?.tvl7d,f?.fees7dChange,f?.fees30d],coverage=Math.round(observed.filter(v=>v!=null).length/8*100);
 return{evidence,coverage,r7,r30,d,penalty,fees7dChange:f?.fees7dChange??null,tvl7d:f?.tvl7d??null}
}
function thesisScore(x:any,f:any){
 const mc=num(x.market_cap),fdv=num(x.fully_diluted_valuation),vol=num(x.total_volume),d=fdv&&mc?fdv/mc:null,volMc=vol&&mc?vol/mc:null,feeYield=f?.fees30d!=null&&fdv?f.fees30d*12/fdv:null,fdvTvl=f?.tvl&&fdv?fdv/f.tvl:null;
 const liquidity=volMc==null?null:Math.round(clamp(45+volMc*220,20,90));
 const supply=d==null?null:d<=1.15?90:d<=1.35?78:d<=1.7?64:d<=2.2?48:d<=3?32:18;
 const traction=f?.fees7dChange!=null||f?.tvl7d!=null?Math.round(clamp(50+(f?.fees7dChange??0)*.55+(f?.tvl7d??0)*.65,10,95)):null;
 let valuation=null;if(f?.fees30d!=null||f?.tvl!=null){let v=50;if(feeYield!=null)v+=feeYield>.15?25:feeYield>.07?16:feeYield>.03?8:feeYield<.01?-15:0;if(fdvTvl!=null)v+=fdvTvl<1?18:fdvTvl<3?10:fdvTvl>12?-18:fdvTvl>7?-8:0;valuation=Math.round(clamp(v,5,95))}
 const marketQuality=mc==null?null:Math.round(clamp(35+(Math.log10(Math.max(mc,1))-7)*12,20,90));
 const parts:any={fundamental_traction:traction,valuation,supply,liquidity,market_quality:marketQuality,token_value_capture:null,catalysts:null,qualitative_risk:null};
 const weights:any={fundamental_traction:25,valuation:20,supply:15,liquidity:10,market_quality:10,token_value_capture:10,catalysts:5,qualitative_risk:5};let weighted=0,observed=0,total=0;for(const[k,w]of Object.entries(weights) as any){total+=w;if(parts[k]!=null){weighted+=parts[k]*w;observed+=w}}
 const coverage=Math.round(observed/total*100),score=observed?Math.round(clamp(weighted/observed,0,100)):null;return{score,coverage,parts}
}

function state(s:any,owned:boolean,prev:any){
 const prevScore=num(prev?.evidence_score),delta=prevScore==null?null:s.evidence-prevScore;
 const fundamentalDrop=(s.fees7dChange!=null&&s.fees7dChange<=-25)||(s.tvl7d!=null&&s.tvl7d<=-20);
 const concreteNegative=s.penalty>=24||fundamentalDrop;
 const sustainedDeterioration=prevScore!=null&&delta!=null&&delta<=-12&&s.coverage>=75&&concreteNegative;
 if(sustainedDeterioration)return{status:owned?"reduce_exit_review":"archive_candidate",reason:owned?"Concrete, well-covered deterioration persisted versus the prior evaluation; review the thesis and predefined exit rules.":"Concrete, well-covered deterioration persisted versus the prior evaluation; consider retiring this research candidate."};
 if(s.penalty>=24)return{status:"reassess",reason:"Price appears substantially repriced; reassess valuation versus fundamentals."};
 if(fundamentalDrop)return{status:"reassess",reason:"Observed fundamentals deteriorated materially; review whether the thesis is weakening."};
 if(s.evidence>=65&&s.coverage>=75)return{status:"strengthening",reason:"Current Setup Evidence is comparatively strong with at least 75% Data Coverage; deepen entry research while keeping the longer-lived thesis separate."};
 if(delta!=null&&delta<=-12)return{status:"reassess",reason:`Evidence fell ${Math.abs(Math.round(delta))} points since the prior evaluation; review what changed.`};
 if(delta!=null&&delta>=10&&s.coverage>=75)return{status:"strengthening",reason:`Evidence improved ${Math.round(delta)} points with sufficient coverage.`};
 if(s.coverage<75)return{status:"research_needed",reason:"Setup Data Coverage is below 75%. Missing evidence is uncertainty, not negative evidence; continue researching."};
 return{status:"monitor",reason:"No hard current-setup deterioration signal; continue monitoring the setup and thesis separately."}
}
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const expected=Deno.env.get("MONITOR_CRON_SECRET");if(!expected||req.headers.get("x-monitor-secret")!==expected)return new Response("Unauthorized",{status:401});
 const url=Deno.env.get("SUPABASE_URL"),key=secretKey();if(!url||!key)return Response.json({error:"Supabase server credentials unavailable"},{status:500});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const{data:assets,error}=await db.from("research_assets").select("*").neq("stage","archived");if(error)return Response.json({error:error.message},{status:500});if(!assets?.length)return Response.json({ok:true,evaluated:0});
 const ids=[...new Set(assets.map((a:any)=>a.coingecko_id))],h:Record<string,string>={accept:"application/json"},cg=Deno.env.get("COINGECKO_DEMO_API_KEY");if(cg)h["x-cg-demo-api-key"]=cg;
 const market=await fj(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(",")}&sparkline=false&price_change_percentage=7d,30d`,h);if(!Array.isArray(market))return Response.json({error:"CoinGecko unavailable"},{status:502});
 const mm=new Map(market.map((x:any)=>[x.id,x])),protocols=await fj("https://api.llama.fi/protocols")||[],pm=protocolMap(protocols);let evaluated=0;
 for(const a of assets){
  const m=mm.get(a.coingecko_id);if(!m)continue;const p=pm.x(a.coingecko_id,a.symbol);let f:any=null;
  if(p){const fees=await fj(`https://api.llama.fi/summary/fees/${p.slug}?dataType=dailyFees`);f={tvl:p.tvl,tvl7d:p.tvl7d,fees30d:num(fees?.total30d),fees7dChange:num(fees?.change_7dover7d)??chart7(fees)}}
  const s=score(m,f),t=thesisScore(m,f),{data:prior}=await db.from("research_evaluations").select("evidence_score,evidence_coverage,status").eq("research_asset_id",a.id).order("evaluated_at",{ascending:false}).limit(1).maybeSingle(),st=state(s,!!a.is_owned,prior);
  if(t.score!=null)await db.from("research_assets").update({thesis_strength:t.score,thesis_coverage:t.coverage,thesis_components:t.parts,thesis_updated_at:new Date().toISOString()}).eq("id",a.id);
  const{error:ie}=await db.from("research_evaluations").insert({user_id:a.user_id,research_asset_id:a.id,evidence_score:s.evidence,evidence_coverage:s.coverage,price:m.current_price,market_cap:m.market_cap??null,fdv:m.fully_diluted_valuation??null,volume_24h:m.total_volume??null,tvl:f?.tvl??null,fees_30d:f?.fees30d??null,return_7d:s.r7,return_30d:s.r30,fees_7d_change:f?.fees7dChange??null,tvl_7d_change:f?.tvl7d??null,dilution:s.d,status:st.status,reason:st.reason});if(!ie)evaluated++;
 }
 return Response.json({ok:true,evaluated,coinGeckoDemoKey:!!cg,at:new Date().toISOString()})
});