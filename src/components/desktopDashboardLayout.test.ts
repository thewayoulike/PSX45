import { describe, expect, it } from 'vitest';
import { desktopCards, normalizeDesktopLayout, serializeDesktopCards, placeDesktopCard, resizeDesktopCard, type ResizeDirection } from './desktopDashboardModel';
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

describe('moving and resizing desktop cards', () => {
  it('moves the actual card and pushes intersecting cards without losing information', () => {
    const result=placeDesktopCard(desktopCards(),'return',{row:4});
    expect(result.find(c=>c.id==='return')!.row).toBe(4);
    expect(result.find(c=>c.id==='health')!.row).toBe(5);
    for (const a of result) for (const b of result) if(a!==b && a.visible && b.visible) {
      expect(a.column<b.column+b.width && b.column<a.column+a.width && a.row<b.row+b.rows && b.row<a.row+a.rows).toBe(false);
    }
    expect(result.map(c=>c.id)).toEqual(desktopCards().map(c=>c.id));
  });
  it('keeps resized width and height through saving and reopening', () => {
    const result=placeDesktopCard(desktopCards(),'benchmark',{width:3,height:400});
    expect(desktopCards(serializeDesktopCards(result)).find(c=>c.id==='benchmark')).toMatchObject({width:3,height:400});
  });
});

describe('resizing from every edge and corner', () => {
  it.each(['n','e','s','w','ne','nw','se','sw'] as ResizeDirection[])('anchors the opposite edges for %s', direction => {
    const card={...desktopCards().find(card=>card.id==='benchmark')!,column:3,width:4,height:300,offsetY:0};
    const resized={...card,...resizeDesktopCard(card,direction,1,20,300,100,-100)};
    if(direction.includes('w'))expect(resized.column+resized.width).toBe(card.column+card.width);
    else expect(resized.column).toBe(card.column);
    if(direction.includes('n'))expect(resized.offsetY+resized.height).toBe(300);
    else expect(resized.offsetY).toBe(card.offsetY);
    if(direction==='e'||direction==='w')expect(resized.height).toBe(card.height);
    if(direction==='n'||direction==='s')expect(resized.width).toBe(card.width);
  });
  it('retains the top resize position when saved and reopened', () => {
    const cards=desktopCards();
    const card=cards.find(card=>card.id==='benchmark')!;
    const patch=resizeDesktopCard(card,'n',0,20,650,400,-100);
    const saved=serializeDesktopCards(placeDesktopCard(cards,card.id,patch));
    expect(desktopCards(saved).find(item=>item.id===card.id)).toMatchObject({height:630,offsetY:20});
  });
  it('resizes the selected card without changing neighbouring sizes', () => {
    const cards=desktopCards();
    const selected=cards.find(card=>card.id==='benchmark')!;
    const result=placeDesktopCard(cards,selected.id,resizeDesktopCard(selected,'se',1,100,400,200,0));
    for(const original of cards.filter(card=>card.id!==selected.id)) {
      const after=result.find(card=>card.id===original.id)!;
      expect({width:after.width,height:after.height,offsetY:after.offsetY}).toEqual({width:original.width,height:original.height,offsetY:original.offsetY});
    }
  });
});
