// Server entry for the PSX Tracker connector. Bundled by scripts/build-mcp.mjs into
// lib/generated/psx-mcp.mjs for the Vercel function; never loaded in the browser.
import { DOMParser, parseHTML } from 'linkedom';
import { handleMcpBody } from './protocol';
import { CONNECTOR_INSTRUCTIONS, callConnectorTool, connectorTools, type ConnectorSession } from './tools';
import { listSavedPortfolios, loadPortfolioContext, type EntitlementLimits, type PriceSource, type SavedPortfolioFile } from './portfolio';
import { fetchBatchPSXPrices } from '../services/psxData';
import type { MutualFundRecord } from '../services/mufapData';

export type AppFetch = (path: string, init?: RequestInit) => Promise<Response>;

let installed = false;
/** Browser APIs the shared services use, and app-relative URLs answered by the app's own handlers. */
export function installServerEnvironment(appFetch: AppFetch) {
  if (installed) return;
  installed = true;
  const g = globalThis as any;
  if (!g.DOMParser) g.DOMParser = DOMParser;
  // Market tables are read through an inert <template>, as in the browser.
  if (!g.document) g.document = parseHTML('<!doctype html><html><head></head><body></body></html>').document;
  if (!g.localStorage) {
    const store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
  }
  const realFetch = g.fetch.bind(g);
  g.fetch = (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    return typeof url === 'string' && url.startsWith('/') ? appFetch(url, init) : realFetch(input, init);
  };
}

export const priceSource = (appFetch: AppFetch): PriceSource => ({
  stocks: async (tickers) => {
    const quotes = await fetchBatchPSXPrices(tickers);
    return Object.fromEntries(Object.entries(quotes).map(([t, q]) => [t, { price: q.price, ldcp: q.ldcp }]));
  },
  funds: async () => {
    const res = await appFetch('/api/fund-nav');
    if (!res.ok) return {};
    const raw = await res.json();
    return (raw?.catalog || {}) as Record<string, MutualFundRecord>;
  },
});

export interface ConnectorRequest {
  body: unknown;
  plan: string;
  sharePortfolio: boolean;
  /** Free-plan ticker limits, or null for full access. */
  limits: EntitlementLimits | null;
  /** Reads the user's saved portfolio file; called only when a tool needs it. */
  readPortfolioFile: () => Promise<SavedPortfolioFile>;
  allowBacktest: () => Promise<boolean>;
  appFetch: AppFetch;
}

export async function handleConnectorRequest(req: ConnectorRequest) {
  installServerEnvironment(req.appFetch);
  let file: Promise<SavedPortfolioFile> | null = null;
  const readFile = () => (file ||= req.readPortfolioFile());
  const prices = priceSource(req.appFetch);
  const session: ConnectorSession = {
    plan: req.plan,
    sharePortfolio: req.sharePortfolio,
    listPortfolios: async () => listSavedPortfolios(await readFile()),
    loadPortfolio: async (name) => loadPortfolioContext(await readFile(), prices, { name, limits: req.limits }),
    allowBacktest: req.allowBacktest,
  };
  return handleMcpBody(req.body, {
    instructions: CONNECTOR_INSTRUCTIONS,
    listTools: connectorTools,
    callTool: (name, args) => callConnectorTool(name, args, session),
  });
}
