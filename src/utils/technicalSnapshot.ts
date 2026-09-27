import type { SnapshotStock } from './scanSnapshot';
import { SCAN_DISCLAIMER, technicalExplanation, technicalPlanExplanation, type TechnicalAnalysis } from './technicalRatings';
const fmt = (v: number | null | undefined, d = 2) => v == null || !Number.isFinite(v) ? 'Unavailable' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export function technicalSnapshotStock(r: { symbol: string; current: number; changePct: number; volume: number; technical: TechnicalAnalysis }): SnapshotStock {
  const a = r.technical, p = a.plan;
  return {
    symbol: r.symbol, rating: a.rating, price: fmt(a.summary.lastPrice), priceNote: `Daily close · ${a.candleDate || 'date unavailable'}`,
    // The current quote change is not the change in the historical reference candle.
    summary: { score: a.score, caption: a.score == null ? 'Some readings are unavailable. Overall rating withheld.' : 'Daily technical signals. The trade scenario is separate from the rating.', methodology: 'Equal weight to both groups', available: a.available, total: 26, buys: a.summary.buys, sells: a.summary.sells, neutrals: a.summary.neutrals, groups: a.groups },
    facts: [
      { label: 'Candle date · Pakistan', value: a.candleDate || 'Unavailable' },
      { label: 'Daily bars / signals available', value: `${a.bars} / ${a.available} of 26` },
      { label: 'Latest fetched quote (PKR)', value: fmt(r.current) },
      { label: 'Quote change / volume', value: `${fmt(r.changePct)}% / ${fmt(r.volume, 0)}` },
      { label: 'Reference close for levels (PKR)', value: fmt(a.summary.lastPrice) },
    ],
    sections: [
      ...a.groups.map(g => ({ title: `${g.label} · ${g.available}/${g.total}`, kind: g.key, rows: a.rows.filter(row => row.group === g.key).map(row => ({ label: row.name, value: fmt(row.value), signal: row.signal || 'Unavailable' })) })),
      { title: 'Price levels & trade plan (PKR)', kind: 'levels', rows: p ? [
        { label: 'Illustrative long entry range', value: `${fmt(p.entryLow)} – ${fmt(p.entryHigh)}` },
        { label: 'Stop / risk', value: `${fmt(p.stop)} / ${fmt(p.riskPct)}%` },
        ...p.targets.map((target, i) => ({ label: `Take profit ${i + 1} · ${i + 1}R`, value: `${fmt(target)} / +${fmt(p.rewardPct[i])}%` })),
        { label: p.supportLabel || 'Support', value: fmt(p.support) },
        { label: p.resistanceLabel || 'Resistance', value: fmt(p.resistance) },
        { label: 'ATR (14) · daily true range', value: fmt(p.atr) },
      ] : [{ label: 'Price levels unavailable', value: 'Needs valid price ranges and at least 20 daily candles.' }] },
    ],
    notes: [{ title: 'How the rating works', paragraphs: technicalExplanation(a) }, { title: 'How price levels and take profits work', paragraphs: technicalPlanExplanation }, { title: 'Important', paragraphs: [SCAN_DISCLAIMER] }],
  };
}
