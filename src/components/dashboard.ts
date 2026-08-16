// Dashboard layout model + card registry (data only — rendering lives in App.tsx).

export interface CardMeta {
  id: string;
  label: string;
  hint?: string;     // short description shown in the customizer
  core?: boolean;    // core cards can never be hidden/removed
  defaultW: number;  // default width in 12-col grid units (web)
}

// Order here = the default dashboard order.
export const CARD_META: CardMeta[] = [
  { id: 'indexBar',   label: 'Market Index Bar',   hint: 'KSE-100 · KMI-30 · USD-PKR strip', defaultW: 12 },
  { id: 'stats',      label: 'Portfolio Stats',    hint: 'Net Worth · Total Return · Today’s P&L', core: true, defaultW: 12 },
  { id: 'benchmark',  label: 'Performance vs Index', hint: 'Your return vs the index',        defaultW: 12 },
  { id: 'performance',label: 'Performance Chart',  hint: 'Portfolio value over time',         defaultW: 12 },
  { id: 'allocation', label: 'Allocation',         hint: 'Sector / holding allocation donut', defaultW: 8 },
  { id: 'topHoldings',label: 'Top Holdings',       hint: 'Your biggest positions',            defaultW: 4 },
  { id: 'insights',   label: 'Insights',           hint: 'Best / worst movers',               defaultW: 4 },
  { id: 'dividends',  label: 'Upcoming Dividends', hint: 'Your holdings’ payouts',        defaultW: 4 },
  { id: 'topMovers',  label: 'Top Movers',         hint: 'KSE-100 / KMI-30 gainers & losers', defaultW: 4 },
  { id: 'boardMeetings', label: 'Board Meetings',  hint: 'Upcoming board meetings',           defaultW: 8 },
  { id: 'summary',    label: 'Portfolio Summary',  hint: 'Full holdings + realized summary',  defaultW: 12 },
];

export const CORE_IDS = CARD_META.filter(m => m.core).map(m => m.id);
export const isCore = (id: string) => CORE_IDS.includes(id);
export const metaFor = (id: string) => CARD_META.find(m => m.id === id);

// Per-card layout. w = width in 12-col units (web only; mobile is always full).
// h = fixed pixel height, or 0 for natural/auto height.
export interface CardLayout {
  id: string;
  visible: boolean;
  w: number;
  h: number;
}

export type Device = 'web' | 'mobile';

export interface DashboardLayout {
  web: CardLayout[];
  mobile: CardLayout[];
}

const buildDefault = (device: Device): CardLayout[] =>
  CARD_META.map(m => ({
    id: m.id,
    visible: true,
    w: device === 'mobile' ? 12 : m.defaultW,
    h: 0,
  }));

export const DEFAULT_LAYOUT: DashboardLayout = {
  web: buildDefault('web'),
  mobile: buildDefault('mobile'),
};

const clampW = (w: any): number => {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n)) return 12;
  return Math.min(12, Math.max(1, n));
};

const clampH = (h: any): number => {
  const n = Math.round(Number(h));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1200, Math.max(120, n));
};

// Merge a (possibly stale / partial) saved device layout with the registry so
// new cards appear and removed cards drop out. Core cards are forced visible.
const normalizeDevice = (saved: any[], device: Device): CardLayout[] => {
  const savedArr = Array.isArray(saved) ? saved : [];
  const known = new Set(CARD_META.map(m => m.id));
  const out: CardLayout[] = [];
  const seen = new Set<string>();

  savedArr.forEach((c) => {
    if (!c || typeof c.id !== 'string' || !known.has(c.id) || seen.has(c.id)) return;
    seen.add(c.id);
    out.push({
      id: c.id,
      visible: isCore(c.id) ? true : c.visible !== false,
      w: device === 'mobile' ? 12 : clampW(c.w ?? metaFor(c.id)?.defaultW ?? 12),
      h: clampH(c.h),
    });
  });

  // Append any registry cards missing from the saved layout (new features).
  CARD_META.forEach((m) => {
    if (seen.has(m.id)) return;
    out.push({
      id: m.id,
      visible: true,
      w: device === 'mobile' ? 12 : m.defaultW,
      h: 0,
    });
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

export const hiddenCards = (device: CardLayout[]): CardLayout[] =>
  device.filter(c => !c.visible);
