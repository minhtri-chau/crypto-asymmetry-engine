export function priceMeasurement(start,end){
 if(!start||!end||!Number.isFinite(start.price)||start.price<=0||!Number.isFinite(end.price)||end.price<0||!Number.isFinite(start.t)||!Number.isFinite(end.t))return null;
 return{start,end,delta:end.price-start.price,percent:(end.price/start.price-1)*100,days:Math.abs(end.t-start.t)/86400000};
}
