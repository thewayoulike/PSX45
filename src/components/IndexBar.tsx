import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIndexQuote, fetchAllPSXPrices } from '../services/psxData';
import { buildQuoteStrip, parseBtcUsdQuote, parseGoldOunceQuotes, parsePakistanGoldTola, type QuoteItem } from '../utils/btcQuote';
import { isPsxMarketHours } from '../utils/dates';
import { parseSectorSummary, withSectorMoves, type SectorQuote } from '../utils/sectorSummary';
import { visibleInterval } from '../utils/visibleInterval';

const REFRESH_MS = 5 * 60 * 1000;

const SECTOR_SUMMARY_URL = 'https://dps.psx.com.pk/sector-summary/sectorwise';

function SectorMarquee({ sectors }: { sectors: SectorQuote[] }) {
  const loop = sectors.length > 1 ? [...sectors, ...sectors] : sectors;
  return (
    <div className="sector-marquee" aria-label="Sector summary">
      <div className="sector-marquee__track">
        {loop.map((sector, index) => {
          const up = (sector.changePct ?? 0) >= 0;
          return (
            <div
              key={`${sector.code}-${index}`}
              className="sector-marquee__item"
              aria-hidden={index >= sectors.length ? true : undefined}
            >
              <span className="text-slate-700 dark:text-slate-200">{sector.name}</span>
              {sector.changePct != null && (
                <span className={`tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {up ? '+' : ''}{sector.changePct.toFixed(2)}%
                </span>
              )}
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{sector.advance} up</span>
              <span className="text-rose-500 tabular-nums">{sector.decline} down</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const IndexBar: React.FC = () => {
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const [kse, kmi] = await Promise.all([
      fetchIndexQuote('KSE100').catch(() => null),
      fetchIndexQuote('KMI30').catch(() => null),
    ]);

    let pkr: number | null = null;
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/USD?t=${Date.now()}`);
      const data = await res.json();
      const rate = data?.rates?.PKR;
      if (typeof rate === 'number' && Number.isFinite(rate)) pkr = rate;
    } catch { /* ignore */ }

    let btc: { value: number; changePct: number | null } | null = null;
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&t=${Date.now()}`);
      if (res.ok) btc = parseBtcUsdQuote(await res.json());
    } catch { /* ignore */ }

    let goldUsd: { value: number; changePct: number | null } | null = null;
    try {
      const res = await fetch('https://latest.currency-api.pages.dev/v1/currencies/usd.min.json');
      if (res.ok) goldUsd = parseGoldOunceQuotes(await res.json()).usd;
    } catch { /* ignore */ }

    let goldTola: { value: number; changePct: number | null } | null = null;
    try {
      const res = await fetch('https://goldrateinpakistan.org/api/rates.json');
      if (res.ok) goldTola = parsePakistanGoldTola(await res.json());
    } catch { /* ignore */ }

    try {
      const [res, prices] = await Promise.all([
        fetch(`/api/proxy?url=${encodeURIComponent(SECTOR_SUMMARY_URL)}`),
        fetchAllPSXPrices().catch(() => ({})),
      ]);
      if (res.ok) {
        const parsed = parseSectorSummary(await res.text());
        if (parsed.length) {
          const quotes = Object.values(prices).map(row => ({
            sector: row.sector,
            price: row.price,
            ldcp: row.ldcp,
          }));
          setSectors(withSectorMoves(parsed, quotes));
        }
      }
    } catch { /* ignore */ }

    const collected = buildQuoteStrip({ kse, kmi, pkr, goldUsd, goldTola, btc });
    if (collected.length) setItems(collected);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    load();
    const tick = () => { if (isPsxMarketHours()) load(); };
    return visibleInterval(tick, REFRESH_MS);
  }, [load]);

  if (items.length === 0 && sectors.length === 0) return null;

  return (
    <div className="min-w-0 w-full">
    {items.length > 0 && (
    <div className="mobile-index-strip">
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-1 py-0.5">
      {items.map((it, i) => {
        const up = (it.changePct ?? 0) >= 0;
        return (
          <div key={it.label} className="flex items-center gap-2">
            {i > 0 && (
              <span
                className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700 mr-3"
                aria-hidden
              />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {it.label}
            </span>
            <span className="text-sm font-display font-bold text-slate-900 dark:text-white tabular-nums">
              {it.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {it.changePct != null && (
              <span
                className={`text-[11px] font-bold tabular-nums ${
                  up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                }`}
              >
                {up ? '+' : ''}
                {it.changePct.toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
    </div>
    )}
    {sectors.length > 0 && <SectorMarquee sectors={sectors} />}
    </div>
  );
};
