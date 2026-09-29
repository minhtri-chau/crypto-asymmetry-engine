// v10.4: removal stops research without cascading through historical records.
export async function removeResearchAsset(supabase,uid,id){
  const{data:asset,error:ae}=await supabase.from("research_assets").select("id,symbol,is_owned").eq("id",id).eq("user_id",uid).single();
  if(ae)return{ok:false,error:ae.message};
  const{data:ownedPlan,error:oe}=await supabase.from("plans").select("is_owned").eq("user_id",uid).eq("symbol",asset.symbol).maybeSingle();
  if(oe)return{ok:false,error:oe.message};
  if(asset.is_owned||ownedPlan?.is_owned)return{ok:false,error:"This coin is still marked owned. Clear its position before removing it from Research."};
  // Keep the existing inactive stage internally: workers already exclude it, history and the seed tombstone survive.
  const{data:removed,error}=await supabase.from("research_assets").update({stage:"archived",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",uid).eq("is_owned",false).select("id").maybeSingle();
  if(error)return{ok:false,error:error.message};
  if(!removed)return{ok:false,error:"The position changed. Refresh and check ownership before removing it."};
  return{ok:true};
}

export const visibleResearchAssets=rows=>(rows||[]).filter(x=>x.stage!=="archived"||x.is_owned);
