import { describe, expect, it } from 'vitest';
import { desktopCards, normalizeDesktopLayout, serializeDesktopCards, DESKTOP_CARDS, restoreFreeCards, serializeFreeCards, scaleFreeCards, moveFreeCard, resizeFreeCard, type ResizeDirection, type FreeCard } from './desktopDashboardModel';
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


const sampleFreeCards=():FreeCard[]=>DESKTOP_CARDS.map((meta,index)=>({id:meta.id,label:meta.label,selector:meta.selector,
  left:index%2*500,top:Math.floor(index/2)*160,width:450,height:120,visible:true}));
describe('free Dashboard placement',()=>{
  it('keeps exact positions and sizes when saved, normalized, and reopened',()=>{
    const cards=sampleFreeCards();cards[0]={...cards[0],left:123.45,top:67.89,width:333.33,height:415.5};
    const saved=serializeFreeCards(cards,1000),normalized=normalizeLayout({...DEFAULT_LAYOUT,desktop:saved});
    expect(normalized.desktop).toEqual(saved);
    expect(restoreFreeCards(normalized.desktop as any,1000)).toEqual(cards);
    expect(normalized.mobile).toEqual(DEFAULT_LAYOUT.mobile);
  });
  it('moves up into empty space by a single pixel without grid snapping or compaction',()=>{
    const cards=sampleFreeCards(),original=cards[4],snapshot=structuredClone(cards);
    const moved=moveFreeCard(original,original.left+17.25,original.top-81.5,1000);
    expect(moved).toMatchObject({left:original.left+17.25,top:original.top-81.5,width:original.width,height:original.height});
    expect(cards).toEqual(snapshot);
  });
  it('scales horizontal positions for another desktop width while retaining heights and vertical placements',()=>{
    const cards=sampleFreeCards(),scaled=scaleFreeCards(cards,1000,1500);
    expect(scaled[1]).toMatchObject({left:750,width:675,top:cards[1].top,height:cards[1].height});
  });
  it.each(['n','e','s','w','ne','nw','se','sw'] as ResizeDirection[])('resizes from %s and anchors the opposite edges',direction=>{
    const card={...sampleFreeCards()[0],left:100,top:100,width:300,height:200};
    const resized=resizeFreeCard(card,direction,17,23,1000);
    if(direction.includes('w'))expect(resized.left+resized.width).toBe(card.left+card.width);else expect(resized.left).toBe(card.left);
    if(direction.includes('n'))expect(resized.top+resized.height).toBe(card.top+card.height);else expect(resized.top).toBe(card.top);
    if(direction==='e'||direction==='w')expect(resized.height).toBe(card.height);
    if(direction==='n'||direction==='s')expect(resized.width).toBe(card.width);
  });
  it('permits an exact chosen height without forcing another card to match',()=>{
    const cards=sampleFreeCards(),before=structuredClone(cards),resized=resizeFreeCard(cards[1],'s',0,333,1000);
    expect(resized.height).toBe(453);expect(cards).toEqual(before);
  });
  it('bounds a card at the canvas edges and preserves readable minimum dimensions',()=>{
    const card=sampleFreeCards()[0];
    expect(moveFreeCard(card,-200,-300,1000)).toMatchObject({left:0,top:0});
    expect(resizeFreeCard(card,'se',-10000,-10000,1000)).toMatchObject({width:80,height:40});
  });
});
