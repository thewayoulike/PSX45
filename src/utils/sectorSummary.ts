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

function sectorKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export type SectorQuote = SectorDay & { changePct: number | null };

/** Equal-weight average of each name’s move from its previous close. */
export function withSectorMoves(
  sectors: readonly SectorDay[],
  quotes: readonly { sector: string; price: number; ldcp: number }[],
): SectorQuote[] {
  const groups = new Map<string, number[]>();
  for (const quote of quotes) {
    if (!(quote.price > 0) || !(quote.ldcp > 0) || !quote.sector) continue;
    const key = sectorKey(quote.sector);
    const moves = groups.get(key) ?? [];
    moves.push(((quote.price - quote.ldcp) / quote.ldcp) * 100);
    groups.set(key, moves);
  }
  return sectors.map(sector => {
    const moves = groups.get(sectorKey(sector.name));
    const changePct = moves && moves.length
      ? moves.reduce((sum, move) => sum + move, 0) / moves.length
      : null;
    return { ...sector, changePct };
  });
}
