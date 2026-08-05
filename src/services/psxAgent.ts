import { GoogleGenAI, Type } from "@google/genai";
import { Holding, PortfolioStats, RealizedTrade, Transaction } from '../types';
import { fetchStockHistory, fetchBatchPSXPrices, fetchTopVolumeStocks } from './psxData';
import { fetchCompanyFundamentals, fetchDividendsForScan } from './financials';
import { computeSignal, computeTradePlan } from '../utils/indicators';

/* =============================================================================
   PSX AI AGENT
   A tool-calling agent that can actually look things up before answering:
   the user's own portfolio, live PSX prices, technical signals, dividends and
   company fundamentals. Runs on the user's own Gemini key.
   ============================================================================= */

export interface AgentContext {
  holdings: Holding[];
  stats: PortfolioStats;
  realizedTrades: RealizedTrade[];
  transactions: Transaction[];
}

export interface AgentMessage {
  role: 'user' | 'model';
  text: string;
  /** names of tools the agent ran to produce this answer (for the UI trace) */
  toolsUsed?: string[];
}

const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `You are the PSX Assistant — an expert analyst for the Pakistan Stock Exchange, built into a user's own portfolio tracker.

TOOLS
You have tools to read the user's real portfolio and fetch live PSX market data.
ALWAYS call the relevant tool before answering questions about the user's holdings,
prices, signals, dividends or fundamentals. Never guess a number you could look up,
and never invent a price, ticker or figure. If a tool returns nothing useful, say so plainly.

STYLE
- Be concise and specific. Lead with the answer, then the reasoning.
- Always cite the actual numbers you retrieved (price, %, weight, RSI, etc.).
- Use PKR / Rs. for money and keep percentages to 2 decimals.
- Format with short paragraphs or compact bullet lists. No large tables.
- If the user asks something you have no tool for (e.g. macro news), say what you
  do and don't know rather than speculating.

BOUNDARIES
- You are a research assistant, not a financial advisor. Do not give direct
  "buy this" / "sell this" instructions and do not predict future prices.
- You MAY explain what technical indicators currently show, what a trade plan's
  levels are, and what risks a portfolio's structure carries — that is analysis.
- Frame suggestions as things to consider or research, and remind the user that
  decisions are theirs. Keep disclaimers to one short sentence, not a wall of text.`;

/* ------------------------------- tool schema ------------------------------- */

