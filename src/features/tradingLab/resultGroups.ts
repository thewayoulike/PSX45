import {isShariahCompliant} from '../../utils/shariah';
import type {MarketSymbol} from './scanner';

export type ResultGroup=''|'KSE100'|'KMI30'|'SHARIAH'|'HOLDINGS';
export const RESULT_GROUPS=[
  {value:'KSE100',label:'KSE-100'},
  {value:'KMI30',label:'KMI-30'},
  {value:'SHARIAH',label:'Shariah'},
  {value:'HOLDINGS',label:'My holdings'},
] as const;

/** Use the scan's Market Watch membership, never a hardcoded constituent list. */
export function scanMembership(stock:Pick<MarketSymbol,'listedIn'>){
  const tags=(stock.listedIn||'').split(',').map(tag=>tag.trim().toUpperCase().replace(/[\s-]/g,'')).filter(Boolean);
  return {kse100:tags.includes('KSE100'),kmi30:tags.includes('KMI30'),shariah:isShariahCompliant(tags)};
}

/** Membership filters also apply to failed rows; failures from other groups must not leak in. */
export function matchesResultGroup(stock:Pick<MarketSymbol,'symbol'|'listedIn'>,group:ResultGroup,holdings:ReadonlySet<string>){
  if(!group)return true;
  if(group==='HOLDINGS')return holdings.has(stock.symbol.trim().toUpperCase());
  const membership=scanMembership(stock);
  return group==='KSE100'?membership.kse100:group==='KMI30'?membership.kmi30:membership.shariah;
}

/** Keep every requested watchlist symbol even if absent from Market Watch. */
export function enrichWatchlist(stocks:MarketSymbol[],market:MarketSymbol[]):MarketSymbol[]{
  const bySymbol=new Map(market.map(stock=>[stock.symbol,stock]));
  return stocks.map(stock=>bySymbol.get(stock.symbol)||stock);
}
