import React from 'react';
import { ExternalLink, Loader2, Newspaper } from 'lucide-react';
import { useHeadlineMood } from '../services/headlineMood';
import type { HeadlineSentiment, StockMood } from '../utils/headlineMood';
import { PK_TIMEZONE } from '../utils/dates';

const TONE: Record<StockMood['mood'], string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  negative: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  mixed: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};
const DOT: Record<HeadlineSentiment, string> = { positive: 'bg-emerald-500', negative: 'bg-rose-500', neutral: 'bg-slate-400' };
const WORD: Record<HeadlineSentiment, string> = { positive: 'Good news', negative: 'Bad news', neutral: 'Neutral' };

const Counts: React.FC<{ mood: StockMood }> = ({ mood }) => (
  <span className="inline-flex items-center gap-1.5 tabular-nums">
    {(['positive', 'negative', 'neutral'] as const).map((s) => (
      <span key={s} className="inline-flex items-center gap-0.5" aria-label={`${mood[s]} ${WORD[s].toLowerCase()}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[s]}`} aria-hidden="true" />{mood[s]}
      </span>
    ))}
  </span>
);

/** Small badge for lists; renders nothing when the stock had no headlines this week. */
export const HeadlineMoodBadge: React.FC<{ mood?: StockMood }> = ({ mood }) => mood ? (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${TONE[mood.mood]}`}
    title={`News mood, past 7 days: ${mood.label}. ${mood.headlines.length} headline${mood.headlines.length === 1 ? '' : 's'}.`}>
    <Newspaper size={11} aria-hidden="true" /> {mood.label} · <Counts mood={mood} />
  </span>
) : null;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: PK_TIMEZONE });

/** The past week's headlines about one stock, each marked good, bad or neutral. */
export const HeadlineMoodCard: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { data, error } = useHeadlineMood();
  const mood = data?.index.get(symbol.toUpperCase());
  return (
    <section aria-label={`${symbol} news mood`} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Newspaper size={16} className="text-sky-500" /> News mood · past {data?.windowDays ?? 7} days</h4>
        {mood && <HeadlineMoodBadge mood={mood} />}
      </div>
      {!data && !error && <p className="text-xs text-slate-500 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking headlines…</p>}
      {error && <p className="text-xs text-slate-500">Headlines could not be loaded right now.</p>}
      {data && !mood && <p className="text-xs text-slate-500">No headlines about {symbol} in the past week. A price move without news may be driven by trading flows or rumours rather than company news.</p>}
      {mood && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {mood.headlines.slice(0, 8).map((h) => (
            <li key={h.id} className="py-2 flex items-start gap-2.5">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[h.sentiment]}`} aria-hidden="true" />
              <div className="min-w-0">
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:underline">
                  {h.title} <ExternalLink size={11} className="inline -mt-0.5 opacity-60" aria-hidden="true" />
                </a>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  <span className="font-bold">{WORD[h.sentiment]}</span>
                  {h.reasons.length > 0 && <> · “{h.reasons.slice(0, 2).join('”, “')}”</>}
                  {' · '}{h.source} · {when(h.publishedAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {mood && mood.headlines.length > 8 && <p className="text-[11px] text-slate-500 mt-1">{mood.headlines.length - 8} more in Markets → News.</p>}
      <p className="text-[10px] text-slate-400 mt-2">Marked by word rules (for example “profit rises” is good, “loss widens” is bad), not by reading the article, so some headlines will be misjudged. Pakistani publishers only. Not investment advice.</p>
    </section>
  );
};