const functionDeclarations = [
  {
    name: "get_portfolio_summary",
    description: "Overall snapshot of the user's portfolio: market value, cost basis, unrealized/realized P&L, dividends, fees, free cash, sector mix and win rate.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_holdings",
    description: "List every current holding with quantity, average cost, current price, market value, portfolio weight % and unrealized P&L %.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_holding_detail",
    description: "Detailed view of ONE ticker the user holds or has traded: position, average cost, P&L, and its full transaction history (buys, sells, dividends).",
    parameters: {
      type: Type.OBJECT,
      properties: { ticker: { type: Type.STRING, description: "PSX symbol, e.g. MACTER" } },
      required: ["ticker"],
    },
  },
  {
    name: "get_realized_performance",
    description: "The user's closed/realized trades: total realized P&L, CGT, number of trades, win rate, best and worst exits.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_live_price",
    description: "Current live PSX market data for one or more symbols: last price, previous close (LDCP), day change %, day high/low and volume.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbols: { type: Type.ARRAY, items: { type: Type.STRING }, description: "PSX symbols, e.g. ['ENGRO','LUCK']" },
      },
      required: ["symbols"],
    },
  },
  {
    name: "get_technical_analysis",
    description: "Technical analysis for a PSX symbol: overall verdict (STRONG BUY..STRONG SELL), indicator votes (SMA/EMA/RSI/MACD/momentum), RSI, SMA20/50, plus a trade plan with buy range, stop loss, take-profit targets, support and resistance.",
    parameters: {
      type: Type.OBJECT,
      properties: { symbol: { type: Type.STRING, description: "PSX symbol, e.g. OGDC" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_price_history",
    description: "Historical closing prices for a PSX symbol over a range, with the period's change %, high and low. Use for trend or performance questions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING },
        range: { type: Type.STRING, enum: ["1D", "1M", "6M", "YTD", "1Y", "3Y", "5Y"], description: "Defaults to 1M" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_index_performance",
    description: "Current level and recent change of the KSE-100 and KMI-30 indices. Use to compare the user's portfolio against the market.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_upcoming_dividends",
    description: "Recent and upcoming PSX dividend announcements (ex-dates and per-share amounts), optionally filtered to only stocks the user holds.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        only_my_holdings: { type: Type.BOOLEAN, description: "If true, only dividends for stocks the user owns. Default true." },
      },
    },
  },
  {
    name: "get_company_fundamentals",
    description: "Company financials from PSX for a symbol: sales, profit after tax, EPS, book value, equity and liabilities across recent periods.",
    parameters: {
      type: Type.OBJECT,
      properties: { symbol: { type: Type.STRING } },
      required: ["symbol"],
    },
  },
  {
    name: "get_market_movers",
    description: "Today's most actively traded PSX stocks by volume, with price and change %.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

/* ----------------------------- tool execution ----------------------------- */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const executeTool = async (name: string, args: any, ctx: AgentContext): Promise<any> => {
  const { holdings, stats, realizedTrades, transactions } = ctx;
  const totalValue = stats.totalValue || 0;

  switch (name) {
    case "get_portfolio_summary": {
      const sectorMap: Record<string, number> = {};
      holdings.forEach(h => {
        const s = h.sector || 'Other';
        sectorMap[s] = (sectorMap[s] || 0) + h.currentPrice * h.quantity;
      });
      const real = realizedTrades.filter(t => t.ticker && t.ticker !== 'PREV-PNL');
      const wins = real.filter(t => t.profit > 0).length;
      return {
        currency: "PKR",
        market_value: r2(totalValue),
        cost_basis: r2(stats.totalCost),
        unrealized_pl: r2(stats.unrealizedPL),
        unrealized_pl_percent: r2(stats.unrealizedPLPercent),
        realized_pl_net_of_cgt: r2(stats.netRealizedPL),
        dividends_received: r2(stats.totalDividends),
        total_fees_and_taxes: r2((stats.totalCommission || 0) + (stats.totalSalesTax || 0) + (stats.totalCDC || 0) + (stats.totalOtherFees || 0) + (stats.totalCGT || 0)),
        free_cash: r2(stats.freeCash),
        todays_pl: r2(stats.dailyPL),
        todays_pl_percent: r2(stats.dailyPLPercent),
        holdings_count: holdings.length,
        closed_trades: real.length,
        win_rate_percent: real.length ? r2((wins / real.length) * 100) : null,
        sector_weights: Object.entries(sectorMap)
          .map(([sector, v]) => ({ sector, weight_percent: totalValue > 0 ? r2((v / totalValue) * 100) : 0 }))
          .sort((a, b) => b.weight_percent - a.weight_percent),
      };
    }

    case "get_holdings": {
      if (!holdings.length) return { holdings: [], note: "The user currently has no open holdings." };
      return {
        currency: "PKR",
        holdings: holdings.map(h => {
          const val = h.currentPrice * h.quantity;
          const cost = h.avgPrice * h.quantity;
          return {
            ticker: h.ticker,
            sector: h.sector || 'Other',
            quantity: h.quantity,
            avg_cost: r2(h.avgPrice),
            current_price: r2(h.currentPrice),
            market_value: r2(val),
            weight_percent: totalValue > 0 ? r2((val / totalValue) * 100) : 0,
            unrealized_pl: r2(val - cost),
            unrealized_pl_percent: cost > 0 ? r2(((val - cost) / cost) * 100) : 0,
          };
        }).sort((a, b) => b.weight_percent - a.weight_percent),
      };
    }

    case "get_holding_detail": {
      const t = String(args?.ticker || '').trim().toUpperCase();
      const h = holdings.find(x => x.ticker.toUpperCase() === t);
      const txs = transactions.filter(x => x.ticker?.toUpperCase() === t);
      const closed = realizedTrades.filter(x => x.ticker?.toUpperCase() === t);
      if (!h && txs.length === 0) return { error: `The user has no holdings or transactions for ${t}.` };
      const val = h ? h.currentPrice * h.quantity : 0;
      const cost = h ? h.avgPrice * h.quantity : 0;
      return {
        ticker: t,
        currency: "PKR",
        open_position: h ? {
          quantity: h.quantity,
          avg_cost: r2(h.avgPrice),
          current_price: r2(h.currentPrice),
          market_value: r2(val),
          unrealized_pl: r2(val - cost),
          unrealized_pl_percent: cost > 0 ? r2(((val - cost) / cost) * 100) : 0,
          sector: h.sector || 'Other',
        } : null,
        realized: {
          trades: closed.length,
          total_pl: r2(closed.reduce((s, x) => s + x.profit, 0)),
        },
        transactions: txs
          .slice()
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 40)
          .map(x => ({ date: x.date, type: x.type, quantity: x.quantity, price: r2(x.price), broker: x.broker || null })),
      };
    }

    case "get_realized_performance": {
      const real = realizedTrades.filter(t => t.ticker && t.ticker !== 'PREV-PNL');
      if (!real.length) return { note: "No closed trades yet." };
      const wins = real.filter(t => t.profit > 0);
      const losses = real.filter(t => t.profit < 0);
      const best = real.reduce((a, b) => (b.profit > a.profit ? b : a));
      const worst = real.reduce((a, b) => (b.profit < a.profit ? b : a));
      const grossWin = wins.reduce((s, t) => s + t.profit, 0);
      const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
      return {
        currency: "PKR",
        total_realized_pl: r2(real.reduce((s, t) => s + t.profit, 0)),
        realized_pl_net_of_cgt: r2(stats.netRealizedPL),
        total_cgt: r2(stats.totalCGT),
        trades: real.length,
        wins: wins.length,
        losses: losses.length,
        win_rate_percent: r2((wins.length / real.length) * 100),
        profit_factor: grossLoss > 0 ? r2(grossWin / grossLoss) : null,
        avg_win: wins.length ? r2(grossWin / wins.length) : 0,
        avg_loss: losses.length ? r2(grossLoss / losses.length) : 0,
        best_exit: { ticker: best.ticker, profit: r2(best.profit), date: best.date },
        worst_exit: { ticker: worst.ticker, profit: r2(worst.profit), date: worst.date },
      };
    }

    case "get_live_price": {
      const syms: string[] = (args?.symbols || []).map((s: string) => String(s).trim().toUpperCase()).filter(Boolean);
      if (!syms.length) return { error: "No symbols provided." };
      const data = await fetchBatchPSXPrices(syms);
      const out = syms.map(s => {
        const d = (data as any)[s];
        if (!d) return { symbol: s, error: "Not found on PSX market watch." };
        const chg = d.ldcp > 0 ? ((d.price - d.ldcp) / d.ldcp) * 100 : null;
        return {
          symbol: s, price: r2(d.price), previous_close: r2(d.ldcp),
          change_percent: chg == null ? null : r2(chg),
          day_high: r2(d.high), day_low: r2(d.low), volume: d.volume, sector: d.sector,
        };
      });
      return { currency: "PKR", quotes: out };
    }

    case "get_technical_analysis": {
      const sym = String(args?.symbol || '').trim().toUpperCase();
      if (!sym) return { error: "No symbol provided." };
      const hist = await fetchStockHistory(sym, '6M');
      if (!hist || hist.length < 30) return { error: `Not enough price history for ${sym} to run technical analysis.` };
      const closes = hist.map(p => p.price);
      const sig = computeSignal(closes);
      const plan = computeTradePlan(closes, sig.lastPrice);
      return {
        symbol: sym,
        currency: "PKR",
        verdict: sig.verdict,
        score: r2(sig.score),
        votes: { buy: sig.buys, sell: sig.sells, neutral: sig.neutrals },
        last_price: r2(sig.lastPrice),
        rsi_14: r2(sig.rsi),
        sma_20: r2(sig.sma20),
        sma_50: r2(sig.sma50),
        indicators: sig.indicators,
        trade_plan: plan ? {
          buy_range_low: r2(plan.entryLow),
          buy_range_high: r2(plan.entryHigh),
          stop_loss: r2(plan.stop),
          targets: plan.targets.map(r2),
          risk_percent: r2(plan.riskPct),
          reward_percent: plan.rewardPct.map(r2),
          support: r2(plan.support),
          resistance: r2(plan.resistance),
        } : null,
        note: "Indicator-based analysis of past prices only. Not a prediction or a recommendation.",
      };
    }

    case "get_price_history": {
      const sym = String(args?.symbol || '').trim().toUpperCase();
      const range = (args?.range || '1M') as any;
      if (!sym) return { error: "No symbol provided." };
      const hist = await fetchStockHistory(sym, range);
      if (!hist || hist.length < 2) return { error: `No price history available for ${sym}.` };
      const prices = hist.map(p => p.price);
      const first = prices[0], last = prices[prices.length - 1];
      return {
        symbol: sym, range, currency: "PKR",
        start_price: r2(first), end_price: r2(last),
        change_percent: first > 0 ? r2(((last - first) / first) * 100) : null,
        period_high: r2(Math.max(...prices)), period_low: r2(Math.min(...prices)),
        data_points: prices.length,
        recent_closes: hist.slice(-20).map(p => ({ date: new Date(p.time).toISOString().slice(0, 10), close: r2(p.price) })),
      };
    }

    case "get_index_performance": {
      const [kse, kmi] = await Promise.all([
        fetchStockHistory('KSE100', '1M').catch(() => []),
        fetchStockHistory('KMI30', '1M').catch(() => []),
      ]);
      const summarize = (arr: { time: number; price: number }[]) => {
        if (!arr || arr.length < 2) return null;
        const last = arr[arr.length - 1].price, prev = arr[arr.length - 2].price, first = arr[0].price;
        return {
          level: r2(last),
          day_change_percent: prev > 0 ? r2(((last - prev) / prev) * 100) : null,
          month_change_percent: first > 0 ? r2(((last - first) / first) * 100) : null,
        };
      };
      return {
        KSE100: summarize(kse),
        KMI30: summarize(kmi),
        portfolio_today_percent: r2(stats.dailyPLPercent),
        portfolio_unrealized_percent: r2(stats.unrealizedPLPercent),
      };
    }

    case "get_upcoming_dividends": {
      const onlyMine = args?.only_my_holdings !== false;
      const list = await fetchDividendsForScan(12).catch(() => []);
      const owned = new Set(holdings.map(h => h.ticker.toUpperCase()));
      const filtered = onlyMine ? list.filter(d => owned.has(d.ticker.toUpperCase())) : list;
      if (!filtered.length) return { note: onlyMine ? "No dividend announcements found for the user's holdings." : "No dividend announcements found." };
      return {
        currency: "PKR",
        note: "Amounts are rupees per share, converted using each stock's real face value.",
        dividends: filtered.slice(0, 40).map(d => {
          const qty = holdings.find(h => h.ticker.toUpperCase() === d.ticker.toUpperCase())?.quantity || 0;
          return {
            ticker: d.ticker, ex_date: d.exDate, per_share: r2(d.amount),
            shares_held: qty, estimated_gross: qty ? r2(qty * d.amount) : null,
          };
        }),
      };
    }

    case "get_company_fundamentals": {
      const sym = String(args?.symbol || '').trim().toUpperCase();
      if (!sym) return { error: "No symbol provided." };
      const f = await fetchCompanyFundamentals(sym);
      if (!f) return { error: `Could not retrieve fundamentals for ${sym} from PSX.` };
      return {
        symbol: sym,
        annual: f.annual.financials.slice(0, 5),
        annual_ratios: f.annual.ratios.slice(0, 5),
        quarterly: f.quarterly.financials.slice(0, 4),
        note: "Figures scraped from the PSX company page; units are as reported.",
      };
    }

    case "get_market_movers": {
      const top = await fetchTopVolumeStocks();
      if (!top?.length) return { error: "Could not fetch market activity right now." };
      return {
        currency: "PKR",
        most_active: top.slice(0, 20).map(s => ({
          symbol: s.symbol, price: r2(s.price), change_percent: r2(s.change), volume: s.volume,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
};

/* ------------------------------- agent loop ------------------------------- */

export interface AgentRunResult {
  text: string;
  toolsUsed: string[];
}

/**
 * Runs one turn of the agent. `history` is the prior conversation (oldest first).
 * The agent may call tools repeatedly before producing its final answer.
 */
export const runAgent = async (
  apiKey: string,
  history: AgentMessage[],
  userMessage: string,
  ctx: AgentContext,
  onToolCall?: (toolName: string) => void
): Promise<AgentRunResult> => {
  if (!apiKey) throw new Error("API Key missing. Add a Gemini key in Settings → API Keys.");

  const ai = new GoogleGenAI({ apiKey: apiKey.replace(/[^\x00-\x7F]/g, "").trim() });

  // Build conversation contents
  const contents: any[] = history.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const toolsUsed: string[] = [];
  const MAX_STEPS = 6; // guard against runaway tool loops

  for (let step = 0; step < MAX_STEPS; step++) {
    const response: any = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: functionDeclarations as any }],
      },
    });

    const calls = response.functionCalls;

    if (calls && calls.length > 0) {
      // Record the model's tool calls
      contents.push({ role: 'model', parts: calls.map((c: any) => ({ functionCall: c })) });

      const responseParts: any[] = [];
      for (const call of calls) {
        const label = String(call.name || 'tool');
        toolsUsed.push(label);
        onToolCall?.(label);
        let result: any;
        try {
          result = await executeTool(label, call.args || {}, ctx);
        } catch (e: any) {
          result = { error: e?.message || 'Tool failed to execute.' };
        }
        responseParts.push({ functionResponse: { name: label, response: { result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      continue; // let the model use the results
    }

    // No more tool calls -> final answer
    const text = response.text;
    if (text) return { text, toolsUsed };
    break;
  }

  return {
    text: "I wasn't able to complete that request. Try rephrasing, or ask about something more specific.",
    toolsUsed,
  };
};

/** Suggested starter prompts shown in the empty state. */
export const SUGGESTED_PROMPTS = [
  "How is my portfolio doing overall?",
  "Which of my holdings looks weakest right now?",
  "What do the technicals say about my biggest position?",
  "Am I too concentrated in any sector?",
  "Any dividends coming up for my stocks?",
  "How does my performance compare to the KSE-100?",
];
