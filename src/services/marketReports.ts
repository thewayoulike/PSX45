export type InsiderRecord = {id:string;symbol:string;company:string;date:string;person:string;role:string;action:string;shares:number;price:number;value:number|null;sourceUrl:string};
export type InsiderReport = {updatedAt:string;asOf:string;coverage:string;companies:number;checked:number;failed:string[];records:InsiderRecord[];sourceUrl:string};
export type FlowReport = {date:string;updatedAt:string;sourceUrl:string;cells:{sector:string;investor:string;value:number}[];unit:string};
export type InsiderPeriod = 'week'|'month'|'quarter'|'year';
export function insiderStart(asOf:string, period:InsiderPeriod) {
  const end=new Date(asOf+'T00:00:00Z');
  if(period==='year') return asOf.slice(0,4)+'-01-01';
  if(period==='week') end.setUTCDate(end.getUTCDate()-6);
  else {
    const day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()-(period==='month'?1:3));
    const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,last));
  }
  return end.toISOString().slice(0,10);
}
export function insiderTotals(rows:InsiderRecord[]) {
  let buy=0,sell=0,buyCount=0,sellCount=0,other=0,unpriced=0;
  const groups=new Map<string,{symbol:string;company:string;buy:number;sell:number;buyCount:number;sellCount:number}>();
  for(const row of rows) {
    const action=row.action.toLowerCase();
    if(action!=='buy' && action!=='sell'){other++;continue;}
    if(row.value==null || !Number.isFinite(row.value) || row.value<=0){unpriced++;continue;}
    const group=groups.get(row.symbol)||{symbol:row.symbol,company:row.company,buy:0,sell:0,buyCount:0,sellCount:0};
    if(action==='buy'){buy+=row.value;buyCount++;group.buy+=row.value;group.buyCount++;}
    else {sell+=row.value;sellCount++;group.sell+=row.value;group.sellCount++;}
    groups.set(row.symbol,group);
  }
  return {buy,sell,buyCount,sellCount,other,unpriced,buyers:[...groups.values()].filter(r=>r.buy>0).sort((a,b)=>b.buy-a.buy),sellers:[...groups.values()].filter(r=>r.sell>0).sort((a,b)=>b.sell-a.sell)};
}
export function insiderMonths(report:InsiderReport) {
  const end=new Date(report.asOf.slice(0,7)+'-01T00:00:00Z');
  return Array.from({length:12},(_,i)=>{
    const month=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-11+i,1)).toISOString().slice(0,7);
    return {month,...insiderTotals(report.records.filter(r=>r.date.startsWith(month)))};
  });
}
