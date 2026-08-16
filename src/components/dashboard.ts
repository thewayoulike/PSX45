// Dashboard layout model + card registry (data only — rendering lives in App.tsx).
// Layout is a true 2-D grid (react-grid-layout): each card has x, y, w, h.

export interface CardMeta {
  id: string;
  label: string;
  hint?: string;
  core?: boolean;    // core cards can never be hidden/removed
}

export const CARD_META: CardMeta[] = [
  { id: 'indexBar',    label: 'Market Index Bar',    hint: 'KSE-100 · KMI-30 · USD-PKR strip' },
  { id: 'stats',       label: 'Portfolio Stats',     hint: 'Net Worth · Total Return · Today’s P&L', core: true },
  { id: 'benchmark',   label: 'Performance vs Index',hint: 'Your return vs the index' },
  { id: 'performance', label: 'Performance Chart',   hint: 'Portfolio value over time' },
  { id: 'allocation',  label: 'Allocation',          hint: 'Sector / holding allocation donut' },
  { id: 'topHoldings', label: 'Top Holdings',        hint: 'Your biggest positions' },
  { id: 'insights',    label: 'Insights',            hint: 'Best / worst movers' },
  { id: 'dividends',   label: 'Upcoming Dividends',  hint: 'Your holdings’ payouts' },
  { id: 'topMovers',   label: 'Top Movers',          hint: 'KSE-100 / KMI-30 gainers & losers' },
  { id: 'boardMeetings', label: 'Board Meetings',    hint: 'Upcoming board meetings' },
  { id: 'summary',     label: 'Portfolio Summary',   hint: 'Full holdings + realized summary' },
];

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
export const ROW_HEIGHT = 110;         // px per grid row unit
export const GRID_MARGIN: [number, number] = [24, 24];

// Default web layout: [id, x, y, w, h]
const WEB_BASE: Array<[string, number, number, number, number]> = [
  ['indexBar',     0,  0, 12, 1],
  ['stats',        0,  1, 12, 3],
  ['benchmark',    0,  4, 12, 3],
  ['performance',  0,  7, 12, 4],
  ['allocation',   0, 11,  8, 4],
  ['topHoldings',  8, 11,  4, 4],
  ['insights',     0, 15,  4, 3],
  ['dividends',    4, 15,  4, 4],
  ['topMovers',    8, 15,  4, 5],
  ['boardMeetings',0, 20,  8, 5],
  ['summary',      0, 25, 12, 4],
];

// Default heights reused for the (single-column) mobile stack.
const H_BY_ID: Record<string, number> = Object.fromEntries(WEB_BASE.map(([id, , , , h]) => [id, h]));

// Minimum size per card (cols, rows) so content stays readable when resized.
const MIN_BY_ID: Record<string, [number, number]> = {
  indexBar:     [3, 1],
  stats:        [4, 2],
  benchmark:    [4, 2],
  performance:  [4, 3],
  allocation:   [3, 3],
  topHoldings:  [3, 2],
  insights:     [3, 2],
  dividends:    [3, 2],
  topMovers:    [3, 3],
  boardMeetings:[3, 3],
  summary:      [4, 3],
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

  savedArr.forEach((c) => {
    if (!c || typeof c.id !== 'string' || !known.has(c.id) || seen.has(c.id)) return;
    seen.add(c.id);
    const { minW, minH } = minFor(c.id, device);
    const w = Math.min(cols, Math.max(minW, num(c.w, device === 'mobile' ? 1 : 4)));
    const x = Math.min(cols - w, Math.max(0, num(c.x, 0)));
    const y = Math.max(0, num(c.y, maxY));
    const h = Math.max(minH, num(c.h, H_BY_ID[c.id] ?? 3));
    out.push({ id: c.id, visible: isCore(c.id) ? true : c.visible !== false, x, y, w, h });
    maxY = Math.max(maxY, y + h);
  });

  // Append any registry cards missing from the saved layout, at the bottom.
  CARD_META.forEach((m) => {
    if (seen.has(m.id)) return;
    const h = H_BY_ID[m.id] ?? 3;
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
