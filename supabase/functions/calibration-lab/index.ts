import{createClient}from"https://esm.sh/@supabase/supabase-js@2";
const V="calibration-lab-v9.9",MIN_INDEPENDENT=10,MIN_ASSETS=4;
function key(){const x=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(x)return x;try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||null}catch{return null}}
async function all(q:any){const o:any[]=[];for(let f=0;;f+=1000){const{data,error}=await q().range(f,f+999);if(error)throw error;o.push(...(data||[]));if(!data||data.length<1000)break}return o}
const n=(x:any)=>x==null?null:Number(x),fin=(x:any)=>Number.isFinite(x);
function med(a:number[]){a=a.filter(fin).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function independent(rows:any[],h:number){const by=new Map<number,any[]>();for(const r of rows){if(!by.has(r.research_asset_id))by.set(r.research_asset_id,[]);by.get(r.research_asset_id)!.push(r)}
 let out:any[]=[];for(const z of by.values()){z.sort((a,b)=>String(a.observed_date).localeCompare(String(b.observed_date)));let last=-Infinity;for(const r of z){const t=Date.parse(r.observed_date+"T00:00:00Z");if(t-last>=h*86400000){out.push(r);last=t}}}return out}
function bucket(v:number|null,cuts:number[]){if(v==null)return null;for(let i=0;i<cuts.length;i++)if(v<cuts[i])return i;return cuts.length}
function summarize(z:any[]){const ar=z.map(x=>n(x.asset_return_pct)).filter(fin),br=z.map(x=>n(x.btc_relative_return_pct)).filter(fin);return{n:z.length,assets:new Set(z.map(x=>x.research_asset_id)).size,median_return_pct:med(ar),median_btc_relative_pct:med(br),positive_rate_pct:ar.length?100*ar.filter(x=>x>0).length/ar.length:null}}
Deno.serve(async req=>{try{
 const secret=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!secret||req.headers.get("x-monitor-secret")!==secret)return Response.json({error:"unauthorized"},{status:401});
 const url=Deno.env.get("SUPABASE_URL"),sk=key();if(!url||!sk)throw Error("Supabase credentials unavailable");const db=createClient(url,sk,{auth:{persistSession:false}});
 const [dec,out]=await Promise.all([all(()=>db.from("decision_expectations").select("id,user_id,research_asset_id,observed_date,mode,posture,input_snapshot,expectation").order("id")),all(()=>db.from("decision_outcomes").select("*").eq("horizon_days",30).order("id"))]);
 const dm=new Map(dec.map((x:any)=>[x.id,x]));let joined:any[]=[];for(const o of out){const d:any=dm.get(o.decision_expectation_id);if(d)joined.push({...o,observed_date:d.observed_date,input_snapshot:d.input_snapshot,expectation:d.expectation})}
 let written=0;
 for(const uid of [...new Set(dec.map((x:any)=>x.user_id))]){
  const u=joined.filter(x=>x.user_id===uid),rows:any[]=[];
  for(const spec of [
   {scope:"entry",metric:"setup_evidence",cuts:[55,65,75],rule:{current_entry_setup:65},get:(r:any)=>n(r.expectation?.deterministic_signal?.setup_evidence)},
   {scope:"entry",metric:"thesis_strength",cuts:[60,70,80],rule:{minimum_thesis_for_entry_setup:70},get:(r:any)=>n(r.expectation?.deterministic_signal?.thesis_strength)},
   {scope:"position",metric:"regime_score",cuts:[35,45,55,65],rule:{defensive_below:45},get:(r:any)=>n(r.expectation?.deterministic_signal?.regime_score)}
  ]){
   const eligible=u.filter(x=>x.mode===spec.scope).map(x=>({...x,_v:spec.get(x)})).filter(x=>x._v!=null),ind=independent(eligible,30),assets=new Set(ind.map(x=>x.research_asset_id)).size;
   const groups:any[]=[];for(let i=0;i<=spec.cuts.length;i++){const z=ind.filter(x=>bucket(x._v,spec.cuts)===i);groups.push({bucket:i,lower:i?spec.cuts[i-1]:null,upper:i<spec.cuts.length?spec.cuts[i]:null,...summarize(z)})}
   const enough=ind.length>=MIN_INDEPENDENT&&assets>=MIN_ASSETS;
   // v9.9 deliberately does not synthesize a threshold from sparse/overlapping data.
   // Even when ready, it emits REVIEW_READY plus diagnostics. Human review is required before any later version may propose a numeric change.
   const state=!enough?"WAITING_FOR_EVIDENCE":"REVIEW_READY";
   const rationale=!enough?`Need at least ${MIN_INDEPENDENT} independent 30D observations across ${MIN_ASSETS} assets; currently ${ind.length} across ${assets}.`:"Evidence floor reached. Review bucket separation, dispersion, asset concentration and stability before considering any rule change.";
   rows.push({user_id:uid,scope:spec.scope,metric_key:spec.metric,current_rule:spec.rule,evidence_state:state,proposal_state:"OBSERVATIONAL",proposal:null,diagnostics:{horizon_days:30,raw_observations:eligible.length,independent_observations:ind.length,asset_count:assets,buckets:groups,minimum_independent:MIN_INDEPENDENT,minimum_assets:MIN_ASSETS},rationale,calibration_version:V});
  }
  for(const r of rows){const{error}=await db.from("calibration_proposals").upsert(r,{onConflict:"user_id,scope,metric_key,observed_date,calibration_version"});if(error)throw error;written++}
 }
 return Response.json({ok:true,version:V,written,note:"Calibration Lab is observational. It never changes thresholds and v9.9 emits no numeric threshold proposal."});
}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}})
