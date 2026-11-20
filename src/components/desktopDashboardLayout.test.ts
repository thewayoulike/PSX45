import { describe, expect, it } from 'vitest';
import { desktopCards, normalizeDesktopLayout, serializeDesktopCards } from './desktopDashboardModel';
import { DEFAULT_LAYOUT, normalizeLayout, applyPortfolioToLayout } from './dashboard';
describe('desktop Dashboard layout', () => {
  it('shares the reference composition and omits the duplicate net worth card', () => {
    const cards = desktopCards();
    expect(cards.some(c => c.id === 'netWorth')).toBe(false);
    expect(cards.find(c => c.id === 'value')).toMatchObject({column:1,width:8,row:2,rows:3});
    expect(cards.find(c => c.id === 'health')).toMatchObject({column:9,width:4,row:4});
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
  });
  it('round trips editor changes through the existing saved/cloud layout', () => {
    const cards = desktopCards();
    Object.assign(cards.find(c => c.id === 'benchmark'), {column:1,width:12,height:200});
    cards.find(c => c.id === 'boardMeetings')!.visible=false;
    const saved = serializeDesktopCards(cards);
    const normalized = normalizeLayout({...DEFAULT_LAYOUT,desktop:saved});
    expect(normalized.desktop).toEqual(saved);
    expect(applyPortfolioToLayout(normalized,'PSX').desktop).toEqual(saved);
    expect(normalized.mobile).toEqual(DEFAULT_LAYOUT.mobile);
  });
  it('migrates existing visibility and validates malformed positions', () => {
    const legacy=DEFAULT_LAYOUT.web.map(c => c.id === 'allocation' ? {...c,visible:false} : c);
    expect(desktopCards(undefined,legacy).find(c => c.id === 'allocation')!.visible).toBe(false);
    const saved=serializeDesktopCards(desktopCards());
    Object.assign(saved.cards.benchmark,{column:100,width:999,row:-10,rows:0,height:Infinity,selector:'bad'});
    const card=desktopCards(saved).find(c => c.id === 'benchmark')!;
    expect(card).toMatchObject({column:12,width:1,row:1,rows:1,height:0,selector:'[data-dashboard-card="benchmark"]'});
    expect(normalizeDesktopLayout({version:2} as any)).toBeUndefined();
  });
});
