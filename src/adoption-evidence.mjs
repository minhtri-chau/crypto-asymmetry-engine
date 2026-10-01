export const ADOPTION_METRICS = [
 ["active_addresses","Active addresses","count"], ["paying_users","Paying users","count"],
 ["retained_users","Retained users","percent"], ["tvl_usd","TVL","usd"],
 ["net_deposits_usd","Net deposits","usd"], ["fees_usd","Fees","usd"],
 ["revenue_usd","Protocol revenue","usd"], ["monthly_active_developers","Monthly active developers","count"],
 ["established_developers","Established developers","count"], ["developer_retention","Developer retention","percent"],
 ["releases","Releases","count"]
];
const DAY=86400000;
const date=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v?Date.parse(v+"T00:00:00Z"):NaN;
export function adoptionEvidence(intelligence, now=Date.now()) {
 const sources=new Map((intelligence?.sources||[]).filter(s=>/^https:\/\//i.test(s.url||"")).map(s=>[s.id,s]));
 return ADOPTION_METRICS.map(([key,label,unit])=>{
  const metric=(intelligence?.adoption_development||[]).find(m=>m.metric===key);
  const points=(metric?.observations||[]).filter(o=>Number.isFinite(o.value)&&o.value>=0&&(unit!=="percent"||o.value<=100)&&Number.isFinite(date(o.date))&&date(o.date)<=now&&o.definition?.trim()&&o.scope?.trim()&&Number.isInteger(o.period_days)&&o.period_days>0&&(o.source_ids||[]).some(id=>sources.has(id))).sort((a,b)=>date(b.date)-date(a.date));
  const current=points[0],dev=key.includes("developer")||key==="releases",windows=dev?[90,180]:[30,90];
  const changes=windows.map(days=>{
   const previous=current&&points.find(o=>Math.abs((date(current.date)-date(o.date))/DAY-days)<=3&&o.period_days===current.period_days&&o.definition===current.definition&&o.scope===current.scope);
   return {days,value:previous&&previous.value>0?(current.value/previous.value-1)*100:null,previous};
  });
  const stale=current?(now-date(current.date))/DAY>(dev?60:30):false;
  return {key,label,unit,current,changes,stale,sources:current?(current.source_ids||[]).map(id=>sources.get(id)).filter(Boolean):[],note:metric?.note||"No sourced observation collected."};
 });
}
