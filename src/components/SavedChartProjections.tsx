import React, { useEffect, useMemo, useState } from 'react';
import type { ChartProjection } from '../utils/chartProjection';
import type { OhlcBar } from '../services/psxData';
import { compareSavedProjection, loadSavedProjections, saveChartProjection, removeSavedProjection, PROJECTIONS_CHANGED, PROJECTIONS_RESTORED, type SavedProjection } from '../services/chartProjectionStorage';

const price = (n: number) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stamp = (time: number) => new Date(time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }) + ' PKT';
const day = (time: number) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
function download(record: SavedProjection) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `PSX-${record.symbol}-projection-${new Date(record.savedAt).toISOString().replace(/[:.]/g, '-')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SavedRow({ saved, bars, remove }: { saved: SavedProjection; bars: OhlcBar[]; remove: () => void }) {
  const comparison = useMemo(() => compareSavedProjection(saved, bars), [saved, bars]);
  const assessed = comparison.rows.filter(r => r.actual && !r.beforeSave), inside = assessed.filter(r => r.insideWide).length;
  const last = comparison.rows[comparison.rows.length - 1];
  return <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
    <summary className="cursor-pointer font-bold leading-relaxed">{saved.symbol} · {saved.data.points.length} sessions <span className="font-normal text-slate-500">· saved {stamp(saved.savedAt)}</span><span className="block mt-1 font-normal text-[10px] text-slate-500">{comparison.reason ? 'Awaiting comparable history' : `${assessed.length}/${comparison.rows.length} future closes available · ${inside} within wider range`}</span></summary>
    <div className="mt-3 space-y-3 leading-relaxed">
      <p>Frozen reference: {stamp(saved.data.referenceTime)} · close {price(saved.data.referenceClose)}. Reference time is the feed’s candle timestamp; saved time is when you captured this range.</p>
      <p className="text-[10px]">Captured model: {saved.data.evidence?.method === 'indicator-matched-v2' ? 'Indicator-matched range' : 'Historical baseline'}. {saved.data.evidence && <>Patterns: {saved.data.evidence.context.patterns.join(', ') || 'none listed'}. {saved.data.evidence.context.recent}. {saved.data.evidence.context.volume}. The original inputs and historical-check results are kept in the downloadable record.</>}</p>
      {comparison.reason && <p role="status">{comparison.reason}</p>}
      <div className="overflow-x-auto"><table className="w-full text-[10px] text-right tabular-nums"><caption className="text-left mb-2 font-bold">Saved ranges versus subsequent daily closes</caption><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 text-left">Session</th><th>Saved P10–P90</th><th>Actual close</th><th>Result</th></tr></thead><tbody>{comparison.rows.map(r => <tr key={r.point.session} className="border-b border-slate-100 dark:border-slate-800"><th className="py-3 text-left">+{r.point.session}</th><td>{price(r.point.lower)}–{price(r.point.upper)}<span className="block text-slate-500">Median {price(r.point.median)}</span></td><td>{r.actual ? <>{price(r.actual.close)}<span className="block text-slate-500">{day(r.actual.time)}</span></> : 'Pending'}</td><td className={r.actual && !r.beforeSave ? r.insideWide ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-500' : 'text-slate-500'}>{!r.actual ? 'Pending' : r.beforeSave ? 'Before save' : r.insideWide ? 'Inside wider' : 'Outside wider'}{r.actual && !r.beforeSave && <span className="block text-[9px] text-slate-500">{r.insideInner ? 'Inside' : 'Outside'} inner</span>}</td></tr>)}</tbody></table></div>
      {last.actual && !last.beforeSave && <p>Final close versus saved median: {last.medianError! >= 0 ? '+' : ''}{price(last.medianError!)} chart units.</p>}
      <p className="text-[10px] text-slate-500">Comparison uses the next available daily candles after the reference. Missing sessions or adjusted prices can affect it. “Before save” outcomes are excluded from the future-close count. Range coverage is not a trading win rate or proof of future accuracy.</p>
      <div className="flex gap-4"><button type="button" onClick={() => download(saved)} className="text-emerald-700 dark:text-emerald-300 font-bold underline">Download record</button><button type="button" onClick={remove} className="text-slate-500 underline">Remove saved projection</button></div>
    </div>
  </details>;
}

export function SavedChartProjections({ symbol, projection, bars }: { symbol: string; projection: ChartProjection | null; bars: OhlcBar[] }) {
  const [saved, setSaved] = useState(loadSavedProjections), [open, setOpen] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    const refresh = () => setSaved(loadSavedProjections());
    window.addEventListener(PROJECTIONS_CHANGED, refresh); window.addEventListener(PROJECTIONS_RESTORED, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(PROJECTIONS_CHANGED, refresh); window.removeEventListener(PROJECTIONS_RESTORED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => { setMessage(''); }, [symbol]);
  const records = saved.filter(s => s.symbol === symbol.toUpperCase());
  const save = () => {
    if (!projection) return;
    try { saveChartProjection(symbol, projection); setMessage('Projection saved with its original values and capture time.'); setOpen(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this projection. Browser storage may be full.'); }
  };
  return <section aria-label="Saved projections" className="px-2 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
    <div className="flex flex-wrap gap-3 items-center">
      {projection && <button type="button" onClick={save} className="rounded-lg px-3 py-2 bg-emerald-600 text-white font-bold">Save projection</button>}
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="font-bold px-2 py-2 text-emerald-700 dark:text-emerald-300">Saved for {symbol} ({records.length})</button>
    </div>
    {message && <p role="status" className="mt-2">{message}</p>}
    {open && <div className="space-y-3 mt-3">
      <p className="text-[10px] text-slate-500">Saved on this device and included in your next connected Drive backup. Use the app’s sync status to confirm the backup. Refresh the daily chart later to compare completed closes. Saved ranges never recalculate.</p>
      {!records.length && <p>No saved projections for {symbol}. Turn on Projected range to save one.</p>}
      {records.map(record => <SavedRow key={record.id} saved={record} bars={bars} remove={() => { try { removeSavedProjection(record.id); setMessage('Saved projection removed.'); } catch { setMessage('Could not remove the saved projection.'); } }} />)}
    </div>}
  </section>;
}
