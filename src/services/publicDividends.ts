import { parseCSV } from '../utils/csv';
import { cachedMarketFetch } from './marketCache';

// This is a public market reference, not a user's private portfolio spreadsheet.
const workbook = 'https://docs.google.com/spreadsheets/d/1Z-Qd8g__vCqRkaSWpcIx-qf6uKgE9ZxO4Bw2FFRWr9g/gviz/tq?tqx=out:csv';
const sources = {
  dividends: workbook + '&sheet=Sheet1&range=A3:F',
  boardMeetings: workbook + '&gid=516127681',
};
type Tab = keyof typeof sources;
const state = new Map<Tab, { running?: Promise<string[][]>; rows?: string[][]; expires: number; retryAt: number }>();
export const readDividendRows = () => readPublicMarketRows('dividends');
export const readBoardMeetingRows = () => readPublicMarketRows('boardMeetings');
function readPublicMarketRows(tab: Tab): Promise<string[][]> {
  let entry = state.get(tab);
  if (!entry) { entry = { expires: 0, retryAt: 0 }; state.set(tab, entry); }
  const saved = entry;
  const source = sources[tab];
  if (saved.rows && Date.now() < saved.expires) return Promise.resolve(saved.rows);
  if (saved.running) return saved.running;
  if (Date.now() < saved.retryAt) return Promise.reject(new Error('Shared market data is temporarily unavailable. Please retry shortly.'));
  saved.running = (async () => {
    const proxy = `/api/proxy?url=${encodeURIComponent(source)}`;
    // Neither route needs a user's token or broader Google account permissions.
    for (const url of [proxy, source]) {
      try {
        const res = await cachedMarketFetch(url, () => fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) }));
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.trim() || /^\s*</.test(text)) continue;
        const parsed = parseCSV(text);
        const valid = tab === 'boardMeetings'
          ? parsed[0]?.map(v => v.trim().toLowerCase()).includes('bm_date') && parsed[0]?.map(v => v.trim().toLowerCase()).includes('company_code')
          : parsed.some(row => row.length >= 6 && /^[A-Z0-9][A-Z0-9.-]*$/.test(row[0].trim()) && Number.isFinite(Date.parse(row[5])));
        if (!valid) continue;
        saved.rows = parsed;
        saved.expires = Date.now() + 5 * 60 * 1000;
        return parsed;
      } catch { /* Try the same public source directly if our proxy is unavailable. */ }
    }
    saved.retryAt = Date.now() + 60000;
    throw new Error('Shared market data is temporarily unavailable. Please retry shortly.');
  })().finally(() => { saved.running = undefined; });
  return saved.running;
}
