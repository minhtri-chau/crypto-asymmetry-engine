// Add as api/history-onboard.js
// Authenticated browser bridge. MONITOR_CRON_SECRET remains server-side.
export default async function handler(req,res){
 try{
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  const auth=req.headers.authorization||"";if(!auth.startsWith("Bearer "))return res.status(401).json({error:"Unauthorized"});
  const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return res.status(503).json({error:"Supabase env missing"});
  const u=await fetch(`${url}/auth/v1/user`,{headers:{Authorization:auth,apikey:key}});
  if(!u.ok)return res.status(401).json({error:"Unauthorized"});
  const user=await u.json(),id=Number(req.body?.research_asset_id);if(!id)return res.status(400).json({error:"research_asset_id required"});
  // Verify the requested asset belongs to the signed-in user before invoking privileged worker.
  const q=await fetch(`${url}/rest/v1/research_assets?id=eq.${id}&user_id=eq.${encodeURIComponent(user.id)}&select=id`,{headers:{apikey:key,Authorization:auth}});
  const rows=q.ok?await q.json():[];if(!Array.isArray(rows)||!rows.length)return res.status(404).json({error:"Research asset not found"});
  const secret=process.env.MONITOR_CRON_SECRET;
  if(!secret)return res.status(503).json({error:"MONITOR_CRON_SECRET is not configured in Vercel"});
  const r=await fetch(`${url}/functions/v1/research-history-onboard`,{method:"POST",headers:{"content-type":"application/json","x-monitor-secret":secret},body:JSON.stringify({research_asset_id:id})});
  const text=await r.text();let j=null;try{j=JSON.parse(text)}catch{}
  return res.status(r.ok?200:502).json(j||{error:"History onboarding returned an unexpected response"});
 }catch(e){console.error("history-onboard",e);return res.status(500).json({error:e?.message||"History onboarding failed"})}
}
