import type { CardLayout } from './dashboard';

export type DesktopPlacement = { column: number; width: number; row: number; rows: number; height: number; offsetY: number; visible: boolean };
export type DesktopCard = DesktopPlacement & { id: string; label: string; selector: string };
export type LegacyDesktopLayout = { version: 1; cards: Record<string, DesktopPlacement> };
export type FreePlacement = { left: number; top: number; width: number; height: number; visible: boolean };
export type FreeCard = FreePlacement & { id: string; label: string; selector: string };
export type FreeDesktopLayout = { version: 2; canvasWidth: number; cards: Record<string, FreePlacement> };
export type DesktopLayout = LegacyDesktopLayout | FreeDesktopLayout;
const card = (id: string, label: string, selector: string, column: number, width: number, row: number, rows = 1): DesktopCard =>
  ({ id, label, selector, column, width, row, rows, height: 0, offsetY: 0, visible: true });
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
      offsetY: clampPlacement(placement?.offsetY, -1500, 1500, 0),
      visible: typeof placement?.visible === 'boolean' ? placement.visible : legacy.find(c => c.id === item.id)?.visible !== false,
    };
  });
}
export function serializeDesktopCards(cards: DesktopCard[]): LegacyDesktopLayout {
  return { version: 1, cards: Object.fromEntries(cards.map(({ id, label, selector, ...placement }) => [id, placement])) };
}
export function normalizeDesktopLayout(saved: DesktopLayout): DesktopLayout | undefined {
  if(saved?.version===2 && saved.cards && typeof saved.cards==='object' && Number.isFinite(saved.canvasWidth)) {
    const width=Math.max(320,Math.min(10000,saved.canvasWidth));
    return serializeFreeCards(restoreFreeCards(saved,width),width);
  }
  return saved?.version===1 && saved.cards && typeof saved.cards==='object' ? serializeDesktopCards(desktopCards(saved)) : undefined;
}

export type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const between = (value: number, low: number, high: number) => Math.max(low,Math.min(high,value));
const precision = (value: number) => Math.round(value*100)/100;
export function restoreFreeCards(saved: FreeDesktopLayout, canvasWidth: number): FreeCard[] {
  const sourceWidth=Math.max(320,finite(saved.canvasWidth,canvasWidth));
  const scale=canvasWidth/sourceWidth;
  let bottom=0;
  return DESKTOP_CARDS.map(meta=>{
    const item=saved.cards?.[meta.id];
    const width=between(finite(item?.width,sourceWidth)*scale,80,canvasWidth);
    const card:FreeCard={id:meta.id,label:meta.label,selector:meta.selector,
      left:precision(between(finite(item?.left,0)*scale,0,canvasWidth-width)),
      top:precision(between(finite(item?.top,bottom),0,100000)),width:precision(width),
      height:precision(between(finite(item?.height,200),40,5000)),visible:item?.visible!==false};
    bottom=Math.max(bottom,card.top+card.height+14);
    return card;
  });
}
export function serializeFreeCards(cards: FreeCard[], canvasWidth: number): FreeDesktopLayout {
  return {version:2,canvasWidth:precision(canvasWidth),cards:Object.fromEntries(cards.map(({id,label,selector,...placement})=>
    [id,Object.fromEntries(Object.entries(placement).map(([key,value])=>[key,typeof value==='number'?precision(value):value])) as FreePlacement]))};
}
export function scaleFreeCards(cards:FreeCard[],previousWidth:number,nextWidth:number):FreeCard[] {
  return restoreFreeCards(serializeFreeCards(cards,previousWidth),nextWidth);
}
/** Moving one card never compacts or changes neighbouring cards. */
export function moveFreeCard(card:FreeCard,left:number,top:number,canvasWidth:number):FreeCard {
  return {...card,left:precision(between(left,0,canvasWidth-card.width)),top:precision(between(top,0,100000))};
}
export function resizeFreeCard(card:FreeCard,direction:ResizeDirection,dx:number,dy:number,canvasWidth:number):FreeCard {
  const next={...card},right=card.left+card.width,bottom=card.top+card.height;
  if(direction.includes('w')) {next.left=between(card.left+dx,0,right-80);next.width=right-next.left;}
  else if(direction.includes('e'))next.width=between(card.width+dx,80,canvasWidth-card.left);
  if(direction.includes('n')) {next.top=between(card.top+dy,Math.max(0,bottom-5000),bottom-40);next.height=bottom-next.top;}
  else if(direction.includes('s'))next.height=between(card.height+dy,40,5000);
  return {...next,left:precision(next.left),top:precision(next.top),width:precision(next.width),height:precision(next.height)};
}
