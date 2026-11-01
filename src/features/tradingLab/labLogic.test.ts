import {describe,expect,it,vi} from 'vitest';
import {DEFAULT_PLAN,intradaySegments,netReturn,sizePlan,standardSessions,type Bar} from './engine';
import {DEFAULT_RULES,checkEntry,exitLevels,replayRules,slotVolume,wilson} from './workflow';
import {setupStrength} from './strength';
import {intradayScan,type ScanRow} from './scanner';
import {createLabMonitor,monitorDue,observedAlerts} from './monitor';

const at=(day:string,time:string)=>Date.parse(`${day}T${time}:00+05:00`);
const bar=(time:number,close=100,volume:number|null=100):Bar=>({time,open:close,high:close+1,low:close-1,close,volume});
function session(day:string,index=0,close=100){const s=standardSessions(day)[index],first=Math.ceil(s.start/300000)*300000;return Array.from({length:(s.end-first)/300000},(_,i)=>bar(first+i*300000,close));}

describe('PSX trading costs',()=>{
  it('charges at least a broker minimum and one tick per share, so cheap stocks are not mis-rated',()=>{
    // KEL-style: entry 2.50, stop 2.45, target 2.60. Percentage costs alone suggested about 1.3R.
    const kel=sizePlan({...DEFAULT_PLAN,symbol:'KEL',entry:2.5,stop:2.45,target:2.6});
    expect(kel.rr).toBeLessThan(0.3);
    // At normal prices the floors are not binding: Rs 100 trades cost the same as before.
    expect(netReturn(100,110,0.2,0.1)).toBeCloseTo(110*0.999*0.998-100*1.001*1.002,6);
  });
  it('default costs match the PSX fee schedule: about 0.38% for a same-price round trip at Rs 200',()=>{
    const pct=-netReturn(200,200,DEFAULT_PLAN.feePct,DEFAULT_PLAN.slipPct)/200*100;
    expect(pct).toBeGreaterThan(0.33);expect(pct).toBeLessThan(0.45);
  });
  it('turning fees and slippage off removes their floors too',()=>{
    expect(netReturn(2.5,2.6,0,0)).toBeCloseTo(0.1,9);
  });
  it('shows the loss if price gaps to the daily lower limit and warns when it is large',()=>{
    const sized=sizePlan({...DEFAULT_PLAN,entry:100,stop:99,target:104,feePct:0,slipPct:0},{worstExit:90});
    expect(sized.gapLoss).toBeGreaterThan(sized.loss*5);
    expect(sized.warnings.some(w=>w.includes('daily lower limit'))).toBe(true);
  });
});

describe('entry rules',()=>{
  const day='2026-10-22';
  it('a custom level must be crossed, not merely be below the price all day',()=>{
    const bars=session(day,0,110);const s=intradaySegments(bars,at('2026-10-24','12:00'))[0];
    expect(checkEntry(s,{...DEFAULT_RULES,entryMode:'level',level:100},at('2026-10-24','12:00')).trigger).toBeNull();
    const dip=session(day,0,99);dip[5]=bar(dip[5].time,102);const crossed=intradaySegments(dip,at('2026-10-24','12:00'))[0];
    expect(checkEntry(crossed,{...DEFAULT_RULES,entryMode:'level',level:100},at('2026-10-24','12:00')).index).toBe(5);
  });
  it('compares breakout volume with the same time of day on earlier sessions when known',()=>{
    const days=['2026-10-19','2026-10-20','2026-10-21','2026-10-22'];
    const segs=intradaySegments(days.flatMap(d=>session(d)),at('2026-10-24','12:00'));
    // Earlier days: the 4th candle normally trades 300 shares. Today it trades 450 and breaks out.
    segs.slice(0,3).forEach(s=>{s.bars[3].volume=300;});
    const today=segs[3];today.bars[3]={...bar(today.bars[3].time,102),volume:450};
    expect(slotVolume(segs.slice(0,3),3)).toBe(300);
    const check=checkEntry(today,{...DEFAULT_RULES,volumeX:1.5},at('2026-10-24','12:00'),segs.slice(0,3));
    expect(check.volumeRatio).toBeCloseTo(1.5);expect(check.volumeBasis).toBe('time-of-day');
  });
  it('lets an ATR stop work early in the day using earlier sessions, never later candles',()=>{
    const prior=session('2026-10-21'),today=session('2026-10-22');today[3]=bar(today[3].time,102);
    const s=intradaySegments([...prior,...today],at('2026-10-24','12:00')).at(-1)!;
    const levels=exitLevels(102,s,3,{...DEFAULT_RULES,stopMode:'atr',stopValue:1},0,{intraday:[...prior,...today]});
    expect(levels.atr.count).toBe(14);expect(levels.stop).toBeLessThan(102);
    expect(()=>exitLevels(102,s,3,{...DEFAULT_RULES,stopMode:'atr'},0,{intraday:today})).toThrow('14 earlier');
  });
});

