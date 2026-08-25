// Dashboard layout model + card registry (data only — rendering lives in App.tsx).
// Layout is a true 2-D grid (react-grid-layout): each card has x, y, w, h.

import type { PortfolioType } from '../types';

export interface CardMeta {
  id: string;
  label: string;
  hint?: string;
  core?: boolean;    // core cards can never be hidden/removed
  psxOnly?: boolean; // hidden on mutual fund portfolios
}

export const CARD_META: CardMeta[] = [
  { id: 'stats',       label: 'Portfolio Stats',     hint: 'Net Worth · Total Return · Today’s P&L', core: true },
  { id: 'benchmark',   label: 'Performance vs Index',hint: 'Your return vs the index', psxOnly: true },
  { id: 'performance', label: 'Performance Chart',   hint: 'Portfolio value over time' },
  { id: 'allocation',  label: 'Allocation',          hint: 'Sector / holding allocation donut' },
  { id: 'topHoldings', label: 'Top Holdings',        hint: 'Your biggest positions' },
  { id: 'insights',    label: 'Insights',            hint: 'Best / worst movers' },
  { id: 'dividends',   label: 'Upcoming Dividends',  hint: 'Your holdings’ payouts', psxOnly: true },
  { id: 'topMovers',   label: 'Top Movers',          hint: 'KSE-100 / KMI-30 gainers & losers', psxOnly: true },
  { id: 'boardMeetings', label: 'Board Meetings',    hint: 'Upcoming board meetings', psxOnly: true },
  { id: 'summary',     label: 'Portfolio Summary',   hint: 'Full holdings + realized summary' },
];

/** Cards that only apply to PSX stock portfolios — auto-hidden for mutual funds. */
export const PSX_ONLY_CARD_IDS = new Set(CARD_META.filter(m => m.psxOnly).map(m => m.id));

export const applyPortfolioToLayout = (layout: DashboardLayout, portfolioType: PortfolioType): DashboardLayout => {
  const isFund = portfolioType === 'MUTUAL_FUND';
  const patch = (cards: CardLayout[]) => cards.map(c => ({
    ...c,
    visible: isFund && PSX_ONLY_CARD_IDS.has(c.id) ? false : (isCore(c.id) ? true : c.visible),
  }));
  return { web: patch(layout.web), mobile: patch(layout.mobile) };
};

export const CORE_IDS = CARD_META.filter(m => m.core).map(m => m.id);
export const isCore = (id: string) => CORE_IDS.includes(id);
export const metaFor = (id: string) => CARD_META.find(m => m.id === id);

export interface CardLayout {
  id: string;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Device = 'web' | 'mobile';

export interface DashboardLayout {
  web: CardLayout[];
  mobile: CardLayout[];
}

export const COLS: Record<Device, number> = { web: 12, mobile: 1 };
export const ROW_HEIGHT = 20;          // px per grid row — fine vertical resize
export const GRID_MARGIN: [number, number] = [20, 20];
const LEGACY_ROW = 110;                // previous row unit; convert old saved layouts

// Default web layout: [id, x, y, w, h]
const WEB_BASE: Array<[string, number, number, number, number]> = [
  ['stats',         0,  0, 12, 36],
  ['benchmark',     0, 36, 12, 16],
  ['performance',   0, 52, 12, 22],
  ['allocation',    0, 74,  8, 20],
  ['topHoldings',   8, 74,  4, 20],
  ['insights',      0, 94,  4, 16],
  ['dividends',     4, 94,  4, 20],
  ['topMovers',     8, 94,  4, 22],
  ['boardMeetings', 0,116,  8, 22],
  ['summary',       0,138, 12, 20],
];

// Default heights reused for the (single-column) mobile stack.
const H_BY_ID: Record<string, number> = Object.fromEntries(WEB_BASE.map(([id, , , , h]) => [id, h]));

// Minimum size per card (cols, rows) so content stays readable when resized.
const MIN_BY_ID: Record<string, [number, number]> = {
  stats:         [4, 10],
  benchmark:     [4, 8],
  performance:   [4, 10],
  allocation:    [3, 8],
  topHoldings:   [3, 8],
  insights:      [3, 8],
  dividends:     [3, 8],
  topMovers:     [3, 10],
  boardMeetings: [3, 10],
  summary:       [4, 10],
};

export const minFor = (id: string, device: Device): { minW: number; minH: number } => {
  const [mw, mh] = MIN_BY_ID[id] || [2, 2];
  return { minW: device === 'mobile' ? 1 : mw, minH: mh };
};

const buildWeb = (): CardLayout[] =>
  WEB_BASE.map(([id, x, y, w, h]) => ({ id, visible: true, x, y, w, h }));

const buildMobile = (): CardLayout[] =>
  CARD_META.map((m, i) => ({ id: m.id, visible: true, x: 0, y: i * 3, w: 1, h: H_BY_ID[m.id] ?? 3 }));

export const DEFAULT_LAYOUT: DashboardLayout = { web: buildWeb(), mobile: buildMobile() };

const num = (v: any, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeDevice = (saved: any[], device: Device): CardLayout[] => {
  const cols = COLS[device];
  const savedArr = Array.isArray(saved) ? saved : [];
  const known = new Set(CARD_META.map(m => m.id));
  const seen = new Set<string>();
  const out: CardLayout[] = [];
  let maxY = 0;

  const legacy = savedArr.length > 0 && savedArr.every((c) => !c || num(c.h, 0) <= 12);

  savedArr.forEach((c) => {
    if (!c || typeof c.id !== 'string' || !known.has(c.id) || seen.has(c.id)) return;
    seen.add(c.id);
    const { minW, minH } = minFor(c.id, device);
    const w = Math.min(cols, Math.max(minW, num(c.w, device === 'mobile' ? 1 : 4)));
    const x = Math.min(cols - w, Math.max(0, num(c.x, 0)));
    const yRaw = Math.max(0, num(c.y, maxY));
    const y = legacy ? Math.round(yRaw * LEGACY_ROW / ROW_HEIGHT) : yRaw;
    const hRaw = num(c.h, H_BY_ID[c.id] ?? 16);
    const h = Math.max(minH, legacy ? Math.round(hRaw * LEGACY_ROW / ROW_HEIGHT) : hRaw);
    out.push({ id: c.id, visible: isCore(c.id) ? true : c.visible !== false, x, y, w, h });
    maxY = Math.max(maxY, y + h);
  });

  // Append any registry cards missing from the saved layout, at the bottom.
  CARD_META.forEach((m) => {
    if (seen.has(m.id)) return;
    const h = H_BY_ID[m.id] ?? 16;
    out.push({ id: m.id, visible: true, x: 0, y: maxY, w: device === 'mobile' ? 1 : Math.min(cols, 4), h });
    maxY += h;
  });

  return out;
};

export const normalizeLayout = (saved: any): DashboardLayout => {
  if (!saved || typeof saved !== 'object') return DEFAULT_LAYOUT;
  return {
    web: normalizeDevice(saved.web, 'web'),
    mobile: normalizeDevice(saved.mobile, 'mobile'),
  };
};

export const visibleOrdered = (device: CardLayout[]): CardLayout[] =>
  device.filter(c => c.visible);
