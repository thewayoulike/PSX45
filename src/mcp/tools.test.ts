import { describe, expect, it } from 'vitest';
import { portfolioGroups } from './portfolio';
import { callConnectorTool, type ConnectorSession } from './tools';
import type { AgentContext } from '../services/psxAgent';

const file = {
  portfolios: [
    { id: 's1', name: 'Trading', defaultBrokerId: 'b' },
    { id: 's2', name: 'Long term', defaultBrokerId: 'b' },
    { id: 'f1', name: 'Meezan funds', defaultBrokerId: 'b', type: 'MUTUAL_FUND' as const },
  ],
};

describe('portfolio groups', () => {
  it('covers stock and fund portfolios as separate groups when no name is given', () => {
    const groups = portfolioGroups(file);
    expect(groups.map((g) => [g.label, g.chosen.map((p) => p.id)])).toEqual([
      ['All stock portfolios (Trading, Long term)', ['s1', 's2']],
      ['Meezan funds', ['f1']],
    ]);
  });
  it('picks one portfolio by name, case-insensitively or by part of the name', () => {
    expect(portfolioGroups(file, 'meezan')[0].label).toBe('Meezan funds');
    expect(() => portfolioGroups(file, 'crypto')).toThrow(/Your portfolios: Trading, Long term, Meezan funds/);
  });
});

const holding = (ticker: string, quantity: number, price: number) =>
  ({ ticker, sector: 'X', broker: '', quantity, avgPrice: price, currentPrice: price } as AgentContext['holdings'][number]);
const ctx = (holdings: AgentContext['holdings']): AgentContext =>
  ({ holdings, stats: { totalValue: holdings.reduce((s, h) => s + h.quantity * h.currentPrice, 0) } as AgentContext['stats'], realizedTrades: [], transactions: [] });

const session = (groups: { portfolio: string; holdings: AgentContext['holdings'] }[]): ConnectorSession => ({
  plan: 'paid', sharePortfolio: true, listPortfolios: async () => [], allowBacktest: async () => true,
  loadPortfolios: async (name) => groups.filter((g) => !name || g.portfolio === name).map((g) => ({ portfolio: g.portfolio, ctx: ctx(g.holdings), unpriced: [] })),
});
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe('portfolio tools across groups', () => {
  const s = session([
    { portfolio: 'All stock portfolios', holdings: [holding('OGDC', 100, 300)] },
    { portfolio: 'Meezan funds', holdings: [holding('MF:AMMF', 1000, 50)] },
  ]);
  it('returns every group when no portfolio is named', async () => {
    const out = parse(await callConnectorTool('get_holdings', {}, s));
    expect(out.groups.map((g: any) => [g.portfolio, g.holdings[0].ticker])).toEqual([['All stock portfolios', 'OGDC'], ['Meezan funds', 'MF:AMMF']]);
    expect(out.note).toMatch(/separately/);
  });
  it('returns one group for a named portfolio', async () => {
    const out = parse(await callConnectorTool('get_holdings', { portfolio: 'Meezan funds' }, s));
    expect(out.portfolio).toBe('Meezan funds');
    expect(out.groups).toBeUndefined();
  });
  it('answers a single holding from the group that has it', async () => {
    const out = parse(await callConnectorTool('get_holding_detail', { ticker: 'MF:AMMF' }, s));
    expect(out.portfolio).toBe('Meezan funds');
    expect(out.open_position.quantity).toBe(1000);
  });
});
