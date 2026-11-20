import type { CardLayout } from './dashboard';

export type DesktopPlacement = { column: number; width: number; row: number; rows: number; height: number; visible: boolean };
export type DesktopCard = DesktopPlacement & { id: string; label: string; selector: string };
export type DesktopLayout = { version: 1; cards: Record<string, DesktopPlacement> };
const card = (id: string, label: string, selector: string, column: number, width: number, row: number, rows = 1): DesktopCard =>
  ({ id, label, selector, column, width, row, rows, height: 0, visible: true });
export const DESKTOP_CARDS: DesktopCard[] = [
  card('greeting', 'Dashboard heading', '[data-dashboard-greeting]', 1, 12, 1),
  card('value', 'Portfolio value chart', '.portfolio-value-preview', 1, 8, 2, 3),
  card('return', 'Total return', '[data-summary-card="return"]', 9, 4, 2),
  card('daily', 'Today’s P&L', '[data-summary-card="daily"]', 9, 4, 3),
  card('health', 'Health score', '[data-dashboard-health]', 9, 4, 4),
  card('metrics', 'Performance, Capital and Income', '[data-dashboard-stats] > :has(.dashboard-metrics)', 1, 12, 5),
  card('fees', 'Charges paid', '[data-dashboard-fees]', 1, 12, 6),
  card('performance', 'Daily stock P&L chart', '[data-dashboard-card="performance"]', 1, 8, 7),
  card('benchmark', 'Performance vs index', '[data-dashboard-card="benchmark"]', 9, 4, 7),
  card('allocation', 'Allocation Analysis', '[data-dashboard-card="allocation"]', 1, 8, 8),
  card('topHoldings', 'Top Holdings', '[data-dashboard-card="topHoldings"]', 9, 4, 8),
  card('insights', 'Insights', '[data-dashboard-card="insights"]', 1, 8, 9),
  card('dividends', 'Upcoming Dividends', '[data-dashboard-card="dividends"]', 9, 4, 9),
  card('topMovers', 'Top Movers', '[data-dashboard-card="topMovers"]', 1, 8, 10),
  card('boardMeetings', 'Board Meetings', '[data-dashboard-card="boardMeetings"]', 9, 4, 10),
  card('summary', 'Portfolio Summary', '[data-dashboard-card="summary"]', 1, 12, 11),
];
export function clampPlacement(value: number, low: number, high: number, fallback: number) {
  return Number.isFinite(value) ? Math.round(Math.max(low, Math.min(high, value))) : fallback;
}
/** Validate persisted positions; migrate existing card visibility without changing mobile layouts. */
export function desktopCards(saved?: DesktopLayout, legacy: CardLayout[] = []): DesktopCard[] {
  return DESKTOP_CARDS.map(item => {
    const placement = saved?.version === 1 ? saved.cards?.[item.id] : undefined;
    const column = clampPlacement(placement?.column, 1, 12, item.column);
    return { ...item, column,
      width: clampPlacement(placement?.width, 1, 13 - column, Math.min(item.width, 13 - column)),
      row: clampPlacement(placement?.row, 1, 100, item.row),
      rows: clampPlacement(placement?.rows, 1, 10, item.rows),
      height: clampPlacement(placement?.height, 0, 1500, 0),
      visible: typeof placement?.visible === 'boolean' ? placement.visible : legacy.find(c => c.id === item.id)?.visible !== false,
    };
  });
}
export function serializeDesktopCards(cards: DesktopCard[]): DesktopLayout {
  return { version: 1, cards: Object.fromEntries(cards.map(({ id, label, selector, ...placement }) => [id, placement])) };
}
export function normalizeDesktopLayout(saved: DesktopLayout): DesktopLayout | undefined {
  return saved?.version === 1 && saved.cards && typeof saved.cards === 'object'
    ? serializeDesktopCards(desktopCards(saved)) : undefined;
}

/** Push intersecting cards down when a card is moved or widened. Hidden cards do not block a move. */
export function placeDesktopCard(cards: DesktopCard[], id: string, patch: Partial<DesktopPlacement>): DesktopCard[] {
  const next = cards.map(card => ({ ...card, ...(card.id === id ? patch : {}) }));
  const moving = next.find(card => card.id === id);
  if (!moving || !moving.visible) return next;
  const overlaps = (a: DesktopCard, b: DesktopCard) => a.visible && b.visible &&
    a.column < b.column + b.width && b.column < a.column + a.width &&
    a.row < b.row + b.rows && b.row < a.row + a.rows;
  const settled: DesktopCard[] = [moving];
  for (const card of next.filter(card => card.id !== id).sort((a,b) => a.row-b.row || a.column-b.column)) {
    let collision: DesktopCard | undefined;
    while ((collision = settled.find(other => overlaps(card, other)))) card.row = collision.row + collision.rows;
    settled.push(card);
  }
  return next;
}
