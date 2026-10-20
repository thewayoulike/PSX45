import {describe,it,expect} from 'vitest';
import {parseInsiders,normalizeFlows,reportDate} from '../scripts/market-reports.mjs';
const html=(action='Buy',rate='315.00')=>`<table id="ContentPlaceHolder1_GridView2"><tr><td>16-Oct-2026</td><td>Example &amp; Co</td><td>Substantial Shareholder</td><td>${action}</td><td>370,000</td><td>${rate}</td><td><a href="javascript:bad()">View</a></td><td><a href="https://dps.psx.com.pk/download/document/285893.pdf">PDF</a></td></tr></table><div id="ContentPlaceHolder1_div_earnings1"></div>`;
describe('public report ingestion',()=>{
  it('calculates values from quantity and rate and keeps only trusted disclosure links',()=>{
    expect(parseInsiders(html(),{symbol:'NATF',company:'National Foods'})[0]).toMatchObject({shares:370000,price:315,value:116550000,date:'2026-10-16',sourceUrl:'https://dps.psx.com.pk/download/document/285893.pdf'});
  });
  it('preserves non-cash classification without turning zero rates into purchases',()=>{expect(parseInsiders(html('Gift In','0.00'),{symbol:'NATF',company:'National Foods'})[0]).toMatchObject({action:'Gift In',value:null});});
  it('fails closed on login/error pages, invalid dates and malformed financial values',()=>{
    expect(()=>parseInsiders('<html>Blocked</html>',{symbol:'NATF',company:'National Foods'})).toThrow();expect(()=>reportDate('31-Feb-2026')).toThrow();expect(()=>parseInsiders(html('Buy','unknown'),{symbol:'NATF',company:'National Foods'})).toThrow();
  });
  it('rejects incomplete investor flows instead of treating them as zero',()=>{expect(()=>normalizeFlows([],'2026-10-16')).toThrow();});
  it('rejects duplicate cells and sector imbalances while preserving USD-million units',()=>{
    const sectors=['Debt Market',...Array.from({length:10},(_,i)=>'Sector '+i)];
    const types=['FIPI','BANKS / DFI','INDIVIDUALS','COMPANIES','MUTUAL FUNDS'];
    const rows=sectors.flatMap(sector=>types.map((type,i)=>({FLSectorName:sector+' (mn$)',FLTypeNew:type,FLNetValueUSD:i===0?-0.4:i===1?0.4:0})));
    expect(normalizeFlows(rows,'2026-10-16').cells[0]).toEqual({sector:'Debt Market',investor:'FIPI',value:-0.4});
    expect(()=>normalizeFlows([...rows,rows[0]],'2026-10-16')).toThrow();
    expect(()=>normalizeFlows(rows.map((r,i)=>i===0?{...r,FLNetValueUSD:4}:r),'2026-10-16')).toThrow();
  });
  it('accepts a balanced sector that has no foreign-investor row',()=>{
    const sectors=['Debt Market',...Array.from({length:10},(_,i)=>'Sector '+i)];
    const types=['FIPI','BANKS / DFI','INDIVIDUALS','COMPANIES','MUTUAL FUNDS'];
    const rows=sectors.flatMap(sector=>types.map((type,i)=>({FLSectorName:sector+' (mn$)',FLTypeNew:type,FLNetValueUSD:i===0?-0.4:i===1?0.4:0})));
    const debt=[
      {FLSectorName:'Debt Market (mn$)',FLTypeNew:'BANKS / DFI',FLNetValueUSD:'38.024251'},
      {FLSectorName:'Debt Market (mn$)',FLTypeNew:'COMPANIES',FLNetValueUSD:'0.609586'},
      {FLSectorName:'Debt Market (mn$)',FLTypeNew:'MUTUAL FUNDS',FLNetValueUSD:'-38.633839'},
    ];
    const report=normalizeFlows([...rows.filter(r=>!r.FLSectorName.startsWith('Debt Market')),...debt],'2026-10-20');
    expect(report.cells.filter(c=>c.sector==='Debt Market').map(c=>c.investor)).toEqual(['BANKS / DFI','COMPANIES','MUTUAL FUNDS']);
    expect(()=>normalizeFlows([...rows.filter(r=>!r.FLSectorName.startsWith('Debt Market')),...debt.map((r,i)=>i===0?{...r,FLNetValueUSD:'40'}:r)],'2026-10-20')).toThrow('Unbalanced flow sector: Debt Market');
  });
});
