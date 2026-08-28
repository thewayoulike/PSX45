import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot, Loader2, Play, Sparkles, Clock, Settings2, Radar, Crosshair,
} from 'lucide-react';
import {
  DailyScanSnapshot,
  ScanBotSettings,
  ScanMode,
  ScanUniverse,
  isScanStale,
  loadDailyScan,
  loadScanBotSettings,
  runDailyScan,
  saveScanBotSettings,
} from '../services/scanBot';

interface Props {
  watchlist: string[];
  onAskAssistant?: (prompt: string) => void;
  onSymbolClick?: (symbol: string) => void;
}

const fmt = (n?: number | null, d = 2) =>
  (n == null || Number.isNaN(n) || !Number.isFinite(n))
    ? '—'
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtPct = (n?: number | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmt(n)}%`;
};

const UNIVERSE_LABEL: Record<ScanUniverse, string> = {
  KSE100: 'KSE-100',
  KMI30: 'KMI-30',
  WATCHLIST: 'Watchlist',
};

export const DailyScanBot: React.FC<Props> = ({ watchlist, onAskAssistant, onSymbolClick }) => {
  const [settings, setSettings] = useState<ScanBotSettings>(() => loadScanBotSettings());
  const [snapshot, setSnapshot] = useState<DailyScanSnapshot | null>(() => loadDailyScan());
  const [universe, setUniverse] = useState<ScanUniverse>(settings.defaultUniverse);
  const [mode, setMode] = useState<ScanMode>(settings.defaultMode);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const autoRan = React.useRef(false);

  const run = useCallback(async () => {
    setStatus('running');
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const snap = await runDailyScan({
        universe,
        mode,
        watchlist,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSnapshot(snap);
      setStatus('done');
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
      setStatus('error');
    }
  }, [universe, mode, watchlist]);

  useEffect(() => {
    if (autoRan.current || !settings.autoRunIfStale) return;
    const snap = loadDailyScan();
    if (isScanStale(snap, settings.staleHours)) {
      autoRan.current = true;
      run();
    }
  }, [settings.autoRunIfStale, settings.staleHours, run]);

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const rsiMode = mode === 'rsi_oversold';
  const stale = isScanStale(snapshot, settings.staleHours);

  const assistantPrompt = snapshot
    ? `Summarize my latest Daily Scan (${UNIVERSE_LABEL[snapshot.universe]}, ${rsiMode ? 'RSI oversold' : 'multi-indicator buys'}). Highlight the strongest 3–5 names, note any that overlap my watchlist, and flag risks. Use get_daily_scan for the data.`
    : 'Summarize what a Daily Scan would show — I have not run one yet.';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 w-full min-w-0">
      <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-100 dark:border-cyan-500/20">
              <Bot size={24} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                Daily Scan Bot
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                Automated PSX scan — no Gemini. Optional AI summary uses your own key in PSX Assistant.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <Settings2 size={14} /> Settings
          </button>
        </div>

        {showSettings && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoRunIfStale}
                onChange={(e) => {
                  const next = { ...settings, autoRunIfStale: e.target.checked };
                  setSettings(next);
                  saveScanBotSettings(next);
                }}
                className="rounded"
              />
              Auto-run when I open the app if last scan is older than {settings.staleHours}h
            </label>
            <div className="flex gap-3 flex-wrap text-xs">
              <span className="text-slate-400">Default universe:</span>
              {(['KSE100', 'KMI30', 'WATCHLIST'] as ScanUniverse[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    const next = { ...settings, defaultUniverse: u };
                    setSettings(next);
                    saveScanBotSettings(next);
                    setUniverse(u);
                  }}
                  className={`px-2 py-1 rounded-md font-bold ${settings.defaultUniverse === u ? 'bg-cyan-100 text-cyan-800' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
                >
                  {UNIVERSE_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMode('composite')}
              disabled={status === 'running'}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${mode === 'composite' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}
            >
              <Radar size={14} /> Multi-indicator
            </button>
            <button
              type="button"
              onClick={() => setMode('rsi_oversold')}
              disabled={status === 'running'}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${mode === 'rsi_oversold' ? 'bg-white dark:bg-slate-700 text-teal-600 shadow-sm' : 'text-slate-500'}`}
            >
              <Crosshair size={14} /> RSI &lt; 30
            </button>
          </div>

          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value as ScanUniverse)}
            disabled={status === 'running'}
            className="glass-input rounded-xl px-4 py-2.5 text-sm font-bold outline-none"
          >
            <option value="KSE100">KSE-100</option>
            <option value="KMI30">KMI-30</option>
            <option value="WATCHLIST">My watchlist ({watchlist.length})</option>
          </select>

          <button
            type="button"
            onClick={run}
            disabled={status === 'running'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-cyan-600/20"
          >
            {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Run scan
          </button>

          {onAskAssistant && (
            <button
              type="button"
              onClick={() => onAskAssistant(assistantPrompt)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-sm font-bold bg-purple-50/50 dark:bg-purple-500/10 hover:bg-purple-100/80 dark:hover:bg-purple-500/20"
            >
              <Sparkles size={16} />
              Summarize in Assistant
            </button>
          )}
        </div>

        {status === 'running' && (
          <div className="mt-4">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
              <span>Scanning {progress.total} symbols…</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-500 font-medium">{error}</p>}

        {snapshot && status !== 'running' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Clock size={14} />
            Last scan: {new Date(snapshot.scannedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            {stale && <span className="text-amber-600 font-bold">· Stale — consider re-running</span>}
            <span>· {snapshot.hits.length} hits / {snapshot.totalScanned} scanned</span>
          </div>
        )}
      </div>

      {snapshot?.aggBacktest && rsiMode && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: '1Y trades (universe)', v: String(snapshot.aggBacktest.trades) },
            { k: 'Win rate', v: `${fmt(snapshot.aggBacktest.winRate, 0)}%` },
            { k: 'Avg return / trade', v: fmtPct(snapshot.aggBacktest.avgReturnPct) },
          ].map(({ k, v }) => (
            <div key={k} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{k}</div>
              <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1">{v}</div>
            </div>
          ))}
        </div>
      )}

      {snapshot && snapshot.hits.length > 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-card dark:shadow-card-dark">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {rsiMode ? 'Oversold hits' : 'Buy signals'} · {UNIVERSE_LABEL[snapshot.universe]}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left px-5 py-3">Symbol</th>
                  <th className="text-right px-3 py-3">Price</th>
                  <th className="text-right px-3 py-3">Chg %</th>
                  <th className="text-right px-3 py-3">RSI</th>
                  <th className="text-left px-3 py-3">Signal</th>
                  <th className="text-right px-3 py-3">Stop</th>
                  <th className="text-right px-3 py-3">Target</th>
                  {rsiMode && <th className="text-right px-5 py-3">1Y BT</th>}
                </tr>
              </thead>
              <tbody>
                {snapshot.hits.map((h) => (
                  <tr
                    key={h.symbol}
                    className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => onSymbolClick?.(h.symbol)}
                  >
                    <td className="px-5 py-2.5 font-black text-cyan-700 dark:text-cyan-400">{h.symbol}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(h.current)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${h.changePct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmtPct(h.changePct)}</td>
                    <td className="px-3 py-2.5 text-right">{fmt(h.rsi, 1)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-emerald-600">{h.verdict}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(h.stop)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(h.target)}</td>
                    {rsiMode && (
                      <td className="px-5 py-2.5 text-right text-xs">
                        {h.backtestTrades ? `${fmt(h.backtestWinRate, 0)}% · ${h.backtestTrades}t` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : snapshot && status !== 'running' ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Scan complete — no {rsiMode ? 'RSI oversold' : 'buy'} signals in {UNIVERSE_LABEL[snapshot.universe]} right now.
        </div>
      ) : !snapshot && status !== 'running' ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          Run your first scan to build today&apos;s signal list. No API key required.
        </div>
      ) : null}

      <p className="text-[11px] text-slate-400 text-center pb-2">
        Scan bot uses the same rules as Market Signals. Gemini is only used if you open PSX Assistant for a summary.
      </p>
    </div>
  );
};
