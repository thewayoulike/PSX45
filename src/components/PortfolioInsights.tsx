import React, { useMemo, useState } from 'react';
import { Holding, PortfolioStats, RealizedTrade } from '../types';
import {
  TrendingUp, TrendingDown, PieChart, Activity, Coins, Layers,
  Wallet, Receipt, Target, Trophy, AlertTriangle, Percent, CalendarDays
} from 'lucide-react';

interface PortfolioInsightsProps {
  holdings: Holding[];
  realizedTrades: RealizedTrade[];
  stats: PortfolioStats;
  onViewReport?: () => void;
}

type Tone = 'good' | 'warn' | 'info' | 'purple' | 'rose';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  good:   { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-600 dark:text-emerald-400' },
  warn:   { bg: 'bg-amber-100 dark:bg-amber-900/40',     fg: 'text-amber-600 dark:text-amber-400' },
  info:   { bg: 'bg-blue-100 dark:bg-blue-900/40',       fg: 'text-blue-600 dark:text-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/40',   fg: 'text-purple-600 dark:text-purple-400' },
  rose:   { bg: 'bg-rose-100 dark:bg-rose-900/40',       fg: 'text-rose-600 dark:text-rose-400' },
};

const MIN_COST = 500; // ignore tiny positions when ranking % return

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toFixed(2)}%`;

interface Insight {
  key: string;
  tone: Tone;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  score: number;
  node: React.ReactNode;
}

const VISIBLE = 5; // how many to show before "Show more"

// Small pill badge (status / "This month")
const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700 whitespace-nowrap">{children}</span>
);

export const PortfolioInsights: React.FC<PortfolioInsightsProps> = ({ holdings, realizedTrades, stats, onViewReport }) => {
  const [expanded, setExpanded] = useState(false);

  const list = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const strong = (t: string) => <span className="font-bold text-slate-800 dark:text-slate-100">{t}</span>;

    const realTrades = realizedTrades.filter((t) => t.ticker && t.ticker !== 'PREV-PNL');

    // Current month, e.g. "2026-07"
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthName = now.toLocaleString(undefined, { month: 'long' });

    type Agg = { profit: number; cost: number; isHolding: boolean; isRealized: boolean };
    const bestWorst = (stats: Record<string, Agg>) => {
      let best: { ticker: string; ret: number; profit: number; status: string } | null = null;
      let worst: { ticker: string; ret: number; profit: number } | null = null;
      Object.entries(stats).forEach(([ticker, d]) => {
        if (d.cost < MIN_COST) return;
        const ret = (d.profit / d.cost) * 100;
        const status = d.isHolding && d.isRealized ? 'Active & Sold' : d.isHolding ? 'Active' : 'Sold';
        if (!best || ret > best.ret) best = { ticker, ret, profit: d.profit, status };
        if (!worst || ret < worst.ret) worst = { ticker, ret, profit: d.profit };
      });
      return { best, worst };
    };

    // ---- Overall (active + sold) ----
    const overall: Record<string, Agg> = {};
    realTrades.forEach((t) => {
      const s = (overall[t.ticker] ||= { profit: 0, cost: 0, isHolding: false, isRealized: false });
      s.profit += t.profit; s.cost += t.buyAvg * t.quantity; s.isRealized = true;
    });
    holdings.forEach((h) => {
      const s = (overall[h.ticker] ||= { profit: 0, cost: 0, isHolding: false, isRealized: false });
      s.profit += (h.currentPrice - h.avgPrice) * h.quantity; s.cost += h.avgPrice * h.quantity; s.isHolding = true;
    });
    const { best, worst } = bestWorst(overall);

    // ---- This month (realized trades closed this month) ----
    const monthAgg: Record<string, Agg> = {};
    realTrades.filter((t) => (t.date || '').startsWith(monthKey)).forEach((t) => {
      const s = (monthAgg[t.ticker] ||= { profit: 0, cost: 0, isHolding: false, isRealized: true });
      s.profit += t.profit; s.cost += t.buyAvg * t.quantity;
    });
    const { best: bestM, worst: worstM } = bestWorst(monthAgg);

    // 1) Best performer overall — pinned to top
    if (best) {
      out.push({
        key: 'best', tone: 'good', Icon: TrendingUp, score: 1000,
        node: (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            {strong(best.ticker)} is your best performer <Badge>{best.status}</Badge>
            <span className={`block mt-0.5 font-bold ${best.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {best.profit >= 0 ? '+' : ''}{money(best.profit)} ({pct(best.ret)})
            </span>
          </p>
        ),
      });
    }

    // 2) Best performer this month
    if (bestM && bestM.profit > 0) {
      out.push({
        key: 'bestMonth', tone: 'good', Icon: CalendarDays, score: 950,
        node: (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            {strong(bestM.ticker)} is your top performer this month <Badge>{monthName}</Badge>
            <span className="block mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">+{money(bestM.profit)} ({pct(bestM.ret)})</span>
          </p>
        ),
      });
    }

    // 3) Biggest drag overall
    if (worst && (!best || worst.ticker !== best.ticker) && worst.ret < 0) {
      out.push({
        key: 'worst', tone: 'rose', Icon: TrendingDown, score: 900,
        node: (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            {strong(worst.ticker)} is your biggest drag
            <span className="block mt-0.5 font-bold text-rose-500">{money(worst.profit)} ({pct(worst.ret)})</span>
          </p>
        ),
      });
    }

    // 4) Biggest drag this month
    if (worstM && worstM.ret < 0 && (!bestM || worstM.ticker !== bestM.ticker)) {
      out.push({
        key: 'worstMonth', tone: 'rose', Icon: CalendarDays, score: 850,
        node: (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            {strong(worstM.ticker)} is your biggest drag this month <Badge>{monthName}</Badge>
            <span className="block mt-0.5 font-bold text-rose-500">{money(worstM.profit)} ({pct(worstM.ret)})</span>
          </p>
        ),
      });
    }

    // ---- Concentration (names the top holdings) ----
    const valued = holdings
      .map((h) => ({ ticker: h.ticker, val: h.currentPrice * h.quantity }))
      .sort((a, b) => b.val - a.val);
    if (valued.length && stats.totalValue > 0) {
      const top1 = valued[0];
      const top1Pct = (top1.val / stats.totalValue) * 100;
      const top3 = valued.slice(0, 3);
      const top3Pct = (top3.reduce((s, x) => s + x.val, 0) / stats.totalValue) * 100;
      const heavy = top3Pct >= 60;
      out.push({
        key: 'conc', tone: heavy ? 'warn' : 'info', Icon: heavy ? AlertTriangle : PieChart,
        score: 30 + top3Pct,
        node: valued.length >= 3 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            Your top 3 — {strong(top3.map((x) => x.ticker).join(', '))} — are {strong(pct(top3Pct))} of the portfolio{heavy ? ' (heavily concentrated)' : ''}
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            {strong(top1.ticker)} is {strong(pct(top1Pct))} of your active portfolio value
          </p>
        ),
      });
    }

    // ---- Sector exposure ----
    const sectorMap: Record<string, number> = {};
    holdings.forEach((h) => { const s = h.sector || 'Other'; sectorMap[s] = (sectorMap[s] || 0) + h.currentPrice * h.quantity; });
    const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
    if (sectors.length && stats.totalValue > 0) {
      const [name, val] = sectors[0];
      const sPct = (val / stats.totalValue) * 100;
      if (sPct >= 20) {
        out.push({
          key: 'sector', tone: sPct >= 45 ? 'warn' : 'info', Icon: Layers, score: 14 + sPct / 2,
          node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{strong(name)} is your largest sector at {strong(pct(sPct))} of holdings</p>,
        });
      }
    }

    // ---- Underwater positions ----
    if (holdings.length) {
      const under = holdings.filter((h) => h.currentPrice > 0 && h.currentPrice < h.avgPrice).length;
      if (under > 0) {
        const underPct = (under / holdings.length) * 100;
        out.push({
          key: 'under', tone: underPct >= 50 ? 'warn' : 'info', Icon: Activity, score: 18 + underPct / 3,
          node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{strong(`${under} of ${holdings.length}`)} holdings are currently in the red</p>,
        });
      }
    }

    // ---- Win rate + biggest single trades ----
    if (realTrades.length >= 3) {
      const wins = realTrades.filter((t) => t.profit > 0).length;
      const wr = (wins / realTrades.length) * 100;
      out.push({
        key: 'winrate', tone: wr >= 50 ? 'good' : 'warn', Icon: Target, score: 22,
        node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">You've closed {strong(String(realTrades.length))} trades with a {strong(pct(wr))} win rate</p>,
      });

      const bestTrade = realTrades.reduce((a, b) => (b.profit > a.profit ? b : a));
      const worstTrade = realTrades.reduce((a, b) => (b.profit < a.profit ? b : a));
      if (bestTrade.profit > 0 || worstTrade.profit < 0) {
        out.push({
          key: 'extremes', tone: 'info', Icon: Trophy, score: 16,
          node: (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
              Best exit {strong(bestTrade.ticker)} <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{money0(bestTrade.profit)}</span>
              {worstTrade.profit < 0 && <> · worst {strong(worstTrade.ticker)} <span className="text-rose-500 font-bold">{money0(worstTrade.profit)}</span></>}
            </p>
          ),
        });
      }
    }

    // ---- Fee & tax drag ----
    const totalCosts = stats.totalCommission + stats.totalSalesTax + stats.totalCDC + stats.totalOtherFees + stats.totalCGT;
    if (totalCosts > 0) {
      const grossGains = stats.netRealizedPL + stats.totalDividends + Math.max(0, stats.unrealizedPL) + totalCosts;
      const feePct = grossGains > 0 ? (totalCosts / grossGains) * 100 : null;
      out.push({
        key: 'fees', tone: feePct != null && feePct >= 15 ? 'warn' : 'info', Icon: Receipt, score: 26 + (feePct || 0),
        node: (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
            Fees and taxes have cost {strong(`Rs ${money0(totalCosts)}`)}{feePct != null && <> — about {strong(pct(feePct))} of your gross gains</>}
          </p>
        ),
      });
    }

    // ---- Cash drag ----
    const netWorth = stats.totalValue + stats.freeCash;
    if (stats.freeCash > 0 && netWorth > 0) {
      const cashPct = (stats.freeCash / netWorth) * 100;
      if (cashPct >= 10) {
        out.push({
          key: 'cash', tone: cashPct >= 30 ? 'warn' : 'info', Icon: Wallet, score: 8 + cashPct / 2,
          node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{strong(`Rs ${money0(stats.freeCash)}`)} ({pct(cashPct)} of net worth) is sitting in cash</p>,
        });
      }
    }

    // ---- Realized vs paper ----
    const totalGain = stats.netRealizedPL + stats.unrealizedPL;
    if (totalGain > 0 && stats.unrealizedPL > 0) {
      const paperPct = (stats.unrealizedPL / totalGain) * 100;
      out.push({
        key: 'paper', tone: 'info', Icon: Percent, score: 9,
        node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{strong(pct(paperPct))} of your gains are still unrealized (on paper)</p>,
      });
    }

    // ---- Dividend contribution ----
    if (stats.totalDividends > 0) {
      const totalReturn = stats.unrealizedPL + stats.netRealizedPL + stats.totalDividends;
      const divPct = totalReturn > 0 ? (stats.totalDividends / totalReturn) * 100 : 0;
      out.push({
        key: 'div', tone: 'purple', Icon: Coins, score: 12,
        node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">Dividends are {strong(pct(divPct))} of your total returns</p>,
      });
    }

    // ---- Today's move (low priority) ----
    out.push({
      key: 'daily', tone: stats.dailyPL >= 0 ? 'good' : 'rose', Icon: Activity, score: 5,
      node: <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">Your portfolio {stats.dailyPL >= 0 ? 'gained' : 'lost'} {strong(pct(Math.abs(stats.dailyPLPercent)))} today</p>,
    });

    return out.sort((a, b) => b.score - a.score);
  }, [holdings, realizedTrades, stats]);

  if (list.length === 0) return null;

  const visible = expanded ? list : list.slice(0, VISIBLE);
  const hidden = list.length - VISIBLE;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">💡</span>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Insights</h3>
      </div>

      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
        {visible.map((ins) => {
          const t = TONE[ins.tone];
          const Icon = ins.Icon;
          return (
            <div key={ins.key} className="flex items-start gap-4 py-3.5 first:pt-0">
              <div className={`w-8 h-8 rounded-full ${t.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon size={16} className={t.fg} />
              </div>
              <div className="min-w-0">{ins.node}</div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full mt-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          {expanded ? 'Show less' : `Show ${hidden} more insight${hidden > 1 ? 's' : ''}`}
        </button>
      )}

      {onViewReport && (
        <button
          onClick={onViewReport}
          className="w-full mt-3 py-2.5 border border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold rounded-xl transition-colors text-sm"
        >
          View Full Report
        </button>
      )}
    </div>
  );
};
