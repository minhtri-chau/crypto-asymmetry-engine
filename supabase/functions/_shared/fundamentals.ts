export const PROTOCOLS:Record<string,string>={AAVE:"aave",PENDLE:"pendle",AERO:"aerodrome",LINK:"chainlink",ONDO:"ondo-finance"};
export const CHAINS:Record<string,{chain:string,fees:string,tvlRule:boolean}>={
 SUI:{chain:"Sui",fees:"sui",tvlRule:true},
 TIA:{chain:"Celestia",fees:"celestia",tvlRule:false},
 TAO:{chain:"Bittensor",fees:"chutes",tvlRule:false}
};
const n=(v:any)=>v===null||v===undefined||v===""?null:Number(v);
async function j(url:string){try{const r=await fetch(url);return r.ok?await r.json():null}catch{return null}}
export async function fundamentals(symbols:string[]){
 const out:Record<string,any>={};
 await Promise.all(symbols.map(async s=>{
  if(PROTOCOLS[s]){
   const slug=PROTOCOLS[s],[tvl,fees,rev]=await Promise.all([
    j(`https://api.llama.fi/tvl/${slug}`),
    j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`),
    j(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue`)
   ]);
   out[s]={tvl:typeof tvl==="number"?tvl:null,fees30d:n(fees?.total30d),fees7d:n(fees?.total7d),revenue30d:n(rev?.total30d),revenue7d:n(rev?.total7d),tvlRule:true,feeRule:true};
   return;
  }
  const c=CHAINS[s];
  if(c){
   const[hist,fees,rev]=await Promise.all([
    j(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(c.chain)}`),
    j(`https://api.llama.fi/summary/fees/${c.fees}?dataType=dailyFees`),
    j(`https://api.llama.fi/summary/fees/${c.fees}?dataType=dailyRevenue`)
   ]);
   const rows=Array.isArray(hist)?hist:[],last=rows.at(-1),tvl=n(last?.tvl??last?.[1]);
   out[s]={tvl,fees30d:n(fees?.total30d),fees7d:n(fees?.total7d),revenue30d:n(rev?.total30d),revenue7d:n(rev?.total7d),tvlRule:c.tvlRule,feeRule:true};
  }
 }));
 return out;
}
