import {it,expect} from 'vitest';
import {recentOpenSnapshot,missingLevelsReason,scanDiagnostics} from './scannerView';
import {intradayScan,type ScanRow} from './scanner';
import {DEFAULT_RULES} from './workflow';
import {setupStrength} from './strength';
const at=(time:string)=>Date.parse(`2026-10-28T${time}:00+05:00`);
const bars=[0,1,2,3].map(i=>({time:at('09:35')+i*300000,open:100,high:i===3?103:101,low:99,close:i===3?102:100,volume:100}));
const row=():ScanRow=>({symbol:'TEST',name:'Test',sector:'Test',volume:1,checkedAt:at('09:56'),entry:intradayScan(bars,DEFAULT_RULES,at('09:56'))});
it('expires recent snapshots on the clock without rewriting the observed outcome',()=>{
 const r=row();expect(recentOpenSnapshot(r,at('10:00'))).toBe(true);
 expect(recentOpenSnapshot(r,at('10:06'))).toBe(false);
 expect(recentOpenSnapshot(r,at('09:55'))).toBe(false);
 expect(recentOpenSnapshot(r,at('10:00')+86400000)).toBe(false);
 r.entry!.progress!.state='target';expect(recentOpenSnapshot(r,at('10:00'))).toBe(false);
});
it('distinguishes failed data, missing data and an expired no-match result',()=>{
 const failed={...row(),error:'HTTP 503'};expect(missingLevelsReason(failed)).toContain('feed failed');
 const incomplete={...row(),entry:intradayScan(bars.slice(0,3),DEFAULT_RULES,at('11:10'))};
 expect(missingLevelsReason(incomplete)).toContain('incomplete');
 const expired={...row(),entry:intradayScan(bars.map(b=>({...b,close:100})),{...DEFAULT_RULES,entryMinutes:25},at('10:10'))};
 expect(missingLevelsReason(expired)).toContain('window ended');
 const ratings=new Map([failed,incomplete,expired].map((r,i)=>[String(i),setupStrength(r)]));
 const rows=[failed,incomplete,expired].map((r,i)=>({...r,symbol:String(i)}));
 expect(scanDiagnostics(rows,ratings)).toMatchObject({failed:1,evaluated:2,expired:1,incomplete:1,stronger:0});
});
