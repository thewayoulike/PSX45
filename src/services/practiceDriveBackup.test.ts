import {expect,it,vi} from 'vitest';
vi.mock('./driveStorage',()=>({cloudSession:vi.fn()}));
vi.mock('./practiceTrading',()=>({practiceRequest:vi.fn()}));
import {collectPracticeBackup,parsePracticeBackup,type PracticeRequest} from './practiceDriveBackup';
const order=(id:number)=>({id:String(id),clientOrderId:'ref-'+id,symbol:'HBL',side:'BUY',type:'MARKET',status:'FILLED',quantity:1,filled:1,price:100,limitPrice:null,commission:1,fees:1,reason:'',createdAt:'2026-10-24T14:00:00Z'});
const snapshot=(count=56,offset=0)=>({config:{environment:'sandbox',startingCash:100000,commissionPct:.15,currency:'PKR',fees:{advanceRate:0,sstRate:0}},account:{id:'sandbox-1',status:'ACTIVE'},portfolio:{cash:100,availableCash:100,reservedCash:0,equity:200,marketValue:100,unrealizedPnl:0,asOf:'2026-10-24T14:00:00Z',positions:[{symbol:'HBL',quantity:1,averagePrice:100,lastPrice:100,marketValue:100,unrealizedPnl:0}]},orders:Array.from({length:count},(_,i)=>order(i)).slice(offset,offset+25),total:count,offset});
it('backs up all order pages, then rechecks the first page before upload',async()=>{
  const request=vi.fn(async(_email,body)=>snapshot(56,body.offset));
  const result=await collectPracticeBackup('a@example.test',request as PracticeRequest);
  expect(result.snapshot.orders).toHaveLength(56);expect(request.mock.calls.map(c=>c[1].offset)).toEqual([0,25,50,0]);
});
it('refuses partial history, duplicate pages and an account change',async()=>{
  for(const mode of ['partial','duplicate','account']){
    const request=async(_email:string,body:any)=>{const s=snapshot(56,body.offset);if(body.offset===25){if(mode==='partial')s.orders=[];if(mode==='duplicate')s.orders=snapshot().orders;if(mode==='account')s.account.id='wrong';}return s;};
    await expect(collectPracticeBackup('a@example.test',request as PracticeRequest)).rejects.toThrow('changed');
  }
});
it('retries a changing order count and captures the complete second attempt',async()=>{
  let first=true;const request=vi.fn(async(_email,body)=>{if(first&&body.offset===25){first=false;return snapshot(57,25);}return snapshot(first?56:57,body.offset);});
  const result=await collectPracticeBackup('a@example.test',request as PracticeRequest);expect(result.snapshot.orders).toHaveLength(57);
});
it('excludes credentials and rejects empty, live and malformed backups',()=>{
  const s:any=snapshot(1);s.secret='never-upload';s.account.token='never-upload';
  const input={capturedAt:'2026-10-24T15:00:00Z',snapshot:s,accessToken:'never-upload'};
  expect(JSON.stringify(parsePracticeBackup(input))).not.toContain('never-upload');
  for(const changed of [{account:null},{config:{...s.config,environment:'live'}},{orders:[]}])expect(()=>parsePracticeBackup({...input,snapshot:{...s,...changed}})).toThrow();
});
