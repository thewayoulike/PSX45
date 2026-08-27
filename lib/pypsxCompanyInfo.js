/**
 * Company info — pypsx-toolkit on Vercel (Python) / locally (Python script).
 * Falls back to direct PSX web scrape if toolkit unavailable.
 */

import { fetchPypsxToolkit } from './pypsxFetch.js';
import { fetchPsxCompanyInfo } from './psxCompanyInfo.js';

/** @param {string} symbol */
export async function fetchPypsxCompanyInfo(symbol) {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  try {
    return await fetchPypsxToolkit('company', { symbol: clean });
  } catch (pypsxErr) {
    try {
      const scraped = await fetchPsxCompanyInfo(clean);
      // PSX payout table shows announcement % (e.g. "725%(F) (D)"), not PKR cash.
      return {
        symbol: scraped.symbol,
        businessDescription: scraped.businessDescription,
        fundamentals: scraped.fundamentals,
        latestDividend: null,
        dividendHistory: [],
        source: 'psx:web',
        dividendDataUnavailable: true,
        pypsxError: pypsxErr?.message || String(pypsxErr),
      };
    } catch {
      throw pypsxErr;
    }
  }
}
