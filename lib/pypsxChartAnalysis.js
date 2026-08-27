/**
 * Chart analysis (BB + RSI + MACD) via pypsx-toolkit.
 * Live: Vercel Python /api/pypsx · Local: Python script.
 */

import { fetchPypsxToolkit } from './pypsxFetch.js';

/** @param {string} symbol @param {string} [period] */
export async function fetchPypsxChartAnalysis(symbol, period = '6mo') {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  return fetchPypsxToolkit('analysis', { symbol: clean, period });
}
