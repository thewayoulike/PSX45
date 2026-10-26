import {describe,it,expect} from 'vitest';
import {enrichWatchlist,matchesResultGroup,scanMembership} from './resultGroups';
import {normalizeUniverse,remainingScanStocks,runMarketScan,type MarketSymbol,type ScanRow} from './scanner';
import {holdingScanSymbols} from '../../utils/scanUniverse';
import {DEFAULT_RULES} from './workflow';

const stock=(symbol:string,listedIn?:string):MarketSymbol=>({symbol,listedIn,name:symbol,sector:'Test',volume:100});

describe('scan result membership',()=>{
  it('recognizes exact index tags and Shariah indices without mistaking KSE100PR or KMI All Share for the main index',()=>{
    expect(scanMembership(stock('PPL','ALLSHR, KSE100,KMI30,KMIALLSHR'))).toEqual({kse100:true,kmi30:true,shariah:true});
    expect(scanMembership(stock('OTHER','ALLSHR,KSE100PR,KMIALLSHR'))).toEqual({kse100:false,kmi30:false,shariah:true});
    expect(scanMembership(stock('MZN','MZNPI')).shariah).toBe(true);
    expect(scanMembership(stock('FORMATTED',' kse-100, kmi-30 '))).toEqual({kse100:true,kmi30:true,shariah:true});
    expect(scanMembership(stock('UNKNOWN'))).toEqual({kse100:false,kmi30:false,shariah:false});
  });

  it('preserves source tags through normalization, scan results and retries',async()=>{
    const stocks=normalizeUniverse([stock('ppl','KSE100,KMI30'),stock('MISSING','KSE100PR')]);
    const rows:ScanRow[]=[];
    await runMarketScan({stocks,kind:'intraday',rules:DEFAULT_RULES,signal:new AbortController().signal,
      load:async symbol=>{if(symbol==='MISSING')throw new Error('Unavailable');return {symbol,bars:[],source:'test',retrievedAt:''};},
      onRow:row=>rows.push(row)});
    expect(rows.find(row=>row.symbol==='PPL')?.listedIn).toBe('KSE100,KMI30');
    expect(remainingScanStocks(stocks,rows)[0].listedIn).toBe('KSE100PR');
  });

  it('filters membership before failed-feed exceptions so unrelated failed stocks stay excluded',()=>{
    const rows:ScanRow[]=[{...stock('PPL','KSE100,KMI30'),checkedAt:1},
      {...stock('BANK','KSE100'),checkedAt:1,error:'Offline'},
      {...stock('OTHER','KSE100PR'),checkedAt:1,error:'Offline'},
      {...stock('UNKNOWN'),checkedAt:1}];
    const held=new Set(['PPL','UNKNOWN']);
    expect(rows.filter(row=>matchesResultGroup(row,'KSE100',held)).map(row=>row.symbol)).toEqual(['PPL','BANK']);
    expect(rows.filter(row=>matchesResultGroup(row,'KMI30',held)).map(row=>row.symbol)).toEqual(['PPL']);
    expect(rows.filter(row=>matchesResultGroup(row,'SHARIAH',held)).map(row=>row.symbol)).toEqual(['PPL']);
    expect(rows.filter(row=>matchesResultGroup(row,'HOLDINGS',held)).map(row=>row.symbol)).toEqual(['PPL','UNKNOWN']);
    expect(rows.filter(row=>matchesResultGroup(row,'',held))).toHaveLength(4);
    expect(rows.filter(row=>matchesResultGroup(row,'HOLDINGS',new Set()))).toEqual([]);
  });

  it('uses current positions only, removes duplicates and reflects a changed portfolio',()=>{
    const symbols=holdingScanSymbols([{ticker:' ppl ',quantity:5},{ticker:'PPL',quantity:1},
      {ticker:'SOLD',quantity:0},{ticker:'SHORT',quantity:-1},{ticker:'BROKEN',quantity:NaN}]);
    expect(symbols).toEqual(['PPL']);
    expect(matchesResultGroup(stock('PPL'),'HOLDINGS',new Set(symbols))).toBe(true);
    expect(matchesResultGroup(stock('SOLD'),'HOLDINGS',new Set(symbols))).toBe(false);
    expect(matchesResultGroup(stock('PPL'),'HOLDINGS',new Set(['OGDC']))).toBe(false);
  });

  it('enriches watchlists without adding market stocks or removing unknown watchlist symbols',()=>{
    const chosen=[stock('PPL'),stock('UNKNOWN')];
    const enriched=enrichWatchlist(chosen,[stock('PPL','KSE100,KMI30'),stock('BANK','KSE100')]);
    expect(enriched.map(row=>row.symbol)).toEqual(['PPL','UNKNOWN']);
    expect(scanMembership(enriched[0]).kmi30).toBe(true);
    expect(enriched[1].listedIn).toBeUndefined();
    expect(chosen[0].listedIn).toBeUndefined();
  });
});
