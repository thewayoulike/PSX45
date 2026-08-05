import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Holding, PortfolioStats, RealizedTrade, Transaction } from '../types';
import { runAgent, AgentMessage, SUGGESTED_PROMPTS } from '../services/psxAgent';
import {
  Sparkles, Send, Loader2, Key, Trash2, Wrench, AlertCircle, User as UserIcon
} from 'lucide-react';

interface Props {
  holdings: Holding[];
  stats: PortfolioStats;
  realizedTrades: RealizedTrade[];
  transactions: Transaction[];
  apiKey: string;
  onOpenApiKeys?: () => void;
}

/** Human labels for the tool trace chips. */
const TOOL_LABEL: Record<string, string> = {
  get_portfolio_summary: 'Portfolio summary',
  get_holdings: 'Holdings',
  get_holding_detail: 'Position detail',
  get_realized_performance: 'Closed trades',
  get_live_price: 'Live prices',
  get_technical_analysis: 'Technical analysis',
  get_price_history: 'Price history',
  get_index_performance: 'Index performance',
  get_upcoming_dividends: 'Dividends',
  get_company_fundamentals: 'Fundamentals',
  get_market_movers: 'Market movers',
};

/** Minimal, safe markdown-ish renderer: **bold**, bullets, and paragraphs. */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = text.split('\n').filter(l => l.trim() !== '');
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="font-bold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );

  return (
    <div className="space-y-2">
      {blocks.map((line, i) => {
        const t = line.trim();
        const bullet = /^[-*•]\s+/.test(t);
        const numbered = /^\d+[.)]\s+/.test(t);
        if (bullet || numbered) {
          return (
            <div key={i} className="flex items-start gap-2.5 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-[7px] shrink-0" />
              <span className="text-sm leading-relaxed">{inline(t.replace(/^([-*•]|\d+[.)])\s+/, ''))}</span>
            </div>
          );
        }
        if (/^#{1,4}\s+/.test(t)) {
          return <h4 key={i} className="text-sm font-display font-black text-slate-900 dark:text-white pt-1">{inline(t.replace(/^#{1,4}\s+/, ''))}</h4>;
        }
        return <p key={i} className="text-sm leading-relaxed">{inline(t)}</p>;
      })}
    </div>
  );
};

export const AiAgent: React.FC<Props> = ({
  holdings, stats, realizedTrades, transactions, apiKey, onOpenApiKeys
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ctx = useMemo(
    () => ({ holdings, stats, realizedTrades, transactions }),
    [holdings, stats, realizedTrades, transactions]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, activeTool]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput('');
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setBusy(true);
    setActiveTool(null);

    try {
      const res = await runAgent(apiKey, history, q, ctx, (tool) => setActiveTool(tool));
      setMessages(prev => [...prev, { role: 'model', text: res.text, toolsUsed: Array.from(new Set(res.toolsUsed)) }]);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
      setActiveTool(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const card = "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark";

  /* ---------------- no API key ---------------- */
  if (!apiKey) {
    return (
      <div className={`${card} p-10 text-center`}>
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <Key size={26} />
        </div>
        <h3 className="text-lg font-display font-black text-slate-800 dark:text-white mb-2">Add a Gemini API key to use the assistant</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
          The assistant runs on your own Google Gemini key, so usage is billed to your account and your
          portfolio data never passes through anyone else's server. Gemini's free tier is plenty for this.
        </p>
        {onOpenApiKeys && (
          <button onClick={onOpenApiKeys} className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity">
            Open API Key Settings
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${card} flex flex-col h-[calc(100vh-11rem)] min-h-[520px] overflow-hidden`}>

      {/* ---------------- header ---------------- */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center shrink-0">
            <Sparkles size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              PSX Assistant
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-500/20">Beta</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium truncate">Reads your portfolio and live PSX data to answer questions</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setError(null); }}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0"
            title="Clear conversation"
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>

      {/* ---------------- messages ---------------- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-6 space-y-5">

        {messages.length === 0 && !busy && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center mb-5">
              <Sparkles size={30} />
            </div>
            <h3 className="text-xl font-display font-black text-slate-900 dark:text-white mb-2 tracking-tight">Ask me about your portfolio</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-7 leading-relaxed">
              I can look up your holdings, pull live PSX prices, run technical analysis, check dividends
              and read company fundamentals before answering.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
              {SUGGESTED_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:border-purple-300 dark:hover:border-purple-500/40 hover:text-purple-700 dark:hover:text-purple-300 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="flex items-start gap-3 max-w-[85%] flex-row-reverse">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon size={15} />
                </div>
                <div className="bg-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-3 max-w-[92%]">
              <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={15} />
              </div>
              <div className="min-w-0">
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {m.toolsUsed.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md">
                        <Wrench size={9} /> {TOOL_LABEL[t] || t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-slate-600 dark:text-slate-300">
                  <RichText text={m.text} />
                </div>
              </div>
            </div>
          )
        ))}

        {busy && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center shrink-0">
              <Loader2 size={15} className="animate-spin" />
            </div>
            <div className="pt-1.5 text-sm text-slate-400 font-medium">
              {activeTool ? <>Looking up <span className="font-bold text-slate-500 dark:text-slate-300">{TOOL_LABEL[activeTool] || activeTool}</span>…</> : 'Thinking…'}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 p-3.5 rounded-2xl flex items-start gap-2.5 text-rose-600 dark:text-rose-400">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}
      </div>

      {/* ---------------- composer ---------------- */}
      <div className="border-t border-slate-100 dark:border-slate-800/60 p-4 shrink-0 bg-white dark:bg-slate-900">
        <div className="flex items-end gap-2.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your holdings, a stock, dividends…"
            className="flex-1 resize-none bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all max-h-32"
            style={{ minHeight: '46px' }}
            disabled={busy}
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white w-[46px] h-[46px] rounded-2xl flex items-center justify-center shadow-md shadow-purple-600/20 transition-all shrink-0"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2.5 leading-snug text-center">
          AI can be wrong — verify anything important. Research assistance only, not investment advice.
        </p>
      </div>
    </div>
  );
};
