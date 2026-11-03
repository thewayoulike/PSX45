import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Plug, ShieldCheck } from 'lucide-react';
import { createConnectorLink, loadConnectorStatus, revokeConnectorLink, setConnectorSharing, type ConnectorStatus } from '../services/aiConnector';
import { SiteFooter } from './SiteFooter';

interface AppGuide { id: string; steps: string[]; check: string; tip?: string }
const APPS: AppGuide[] = [
  {
    id: 'Claude',
    steps: [
      'Open Claude at claude.ai or in the Claude desktop app, then go to Settings → Connectors.',
      'Click “Add custom connector”.',
      'Name: PSX Tracker. Remote MCP server URL: paste your link. Leave the OAuth fields empty, then click Add.',
      'Start a new chat, open the tools menu (the sliders icon under the message box) and turn PSX Tracker on.',
    ],
    check: 'PSX Tracker shows in the tools list with 15 tools. The first time Claude uses one, it asks for permission: choose “Always allow” for a smoother experience.',
    tip: 'Custom connectors may need a paid Claude plan or be limited in number on the free plan. Menu names can change slightly between Claude versions.',
  },
  {
    id: 'ChatGPT',
    steps: [
      'Open ChatGPT on the web, then go to Settings → Apps & Connectors → Advanced settings and turn on Developer mode.',
      'Back in Apps & Connectors, click “Create”.',
      'Name: PSX Tracker. MCP server URL: paste your link. Authentication: No authentication. Tick that you trust this app, then click Create.',
      'In a new chat, click + (or the tools menu), choose Developer mode, and pick PSX Tracker.',
    ],
    check: 'ChatGPT lists PSX Tracker’s tools when you open it in Apps & Connectors. It may ask you to confirm each lookup.',
    tip: 'Developer mode is available on paid ChatGPT plans. Menu names can change slightly between ChatGPT versions.',
  },
  {
    id: 'Cursor',
    steps: [
      'Open Cursor → Settings (gear icon) → Tools & MCP (older versions: MCP).',
      'Click “New MCP Server” and choose User, not a workspace. A workspace saves the link inside your project, where it could end up on GitHub.',
      'Cursor opens mcp.json. Add the psx-tracker entry below. If the file already has "mcpServers" (for example GitHub), add only the "psx-tracker" part inside it, after a comma.',
      'Save the file and come back to Tools & MCP.',
    ],
    check: 'psx-tracker shows a green dot with 15 tools enabled. In Cursor’s chat, ask “Use psx-tracker: how is my portfolio doing?”.',
    tip: 'Use a normal chat on your computer, not a Cloud or Background Agent: those run on Cursor’s servers and don’t load your own MCP connections.',
  },
];
const USE_EXAMPLES = [
  { title: 'About my money', items: ['How is my portfolio doing?', 'Which of my stocks are in profit?', 'How much have I made from selling?'] },
  { title: 'About the market', items: ['What is the price of OGDC?', 'How did the KSE-100 do today?', 'Is LUCK going up or down?'] },
  { title: 'News and ideas', items: ['Any news about OGDC this week?', 'Do any of my stocks have bad news?', 'What would have worked best on HUBC last year?'] },
];
const cursorConfig = (link: string) => `{
  "mcpServers": {
    "psx-tracker": {
      "url": "${link || 'https://www.psx-tracker.com/api/mcp/YOUR-LINK'}"
    }
  }
}`;
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
  const guide = APPS.find((a) => a.id === app)!;
  const [configCopied, setConfigCopied] = useState(false);
  const copyConfig = async () => {
    try { await navigator.clipboard.writeText(cursorConfig(newLink)); setConfigCopied(true); }
    catch { setError('Copy was blocked. Select the text and copy it manually.'); }
  };
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
        <ol className="mt-3 list-decimal pl-5 space-y-2 text-slate-700 dark:text-slate-200">{guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {app === 'Cursor' && (
          <div className="mt-3">
            <pre className="rounded-xl bg-slate-900 text-slate-100 p-4 text-xs overflow-x-auto"><code>{cursorConfig(newLink)}</code></pre>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={copyConfig} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-bold">{configCopied ? <Check size={14} /> : <Copy size={14} />}{configCopied ? 'Copied' : 'Copy mcp.json'}</button>
              <span className="text-xs text-slate-500">{newLink ? 'Your new link is already filled in.' : 'Create a link above and it is filled in here.'}</span>
            </div>
          </div>
        )}
        <p className="mt-3 text-sm rounded-xl p-3 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><strong>Check it worked:</strong> {guide.check}</p>
        {guide.tip && <p className="mt-2 text-xs text-slate-500">{guide.tip}</p>}
      </div>

      <div className={card}>
        <h2 className="text-xl font-bold">3. How to use it</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Just type your question, like you would ask a friend. Here are some to try:</p>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          {USE_EXAMPLES.map((group) => (
            <div key={group.title} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <h3 className="text-sm font-bold">{group.title}</h3>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-600 dark:text-slate-300">{group.items.map((q) => <li key={q}>“{q}”</li>)}</ul>
            </div>
          ))}
        </div>
        <h3 className="mt-5 font-bold">If the answer looks wrong</h3>
        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <li>✅ <strong>Check PSX Tracker is turned on</strong> in that chat. You should see “PSX Tracker” appear while it answers.</li>
          <li>✅ <strong>Start your question with “Use PSX Tracker:”</strong> so it doesn’t look anywhere else.</li>
          <li>✅ <strong>Turn off Google Drive and Gmail</strong> in that chat. They aren’t needed; PSX Tracker brings your portfolio itself.</li>
          <li>✅ <strong>Just added a trade?</strong> Wait a few seconds for the app to save it, then ask again.</li>
        </ul>
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
