import React, { useEffect, useMemo, useState } from 'react';
import { Holding, PortfolioStats, RealizedTrade, Transaction } from '../types';
import { TrendingUp, TrendingDown, PieChart, Activity, Coins, Layers, Wallet, Receipt, Target, Trophy, CalendarDays } from 'lucide-react';
import { formatFundShortLabel } from '../utils/fundDisplay';
import { buildPortfolioInsights, InsightPosition } from '../utils/portfolioInsights';
import { PK_TIMEZONE } from '../utils/dates';

interface PortfolioInsightsProps {
  holdings: Holding[]; realizedTrades: RealizedTrade[]; transactions: Transaction[]; stats: PortfolioStats;
  onViewReport?: () => void; onViewDividends?: () => void; displayNames?: Record<string, string>;
}
type Tone = 'good' | 'warn' | 'info' | 'purple' | 'rose';
const TONE = {
  good: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', fg: 'text-emerald-600 dark:text-emerald-400' },
  warn: { bg: 'bg-amber-100 dark:bg-amber-900/40', fg: 'text-amber-600 dark:text-amber-400' },
  info: { bg: 'bg-blue-100 dark:bg-blue-900/40', fg: 'text-blue-600 dark:text-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', fg: 'text-purple-600 dark:text-purple-400' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/40', fg: 'text-rose-600 dark:text-rose-400' },
};
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(2)}%`;
const color = (n: number) => n < 0 ? 'text-rose-500' : n > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500';
const VISIBLE = 5;
interface Insight { key: string; tone: Tone; Icon: import('lucide-react').LucideIcon; node: React.ReactNode }

export const PortfolioInsights: React.FC<PortfolioInsightsProps> = ({ holdings, realizedTrades, transactions, stats, onViewReport, onViewDividends, displayNames = {} }) => {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const data = useMemo(() => buildPortfolioInsights(holdings, realizedTrades, transactions, stats, now), [holdings, realizedTrades, transactions, stats, now]);
  const label = (ticker: string) => formatFundShortLabel(ticker, displayNames);
  const strong = (text: string) => <strong className="text-slate-800 dark:text-slate-100">{text}</strong>;
  const amount = (value: number) => <span className={`font-bold ${color(value)}`}>{value > 0 ? '+' : ''}Rs {money(value)}</span>;
  const ranked = (title: string, p?: InsightPosition) => p && <div className="leading-snug">
    <span className="block text-xs text-slate-500 dark:text-slate-400">{title}</span>
    {strong(label(p.ticker))}{' '}{amount(p.profit)} <span className={color(p.profit)}>({pct(p.percent ?? 0)})</span>
  </div>;
  const rows: Insight[] = [];
  const add = (key: string, tone: Tone, Icon: Insight['Icon'], node: React.ReactNode) => rows.push({ key, tone, Icon, node });
  const hasPositions = data.positions.length > 0;
  const qualified = data.oldPrices || data.priorDayPrices || data.missingTimestamps > 0;
  if (data.missingPrices) add('missing', 'warn', Activity, <p>{strong(`${data.missingPrices} position${data.missingPrices === 1 ? '' : 's'} missing a price`)}. Refresh prices to see holding rankings and daily changes.</p>);
  else if (hasPositions) {
    add('daily', stats.dailyPL < 0 ? 'rose' : stats.dailyPL > 0 ? 'good' : 'info', Activity, <p>
      {qualified ? 'Latest recorded daily P&L' : "Today's holdings P&L"}: {amount(stats.dailyPL)}{data.dailyPercent !== null && <> ({pct(data.dailyPercent)})</>}
      {stats.dailyMissingPrevious && <span className="block text-xs text-amber-700 dark:text-amber-400">Partial: previous prices are missing.</span>}
      <span className="block text-xs text-slate-500 dark:text-slate-400">Current holdings; cash and intraday trading returns excluded.</span>
    </p>);
    if (data.bestDay || data.worstDay) add('dailyContributors', 'info', Activity, <div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{qualified ? 'Recorded daily contributors' : "Today's largest contributors"}</p>
      {data.worstDay && <p>{strong(label(data.worstDay.ticker))} {amount(data.worstDay.amount)}</p>}
      {data.bestDay && <p>{strong(label(data.bestDay.ticker))} {amount(data.bestDay.amount)}</p>}
    </div>);
    add('under', data.underwater > 0 ? 'warn' : 'good', Activity, <p>{strong(`${data.underwater} of ${data.positions.length}`)} unique holdings below purchase cost{qualified ? ' at recorded prices' : ''}.</p>);
  }
  if (data.avgWin !== null || data.avgLoss !== null) add('quality', data.profitFactor !== null && data.profitFactor < 1 ? 'warn' : 'info', Target, <div>
    <p className="font-semibold text-slate-700 dark:text-slate-200">Average win vs loss · matched lots</p>
    {data.avgWin !== null && <p>Win {amount(data.avgWin)}</p>}{data.avgLoss !== null && <p>Loss {amount(-data.avgLoss)}</p>}
    {data.avgWin !== null && data.avgWin > 0 && data.avgLoss !== null && <p>Losses average {strong(`${(data.avgLoss / data.avgWin).toFixed(2)}×`)} wins.</p>}
    {data.profitFactor !== null && <p className="text-xs text-slate-500 dark:text-slate-400">Profit factor {data.profitFactor.toFixed(2)} · before separate CGT entries</p>}
  </div>);
  if (stats.totalDividends !== 0) add('div', 'purple', Coins, <p>Net dividend income {strong(`Rs ${money(stats.totalDividends)}`)}.
    <span className="block text-xs text-slate-500 dark:text-slate-400">All recorded dates; includes reinvested dividends.</span>
    {onViewDividends && <button className="mt-1 underline underline-offset-2 text-emerald-700 dark:text-emerald-400 py-1" onClick={onViewDividends}>View dividend records</button>}
  </p>);
  if (data.bestHolding && !data.missingPrices || data.bestSold) add('best', 'info', TrendingUp, <div className="space-y-2">
    {!data.missingPrices && ranked(data.bestHolding?.profit < 0 ? 'Smallest holding loss (%)' : 'Best holding return (%)', data.bestHolding)}
    {ranked('Best realized return (%) · all time', data.bestSold)}
  </div>);
  if ((!data.missingPrices && data.worstHolding?.profit < 0) || data.worstSold?.profit < 0) add('worst', 'rose', TrendingDown, <div className="space-y-2">
    {!data.missingPrices && data.worstHolding?.profit < 0 && ranked('Worst holding return (%)', data.worstHolding)}
    {data.worstSold?.profit < 0 && ranked('Worst realized return (%) · all time', data.worstSold)}
  </div>);
  if (!data.missingPrices && data.largestLoss) add('largestLoss', 'rose', TrendingDown, <p>Largest holding loss in rupees: {strong(label(data.largestLoss.ticker))} {amount(data.largestLoss.profit)}.</p>);
  if (data.bestExit || data.worstExit) add('exits', 'info', Trophy, <div>
    <p className="font-semibold text-slate-700 dark:text-slate-200">Matched lot exits · all time</p>
    {data.bestExit && <p>Best {strong(label(data.bestExit.ticker))} {amount(data.bestExit.profit)}</p>}
    {data.worstExit && <p>Worst {strong(label(data.worstExit.ticker))} {amount(data.worstExit.profit)}</p>}
  </div>);
  if (!data.missingPrices && data.totalValue > 0) {
    if (data.largestSector) add('sector', 'info', Layers, <p>{strong(data.largestSector[0])} is your largest sector at {strong(pct(data.largestSector[1] / data.totalValue * 100))} of holdings value.</p>);
    if (data.top.length && data.topPercent !== null) add('concentration', data.topPercent >= 60 ? 'warn' : 'info', PieChart,
      <p>{data.top.length === 1 ? 'Largest holding' : `Top ${data.top.length}`} — {strong(data.top.map(p => label(p.ticker)).join(', '))} — {strong(pct(data.topPercent))} of holdings value, excluding cash.</p>);
  }
  if (data.costs.fees !== 0 || data.costs.taxes !== 0) add('costs', 'info', Receipt, <div>
    <p>Recorded fees {strong(`Rs ${money(data.costs.fees)}`)}</p><p>Recorded taxes {strong(`Rs ${money(data.costs.taxes)}`)}</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">All recorded dates. Taxes include Rs {money(data.costs.dividendTax)} dividend withholding.</p>
  </div>);
  if (data.lots.length) add('winrate', 'info', Target, <p>{strong(String(data.lots.length))} closed matched lots; {strong(pct(data.winRate!))} profitable.
    <span className="block text-xs text-slate-500 dark:text-slate-400">{data.wins} winning · {data.losses} losing · {data.flat} flat. A sale can match several purchase lots.</span>
  </p>);
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: PK_TIMEZONE }).format(now);
  if (data.bestMonth || data.worstMonth) add('month', 'info', CalendarDays, <div className="space-y-2">
    <p className="font-semibold text-slate-700 dark:text-slate-200">{monthLabel} · realized returns (%)</p>
    {ranked(data.bestMonth?.profit < 0 ? 'Smallest loss' : 'Best', data.bestMonth)}
    {data.worstMonth?.profit < 0 && data.worstMonth?.ticker !== data.bestMonth?.ticker && ranked('Worst', data.worstMonth)}
    <p className="text-xs text-slate-500 dark:text-slate-400">Lots closed this month, grouped by symbol.</p>
  </div>);
  if (stats.freeCash !== 0) add('cash', stats.freeCash < 0 ? 'warn' : 'info', Wallet, <p>
    {stats.freeCash < 0 ? 'Cash balance' : 'Cash available'} {strong(`Rs ${money(stats.freeCash)}`)}
    {!data.missingPrices && data.cashPercent !== null && <> — {strong(pct(data.cashPercent))} of net worth</>}.
  </p>);
  if (!rows.length) return null;
  const visible = expanded ? rows : rows.slice(0, VISIBLE);
  const timestamp = data.oldestPrice === null ? null : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(data.oldestPrice);
  return <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-full flex flex-col min-h-0">
    <div className="mb-3 shrink-0">
      <div className="flex items-center gap-2"><span className="text-xl">💡</span><h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Insights</h3></div>
      {hasPositions && <p className={`mt-1 text-xs ${qualified || data.missingPrices ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {timestamp ? `Oldest price update: ${timestamp}` : 'Price update time unavailable'}{data.oldPrices ? ' · over 24h old' : ''}{data.missingTimestamps && timestamp ? ' · some update times unavailable' : ''}
      </p>}
    </div>
    <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 dark:divide-slate-800/60">
      {visible.map(({ key, tone, Icon, node }) => <div key={key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
        <div className={`w-8 h-8 rounded-full ${TONE[tone].bg} flex items-center justify-center shrink-0 mt-0.5`}><Icon size={16} className={TONE[tone].fg} /></div>
        <div className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300 leading-snug break-words">{node}</div>
      </div>)}
      <details className="pt-3 text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer py-2">How these figures are calculated</summary>
        <div className="space-y-2 pb-2 leading-relaxed">
          <p>Holding return uses the same rounded purchase cost as Holdings, including purchase fees. Symbols are combined across brokers. Percentage rankings exclude positions with purchase cost below Rs 500.</p>
          <p>Realized figures use matched purchase lots, after purchase and sale fees but before separately recorded CGT. One sale can create several lots. Monthly rankings use the closing date in Pakistan time; they do not measure the month's movement in open holdings.</p>
          <p>Profit factor divides total winning-lot profit by the absolute total losing-lot loss. Average wins and losses use only the winning and losing lots respectively; flat lots still count in the win-rate denominator.</p>
          <p>Daily P&amp;L uses current stock quantities against previous close. Funds use opening units and booked daily income. The percentage divides by the corresponding previous value. It is not a cash-flow-adjusted return for the whole account. Missing previous prices suppress the percentage.</p>
          <p>Price timestamps record when the app updated a price, not its exchange trade time. Older or undated prices qualify these figures. Concentration excludes cash.</p>
          <p>Fees include commission, CDC, other recorded charges and annual fees. Taxes count each transaction's tax once, plus standalone tax entries. Dividend withholding is included. Dividends are net recorded income, including reinvestment.</p>
          {onViewReport && <button className="underline py-2 text-emerald-700 dark:text-emerald-400" onClick={onViewReport}>Open realized P&amp;L report</button>}
        </div>
      </details>
    </div>
    {rows.length > VISIBLE && <button onClick={() => setExpanded(v => !v)} className="w-full mt-2 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0">
      {expanded ? 'Show less' : `Show ${rows.length - VISIBLE} more insights`}
    </button>}
  </div>;
};
