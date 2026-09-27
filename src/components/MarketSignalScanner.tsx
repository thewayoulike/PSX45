import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Radar, Loader2, Copy, CheckCircle2, TrendingUp, Info, Activity, LayoutGrid, Table as TableIcon, Crosshair, Lock, Sparkles, Settings2, Download, X } from 'lucide-react';
import type { ScanSnapshot, SnapshotSection, SnapshotLayout } from '../utils/scanSnapshot';
import { fetchUrlWithFallback, fetchStockHistory } from '../services/psxData';
import { fetchTechnicalScanBars } from '../services/technicalScanData';
import { computeTechnicalAnalysis, SCAN_DISCLAIMER, type TechnicalAnalysis } from '../utils/technicalRatings';
import { technicalSnapshotStock } from '../utils/technicalSnapshot';
import { TechnicalScanResults, type TechnicalResult } from './TechnicalScanResults';
import {
  computeSignal,
  computeTradePlan,
  computeRsiOversoldPlan,
  backtestRsiOversold,
  mergeRsiOversoldBacktests,
  SignalSummary,
  TradePlan,
  Signal,
  Verdict,
  RsiOversoldBacktest,
} from '../utils/indicators';
import { buildScanUniverse } from '../utils/scanUniverse';
import {
  isScanStale,
  loadDailyScan,
  loadScanBotSettings,
  saveDailyScan,
  saveScanBotSettings,
  ScanBotSettings,
  DailyScanHit,
} from '../services/scanBot';
import { useFreemium } from './FreemiumContext';
import { consumeDailyQuota, peekDailyQuota } from '../utils/freemiumQuotas';

