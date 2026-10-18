import {describe,it,expect} from 'vitest';
import {insiderStart,insiderTotals,insiderMonths,type InsiderRecord} from './marketReports';
const row=(action:string,value:number|null,symbol='NATF'):InsiderRecord=>({id:action,symbol,company:symbol,date:'2026-10-16',person:'Public shareholder',role:'Director',action,shares:100,price:10,value,sourceUrl:'https://dps.psx.com.pk/'});
describe('insider report calculations',()=>{
  it('keeps gifts, transfers and unpriced trades out of ranked purchases and sales',()=>{
    const t=insiderTotals([row('Buy',1000),row('Sell',400),row('Gift In',9000),row('Other-In',8000),row('Buy',null)]);
    expect(t).toMatchObject({buy:1000,sell:400,buyCount:1,sellCount:1,other:2,unpriced:1});expect(t.buyers[0].buy).toBe(1000);
  });
  it('uses calendar windows and clamps a month ending on the 31st',()=>{
    expect(insiderStart('2026-03-31','month')).toBe('2026-02-28');expect(insiderStart('2026-01-03','week')).toBe('2025-12-28');expect(insiderStart('2026-10-18','year')).toBe('2026-01-01');
  });
  it('keeps one scale and twelve months across the year boundary',()=>{
    const months=insiderMonths({updatedAt:'',asOf:'2026-10-18',sourceUrl:'',coverage:'partial',companies:1,checked:1,failed:[],records:[row('Buy',1000)]});
    expect(months).toHaveLength(12);expect(months[0].month).toBe('2025-11');expect(months.at(-1)).toMatchObject({month:'2026-10',buy:1000,sell:0});
  });
});
