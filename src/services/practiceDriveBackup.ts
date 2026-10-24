import { isolatedDriveQueue, openDriveDocuments } from './isolatedDriveDocuments';
import { practiceRequest, type PracticeSnapshot, type PracticeOrder } from './practiceTrading';
export type PracticeRequest=<T>(email:string,body:Record<string,unknown>)=>Promise<T>;
export type PracticeBackup={capturedAt:string;snapshot:PracticeSnapshot};
export const practiceBackupKey=(email:string)=>'psx-practice-backup:v1:'+encodeURIComponent(email.trim().toLowerCase());
const num=(v:unknown):number|null=>{if(v===null)return null;if(typeof v!=='number'||!Number.isFinite(v))throw new Error('Incomplete practice data. The previous backup has been kept.');return v;};
const str=(v:unknown):string=>{if(typeof v!=='string')throw new Error('Incomplete practice data. The previous backup has been kept.');return v;};
export function parsePracticeBackup(raw:any):PracticeBackup{
  const s=raw?.snapshot,p=s?.portfolio,c=s?.config;
  if(!Number.isFinite(Date.parse(raw?.capturedAt))||!s?.account?.id||c?.environment!=='sandbox'||!p||!Array.isArray(p.positions)||!Array.isArray(s.orders)||!Number.isSafeInteger(s.total)||s.total<0||s.orders.length!==s.total)throw new Error('A complete sandbox account is needed for backup. The previous copy has been kept.');
  const ids=new Set<string>();
  const orders:PracticeOrder[]=s.orders.map((o:any)=>{
    const id=str(o.id);if(!id||ids.has(id))throw new Error('Practice history changed while loading. Please retry the backup.');ids.add(id);
    return {id,clientOrderId:str(o.clientOrderId),symbol:str(o.symbol),side:str(o.side),type:str(o.type),status:str(o.status),quantity:num(o.quantity),filled:num(o.filled),price:num(o.price),limitPrice:num(o.limitPrice),commission:num(o.commission),fees:num(o.fees),reason:str(o.reason),createdAt:str(o.createdAt)};
  });
  return {capturedAt:raw.capturedAt,snapshot:{
    config:{environment:'sandbox',startingCash:num(c.startingCash),commissionPct:num(c.commissionPct),currency:str(c.currency),fees:{advanceRate:num(c.fees?.advanceRate),sstRate:num(c.fees?.sstRate)}},
    account:{id:str(s.account.id),status:str(s.account.status)},
    portfolio:{cash:num(p.cash),availableCash:num(p.availableCash),reservedCash:num(p.reservedCash),equity:num(p.equity),marketValue:num(p.marketValue),unrealizedPnl:num(p.unrealizedPnl),asOf:str(p.asOf),positions:p.positions.map((v:any)=>({symbol:str(v.symbol),quantity:num(v.quantity),averagePrice:num(v.averagePrice),lastPrice:num(v.lastPrice),marketValue:num(v.marketValue),unrealizedPnl:num(v.unrealizedPnl)}))},
    orders,total:s.total,offset:0,
    ...(s.session?{session:{name:str(s.session.name),canFill:s.session.canFill===true,synthetic:s.session.synthetic===true}}:{}),
  }};
}
/** Read every page. A changing or partial history must not replace a complete backup. */
export async function collectPracticeBackup(email:string,request:PracticeRequest=practiceRequest):Promise<PracticeBackup>{
  const changed='Practice history changed during backup. Please retry.';
  for(let attempt=0;attempt<2;attempt++){
    try{
      const first=await request<PracticeSnapshot>(email,{action:'snapshot',offset:0});
      const total=first.total;
      if(!first.account||!Number.isSafeInteger(total)||total!<0||total!>10000||!first.orders)throw new Error('A complete practice account with up to 10,000 orders is needed for backup.');
      const orders=[...first.orders];
      if(orders.length!==Math.min(25,total!))throw new Error(changed);
      for(let offset=25;offset<total!;offset+=25){
        const page=await request<PracticeSnapshot>(email,{action:'snapshot',offset});
        if(page.account?.id!==first.account.id||page.total!==total||page.offset!==offset||page.orders?.length!==Math.min(25,total!-offset))throw new Error(changed);
        orders.push(...page.orders);
      }
      const last=await request<PracticeSnapshot>(email,{action:'snapshot',offset:0});
      if(last.account?.id!==first.account.id||last.total!==total||JSON.stringify(last.orders)!==JSON.stringify(first.orders)||new Set(orders.map(o=>o.id)).size!==total)throw new Error(changed);
      return parsePracticeBackup({capturedAt:new Date().toISOString(),snapshot:{...last,orders,total,offset:0}});
    }catch(e){if(attempt===0&&e instanceof Error&&e.message===changed)continue;throw e;}
  }
  throw new Error(changed);
}
export async function backupPracticeToDrive(email:string,request:PracticeRequest=practiceRequest){
  return isolatedDriveQueue(email,'practice-backup-v1',async()=>{
    const drive=await openDriveDocuments(email,'practice-backup-v1',parsePracticeBackup);
    const previous=await drive.read();
    const backup=await collectPracticeBackup(email,request);
    const saved=await drive.save(backup,previous,2);
    localStorage.setItem(practiceBackupKey(email),JSON.stringify({fileId:saved.fileId,savedAt:saved.savedAt}));
    return saved;
  });
}