const TICKER_BLACKLIST = ['READY', 'FUTURE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'CHANGE', 'SYMBOL', 'SCRIP', 'LDCP', 'MARKET', 'SUMMARY', 'CURRENT', 'SECTOR', 'INDEX', 'KSE'];

type StrategyMode = 'composite' | 'rsi_oversold';

interface Candidate { symbol: string; current: number; ldcp: number; changePct: number; volume: number; }
interface Result extends Candidate {
  technical?: TechnicalAnalysis;
  summary: SignalSummary;
  plan: TradePlan | null;
  strategy?: StrategyMode;
  backtest?: RsiOversoldBacktest;
}

const numv = (s?: string | null) => {
  const v = parseFloat((s || '').replace(/,/g, '').trim());
  return isNaN(v) ? 0 : v;
};
const fmt = (n?: number | null, d = 2) =>
  (n == null || Number.isNaN(n) || !Number.isFinite(n))
    ? '—'
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtVol = (n: number) => !Number.isFinite(n) ? '—' : (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

// Parse market-watch snapshot into liquidity-ranked candidates.
const parseCandidates = (html: string): Candidate[] => {
  const out: Candidate[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('table').forEach((table) => {
    const trs = table.querySelectorAll('tr');
    if (trs.length < 2) return;
    const col: Record<string, number> = { SYMBOL: 0, LDCP: 1, CURRENT: 5, CHANGE: 6, VOLUME: 7 };
    let found = false;
    trs[0].querySelectorAll('th, td').forEach((cell, i) => {
      const t = (cell.textContent || '').trim().toUpperCase();
      if (t === 'SYMBOL' || t === 'SCRIP') { col.SYMBOL = i; found = true; }
      if (t === 'LDCP' || t === 'PREV') col.LDCP = i;
      if (t === 'CURRENT' || t === 'PRICE' || t === 'RATE') col.CURRENT = i;
      if (t === 'CHANGE' || t === 'NET CHANGE') col.CHANGE = i;
      if (t.includes('VOL')) col.VOLUME = i;
    });
    trs.forEach((tr, r) => {
      if (found && r === 0) return;
      const cols = tr.querySelectorAll('td');
      if (cols.length <= col.CURRENT) return;
      let symbol = cols[col.SYMBOL]?.querySelector('a')?.textContent?.trim().toUpperCase() || '';
      if (!symbol) symbol = (cols[col.SYMBOL]?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase().split(/[\s-]/)[0];
      if (!symbol || TICKER_BLACKLIST.includes(symbol) || symbol.length > 8 || !isNaN(Number(symbol))) return;
      const current = numv(cols[col.CURRENT]?.textContent);
      if (current <= 0) return;
      const ldcp = numv(cols[col.LDCP]?.textContent);
      const change = numv(cols[col.CHANGE]?.textContent) || (ldcp ? current - ldcp : 0);
      const changePct = ldcp > 0 ? (change / ldcp) * 100 : 0;
      const volume = numv(cols[col.VOLUME]?.textContent);
      out.push({ symbol, current, ldcp, changePct, volume });
    });
  });
  const best = new Map<string, Candidate>();
  out.forEach((c) => { const p = best.get(c.symbol); if (!p || c.volume > p.volume) best.set(c.symbol, c); });
  return Array.from(best.values()).sort((a, b) => b.volume - a.volume);
};

// Pick the scan universe from parsed candidates.
const buildUniverse = (
  candidates: Candidate[],
  u: string,
  opts?: { watchlist?: string[]; holdings?: string[]; symbol?: string },
): Candidate[] => buildScanUniverse(candidates, u, opts);

// Run an async fn over items with limited concurrency.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onProgress: (done: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i]); } catch { /* skip */ }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const VERDICT_STYLE: Record<Verdict, { text: string; bg: string; border: string }> = {
  'STRONG BUY': { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20', border: 'border-emerald-200 dark:border-emerald-500/30' },
  'BUY': { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20' },
  'NEUTRAL': { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' },
  'SELL': { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-100 dark:border-rose-500/20' },
  'STRONG SELL': { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-500/20', border: 'border-rose-200 dark:border-rose-500/30' },
};

const chip = (s: Signal) =>
  s === 'BUY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  : s === 'SELL' ? 'bg-rose-50 text-rose-600 border border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
  : 'bg-slate-50 text-slate-500 border border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

// ---------- Detailed card ----------
const SignalCard: React.FC<{ result: Result; onClick?: (s: string) => void }> = ({ result, onClick }) => {
  const { symbol, current, changePct, summary, plan, strategy, backtest } = result;
  const style = VERDICT_STYLE[summary.verdict];
  const markerPct = ((summary.score + 1) / 2) * 100;
  const up = changePct >= 0;
  const isRsi = strategy === 'rsi_oversold';

  return (
    <div className={`bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border rounded-3xl shadow-card dark:shadow-card-dark overflow-hidden hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 group ${
      isRsi ? 'border-teal-200/80 dark:border-teal-500/30' : 'border-slate-200/60 dark:border-slate-800/60'
    }`}>
      <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 flex items-center justify-center rounded-2xl border shadow-sm shrink-0 ${
            isRsi
              ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-100 dark:border-teal-500/20'
              : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20'
          }`}>
            {isRsi ? <Crosshair size={20} className="text-teal-600 dark:text-teal-400" /> : <Activity size={20} className="text-indigo-600 dark:text-indigo-400" />}
          </div>
          <div>
            <button onClick={() => onClick?.(symbol)} className="text-lg font-display font-black text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors tracking-tight">
              {symbol}
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">
              {isRsi ? 'RSI Oversold · −1.5% / +4%' : '1Y Technicals'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display font-black text-xl text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">{fmt(current)}</div>
          <div className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ml-auto w-fit mt-1 ${up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400'}`}>
            {up ? '+' : '−'}{fmt(Math.abs(changePct))}%
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-col items-center text-center mb-5">
          <div className={`px-6 py-2.5 rounded-2xl text-lg font-display font-black uppercase tracking-widest border shadow-sm ${style.bg} ${style.text} ${style.border}`}>
            {isRsi ? 'RSI BUY' : summary.verdict}
          </div>
          {isRsi ? (
            <div className="mt-3 text-xs font-bold uppercase tracking-widest tabular-nums text-teal-600 dark:text-teal-400">
              RSI 14 = {fmt(summary.rsi, 1)}
            </div>
          ) : (
            <div className="flex gap-4 mt-3 text-xs font-bold uppercase tracking-widest tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">{summary.buys} Buy</span>
              <span className="text-slate-400">{summary.neutrals} Neut</span>
              <span className="text-rose-500 dark:text-rose-400">{summary.sells} Sell</span>
            </div>
          )}
        </div>

        {!isRsi && (
          <div className="relative mb-6 px-1">
            <div className="h-3 rounded-full overflow-hidden flex shadow-inner">
              <div className="flex-1 bg-rose-500/90" />
              <div className="flex-1 bg-rose-400/70" />
              <div className="flex-1 bg-slate-200 dark:bg-slate-700/80" />
              <div className="flex-1 bg-emerald-400/70" />
              <div className="flex-1 bg-emerald-500/90" />
            </div>
            <div className="absolute top-[-5px] w-2 h-5 bg-white dark:bg-slate-200 rounded-full shadow-md border border-slate-300 dark:border-slate-500 -translate-x-1/2 transition-all duration-700 ease-out" style={{ left: `${markerPct}%` }} />
            <div className="flex justify-between text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-widest opacity-80">
              <span>Strong Sell</span><span>Neutral</span><span>Strong Buy</span>
            </div>
          </div>
        )}

        {plan && (
          <div className="mb-5">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500 mb-1">
                  {isRsi ? 'Entry' : 'Buy Range'}
                </div>
                <div className="font-mono font-bold text-sm text-emerald-900 dark:text-emerald-100 tabular-nums">
                  {isRsi ? fmt(plan.entryHigh) : `${fmt(plan.entryLow)} – ${fmt(plan.entryHigh)}`}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/50 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-500 mb-1">Stop Loss</div>
                <div className="font-mono font-bold text-sm text-rose-900 dark:text-rose-100 tabular-nums">
                  {fmt(plan.stop)} <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded shadow-sm ml-1">(−{fmt(plan.riskPct)}%)</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {plan.targets.map((t, i) => (
                <div key={i} className="rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 p-2.5 text-center shadow-sm">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                    {isRsi && i === 0 ? 'Take Profit' : `Target ${i + 1}`}
                  </div>
                  <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(t)}</div>
                  <div className="text-[9px] font-bold text-slate-400 tabular-nums">+{fmt(plan.rewardPct[i])}%</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-2xl bg-sky-50/70 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-400 mb-1">Support</div>
                <div className="font-mono font-bold text-sm text-sky-900 dark:text-sky-100 tabular-nums">{fmt(plan.support)}</div>
              </div>
              <div className="rounded-2xl bg-orange-50/70 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400 mb-1">Resistance</div>
                <div className="font-mono font-bold text-sm text-orange-900 dark:text-orange-100 tabular-nums">{fmt(plan.resistance)}</div>
              </div>
            </div>
          </div>
        )}

        {isRsi && backtest && backtest.trades > 0 && (
          <div className="mb-5 rounded-2xl border border-teal-100 dark:border-teal-500/20 bg-teal-50/40 dark:bg-teal-500/5 p-3 text-xs">
            <div className="font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400 mb-2 text-[10px]">1Y backtest (this symbol)</div>
            <div className="grid grid-cols-3 gap-2 tabular-nums">
              <div><span className="text-slate-400">Trades</span><div className="font-black text-slate-800 dark:text-slate-100">{backtest.trades}</div></div>
              <div><span className="text-slate-400">Win %</span><div className="font-black text-emerald-600 dark:text-emerald-400">{fmt(backtest.winRate, 0)}%</div></div>
              <div><span className="text-slate-400">Avg</span><div className={`font-black ${backtest.avgReturnPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{backtest.avgReturnPct >= 0 ? '+' : ''}{fmt(backtest.avgReturnPct)}%</div></div>
            </div>
          </div>
        )}

        {!isRsi && (
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden shadow-sm bg-white dark:bg-slate-900/50">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-left border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Indicator</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">Value</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-center">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {summary.indicators.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-bold">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums font-medium">{row.value}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold shadow-sm ${chip(row.signal)}`}>{row.signal}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- Compact table (screener style) ----------
const ScreenerTable: React.FC<{
  rows: Result[];
  onClick?: (s: string) => void;
  rsiMode?: boolean;
  lockedFrom?: number;
  onUpgrade?: () => void;
}> = ({ rows, onClick, rsiMode, lockedFrom = Infinity, onUpgrade }) => {
  const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ${className}`}>{children}</th>
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm min-w-[860px] whitespace-nowrap">
        <thead className="bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-left sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
          <tr>
            <Th>Symbol</Th>
            <Th className="text-right">Price</Th>
            <Th className="text-right">Chg %</Th>
            <Th className="text-right">SMA 20</Th>
            <Th className="text-right">SMA 50</Th>
            <Th className="text-right">RSI 14</Th>
            <Th className="text-right">Support</Th>
            <Th className="text-right">Resistance</Th>
            <Th className="text-center">{rsiMode ? '1Y Win%' : 'Signal'}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {rows.map((r, idx) => {
            const locked = idx >= lockedFrom;
            const up = r.changePct >= 0;
            const vs = VERDICT_STYLE[r.summary.verdict];
            const rsiColor = r.summary.rsi < 30 ? 'text-amber-600 dark:text-amber-400' : r.summary.rsi > 70 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
            return (
              <tr key={r.symbol} className={`even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors group relative ${locked ? 'opacity-40' : ''}`}>
                <td className="px-4 py-3">
                  {locked ? (
                    <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 font-display font-black text-indigo-600 dark:text-indigo-400 hover:underline">
                      <Lock size={12} /> Pay to see
                    </button>
                  ) : (
                    <button onClick={() => onClick?.(r.symbol)} className="font-display font-black text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{r.symbol}</button>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{locked ? '•••' : fmt(r.current)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    <span className={`px-1.5 py-0.5 rounded ${up ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                        {locked ? '—' : `${up ? '+' : '−'}${fmt(Math.abs(r.changePct))}%`}
                    </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{locked ? '—' : fmt(r.summary.sma20)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{locked ? '—' : fmt(r.summary.sma50)}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${rsiColor}`}>{locked ? '—' : fmt(r.summary.rsi, 1)}</td>
                <td className="px-4 py-3 text-right font-mono text-sky-600 dark:text-sky-400 font-bold tabular-nums">
                  {locked || !r.plan ? '—' : fmt(r.plan.support)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-orange-600 dark:text-orange-400 font-bold tabular-nums">
                  {locked || !r.plan ? '—' : fmt(r.plan.resistance)}
                </td>
                <td className="px-4 py-3 text-center">
                  {locked ? (
                    <button type="button" onClick={onUpgrade} className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline">Pay to see</button>
                  ) : rsiMode ? (
                    <span className="font-mono font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {r.backtest && r.backtest.trades > 0 ? `${fmt(r.backtest.winRate, 0)}%` : '—'}
                    </span>
                  ) : (
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold border shadow-sm ${vs.bg} ${vs.text} ${vs.border}`}>{r.summary.verdict}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const BacktestSummary: React.FC<{ bt: RsiOversoldBacktest; symbols: number }> = ({ bt, symbols }) => (
  <div className="rounded-3xl border border-teal-200/80 dark:border-teal-500/30 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/70 dark:from-teal-500/10 dark:via-slate-900 dark:to-emerald-500/10 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400 mb-1">RSI Oversold · 1Y Backtest</div>
        <h3 className="text-lg font-display font-black text-slate-900 dark:text-white tracking-tight">
          Entry RSI &lt; 30 · Exit +4% / −1.5%
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Across {symbols} scanned names · ~0.1% round-trip commission · educational only
        </p>
      </div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {[
        { label: 'Trades', value: String(bt.trades) },
        { label: 'Win rate', value: `${fmt(bt.winRate, 1)}%` },
        { label: 'Wins / Losses', value: `${bt.wins} / ${bt.losses}` },
        { label: 'Avg / trade', value: `${bt.avgReturnPct >= 0 ? '+' : ''}${fmt(bt.avgReturnPct)}%` },
        { label: 'Sum of trades', value: `${bt.totalReturnPct >= 0 ? '+' : ''}${fmt(bt.totalReturnPct)}%` },
        { label: 'Max DD (trades)', value: `−${fmt(bt.maxDrawdownPct)}%` },
      ].map((s) => (
        <div key={s.label} className="rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-teal-100/80 dark:border-teal-500/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{s.label}</div>
          <div className="text-base font-display font-black text-slate-900 dark:text-white tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  </div>
);

export const MarketSignalScanner: React.FC<{
  onSymbolClick?: (s: string) => void;
  watchlist?: string[];
  holdings?: string[];
  holdingsLabel?: string;
  onAskAssistant?: (prompt: string) => void;
}> = ({ onSymbolClick, watchlist = [], holdings = [], holdingsLabel = 'Selected portfolio', onAskAssistant }) => {
  const { isFree, quotas, requestUpgrade } = useFreemium();
  const signalsVisible = quotas.signalsVisible ?? 5;
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [universe, setUniverse] = useState<string>('KSE100');
  const [singleSymbol, setSingleSymbol] = useState('');
  const [strategy, setStrategy] = useState<StrategyMode>('composite');
  const [buyOnly, setBuyOnly] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [copied, setCopied] = useState(false);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [scanContext, setScanContext] = useState('');
  const snapshotDialog = useRef<HTMLDialogElement>(null);
  const [snapshotScope, setSnapshotScope] = useState('all');
  const [snapshotLayout, setSnapshotLayout] = useState<SnapshotLayout>('landscape');
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [aggBacktest, setAggBacktest] = useState<RsiOversoldBacktest | null>(null);
  const [settings, setSettings] = useState<ScanBotSettings>(() => loadScanBotSettings());
  const [showSettings, setShowSettings] = useState(false);
  const autoRan = useRef(false);

  // RSI oversold works best on liquid index names — nudge universe when switching mode.
  useEffect(() => {
    if (strategy === 'rsi_oversold' && !['KSE100', 'KMI30', 'WATCHLIST', 'HOLDINGS', 'SYMBOL'].includes(universe)) {
      setUniverse('KSE100');
    }
  }, [strategy, universe]);

  const persistHits = useCallback((collected: Result[], univ: string, mode: StrategyMode, total: number, agg: RsiOversoldBacktest | null) => {
    const hits: DailyScanHit[] = collected.filter(r => !r.technical || r.technical.score != null).map((r) => ({
      symbol: r.symbol,
      current: r.current,
      changePct: r.changePct,
      volume: r.volume,
      verdict: r.summary.verdict,
      rsi: r.summary.rsi,
      score: r.summary.score,
      referencePrice: r.technical?.summary.lastPrice,
      candleDate: r.technical?.candleDate || undefined,
      targets: r.plan?.targets,
      model: r.technical ? 'technical-26' : undefined,
      stop: r.plan?.stop,
      target: r.plan?.targets[0],
      support: r.plan?.support,
      resistance: r.plan?.resistance,
      backtestWinRate: r.backtest && r.backtest.trades > 0 ? r.backtest.winRate : undefined,
      backtestTrades: r.backtest && r.backtest.trades > 0 ? r.backtest.trades : undefined,
      backtestAvgReturnPct: r.backtest && r.backtest.trades > 0 ? r.backtest.avgReturnPct : undefined,
    }));
    saveDailyScan({
      scannedAt: Date.now(),
      universe: univ,
      mode,
      hits,
      totalScanned: total,
      aggBacktest: agg && agg.trades > 0
        ? { trades: agg.trades, winRate: agg.winRate, avgReturnPct: agg.avgReturnPct }
        : undefined,
    });
  }, []);

  const runScan = useCallback(async () => {
    if (universe === 'HOLDINGS' && !holdings.length) {
      setError('There are no open stock holdings in this portfolio. Add a stock purchase or choose another scan universe.');
      return;
    }
    if (isFree) {
      const { ok } = consumeDailyQuota('signals', quotas.signalsPerDay ?? 1);
      if (!ok) { requestUpgrade(); return; }
    }
    setStatus('scanning');
    setError('');
    setResults([]);
    setAggBacktest(null);
    setProgress({ done: 0, total: 0 });
    const rsiMode = strategy === 'rsi_oversold';
    const symbolMode = universe === 'SYMBOL';
    try {
      if (symbolMode && !singleSymbol.trim()) {
        throw new Error('Enter a PSX ticker to scan (e.g. OGDC).');
      }
      const html = await fetchUrlWithFallback('https://dps.psx.com.pk/market-watch');
      if (!html || html.length < 500) throw new Error('Could not fetch the market snapshot. Try again in a moment.');

      const scanUniverse = rsiMode && !['KSE100', 'KMI30', 'WATCHLIST', 'HOLDINGS', 'SYMBOL'].includes(universe) ? 'KSE100' : universe;
      const candidates = buildUniverse(parseCandidates(html), scanUniverse, {
        watchlist,
        holdings,
        symbol: singleSymbol,
      });
      if (candidates.length === 0) {
        if (scanUniverse === 'WATCHLIST') throw new Error('Watchlist is empty or none of your tickers appeared in today\'s market snapshot.');
        if (scanUniverse === 'SYMBOL') throw new Error('Enter a PSX ticker to scan (e.g. OGDC).');
        throw new Error('No matching stocks found. If you scanned an index, check the constituent list in indices.ts.');
      }

      const concurrency = candidates.length > 80 ? 8 : 6;
      if (candidates.length > 40) setView('table');

      setProgress({ done: 0, total: candidates.length });

      const collected: Result[] = [];
      const btParts: RsiOversoldBacktest[] = [];

      await mapPool(candidates, concurrency, async (c) => {
        if (!rsiMode) {
          const bars = await fetchTechnicalScanBars(c.symbol);
          const technical = computeTechnicalAnalysis(bars);
          collected.push({ ...c, current: c.current > 0 ? c.current : technical.summary.lastPrice,
            summary: technical.summary, technical, plan: technical.plan, strategy: 'composite' });
          return;
        }
        const history = await fetchStockHistory(c.symbol, '1Y');
        const closes = history.map((h) => h.price);
        if (closes.length < 35) return;
        const price = c.current > 0 ? c.current : closes[closes.length - 1];
        const row = { ...c, current: price };
        const summary = computeSignal(closes);

        if (rsiMode) {
          const bt = backtestRsiOversold(closes);
          btParts.push(bt);
          const oversold = summary.rsi < 30;
          if (!oversold && !symbolMode) return;
          if (oversold) {
            const plan = computeRsiOversoldPlan(price);
            collected.push({
              ...row,
              summary: { ...summary, verdict: 'BUY' },
              plan,
              strategy: 'rsi_oversold',
              backtest: bt,
            });
          } else {
            const plan = computeTradePlan(closes, price);
            collected.push({ ...row, summary, plan, strategy: 'rsi_oversold', backtest: bt });
          }
          return;
        }

      }, (done) => setProgress((p) => ({ ...p, done })));

      let agg: RsiOversoldBacktest | null = null;
      if (rsiMode) {
        collected.sort((a, b) => a.summary.rsi - b.summary.rsi || b.volume - a.volume);
        agg = mergeRsiOversoldBacktests(btParts);
        setAggBacktest(agg);
      } else {
        collected.sort((a, b) => (b.technical?.score ?? -2) - (a.technical?.score ?? -2) || b.volume - a.volume);
      }

      setResults(collected);
      setScannedAt(new Date());
      setScanContext(`${scanUniverse === 'HOLDINGS' ? 'My holdings' : scanUniverse === 'SYMBOL' ? singleSymbol.toUpperCase() : scanUniverse} · ${rsiMode ? 'RSI oversold' : '26-indicator technical scan'} · Daily history · ${candidates.length} stocks scanned`);
      persistHits(collected, scanUniverse, strategy, candidates.length, agg);
      setStatus('done');
    } catch (e: any) {
      setError(e.message || 'Scan failed.');
      setStatus('idle');
    }
  }, [universe, strategy, singleSymbol, watchlist, holdings, holdingsLabel, isFree, quotas.signalsPerDay, requestUpgrade, persistHits]);

  useEffect(() => {
    if (autoRan.current || !settings.autoRunIfStale) return;
    if (isFree && peekDailyQuota('signals') >= (quotas.signalsPerDay ?? 1)) return;
    const snap = loadDailyScan();
    if (isScanStale(snap, settings.staleHours)) {
      autoRan.current = true;
      void runScan();
    }
  }, [settings.autoRunIfStale, settings.staleHours, runScan, isFree, quotas.signalsPerDay]);

  const rsiMode = strategy === 'rsi_oversold';
  const symbolMode = universe === 'SYMBOL';

  const shown = results.filter((r) => {
    if (symbolMode) return true;
    if (rsiMode) return true;
    return buyOnly ? r.summary.enoughData && (r.summary.verdict === 'BUY' || r.summary.verdict === 'STRONG BUY') : true;
  });
  const snapshotResults = isFree ? shown.slice(0, signalsVisible) : shown;
  const takeSnapshot = async () => {
    setSnapshotBusy(true);
    setSnapshotMessage('Preparing complete images…');
    try {
      const selected = snapshotScope === 'all' ? snapshotResults : snapshotResults.filter(r => r.symbol === snapshotScope);
      const snapshot: ScanSnapshot = {
        layout: snapshotLayout,
        scannedAt: scannedAt?.toLocaleString('en-GB', { timeZoneName: 'short' }) || 'Scan time unavailable',
        context: scanContext,
        note: `${selected.length} of ${results.length} results included. Market quotes and history may have different timestamps.`,
        stocks: selected.map(r => {
          if (r.technical) return technicalSnapshotStock({ ...r, technical: r.technical });
          const averageRows = r.summary.indicators.filter(i => /SMA|EMA/.test(i.name));
          const oscillatorRows = r.summary.indicators.filter(i => !/SMA|EMA/.test(i.name));
          const groups = [
            { label: 'Moving averages', rows: averageRows, total: 6, kind: 'averages' as const },
            { label: 'Oscillators', rows: oscillatorRows, total: 3, kind: 'oscillators' as const },
          ];
          const sections: SnapshotSection[] = groups.map(g => ({ title: g.label, kind: g.kind, rows: g.rows.map(i => ({ label: i.name, value: i.value, signal: i.signal })) }));
          if (r.plan) sections.push({ title: 'Price levels & trade plan (PKR)', rows: [
            { label: 'Entry range', value: `${fmt(r.plan.entryLow)} – ${fmt(r.plan.entryHigh)}` },
            { label: 'Stop level', value: fmt(r.plan.stop) },
            ...r.plan.targets.map((t, i) => ({ label: `Take profit ${i + 1} · reward ${fmt(r.plan!.rewardPct[i])}%`, value: `${fmt(t)} · ${r.current > r.plan!.stop ? fmt((t - r.current) / (r.current - r.plan!.stop)) + 'R' : 'R unavailable'}` })),
            { label: 'Risk / reward reference price', value: fmt(r.current) },
            { label: r.plan.supportLabel || 'Support', value: fmt(r.plan.support) },
            { label: r.plan.resistanceLabel || 'Resistance', value: fmt(r.plan.resistance) },
            { label: 'Risk', value: `${fmt(r.plan.riskPct)}%` },
            { label: r.strategy === 'rsi_oversold' ? 'Preset risk distance (1.5%)' : 'ATR (close-based estimate)', value: fmt(r.plan.atr) },
            ...(r.plan.pivot == null ? [] : [{ label: 'Pivot', value: fmt(r.plan.pivot) }]),
          ] });
          if (r.backtest) sections.push({ title: '1-year RSI strategy backtest', rows: [
            { label: 'Closed trades · wins / losses', value: `${r.backtest.trades} · ${r.backtest.wins} / ${r.backtest.losses}` },
            { label: 'Win rate', value: `${fmt(r.backtest.winRate)}%` },
            { label: 'Average return / trade', value: `${fmt(r.backtest.avgReturnPct)}%` },
            { label: 'Sum of trade returns (not compounded)', value: `${fmt(r.backtest.totalReturnPct)}%` },
            { label: 'Expectancy', value: `${fmt(r.backtest.expectancyPct)}%` },
            { label: 'Maximum drawdown', value: `${fmt(r.backtest.maxDrawdownPct)}%` },
          ] });
          return { symbol: r.symbol, rating: r.summary.verdict, price: fmt(r.current),
            change: Number.isFinite(r.changePct) ? `${r.changePct >= 0 ? '+' : ''}${fmt(r.changePct)}%` : 'Unavailable',
            summary: {
              score: r.summary.score, buys: r.summary.buys, sells: r.summary.sells, neutrals: r.summary.neutrals,
              available: r.summary.indicators.length, total: 9,
              caption: r.strategy === 'rsi_oversold' ? 'RSI strategy rating; gauge shows the composite indicator score.' : 'Current multi-indicator scan. Price levels are shown separately.',
              methodology: 'Equal weight to available indicators',
              groups: groups.map(g => {
                const buys = g.rows.filter(i => i.signal === 'BUY').length, sells = g.rows.filter(i => i.signal === 'SELL').length;
                const score = (buys - sells) / (g.rows.length || 1);
                const rating = g.rows.length < g.total ? 'Incomplete' : score >= .5 ? 'Strong Buy' : score >= .15 ? 'Buy' : score > -.15 ? 'Neutral' : score > -.5 ? 'Sell' : 'Strong Sell';
                return { label: g.label, rating, buys, sells, neutrals: g.rows.length - buys - sells, available: g.rows.length, total: g.total };
              }),
            }, facts: [
            { label: 'Price (PKR)', value: fmt(r.current) },
            { label: 'Daily change', value: Number.isFinite(r.changePct) ? `${fmt(r.changePct)}%` : 'Unavailable' },
            { label: 'Volume', value: fmt(r.volume, 0) },
            { label: 'Indicator votes · Buy / Neutral / Sell', value: `${r.summary.buys} / ${r.summary.neutrals} / ${r.summary.sells}` },
            { label: 'Score', value: fmt(r.summary.score) },
            { label: 'SMA 20 / SMA 50', value: `${fmt(r.summary.sma20)} / ${fmt(r.summary.sma50)}` },
            { label: 'RSI (14)', value: fmt(r.summary.rsi) },
          ], sections, notes: [{ title: 'How the rating works', paragraphs: [
            'This scan uses the current engine: up to 6 moving-average comparisons and 3 oscillators. Each available reading contributes Buy (+1), Neutral (0), or Sell (−1). The composite score is (Buy votes − Sell votes) divided by the number of available readings; each available indicator has equal weight.',
            `This scan has ${r.summary.buys} Buy, ${r.summary.neutrals} Neutral and ${r.summary.sells} Sell votes, giving a composite score of ${fmt(r.summary.score)}. Strong Buy: score ≥ 0.50; Buy: 0.15 to below 0.50; Neutral: above −0.15 to below 0.15; Sell: above −0.50 to −0.15; Strong Sell: score ≤ −0.50.`,
            r.strategy === 'rsi_oversold' ? 'RSI Oversold is a separate strategy: RSI below 30 sets its Buy label. The gauge still shows the composite score. The backtest uses take profit 1 (+4%) and a −1.5% stop; take profits 2 and 3 are extra displayed levels, not the exits used by that backtest.' : 'Group cards summarise their own available readings. Their average does not replace the engine’s composite score. Missing long-period averages are omitted from the current engine; group coverage shows any incomplete group.',
            'Values depend on the input data, periods, candle timing and signal rules. Price levels are separate from the rating. Target returns and risk/reward use the displayed reference price and stop; an actual entry price or fees will change them.',
          ] }] };
        }),
      };
      const { downloadScanSnapshot } = await import('../utils/scanSnapshot');
      const count = await downloadScanSnapshot(snapshot, (done, total) => setSnapshotMessage(`Preparing images… ${done} / ${total} stocks`));
      setSnapshotMessage(`Download started: ${count === 1 ? 'one complete PNG image' : `${count} complete PNG images in one ZIP`}. Nothing was uploaded.`);
    } catch (e) { setSnapshotMessage(e instanceof Error ? e.message : 'Could not create the snapshot. Please try again.'); }
    finally { setSnapshotBusy(false); }
  };

  const assistantPrompt = scannedAt
    ? `Summarize my latest Market Signals scan (${universe}${symbolMode ? `: ${singleSymbol.toUpperCase()}` : ''}, ${rsiMode ? 'RSI oversold' : 'multi-indicator'}). Highlight the strongest 3–5 names, note support/resistance, and flag risks. Use get_daily_scan for the data.`
    : 'Summarize what a Market Signals scan would show — I have not run one yet.';

  const copyAll = async () => {
    const header = rsiMode
      ? 'SYMBOL\tPRICE\tCHG %\tRSI14\tSTOP\tTP\tSUPPORT\tRESISTANCE\t1Y_WIN%\t1Y_TRADES\tSIGNAL'
      : 'SYMBOL\tPRICE\tCHG %\tSMA20\tSMA50\tRSI14\tSUPPORT\tRESISTANCE\tSIGNAL';
    const body = snapshotResults.map((r) =>
      rsiMode
        ? `${r.symbol}\t${fmt(r.current)}\t${fmt(r.changePct)}\t${fmt(r.summary.rsi, 1)}\t${r.plan ? fmt(r.plan.stop) : ''}\t${r.plan ? fmt(r.plan.targets[0]) : ''}\t${r.plan ? fmt(r.plan.support) : ''}\t${r.plan ? fmt(r.plan.resistance) : ''}\t${r.backtest ? fmt(r.backtest.winRate, 1) : ''}\t${r.backtest?.trades ?? ''}\tRSI_OVERSOLD`
        : `${r.symbol}\t${fmt(r.current)}\t${fmt(r.changePct)}\t${fmt(r.summary.sma20)}\t${fmt(r.summary.sma50)}\t${fmt(r.summary.rsi, 1)}\t${r.plan ? fmt(r.plan.support) : ''}\t${r.plan ? fmt(r.plan.resistance) : ''}\t${r.technical?.rating || r.summary.verdict}`
    ).join('\n');
    await navigator.clipboard.writeText(`${header}\n${body}\n${SCAN_DISCLAIMER}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const isAll = universe === 'ALL';

  const patchSettings = (partial: Partial<ScanBotSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveScanBotSettings(next);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 w-full min-w-0">
      <dialog ref={snapshotDialog} aria-labelledby="scan-snapshot-title" onCancel={e => { if (snapshotBusy) e.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl p-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xl backdrop:bg-slate-950/50">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 id="scan-snapshot-title" className="text-xl font-bold">Download snapshot</h3>
          <button type="button" disabled={snapshotBusy} aria-label="Close snapshot" onClick={() => snapshotDialog.current?.close()} className="p-2 rounded-xl disabled:opacity-40"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Save the full scan details, including all indicator rows and price levels. Images are created on this device; nothing is uploaded.</p>
        <label className="block text-sm font-bold">Include
          <select value={snapshotScope} disabled={snapshotBusy} onChange={e => setSnapshotScope(e.target.value)} className="block w-full mt-2 mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="all">All visible stocks ({snapshotResults.length})</option>
            {snapshotResults.map(r => <option key={r.symbol} value={r.symbol}>{r.symbol} only</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold">Image layout
          <select value={snapshotLayout} disabled={snapshotBusy} onChange={e => setSnapshotLayout(e.target.value as SnapshotLayout)} className="block w-full mt-2 mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="portrait">1 · Portrait report</option>
            <option value="columns">2 · Two-column report</option>
            <option value="landscape">3 · Landscape sheet</option>
          </select>
        </label>
        <p className="text-xs text-slate-500 mb-4">One stock saves as a PNG. Multiple stocks or very long results save as numbered PNGs in a ZIP. Your portfolio quantities, balances and account details are excluded.</p>
        <button type="button" onClick={takeSnapshot} disabled={snapshotBusy || !snapshotResults.length} className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50">
          {snapshotBusy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} {snapshotBusy ? 'Preparing…' : 'Save to device'}
        </button>
        <p role="status" aria-live="polite" className="text-sm mt-4">{snapshotMessage}</p>
      </dialog>
      {/* Header / controls */}
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 ${
              rsiMode
                ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-100 dark:border-teal-500/20'
                : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20'
            }`}>
              {rsiMode
                ? <Crosshair size={24} className="text-teal-600 dark:text-teal-400" />
                : <Radar size={24} className="text-indigo-600 dark:text-indigo-400" />}
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                Market Signals
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                {scannedAt
                  ? `Scanned ${scannedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Found ${shown.length} ${rsiMode ? 'oversold' : 'signals'}`
                  : 'Scan indexes, watchlist, or one ticker — with support & resistance'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <Settings2 size={14} /> Settings
            </button>
            {onAskAssistant && (
              <button
                type="button"
                onClick={() => onAskAssistant(assistantPrompt)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/20"
              >
                <Sparkles size={14} /> Summarize
              </button>
            )}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
              <button
                type="button"
                onClick={() => { if (strategy !== 'composite') { setStrategy('composite'); setResults([]); setScannedAt(null); setStatus('idle'); setAggBacktest(null); } }}
                disabled={status === 'scanning'}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${strategy === 'composite' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                All 26 indicators
              </button>
              <button
                type="button"
                onClick={() => { if (strategy !== 'rsi_oversold') { setStrategy('rsi_oversold'); setResults([]); setScannedAt(null); setStatus('idle'); setAggBacktest(null); } }}
                disabled={status === 'scanning'}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${strategy === 'rsi_oversold' ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                RSI Oversold
              </button>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
              <button onClick={() => setView('cards')} title="Card view" className={`p-2 rounded-lg transition-all ${view === 'cards' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                <LayoutGrid size={16} />
              </button>
              <button onClick={() => setView('table')} title="Table view" className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                <TableIcon size={16} />
              </button>
            </div>

            <div className="relative">
                <select
                value={universe}
                aria-label="Scan universe"
                onChange={(e) => { setUniverse(e.target.value); if (e.target.value === 'HOLDINGS') setBuyOnly(false); }}
                disabled={status === 'scanning'}
                className="appearance-none glass-input rounded-xl pl-4 pr-9 py-2.5 text-sm font-bold outline-none shadow-sm disabled:opacity-50"
                >
                <option value="KSE100">KSE-100 index</option>
                <option value="KMI30">KMI-30 index</option>
                <option value="WATCHLIST">My watchlist</option>
                <option value="HOLDINGS">My holdings ({holdings.length})</option>
                <option value="SYMBOL">Single stock</option>
                {!rsiMode && <option value="20">Top 20 by volume</option>}
                {!rsiMode && <option value="40">Top 40 by volume</option>}
                {!rsiMode && <option value="60">Top 60 by volume</option>}
                {!rsiMode && <option value="100">Top 100 by volume</option>}
                {!rsiMode && <option value="ALL">All market (slow)</option>}
                </select>
            </div>

            {universe === 'SYMBOL' && (
              <input
                type="text"
                value={singleSymbol}
                onChange={(e) => setSingleSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                placeholder="e.g. OGDC"
                disabled={status === 'scanning'}
                className="glass-input rounded-xl px-3 py-2.5 text-sm font-bold uppercase w-28 outline-none shadow-sm disabled:opacity-50"
              />
            )}

            {!rsiMode && !symbolMode && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={buyOnly} onChange={(e) => setBuyOnly(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300" />
                Buys Only
              </label>
            )}

            {results.length > 0 && (
              <button onClick={copyAll} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:-translate-y-0.5 active:translate-y-0 shrink-0">
                {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />} Copy
              </button>
            )}
            {snapshotResults.length > 0 && (
              <button type="button" onClick={() => { setSnapshotScope('all'); setSnapshotMessage(''); snapshotDialog.current?.showModal(); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <Download size={16} /> Download snapshot
              </button>
            )}

            <button
              onClick={runScan}
              disabled={status === 'scanning'}
              className={`flex items-center gap-2 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:-translate-y-0.5 active:translate-y-0 shrink-0 ${
                rsiMode
                  ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              {status === 'scanning' ? <Loader2 size={18} className="animate-spin" /> : rsiMode ? <Crosshair size={18} /> : <Radar size={18} />}
              {status === 'scanning' ? 'Scanning…' : symbolMode ? 'Scan ticker' : rsiMode ? 'Scan RSI < 30' : 'Scan Market'}
            </button>
          </div>
        </div>

        {universe === 'HOLDINGS' && <p className="mt-3 text-xs text-slate-500">{holdingsLabel} · {holdings.length} open stock holdings. Closed positions and mutual funds are excluded. {rsiMode ? 'This strategy shows only holdings with RSI below 30.' : 'Buy, neutral and sell signals are shown by default.'}</p>}

        {showSettings && (
          <div className="mt-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={settings.autoRunIfStale}
                onChange={(e) => patchSettings({ autoRunIfStale: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-600"
              />
              Auto-run when last scan is stale
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              Stale after
              <input
                type="number"
                min={1}
                max={168}
                value={settings.staleHours}
                onChange={(e) => patchSettings({ staleHours: Math.max(1, Number(e.target.value) || 24) })}
                className="w-16 glass-input rounded-lg px-2 py-1 text-xs font-bold"
              />
              hours
            </label>
          </div>
        )}

        {rsiMode && status !== 'scanning' && (
          <div className="mt-4 p-3 bg-teal-50/80 dark:bg-teal-500/10 border border-teal-200/60 dark:border-teal-500/20 rounded-xl text-xs font-medium text-teal-800 dark:text-teal-300 flex items-start gap-2 shadow-sm">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              Preset: buy when 14-day RSI drops below 30; plan uses a fixed <strong>−1.5% stop</strong> and <strong>+4% take-profit</strong>.
              Scan also runs a 1-year walk-forward backtest on the same rule (with ~0.1% commission). Educational only — not investment advice.
            </p>
          </div>
        )}

        {isAll && status !== 'scanning' && !rsiMode && (
          <div className="mt-4 p-3 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 flex items-start gap-2 shadow-sm">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>Full-market scan loads daily history for each listed stock and can take several minutes. Missing history is shown as unavailable. Recent candle requests are reused for five minutes.</p>
          </div>
        )}

        {status === 'scanning' && (
          <div className="mt-5 px-2 pb-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              <span>{rsiMode ? 'Scanning + backtesting' : 'Analyzing'} {progress.total} stocks…</span>
              <span className="tabular-nums">{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
              <div className={`h-full transition-all duration-300 ease-out ${rsiMode ? 'bg-teal-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <p className="px-4 py-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-500/10 text-xs text-slate-600 dark:text-slate-300 border border-emerald-100 dark:border-emerald-800">{SCAN_DISCLAIMER}</p>

      {error && (
        <div className="p-4 bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-2xl text-sm font-bold text-rose-600 dark:text-rose-400 shadow-sm animate-in fade-in">
          {error}
        </div>
      )}

      {rsiMode && aggBacktest && aggBacktest.trades > 0 && status === 'done' && (
        <BacktestSummary bt={aggBacktest} symbols={progress.total || results.length} />
      )}

      {status === 'idle' && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-5 shadow-inner">
             <TrendingUp size={36} className="text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-display font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Ready to Scan</h3>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">
            {rsiMode
              ? 'Hit “Scan RSI < 30” to find oversold KSE-100 / KMI-30 names and see a 1Y backtest.'
              : 'Choose your holdings, watchlist, an index or one stock, then scan all 26 technical readings.'}
          </p>
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-xl text-xs text-slate-500 dark:text-slate-400 max-w-md shadow-sm leading-relaxed">
            {rsiMode
              ? 'Universe defaults to KSE-100. Live hits require RSI < 30; each name also gets a walk-forward +4% / −1.5% backtest on ~1 year of daily closes.'
              : 'See 15 moving-average readings, 11 oscillators, an equal-group rating, and an illustrative trade scenario with three take-profit levels. Save a complete Design 3 snapshot to your device.'}
          </div>
        </div>
      )}

      {/* Results */}
      {shown.length > 0 && !rsiMode && <TechnicalScanResults
        results={shown.filter((r): r is Result & TechnicalResult => !!r.technical)} view={view}
        visibleLimit={isFree ? signalsVisible : Infinity} onUpgrade={requestUpgrade} onChart={onSymbolClick}
        onSnapshot={symbol => { setSnapshotScope(symbol); setSnapshotMessage(''); snapshotDialog.current?.showModal(); }}
      />}
      {shown.length > 0 && rsiMode && view === 'table' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <ScreenerTable
             rows={shown}
             onClick={onSymbolClick}
             rsiMode={rsiMode}
             lockedFrom={isFree ? signalsVisible : Infinity}
             onUpgrade={requestUpgrade}
           />
        </div>
      )}
      {shown.length > 0 && rsiMode && view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {shown.map((r, idx) => {
            const locked = isFree && idx >= signalsVisible;
            return (
              <div key={r.symbol} className="relative">
                <div className={locked ? 'opacity-40 blur-[2px] pointer-events-none select-none' : ''}>
                  <SignalCard result={r} onClick={onSymbolClick} />
                </div>
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-950/40 rounded-3xl">
                    <button
                      type="button"
                      onClick={requestUpgrade}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg"
                    >
                      <Lock size={14} /> Pay to see
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {status === 'done' && shown.length === 0 && !error && (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-16 text-center shadow-sm">
          <p className="text-slate-500 dark:text-slate-400 font-bold text-lg">
            {rsiMode ? 'No names with RSI below 30 right now.' : 'No buy signals in this batch.'}
          </p>
          <p className="text-slate-400 text-sm mt-2">
            {rsiMode
              ? 'Try KMI-30, or check the backtest summary above for how the rule performed over the past year even when the market isn’t oversold today.'
              : 'Try scanning a larger universe or uncheck “Buys only” to see neutral and sell ratings.'}
          </p>
        </div>
      )}

      {/* Disclaimer */}
      {(results.length > 0 || (rsiMode && aggBacktest)) && (
        <div className="flex items-start gap-3 bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed shadow-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p>
            <strong className="text-slate-700 dark:text-slate-300">Disclaimer:</strong> Mechanical technical signals, fixed RSI exits, and backtests are for educational purposes only and do not constitute investment advice.
            {rsiMode
              ? ' The RSI < 30 / +4% / −1.5% rule is a common mean-reversion heuristic; 1Y walk-forward results use unofficial EOD closes and approximate commissions — past results are not a guarantee of future performance.'
              : ' The overall rating combines two equally weighted indicator groups. Long-position scenarios use historical true range and observed support; reaching a target is not guaranteed.'}
            {' '}Data is unofficial and may be delayed. Always perform your own due diligence.
          </p>
        </div>
      )}
    </div>
  );
};
