/**
 * Intraday OHLCV via authenticated pypsx SDK.
 * Live: Vercel Python /api/pypsx · Local: Python script.
 */

import { fetchPypsxToolkit } from './pypsxFetch.js';

/** @param {string} symbol @param {string} [interval] @param {string} [period] */
export async function fetchPypsxIntraday(symbol, interval = '5m', period = '5d') {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  return fetchPypsxToolkit('intraday', {
    symbol: clean,
    interval: String(interval || '5m'),
    period: String(period || '5d'),
  });
}
