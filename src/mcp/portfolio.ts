// Builds the assistant's portfolio context from the user's saved PSX Tracker file, with the
// same engine the app uses. Only trades, portfolios and price fields are read from the file.
import type { Portfolio, Transaction } from '../types';
import type { AgentContext } from '../services/psxAgent';
import type { MutualFundRecord } from '../services/mufapData';
import { computeHoldings, computePortfolioStats, getPortfolioType } from '../utils/portfolioEngine';
import { firstEntitledTickers } from '../utils/freemiumEntitlements';
import { isFundTicker } from '../utils/fundId';

export interface SavedPortfolioFile {
  transactions?: Transaction[];
  portfolios?: Portfolio[];
  sectorOverrides?: Record<string, string>;
  fundCatalog?: Record<string, MutualFundRecord>;
  manualPrices?: Record<string, number>;
  ldcpMap?: Record<string, number>;
  priceTimestamps?: Record<string, string>;
}

export interface LiveQuote { price: number; ldcp: number }
export interface PriceSource {
  stocks: (tickers: string[]) => Promise<Record<string, LiveQuote>>;
  funds: () => Promise<Record<string, MutualFundRecord>>;
}

export interface EntitlementLimits { stockTickers: number; fundTickers: number }

export interface LoadedPortfolio { ctx: AgentContext; portfolio: string; priced: number; unpriced: string[] }

export function listSavedPortfolios(file: SavedPortfolioFile) {
  const txs = Array.isArray(file.transactions) ? file.transactions : [];
  return (Array.isArray(file.portfolios) ? file.portfolios : []).map((p) => ({
    name: p.name,
    type: getPortfolioType(p) === 'MUTUAL_FUND' ? 'Mutual funds' : 'PSX stocks',
    transactions: txs.filter((t) => t.portfolioId === p.id).length,
  }));
}

/** One named portfolio, or every PSX stock portfolio combined (the app's combined view). */
export function selectPortfolios(file: SavedPortfolioFile, name?: string): { chosen: Portfolio[]; label: string } {
  const all = Array.isArray(file.portfolios) ? file.portfolios : [];
  if (!all.length) throw new Error('No portfolios were found in your PSX Tracker file.');
  if (name && name.trim()) {
    const wanted = name.trim().toLowerCase();
    const match = all.find((p) => p.name.trim().toLowerCase() === wanted) || all.find((p) => p.name.toLowerCase().includes(wanted));
    if (!match) throw new Error(`No portfolio called "${name}". Your portfolios: ${all.map((p) => p.name).join(', ')}.`);
    return { chosen: [match], label: match.name };
  }
  const stocks = all.filter((p) => getPortfolioType(p) !== 'MUTUAL_FUND');
  const chosen = stocks.length ? stocks : [all[0]];
  return { chosen, label: chosen.length === 1 ? chosen[0].name : `All stock portfolios (${chosen.map((p) => p.name).join(', ')})` };
}

export async function loadPortfolioContext(
  file: SavedPortfolioFile,
  prices: PriceSource,
  opts: { name?: string; limits?: EntitlementLimits | null } = {},
): Promise<LoadedPortfolio> {
  const { chosen, label } = selectPortfolios(file, opts.name);
  const ids = new Set(chosen.map((p) => p.id));
  let transactions = (Array.isArray(file.transactions) ? file.transactions : []).filter((t) => ids.has(t.portfolioId));
  // Free plan: the same first-N tickers the app shows.
  if (opts.limits) {
    const allowed = new Set([
      ...firstEntitledTickers(transactions.filter((t) => t.ticker && !isFundTicker(t.ticker)), opts.limits.stockTickers),
      ...firstEntitledTickers(transactions.filter((t) => t.ticker && isFundTicker(t.ticker)), opts.limits.fundTickers),
    ]);
    transactions = transactions.filter((t) => !(t.ticker || '').trim() || allowed.has(t.ticker.trim().toUpperCase()));
  }

  const portfolios = file.portfolios || [];
  const sectorOverrides = file.sectorOverrides || {};
  const tickers = [...new Set(transactions.map((t) => (t.ticker || '').trim().toUpperCase()).filter(Boolean))];
  const stockTickers = tickers.filter((t) => !isFundTicker(t));
  const hasFunds = tickers.some(isFundTicker);
  const [quotes, liveFunds] = await Promise.all([
    stockTickers.length ? prices.stocks(stockTickers).catch(() => ({} as Record<string, LiveQuote>)) : Promise.resolve({} as Record<string, LiveQuote>),
    hasFunds ? prices.funds().catch(() => ({} as Record<string, MutualFundRecord>)) : Promise.resolve({} as Record<string, MutualFundRecord>),
  ]);
  const fundCatalog = { ...(file.fundCatalog || {}), ...liveFunds };

  // Live quotes first; the prices saved with the file are the fallback.
  const now = new Date().toISOString();
  const manualPrices: Record<string, number> = {};
  const ldcpMap: Record<string, number> = {};
  const priceTimestamps: Record<string, string> = {};
  const unpriced: string[] = [];
  for (const t of tickers) {
    const live = isFundTicker(t) ? fundCatalog[t]?.nav : quotes[t]?.price;
    const saved = file.manualPrices?.[t];
    if (live && live > 0) { manualPrices[t] = live; priceTimestamps[t] = now; }
    else if (saved && saved > 0) { manualPrices[t] = saved; if (file.priceTimestamps?.[t]) priceTimestamps[t] = file.priceTimestamps[t]; }
    else unpriced.push(t);
    const prev = isFundTicker(t) ? fundCatalog[t]?.prevNav : quotes[t]?.ldcp;
    if (prev && prev > 0) ldcpMap[t] = prev;
    else if (file.ldcpMap?.[t]) ldcpMap[t] = file.ldcpMap[t];
  }

  const currentPortfolioId = chosen[0].id;
  const { holdings, realizedTrades } = computeHoldings({ portfolioTransactions: transactions, fundCatalog, sectorOverrides, portfolios, currentPortfolioId, manualPrices, priceTimestamps });
  const stats = computePortfolioStats({
    holdings, realizedTrades, portfolioTransactions: transactions, ldcpMap, manualPrices, priceTimestamps,
    marketSessionDate: null, fundNavDayMap: {}, fundCatalog, portfolios, currentPortfolioId,
    isCombinedView: chosen.length > 1, combinedPortfolioIds: ids,
  });
  return { ctx: { holdings, stats, realizedTrades, transactions }, portfolio: label, priced: tickers.length - unpriced.length, unpriced };
}
