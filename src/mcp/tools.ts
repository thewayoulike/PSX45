// The in-app assistant's tools, offered to Claude, ChatGPT and Cursor. Results come from the
// same executeTool the app uses, so answers match what users see in PSX Tracker.
import { executeTool, functionDeclarations, type AgentContext } from '../services/psxAgent';
import { toolResult, type McpTool, type McpToolResult } from './protocol';

/** Tools that read the user's own portfolio. */
export const PORTFOLIO_TOOLS = new Set(['get_portfolio_summary', 'get_holdings', 'get_holding_detail', 'get_realized_performance']);
/** Free plan: one of these a day. */
export const BACKTEST_TOOLS = new Set(['run_strategy_backtest', 'compare_strategies']);
/** Needs the app's own saved scan, which only exists on the user's device. */
const APP_ONLY_TOOLS = new Set(['get_daily_scan']);

const TITLES: Record<string, string> = {
  get_portfolio_summary: 'Portfolio summary', get_holdings: 'Holdings', get_holding_detail: 'One holding in detail',
  get_realized_performance: 'Realised gains', get_live_price: 'Live PSX prices', get_technical_analysis: 'Technical analysis',
  get_price_history: 'Price history', get_index_performance: 'KSE-100 and KMI-30', get_upcoming_dividends: 'Dividends',
  get_company_fundamentals: 'Company results', get_market_movers: 'Most active stocks', run_strategy_backtest: 'Strategy backtest',
  compare_strategies: 'Compare strategies', get_news_mood: 'News mood', list_portfolios: 'List portfolios',
};

const PORTFOLIO_ARG = {
  type: 'string',
  description: 'Portfolio name. Leave out to cover every portfolio: stock portfolios and mutual-fund portfolios are each combined and reported as separate groups. Use list_portfolios to see the names.',
};

function toJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type') out.type = String(value).toLowerCase();
    else if (key === 'properties') out.properties = Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, toJsonSchema(v)]));
    else if (key === 'items') out.items = toJsonSchema(value);
    else out[key] = value;
  }
  return out;
}

export function connectorTools(): McpTool[] {
  const tools: McpTool[] = functionDeclarations
    .filter((d) => !APP_ONLY_TOOLS.has(d.name))
    .map((d) => {
      const inputSchema = toJsonSchema(d.parameters);
      if (PORTFOLIO_TOOLS.has(d.name) || d.name === 'get_upcoming_dividends') inputSchema.properties = { ...inputSchema.properties, portfolio: PORTFOLIO_ARG };
      if (d.name === 'get_company_fundamentals') {
        // Balance-sheet search needs the user's own Gemini key, which stays in the app.
        const { include_balance_sheet: _skip, ...rest } = inputSchema.properties || {};
        inputSchema.properties = rest;
      }
      return { name: d.name, title: TITLES[d.name], description: d.description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: !PORTFOLIO_TOOLS.has(d.name) } };
    });
  tools.push({
    name: 'list_portfolios',
    title: TITLES.list_portfolios,
    description: "The user's PSX Tracker portfolios, with type and number of transactions. Use the names with the portfolio argument of other tools.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  });
  return tools;
}

export interface ConnectorSession {
  plan: string;
  sharePortfolio: boolean;
  listPortfolios: () => Promise<unknown>;
  /** One entry for a named portfolio; otherwise one per type (stocks, mutual funds). */
  loadPortfolios: (name?: string) => Promise<{ ctx: AgentContext; portfolio: string; unpriced: string[] }[]>;
  /** False once a Free-plan user has used today's backtest. */
  allowBacktest: () => Promise<boolean>;
}

const EMPTY_CONTEXT: AgentContext = { holdings: [], stats: {} as AgentContext['stats'], realizedTrades: [], transactions: [] };
const SHARING_OFF = 'Portfolio sharing is off for this connection. Turn on "Portfolio and holdings" in PSX Tracker → Settings → AI assistant, or ask about market data instead.';

export async function callConnectorTool(name: string, rawArgs: Record<string, unknown>, session: ConnectorSession): Promise<McpToolResult> {
  const { portfolio: portfolioName, ...args } = rawArgs as Record<string, any>;
  if (name === 'list_portfolios') {
    if (!session.sharePortfolio) return toolResult({ error: SHARING_OFF }, true);
    return toolResult({ portfolios: await session.listPortfolios() });
  }
  if (BACKTEST_TOOLS.has(name) && !(await session.allowBacktest())) {
    return toolResult({ error: 'The Free plan includes one backtest or strategy comparison a day through the connector. It resets at midnight Pakistan time; upgrade in PSX Tracker for unlimited backtests.' }, true);
  }
  if (name === 'get_company_fundamentals') args.include_balance_sheet = false;

  const needsPortfolio = PORTFOLIO_TOOLS.has(name) || (name === 'get_upcoming_dividends' && args.only_my_holdings !== false);
  if (needsPortfolio) {
    if (!session.sharePortfolio) {
      if (name !== 'get_upcoming_dividends') return toolResult({ error: SHARING_OFF }, true);
      args.only_my_holdings = false;
    } else {
      const loaded = await session.loadPortfolios(typeof portfolioName === 'string' ? portfolioName : undefined);
      const runs = await Promise.all(loaded.map(async (l) => ({ l, result: await executeTool(name, { ...args }, l.ctx) })));
      const labelled = ({ l, result }: (typeof runs)[number]) => ({
        portfolio: l.portfolio, ...result,
        ...(l.unpriced.length ? { price_note: `No current price for ${l.unpriced.join(', ')}; their average cost is used.` } : {}),
      });
      if (runs.length === 1) return toolResult(labelled(runs[0]), !!runs[0].result?.error);
      // One ticker lives in one group: answer from the group that has it.
      if (name === 'get_holding_detail') {
        const hit = runs.find((r) => !r.result?.error);
        return hit ? toolResult(labelled(hit)) : toolResult(labelled(runs[0]), true);
      }
      return toolResult({
        note: 'The user has stock and mutual-fund portfolios. They are calculated differently (FIFO for stocks, average cost for funds), so each group is reported separately; add the groups together for an overall total.',
        groups: runs.map(labelled),
      });
    }
  }
  const result = await executeTool(name, args, EMPTY_CONTEXT);
  return toolResult(result, !!result?.error);
}

export const CONNECTOR_INSTRUCTIONS = [
  'PSX Tracker gives read-only access to Pakistan Stock Exchange (PSX) market data and, when the user allows it, their own PSX Tracker portfolio.',
  'Use the tools for any price, holding, signal, backtest, dividend, result or news question instead of guessing. Amounts are in Pakistani rupees (PKR, Rs).',
  'Without a portfolio name, portfolio tools cover every portfolio, returning stock portfolios and mutual-fund portfolios as separate groups; mention both when answering about the whole portfolio. Call list_portfolios for names.',
  'Market data is unofficial and can be delayed. Technical signals, backtests and news mood are educational, not investment advice: describe what they show, do not tell the user to buy or sell.',
  'If a tool reports a plan limit, pass the message on as written.',
].join(' ');
