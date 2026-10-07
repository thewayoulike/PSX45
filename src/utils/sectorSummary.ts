import { SECTOR_CODE_MAP } from '../services/sectors';

export type SectorDay = {
  code: string;
  name: string;
  advance: number;
  decline: number;
  unchanged: number;
  turnover: number;
  marketCapB: number;
};

function cellText(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function amount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function displayName(code: string, raw: string): string {
  if (SECTOR_CODE_MAP[code]) return SECTOR_CODE_MAP[code];
  return raw.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

/** Sector-wise turnover table from dps.psx.com.pk/sector-summary/sectorwise. */
export function parseSectorSummary(html: string): SectorDay[] {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  const sectors: SectorDay[] = [];
  for (const row of cleaned.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cellText(cell[1]));
    if (cells.length < 7 || !/^\d{4}$/.test(cells[0])) continue;
    const advance = amount(cells[2]);
    const decline = amount(cells[3]);
    const unchanged = amount(cells[4]);
    const turnover = amount(cells[5]);
    const marketCapB = amount(cells[6]);
    if (advance == null || decline == null || unchanged == null || turnover == null || marketCapB == null) continue;
    sectors.push({
      code: cells[0],
      name: displayName(cells[0], cells[1]),
      advance,
      decline,
      unchanged,
      turnover,
      marketCapB,
    });
  }
  return sectors;
}
