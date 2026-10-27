import {expect,it} from 'vitest';
import {setupStrength} from './strength';
import {intradayScan,type ScanRow} from './scanner';
import {DEFAULT_RULES} from './workflow';
import type {Bar} from './engine';
import {DEFAULT_PLAN} from './engine';
const at=(time:string)=>Date.parse('2026-10-23T'+time+':00+05:00');
const bar=(time:string,close=100,volume:number|null=100):Bar=>({time:at(time),open:100,high:Math.max(101,close),low:98,close,volume});
const bars=[bar('14:35'),bar('14:40'),bar('14:45'),bar('14:50',102,200),bar('14:55',103,100)];
const row=(now=at('15:00')):ScanRow=>({symbol:'HBL',name:'Habib Bank',sector:'Commercial Banks',volume:100000,checkedAt:now,entry:intradayScan(bars.map(value=>({...value})),DEFAULT_RULES,now,{daily:Array.from({length:20},(_,i)=>({time:Date.UTC(2026,9,i+1),open:100,high:110,low:90,close:100,volume:100})),band:{day:'2026-10-23',lower:90,upper:110,reference:100,source:'Test'}})});
it('rates strong only when volume, net reward and price confirmation all pass',()=>{
  const rating=setupStrength(row());expect(rating.label).toBe('Strong');expect(rating.context).toBe('Recent at scan');
  expect(rating.reasons.join(' ')).toContain('2.00×');expect(rating.reasons.join(' ')).toContain('after estimated costs');
});
it('does not count missing volume or use later prices to rewrite entry quality',()=>{
  const missing=row();missing.entry!.check!.volumeRatio=null;
  expect(setupStrength(missing).label).toBe('Moderate');
  const lost=row();lost.entry!.last!.close=100;
  expect(setupStrength(lost).label).toBe('Strong');
  expect(setupStrength(lost).reasons.join(' ')).not.toContain('no longer holds');
});
it('caps thin after-cost reward at weak but keeps target touches separate',()=>{
  const costly=row();costly.entry!.levels={entry:210.15,stop:208.90,target:212.65};costly.entry!.last!.close=211;costly.entry!.check!.level=210;
  expect(setupStrength(costly).label).toBe('Weak');expect(setupStrength(costly).reasons.join(' ')).toContain('0.49R');
  const reached=row();reached.entry!.last!.close=reached.entry!.levels!.target;
  expect(setupStrength(reached).label).toBe('Strong');expect(setupStrength(reached).reasons.join(' ')).not.toContain('already at or above');
});
it('keeps historical and delayed qualifiers even when all setup checks pass',()=>{
  expect(setupStrength(row(at('17:00')))).toMatchObject({label:'Strong',context:'Historical setup'});
  expect(setupStrength(row(at('15:30')))).toMatchObject({label:'Strong',context:'Delayed snapshot'});
});
it('does not rate failed, missing or unconfirmed data as a weak trade opportunity',()=>{
  expect(setupStrength({...row(),error:'Offline'}).label).toBe('Unavailable');
  const missing=row();missing.entry!.check=null;expect(setupStrength(missing).label).toBe('Incomplete');
  const waiting=row();waiting.entry!.check!.trigger=null;waiting.entry!.check!.state='waiting';expect(setupStrength(waiting).label).toBe('No setup');
});
it('requires recovery, trend and volume for a strong daily rating',()=>{
  const daily:ScanRow={symbol:'HBL',name:'HBL',sector:'Banks',volume:10000,checkedAt:at('17:00'),daily:{last:bar('14:55',103),date:'2026-10-23',changePct:3,ma20:100,rsi:55,setups:['Reclaimed 20-day average'],avgVolume:100,relativeVolume:2}};
  expect(setupStrength(daily).label).toBe('Strong');
  daily.daily!.relativeVolume=null;expect(setupStrength(daily).label).toBe('Moderate');
  daily.daily!.setups=['RSI below 30'];expect(setupStrength(daily).label).toBe('Weak');
  daily.daily!.setups=[];expect(setupStrength(daily).label).toBe('No setup');
});

it('separates missing target context from genuinely weak quality',()=>{const r=row();r.entry=intradayScan(bars,DEFAULT_RULES,at('15:00'));expect(setupStrength(r).label).toBe('Incomplete');});
it('uses the chosen costs consistently and exposes net reward instead of hiding the reason',()=>{
  const costly=row();costly.entry!.levels={entry:210.15,stop:208.90,target:212.65};
  expect(setupStrength(costly)).toMatchObject({label:'Weak',netRR:expect.closeTo(.49,2)});
  expect(setupStrength(costly).summary).toContain('Less than Rs. 1');
  expect(setupStrength(costly,{feePct:0,slipPct:0})).toMatchObject({label:'Strong',netRR:2});
  expect(setupStrength(costly,{feePct:NaN,slipPct:0}).label).toBe('Incomplete');
  const unrelatedPlan={...DEFAULT_PLAN,capital:0};
  expect(setupStrength(costly,unrelatedPlan)).toEqual(setupStrength(costly));
});
it('separates a negative after-cost target from a weak but profitable setup',()=>{
  const prl=row();prl.entry!.levels={entry:93.99,stop:92.51,target:94.34};
  expect(setupStrength(prl)).toMatchObject({label:'Skip',rank:0});
  expect(setupStrength(prl).reasons[0]).toBe('Skip — target does not cover costs');
  prl.entry!.targetReview!.target=null;prl.entry!.levels=null;
  expect(setupStrength(prl).label).toBe('Skip');
});
