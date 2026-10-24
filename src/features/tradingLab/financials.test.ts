import {describe,it,expect} from 'vitest';
import {parseLabFinancials} from './financials';
const table=(period:string,kind:string)=>`<div class="tabs__panel" data-name="${kind}"><table><tr><th></th><th>${period}</th></tr><tr><td>Total Income</td><td><span>320,648,511</span></td></tr><tr><td>Profit after Taxation</td><td>62,492,417</td></tr><tr><td>EPS</td><td>42.60</td></tr></table></div>`;
const document=(body:string)=>`<div id="financials">All numbers in thousands (000's) except EPS${body}</div><div id="ratios">`;
describe('dated PSX earnings tables',()=>{
 it('reads bank income even when no sales row exists, preserving actual periods',()=>{const result=parseLabFinancials(document(table('2025','Annual')+table('Q3 2026','Quarterly')))!;expect(result.annual.financials[0]).toEqual({year:'2025',sales:'-',totalIncome:'320,648,511',profitAfterTax:'62,492,417',eps:'42.60'});expect(result.quarterly.financials[0].year).toBe('Q3 2026');});
 it('rejects undated tables, unknown units and unrelated sections',()=>{expect(parseLabFinancials(document(table('FY','Annual')))).toBeNull();expect(parseLabFinancials(table('2025','Annual'))).toBeNull();expect(parseLabFinancials(document(table('2025','Annual')).replace('thousands (000\'s) except EPS','unit unknown'))).toBeNull();});
});
