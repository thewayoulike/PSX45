import {describe,it,expect} from 'vitest';
import {DEFAULT_PLAN,intradaySegments,standardSessions,dailyScan,type Bar} from './engine';
import {DEFAULT_RULES,DEFAULT_RISK,checkEntry,exitLevels,riskReview,simulateRules,replayRules,parseWorkflow} from './workflow';
import {mergeLabs,parseLab,type LabBook} from './storage';
import {observedAlerts} from './useLabMonitor';
import {annualChanges,matchHeadlines,catalystTags} from './research';
const at=(day:string,time:string)=>Date.parse(`${day}T${time}:00+05:00`),now=at('2026-10-24','12:00');
const bar=(time:number,close=100):Bar=>({time,open:close,high:close+1,low:close-1,close,volume:100});
function session(day:string,index=0){const s=standardSessions(day)[index],first=Math.ceil(s.start/300000)*300000;return Array.from({length:(s.end-first)/300000},(_,i)=>bar(first+i*300000));}
function segment(){const bars=session('2026-10-22');bars[3]=bar(bars[3].time,102);return intradaySegments(bars,now)[0];}
const plan={...DEFAULT_PLAN,entry:102,stop:99,target:110,feePct:0,slipPct:0};
describe('upstream daily scanner parity',()=>{
 it('matches a >10% run followed by a tight five-close flag',()=>{const closes=Array(25).fill(100);closes.fill(112,19);const rows=closes.map((c,i)=>bar(Date.UTC(2026,8,i+1),c));expect(dailyScan(rows,now).setups).toContain('Bull flag');rows[24]=bar(rows[24].time,120);expect(dailyScan(rows,now).setups).not.toContain('Bull flag');});
 it('distinguishes an oversold bounce from crossing RSI 30',()=>{const rows=Array.from({length:30},(_,i)=>bar(Date.UTC(2026,8,i+1),200-i*3));rows[29]=bar(rows[29].time,rows[28].close+.1);const scan=dailyScan(rows,now);expect(scan.setups).toContain('Oversold bounce');expect(scan.setups).not.toContain('RSI recovery');});
});
describe('entry and exit rules',()=>{
 it('requires close, volume confirmation and entry window together',()=>{const s=segment();expect(checkEntry(s,DEFAULT_RULES,now).index).toBe(3);expect(checkEntry(s,{...DEFAULT_RULES,volumeX:2},now).state).toBe('expired');s.bars[3].volume=200;expect(checkEntry(s,{...DEFAULT_RULES,volumeX:2},now).index).toBe(3);expect(checkEntry(s,{...DEFAULT_RULES,entryMinutes:20},now).state).toBe('expired');});
 it('supports custom levels and waits before the deadline',()=>{const s=segment();expect(checkEntry(s,{...DEFAULT_RULES,entryMode:'level',level:103},at(s.day,'10:00')).state).toBe('waiting');expect(checkEntry(s,{...DEFAULT_RULES,entryMode:'level',level:103},now).state).toBe('expired');});
 it('does not skip a qualifying candle with missing volume',()=>{const s=segment();s.bars[3].volume=null;s.bars[4]=bar(s.bars[4].time,105);expect(checkEntry(s,{...DEFAULT_RULES,volumeX:1},now).state).toBe('incomplete');});
 it('does not infer confirmation after a data gap or before candle completion',()=>{const s=segment();expect(checkEntry(s,DEFAULT_RULES,at(s.day,'09:52')).trigger).toBeNull();s.bars.splice(3,1);s.bars[3]=bar(s.bars[3].time,105);expect(checkEntry(s,DEFAULT_RULES,now).state).toBe('incomplete');});
 it('does not report no match when the feed ends before the entry cutoff',()=>{
  const s=segment();s.bars=s.bars.slice(0,3);
  expect(checkEntry(s,DEFAULT_RULES,at(s.day,'11:10')).state).toBe('incomplete');
  expect(checkEntry(s,DEFAULT_RULES,at(s.day,'09:52')).state).toBe('waiting');
 });
 it('needs only completed slots through a cutoff that falls between candles',()=>{
  const s=segment();s.bars=s.bars.slice(0,5).map(b=>({...b,close:100}));
  const rules={...DEFAULT_RULES,entryMinutes:30}; // 10:02 cutoff, last eligible close 10:00
  expect(checkEntry(s,rules,at(s.day,'10:03')).state).toBe('expired');
  s.bars.pop();expect(checkEntry(s,rules,at(s.day,'10:03')).state).toBe('incomplete');
 });
 it('builds midpoint, percentage and manual stops with R targets',()=>{const s=segment();expect(exitLevels(102,s,3,{...DEFAULT_RULES,stopMode:'range-mid'},99).stop).toBe(100);expect(exitLevels(100,s,3,{...DEFAULT_RULES,stopMode:'percent',stopValue:2},99)).toMatchObject({stop:98,target:104});expect(exitLevels(102,s,3,{...DEFAULT_RULES,stopMode:'manual'},98)).toMatchObject({stop:98,target:110});});
 it('never uses future candles to complete ATR history',()=>{const s=segment(),r={...DEFAULT_RULES,stopMode:'atr' as const};expect(()=>exitLevels(102,s,3,r,99)).toThrow('14 true ranges');expect(exitLevels(102,s,14,r,99).stop).toBeLessThan(102);});
 it('rejects unsafe or non-finite configurations',()=>{expect(()=>parseWorkflow({rules:{...DEFAULT_RULES,jitter:NaN},risk:DEFAULT_RISK})).toThrow();expect(()=>exitLevels(100,null,2,{...DEFAULT_RULES,stopMode:'percent',stopValue:110},99)).toThrow('positive');});
});
describe('session risk gate and immutable Drive snapshots',()=>{
 it('enforces cash buffer, cumulative risk, counts, duplicate symbols and blocks',()=>{const checks=riskReview(plan,{...DEFAULT_RISK,cash:100,cashBuffer:50,lossSoFar:2500,reservedRisk:500,trades:3,heldSymbols:'hbl',blockedSymbols:'HBL',maxOrder:100});expect(checks.ready).toBe(false);expect(checks.blocks).toHaveLength(6);});
 it('does not approve low after-cost reward/risk',()=>{expect(riskReview({...plan,target:103},DEFAULT_RISK).blocks.some(s=>s.includes('reward/risk'))).toBe(true);});
 it('retains settings across merges and accepts legacy plans without them',()=>{const old={id:'old',createdAt:'2026-10-20T12:00:00Z',plan,quantity:10,sourceDate:'2026-10-20',note:''};const book:LabBook={watchlist:'HBL',tickets:[old,{...old,id:'new',workflow:{rules:DEFAULT_RULES,risk:DEFAULT_RISK}}]};const result=mergeLabs(book,{watchlist:'HBL',tickets:[]});expect(result.tickets.find(t=>t.id==='new')?.workflow).toEqual({rules:DEFAULT_RULES,risk:DEFAULT_RISK});expect(result.tickets.find(t=>t.id==='old')?.workflow).toBeUndefined();});
 it('fails closed on corrupt stored settings',()=>{expect(()=>parseLab({watchlist:'HBL',tickets:[{id:'bad',createdAt:'2026-10-20',plan,quantity:10,sourceDate:'2026-10-20',note:'',workflow:{rules:DEFAULT_RULES,risk:{...DEFAULT_RISK,cash:-1}}}]})).toThrow();});
});
describe('replay timing and sampled outcomes',()=>{
 const bars=['2026-10-02','2026-10-09','2026-10-16','2026-10-23'].flatMap(d=>session(d,1));
 it('uses selected entry slot and flat-by with complete earlier family sessions',()=>{const r={...DEFAULT_RULES,entryIndex:8,flatMinutes:10,jitter:0},a=simulateRules(bars,plan,r,now,100);expect(a.sessions).toBe(3);expect(a.entryTime).toBe(at('2026-10-23','15:20'));expect(a.flatBy).toBe(at('2026-10-23','16:20'));expect(a.barsPerPath).toBe(12);expect(a.histogram.reduce((n,b)=>n+b.count,0)).toBe(100);expect(a.fan).toHaveLength(13);expect(a).toEqual(simulateRules(bars,plan,r,now,100));});
 it('respects configured sample minimum and rejects entry after flat-by',()=>{expect(()=>simulateRules(bars,plan,{...DEFAULT_RULES,minimumSessions:20},now,10)).toThrow('Need 20');expect(()=>simulateRules(bars,plan,{...DEFAULT_RULES,entryIndex:24},now,10)).toThrow('leaves time');});
 it('replays selected rules without entry-candle lookahead and closes at flat-by',()=>{const s=segment();s.bars[3]={...s.bars[3],low:97};for(let i=4;i<s.bars.length;i++)s.bars[i]=bar(s.bars[i].time,102);const result=replayRules(s.bars,plan,{...DEFAULT_RULES,flatMinutes:10},now);expect(result.trades).toHaveLength(1);expect(result.trades[0].outcome).toBe('close');expect(result.trades[0].time+300000).toBe(at(s.day,'15:20'));});
 it('reports skipped ATR entries instead of borrowing later history',()=>{const s=segment();const result=replayRules(s.bars,plan,{...DEFAULT_RULES,stopMode:'atr'},now);expect(result.skipped).toBe(1);expect(result.trades).toHaveLength(0);});
});
describe('observed notices and research integrity',()=>{
 it('never reports old, pre-monitor or forming candles as live alerts',()=>{const s=segment(),data={symbol:'HBL',bars:s.bars,source:'test',retrievedAt:''};expect(observedAlerts(data,plan,DEFAULT_RULES,now,now)).toEqual([]);const t=at(s.day,'09:55');expect(observedAlerts(data,plan,DEFAULT_RULES,t+1000,t+2000)).toEqual([]);expect(observedAlerts(data,plan,DEFAULT_RULES,at(s.day,'09:49'),at(s.day,'09:52'))).not.toContainEqual(expect.objectContaining({text:expect.stringContaining('entry rules')}));expect(observedAlerts(data,plan,DEFAULT_RULES,at(s.day,'09:49'),t).some(a=>a.text.includes('entry rules'))).toBe(true);});
 it('uses whole-word headline matches and literal user text',()=>{const items=['HBL profit grows','THBL results','Habib Bank dividend'].map((title,i)=>({id:String(i),title,url:'https://example.com',source:'test',indexedAt:''}));expect(matchHeadlines(items,'HBL, Habib Bank')).toHaveLength(2);expect(matchHeadlines(items,'[')).toHaveLength(0);expect(catalystTags(items[2].title)).toEqual(['Payout']);});
 it('compares only adjacent annual periods and does not give misleading growth for losses',()=>{const row=(year:string,eps:string)=>({year,eps,sales:'-',profitAfterTax:'-',totalIncome:'-'});expect(annualChanges([row('2026','2'),row('2025','(1)')])[0]).toMatchObject({previous:-1,current:2,changePct:null});expect(annualChanges([row('Q1 2026','2'),row('Q4 2025','1')])).toEqual([]);expect(annualChanges([row('2026','2'),row('2024','1')])).toEqual([]);});
});


describe('monitoring before an automatic plan is available',()=>{
 it('still reports entries without inventing stop or target alerts',()=>{
  const s=segment(),data={symbol:'HBL',bars:s.bars,source:'test',retrievedAt:''};
  const notices=observedAlerts(data,{...plan,entry:0,stop:0,target:0},DEFAULT_RULES,at(s.day,'09:49'),at(s.day,'09:55'));
  expect(notices.some(a=>a.text.includes('entry rules'))).toBe(true);
  expect(notices.some(a=>a.text.includes('test stop')||a.text.includes('test target'))).toBe(false);
 });
 it('only watches levels belonging to the selected stock',()=>{
  const s=segment(),data={symbol:'HBL',bars:s.bars,source:'test',retrievedAt:''};
  expect(observedAlerts(data,{...plan,symbol:'OGDC'},DEFAULT_RULES,at(s.day,'09:49'),at(s.day,'09:55'))).toEqual([]);
 });
});
