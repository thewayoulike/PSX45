import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Plug, ShieldCheck } from 'lucide-react';
import { createConnectorLink, loadConnectorStatus, revokeConnectorLink, setConnectorSharing, type ConnectorStatus } from '../services/aiConnector';
import { SiteFooter } from './SiteFooter';

const APPS = [
  { id: 'Claude', steps: ['Open Claude (claude.ai or the app) → Settings → Connectors.', 'Choose “Add custom connector”, name it PSX Tracker and paste your link.', 'In a chat, turn on PSX Tracker from the tools menu and ask about your portfolio.'] },
  { id: 'ChatGPT', steps: ['Open ChatGPT → Settings → Apps & Connectors → Advanced, and turn on developer mode.', 'Choose “Create”, name it PSX Tracker, paste your link and choose “No authentication”.', 'In a chat, pick PSX Tracker from the tools menu.'] },
  { id: 'Cursor', steps: ['Open Cursor → Settings → MCP → Add new MCP server.', 'Paste your link as the server URL (type: streamable HTTP).', 'Ask in the chat; Cursor shows each PSX Tracker lookup.'] },
];
const PLAN_NAMES: Record<string, string> = { free: 'Free', trial: 'Trial', paid: 'Paid', lifetime: 'Lifetime' };
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Karachi' }) : 'Not used yet';

export function AiConnectorPage() {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [app, setApp] = useState('Claude');
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadConnectorStatus().then(setStatus, (e) => setError(e.message)); }, []);
  const run = async (task: () => Promise<ConnectorStatus | void>) => {
    setBusy(true); setError('');
    try { const next = await task(); if (next) setStatus(next); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const create = () => run(async () => {
    const { link } = await createConnectorLink(app);
    setNewLink(link); setCopied(false);
    return loadConnectorStatus();
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(newLink); setCopied(true); }
    catch { setError('Copy was blocked. Select the link and copy it manually.'); }
  };
  const usedPct = status ? Math.min(100, (status.usedToday / Math.max(1, status.dailyLimit)) * 100) : 0;
  const steps = APPS.find((a) => a.id === app)!.steps;
  const card = 'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5';

  return (
    <section className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3"><Plug className="text-emerald-600" size={28} /> AI assistant</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Connect PSX Tracker to Claude, ChatGPT or Cursor and ask about your portfolio, prices, signals, backtests and news in plain words. Your AI app does the thinking on your own account; PSX Tracker answers the data lookups.</p>
      </div>

      {error && <p role="alert" className="text-sm rounded-xl p-3 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <div className={card}>
        <h2 className="text-xl font-bold">1. Create your private link</h2>
        <div role="group" aria-label="AI app" className="flex flex-wrap gap-2 mt-3">
          {APPS.map((a) => (
            <button key={a.id} type="button" aria-pressed={app === a.id} onClick={() => { setApp(a.id); setNewLink(''); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold border ${app === a.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{a.id}</button>
          ))}
        </div>
        {newLink ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <code className="flex-1 min-w-0 break-all rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-sm select-all">{newLink}</code>
              <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-3 font-bold">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Copy it now: for your safety it is shown only once. Anyone with this link can read your PSX Tracker data, so paste it only into your own AI app.</p>
          </div>
        ) : (
          <button type="button" disabled={busy || !status} onClick={create} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-5 py-3 font-bold disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Create link for {app}
          </button>
        )}
      </div>

      <div className={card}>
        <h2 className="text-xl font-bold">2. Add it in {app}</h2>
        <ol className="mt-3 list-decimal pl-5 space-y-1.5 text-slate-700 dark:text-slate-200">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="mt-3 text-sm text-slate-500">Then try: “How did my portfolio do this month?”, “Is OGDC in the news?” or “Which strategy would have worked best on ENGROH?”</p>
      </div>

      <div className={card}>
        <h2 className="text-xl font-bold">Your connections</h2>
        {!status && !error && <p className="mt-3 text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
        {status && (
          <>
            <div className="mt-3">
              <div className="flex justify-between text-sm"><span>Lookups today · {PLAN_NAMES[status.plan] || status.plan} plan</span><span className="tabular-nums font-bold">{status.usedToday} of {status.dailyLimit.toLocaleString('en-US')}</span></div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${usedPct}%` }} /></div>
              <p className="text-xs text-slate-500 mt-1.5">A question usually takes 2–6 lookups. Resets at midnight Pakistan time.{status.plan === 'free' && ' Free plan: the first 5 stocks and 3 funds in your portfolio, and one backtest a day.'}</p>
            </div>
            {!status.driveConnected && <p className="mt-3 text-sm rounded-xl p-3 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Your AI app can use market data now. To let it read your portfolio, connect Google Drive in PSX Tracker once; the connector reads your portfolio file from there.</p>}
            {status.connections.length === 0 ? <p className="mt-4 text-sm text-slate-500">No connections yet.</p> : (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {status.connections.map((c) => (
                  <li key={c.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="font-bold">{c.label} <span className="font-mono text-xs text-slate-400">…{c.hint}</span></p>
                      <p className="text-xs text-slate-500">Added {when(c.createdAt)} · {c.lastUsedAt ? `Last used ${when(c.lastUsedAt)}` : 'Not used yet'}</p>
                      <label className="mt-1.5 inline-flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={c.sharePortfolio} disabled={busy} onChange={(e) => run(() => setConnectorSharing(c.id, e.target.checked))} className="w-4 h-4 accent-emerald-600" />
                        Share my portfolio and holdings
                      </label>
                    </div>
                    <button type="button" disabled={busy} onClick={() => run(() => revokeConnectorLink(c.id))} className="min-h-[44px] px-3 text-sm font-bold text-rose-600 dark:text-rose-400 underline disabled:opacity-50">Disconnect</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className={`${card} flex gap-3`}>
        <ShieldCheck className="text-emerald-600 shrink-0" size={22} />
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
          <p><strong>Read-only.</strong> Your AI app can look up data but cannot add, change or delete trades.</p>
          <p>Only trades, portfolios and prices are read from your Drive file; settings and keys stored in it are never sent. Turn off portfolio sharing to allow market data only.</p>
          <p>Market data is unofficial and may be delayed. Answers are for research, not investment advice.</p>
        </div>
      </div>
      <SiteFooter />
    </section>
  );
}
