// Run every stage; use fresh results when available and retain stored context on failure.
export async function runResearchRefresh({evaluate,direct,source,events,assess,onUpdate,initialContext={},includeAI=true}){
 const steps=["Quantitative evaluation",...(direct?["Direct data (no AI)"]:[]),...(includeAI?["Sourced research","Catalyst events","AI assessment"]:[])].map(label=>({label,status:"Waiting"}));
 const update=(i,status)=>{steps[i]={...steps[i],status};onUpdate(steps.map(step=>({...step})))};
 let context={...initialContext},ok=true;
 const actions=[async()=>{context={...context,...await evaluate()}},...(direct?[async()=>{context.direct=await direct(context)}]:[]),async()=>{context.qualitative=await source(context)},async()=>{await events(context)},async()=>{await assess(context)}];
 for(let i=0;i<steps.length;i++){
  update(i,"Running…");
  try{await actions[i]();update(i,"Complete")}
  catch(e){ok=false;update(i,`Failed: ${e?.message||"Research failed"}`)}
 }
 return{ok,steps,context};
}
