import { useEffect, useState } from 'react';
import { loadMarketData } from './marketOverview';
import { buildMoodIndex, type StockMood } from '../utils/headlineMood';

export interface HeadlineMoodData { index: Map<string, StockMood>; checkedAt: string | null; windowDays: number }

// Built from the hourly headline snapshot and the market-watch company names, both of which
// the app already loads and caches. Nothing new is stored or sent anywhere.
let built: { at: number; promise: Promise<HeadlineMoodData> } | null = null;
export function loadHeadlineMood(): Promise<HeadlineMoodData> {
  if (built && Date.now() - built.at < 900000) return built.promise;
  const promise = Promise.all([loadMarketData('news'), loadMarketData('stocks')]).then(([news, stocks]) => ({
    index: buildMoodIndex(news.data?.items || [], (stocks.data || []).map((s: { symbol: string; name: string }) => ({ symbol: s.symbol, name: s.name }))),
    checkedAt: news.data?.checkedAt || null,
    windowDays: news.data?.windowDays || 7,
  }));
  promise.catch(() => { built = null; });
  built = { at: Date.now(), promise };
  return promise;
}

export function useHeadlineMood(): { data: HeadlineMoodData | null; error: boolean } {
  const [data, setData] = useState<HeadlineMoodData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    loadHeadlineMood().then((d) => { if (live) setData(d); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  return { data, error };
}