describe('replay statistics',()=>{
  it('fills at the next candle open and reports wins with a confidence range',()=>{
    const bars=session('2026-10-22');bars[3]=bar(bars[3].time,102);bars[4]={...bar(bars[4].time,103),open:102.5};
    const result=replayRules(bars,{...DEFAULT_PLAN,entry:102,stop:99,target:110,feePct:0,slipPct:0},DEFAULT_RULES,at('2026-10-24','12:00'));
    expect(result.trades[0].entry).toBe(102.5);
    expect(result.wins+result.trades.filter(t=>t.netR<=0).length).toBe(result.trades.length);
    expect(result.winRange).not.toBeNull();
  });
  it('the 95% win-rate range is wide for small samples and narrows with more trades',()=>{
    const small=wilson(3,5),large=wilson(60,100);
    expect(small.high-small.low).toBeGreaterThan(0.5);expect(large.high-large.low).toBeLessThan(0.2);
  });
});

describe('scanner quality',()=>{
  it('does not depend on the capital setting: a Rs 26,000 stock can still pass every check',()=>{
    const day='2026-10-22',bars=session(day,0,26000).map(b=>({...b,high:b.close+50,low:b.close-50}));
    bars[3]={...bar(bars[3].time,26100,500),high:26120,low:26050};
    const entry=intradayScan(bars,DEFAULT_RULES,at(day,'15:00'));
    expect(entry.check?.trigger).toBeTruthy();
    const row={symbol:'UPFL',name:'UPFL',sector:'',volume:1,checkedAt:at(day,'15:00'),entry:{...entry,levels:{entry:26100,stop:25800,target:26700}}} as ScanRow;
    expect(setupStrength(row).summary).not.toBe('Cost and sizing checks could not be completed.');
  });
});

describe('monitor',()=>{
  const day='2026-10-22';
  it('reports a stop touched by a candle that an earlier late refresh skipped',()=>{
    const bars=session(day);bars[3]=bar(bars[3].time,102);
    bars[4]={...bar(bars[4].time,100),low:99.3};bars[5]={...bar(bars[5].time,100),low:99.9};
    const plan={...DEFAULT_PLAN,symbol:'HBL',entry:102,stop:99.5,target:110};
    const alerts=observedAlerts({symbol:'HBL',bars,source:'t',retrievedAt:''},plan,DEFAULT_RULES,at(day,'09:40'),at(day,'10:06'));
    expect(alerts.some(a=>a.id.includes('stop:'))).toBe(true);
  });
  it('limits how many stocks are watched and refreshes only when a new candle is due',()=>{
    const m=createLabMonitor({load:vi.fn(),visible:()=>true,maxItems:1});
    m.start({...DEFAULT_PLAN,symbol:'HBL'},DEFAULT_RULES);
    expect(()=>m.start({...DEFAULT_PLAN,symbol:'OGDC'},DEFAULT_RULES)).toThrow('up to 1 stock');
    const t=at(day,'10:00');
    expect(monitorDue({refreshedAt:null,candleAt:null},t)).toBe(true);
    expect(monitorDue({refreshedAt:t,candleAt:t},t+90_000)).toBe(false);
    expect(monitorDue({refreshedAt:t,candleAt:t},t+330_000)).toBe(true);
  });
});
