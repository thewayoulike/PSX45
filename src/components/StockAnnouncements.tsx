import React, { useEffect, useState } from 'react';
import {
  fetchCompanyAnnouncements, CompanyAnnouncement,
  fetchBoardMeetings, BoardMeeting,
  fetchMarketWideDividends,
} from '../services/financials';
import { Megaphone, FileText, CalendarClock, Loader2, RefreshCw, Coins, CalendarDays } from 'lucide-react';
import { panelKeys, readPanel, savePanel, PANEL_CACHE_HYDRATED_EVENT } from '../services/panelCache';
import { PanelRefreshNote } from './PanelRefreshNote';
import { daysUntilMeeting } from '../utils/meetingDays';

interface Props { ticker: string | null; }

const KIND_STYLE: Record<CompanyAnnouncement['kind'], { cls: string; label: string }> = {
  'Board Meeting': { cls: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20', label: 'Board Meeting' },
  'Result':        { cls: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20', label: 'Result' },
  'Dividend':      { cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20', label: 'Payout' },
  'Other':         { cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', label: 'Notice' },
};

const clean = (v: any) => { const s = String(v ?? '').trim(); return (!s || s === '-') ? '' : s; };

type FilingsCache = { items: CompanyAnnouncement[]; meeting: BoardMeeting | null; payouts: any[] };

export const StockAnnouncements: React.FC<Props> = ({ ticker }) => {
  const initial = ticker ? readPanel<FilingsCache>(panelKeys.filings(ticker)) : null;
  const [items, setItems] = useState<CompanyAnnouncement[]>(() => initial?.data.items || []);
  const [meeting, setMeeting] = useState<BoardMeeting | null>(() => initial?.data.meeting || null);
  const [payouts, setPayouts] = useState<any[]>(() => initial?.data.payouts || []);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(() => initial != null);
  const [failed, setFailed] = useState(false);
  const [known, setKnown] = useState(() => initial != null);

  const applyCached = (t: string) => {
    const cached = readPanel<FilingsCache>(panelKeys.filings(t));
    if (!cached) return false;
    setItems(cached.data.items || []);
    setMeeting(cached.data.meeting || null);
    setPayouts(cached.data.payouts || []);
    setLoaded(true);
    setKnown(true);
    return true;
  };

  const load = async () => {
    if (!ticker) return;
    const t = ticker.toUpperCase();
    const hadSaved = applyCached(t);
    if (!hadSaved) {
      setItems([]);
      setMeeting(null);
      setPayouts([]);
      setLoaded(false);
      setKnown(false);
    }
    setLoading(true);
    setFailed(false);
    try {
      const [ann, meetings, divs] = await Promise.all([
        fetchCompanyAnnouncements(t),
        fetchBoardMeetings(),
        fetchMarketWideDividends(),
      ]);
      const next = {
        items: ann || [],
        meeting: (meetings || []).find(m => m.ticker === t) || null,
        payouts: (divs || []).filter((d: any) => (d.ticker || '').toUpperCase() === t),
      };
      setItems(next.items);
      setMeeting(next.meeting);
      setPayouts(next.payouts);
      savePanel(panelKeys.filings(t), next);
      setKnown(true);
    } catch (e) {
      console.error('StockAnnouncements load failed', e);
      setFailed(hadSaved);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    const apply = () => { applyCached(ticker.toUpperCase()); };
    window.addEventListener(PANEL_CACHE_HYDRATED_EVENT, apply);
    return () => window.removeEventListener(PANEL_CACHE_HYDRATED_EVENT, apply);
  }, [ticker]);

  return (
    <div className="space-y-4">
      {/* Upcoming board meeting */}
      {meeting && (
        <div className="rounded-3xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-500/10 p-4 flex items-center gap-3">
          <CalendarClock size={18} className="text-indigo-500 shrink-0" />
          <div className="text-sm text-slate-700 dark:text-slate-200">
            <span className="font-bold">Upcoming board meeting</span> · {meeting.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            {meeting.time ? ` · ${meeting.time}` : ''}{meeting.place ? ` · ${meeting.place}` : ''}
            <span className="text-slate-400"> (in {daysUntilMeeting(meeting.date instanceof Date ? meeting.date : new Date(meeting.date))}d)</span>
          </div>
        </div>
      )}

      {/* Upcoming payouts (from Future X-Dates) */}
      {payouts.length > 0 && (
        <div className="rounded-3xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 mb-2 text-emerald-700 dark:text-emerald-400 text-sm font-bold"><Coins size={16} /> Upcoming payouts</div>
          <div className="space-y-1.5">
            {payouts.map((p: any, i: number) => {
              const m = String(p.details || '').match(/Rs\.?\s*([\d.,]+)/i);
              const div = m ? m[1] : '';
              const ex = String(p.bookClosure || '').replace('Ex-Date:', '').trim();
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5">
                    {div && <span className="font-bold">Div Rs {div}</span>}
                    {clean(p.bonus) && <span className="font-bold text-indigo-500">Bonus {p.bonus}</span>}
                    {clean(p.right) && <span className="font-bold text-amber-500">Right {p.right}</span>}
                    {!div && !clean(p.bonus) && !clean(p.right) && <span className="text-slate-400">Corporate action</span>}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-1"><CalendarDays size={11} /> Ex {ex}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Company announcements feed */}
      <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 shadow-card dark:shadow-card-dark overflow-hidden">
        <div className="p-5 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Megaphone size={18} className="text-rose-500" /> Announcements &amp; Board Meetings
          </h3>
          <div className="flex items-center gap-2">
            <PanelRefreshNote updating={loading && known} failed={failed && !loading} />
            <button onClick={load} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-40" title="Refresh">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading && !known ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <Loader2 size={22} className="animate-spin mb-2" />
            <span className="text-xs font-medium">Loading PSX filings for {ticker}…</span>
          </div>
        ) : items.length === 0 && loaded ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">No recent announcements found for {ticker}.</p>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800/60 max-h-[32rem] overflow-y-auto">
            {items.map((a, i) => {
              const s = KIND_STYLE[a.kind];
              return (
                <div key={`${a.pdfUrl}-${i}`} className="py-3 px-5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${s.cls}`}>{s.label}</span>
                      <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1"><CalendarDays size={10} /> {a.date || '—'}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{a.title}</p>
                  </div>
                  <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Open PDF on PSX">
                    <FileText size={16} />
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center gap-1">
          Recent company filings and upcoming payouts for your holdings.
        </div>
      </div>
    </div>
  );
};
