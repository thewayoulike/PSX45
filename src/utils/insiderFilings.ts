/**
 * Insider trades on PSX: directors, the CEO, senior staff, their spouses and big
 * shareholders must file a "Disclosure of Interest" when they buy or sell shares.
 * PSX lists those filings on each company page; the details are in the filing itself.
 */
export interface InsiderFiling {
  date: string;
  ts: number;
  title: string;
  /** Link to the filing (PDF when PSX has one, else the image PSX shows). */
  url: string;
}

const PSX = 'https://dps.psx.com.pk';
const INSIDER = /disclosure of interest|substantial shareholder|beneficial owner/i;
const NOT_INSIDER = /shariah/i;

export const isInsiderTitle = (title: string) => INSIDER.test(title) && !NOT_INSIDER.test(title);

export function parseInsiderFilings(html: string): InsiderFiling[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const out: InsiderFiling[] = [];
  for (const row of Array.from(doc.querySelectorAll('tr'))) {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 2) continue;
    const date = (cells[0].textContent || '').trim();
    const title = (cells[1].textContent || '').replace(/\s+/g, ' ').trim();
    if (!isInsiderTitle(title)) continue;
    const pdf = row.querySelector('a[href*="download/document"]')?.getAttribute('href') || '';
    const image = row.querySelector('a[data-images]')?.getAttribute('data-images') || '';
    const url = pdf ? (pdf.startsWith('http') ? pdf : `${PSX}${pdf}`) : image ? `${PSX}/download/image/${image}` : '';
    const key = url || `${date}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ts = Date.parse(date);
    out.push({ date, ts: Number.isNaN(ts) ? 0 : ts, title, url });
  }
  return out.sort((a, b) => b.ts - a.ts);
}
