// Authenticated single-asset bridge; the cron secret never enters the browser.
export default async function handler(req,res){
 try{
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  const auth=req.headers.authorization||"";
  if(!auth.startsWith("Bearer "))return res.status(401).json({error:"Sign in to refresh research"});
  const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return res.status(503).json({error:"Supabase server configuration missing"});
  const id=req.body?.research_asset_id;
  if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:"Valid research_asset_id required"});
  const headers={Authorization:auth,apikey:key};
  const u=await fetch(`${url}/auth/v1/user`,{headers});
  if(!u.ok)return res.status(401).json({error:"Sign in again to refresh research"});
  const user=await u.json();
  const q=await fetch(`${url}/rest/v1/research_assets?id=eq.${id}&user_id=eq.${encodeURIComponent(user.id)}&stage=neq.archived&select=id`,{headers});
  if(!q.ok)return res.status(502).json({error:"Unable to verify research asset"});
  const rows=await q.json();
  if(!Array.isArray(rows)||rows.length!==1)return res.status(404).json({error:"Research asset not found"});
  const secret=process.env.MONITOR_CRON_SECRET;
  if(!secret)return res.status(503).json({error:"MONITOR_CRON_SECRET is not configured in Vercel"});
  // GET is harmless on older workers (405). Never send a target to an old full-universe worker.
  const endpoint=`${url}/functions/v1/research-monitor`;
  const probe=await fetch(endpoint,{method:"GET",headers:{"x-monitor-secret":secret},signal:AbortSignal.timeout(15000)});
  let capabilities;try{capabilities=await probe.json()}catch{}
  if(!probe.ok||capabilities?.targeted_research_version!=="v10.6")return res.status(503).json({error:"Redeploy research-monitor from v10.6 before using Refresh Research"});
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-monitor-secret":secret},body:JSON.stringify({research_asset_id:id,user_id:user.id}),signal:AbortSignal.timeout(90000)});
  const raw=await r.text();let result;try{result=JSON.parse(raw)}catch{}
  if(!r.ok||!result?.ok||result.evaluated!==1)return res.status(502).json({error:result?.error||`Research worker did not complete one evaluation (${r.status}). Redeploy research-monitor from v10.6.`,worker_status:r.status});
  return res.status(200).json(result);
 }catch(e){return res.status(502).json({error:e?.name==="TimeoutError"?"Quantitative research timed out; check the latest evaluation before retrying.":"Research refresh failed"})}
}
