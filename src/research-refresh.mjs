// Sequential stages keep dependent assessments on freshly persisted evidence.
export async function runResearchRefresh({evaluate,source,events,assess,onUpdate}){
 const steps=["Quantitative evaluation","Sourced research","Catalyst events","AI assessment"].map(label=>({label,status:"Waiting"}));
 const update=(i,status)=>{steps[i]={...steps[i],status};onUpdate(steps.map(step=>({...step})))};
 let context={};
 const actions=[async()=>{context=await evaluate()},async()=>{context.qualitative=await source(context)},async()=>{await events(context)},async()=>{await assess(context)}];
 for(let i=0;i<actions.length;i++){
  update(i,"Running…");
  try{await actions[i]();update(i,"Complete")}
  catch(e){update(i,`Failed: ${e?.message||"Research failed"}`);for(let j=i+1;j<steps.length;j++)update(j,"Skipped — retry after resolving the failed step");return{ok:false,steps,context}}
 }
 return{ok:true,steps,context};
}
