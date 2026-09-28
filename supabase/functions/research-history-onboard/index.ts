// v9.3.2 lightweight trigger endpoint.
// Calls the canonical multi-year-history function for one newly researched asset.
// Keeps mapping/import logic in one place.
Deno.serve(async req=>{try{
 const sec=Deno.env.get("MONITOR_CRON_SECRET")||"";if(!sec||req.headers.get("x-monitor-secret")!==sec)return new Response('{"error":"unauthorized"}',{status:401,headers:{"content-type":"application/json"}});
 let b:any={};try{b=await req.json()}catch{};const id=Number(b.research_asset_id);if(!id)return new Response('{"error":"research_asset_id required"}',{status:400,headers:{"content-type":"application/json"}});
 const base=Deno.env.get("SUPABASE_URL");if(!base)throw Error("SUPABASE_URL missing");
 const r=await fetch(`${base}/functions/v1/multi-year-history`,{method:"POST",headers:{"content-type":"application/json","x-monitor-secret":sec},body:JSON.stringify({research_asset_id:id,years:5})});
 const text=await r.text();return new Response(text,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});
}catch(e){return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{"content-type":"application/json"}})}})
