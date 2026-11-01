import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({announcements:vi.fn(),meetings:vi.fn()}));
vi.mock('../../services/financials',()=>({fetchCompanyAnnouncements:mocks.announcements,fetchBoardMeetings:mocks.meetings}));
import {loadStockEvents,eventsNear,eventOnDay,relativeDay} from './events';
import {setLabRequestInterval,LAB_REQUEST_INTERVAL_MS} from './labBudget';
beforeEach(()=>setLabRequestInterval(0));
afterEach(()=>setLabRequestInterval(LAB_REQUEST_INTERVAL_MS));

it('collects results, dividends, board meetings and ex-dates, and survives a failed source',async()=>{
  mocks.announcements.mockResolvedValue([
    {ticker:'HBL',date:'Oct 22, 2026',ts:Date.parse('2026-10-22T10:00:00+05:00'),title:'Financial Results',pdfUrl:'',kind:'Result'},
    {ticker:'HBL',date:'Oct 1, 2026',ts:Date.parse('2026-10-01T10:00:00+05:00'),title:'Misc',pdfUrl:'',kind:'Other'},
  ]);
  mocks.meetings.mockResolvedValue([{ticker:'HBL',name:'',sector:'',date:new Date(2026,10,3),time:'',place:'',quarter:'Q3',daysTo:3},{ticker:'OGDC',date:new Date(2026,10,4)}]);
  const events=await loadStockEvents('HBL',async()=>({dividendHistory:[{exDividendDate:'2026-10-28'}]}));
  expect(events.map(e=>`${e.day} ${e.kind}`)).toEqual(['2026-10-22 results','2026-10-28 ex-date','2026-11-03 board']);
  mocks.meetings.mockRejectedValue(new Error('sheet down'));
  expect((await loadStockEvents('HBL',async()=>{throw new Error('down');})).map(e=>e.kind)).toEqual(['results']);
});
it('finds events near a day and flags trades on or right after an event day',()=>{
  const events=[{day:'2026-10-22',kind:'results' as const,label:'Results'},{day:'2026-11-20',kind:'board' as const,label:'Board'}];
  expect(eventsNear(events,'2026-10-24').map(e=>e.day)).toEqual(['2026-10-22']);
  expect(eventOnDay(events,'2026-10-23')?.label).toBe('Results');
  expect(eventOnDay(events,'2026-10-26')).toBeNull();
  expect(relativeDay('2026-10-24','2026-10-25')).toBe('tomorrow');
});
