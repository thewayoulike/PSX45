import { describe, expect, it } from 'vitest';
import { selectTopMovers } from './topMovers';

const row = (
  ticker: string,
  listedIn: string,
  change: number,
) => ({ ticker, listedIn, price: 100, ldcp: 100 / (1 + change / 100), change, volume: 1, high: 0, low: 0 });

describe('top movers', () => {
  it('ranks the live KSE-100 tag and leaves out names that only used to be in the index', () => {
    const gainers = selectTopMovers([
      row('FEROZ', 'ALLSHR', 9.67),
      row('SSOM', 'ALLSHR,KSE100,KSE100PR', 10),
      row('LOTCHEM', 'KSE100', 5.48),
      row('POWERPS', 'KSE100PR', 10),
    ], 'KSE100', 'gainers');
    expect(gainers.map(item => item.ticker)).toEqual(['SSOM', 'LOTCHEM']);
  });

  it('does not treat KMIALLSHR as KMI-30', () => {
    const gainers = selectTopMovers([
      row('NRL', 'KMI30,KSE100', 2.14),
      row('TISL', 'ALLSHR,KMIALLSHR', 5.46),
    ], 'KMI30', 'gainers');
    expect(gainers.map(item => item.ticker)).toEqual(['NRL']);
  });

  it('still shows a saved list from before index tags were stored', () => {
    const gainers = selectTopMovers([
      { ticker: 'OGDC', price: 1, change: 1, volume: 0, high: 0, low: 0 },
      { ticker: 'PPL', price: 1, change: 2, volume: 0, high: 0, low: 0 },
    ], 'KSE100', 'gainers');
    expect(gainers.map(item => item.ticker)).toEqual(['PPL', 'OGDC']);
  });

  it('sorts losers from the biggest drop', () => {
    const losers = selectTopMovers([
      row('PGLC', 'KSE100', -3.79),
      row('AIRLINK', 'KSE100', -2.95),
      row('NETSOL', 'ALLSHR', -3.13),
    ], 'KSE100', 'losers');
    expect(losers.map(item => item.ticker)).toEqual(['PGLC', 'AIRLINK']);
  });
});
