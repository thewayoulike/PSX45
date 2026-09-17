import { describe, expect, it } from 'vitest';
import { shouldPersistPortfolio } from './portfolioPersistence';
import { formatTransactionLabel } from './fundDisplay';
import { hitTestDrawings, type DrawRenderCoords } from './chartDrawings';
describe('rollout regressions', () => {
  it('persists empty authenticated portfolios while blocking boot/sign-out writes', () => {
    expect(shouldPersistPortfolio({ signedIn: true, checking: false, skip: false })).toBe(true);
    for (const state of [{signedIn:false,checking:false,skip:false},{signedIn:true,checking:true,skip:false},{signedIn:true,checking:false,skip:true}]) expect(shouldPersistPortfolio(state)).toBe(false);
  });
  it('unknown fund display falls back without crashing', () => {
    expect(formatTransactionLabel('MF:UNKNOWN', {})).toBeTruthy();
    expect(formatTransactionLabel('MF:UNKNOWN', {}, 'Fund: Sample Fund')).toBeTruthy();
  });
  it('selects horizontal lines only within the plot bounds', () => {
    const coords: DrawRenderCoords = {barTimes:[1,2],plotOffset:0,slot:10,plotLeft:0,plotRight:100,plotTop:0,plotBottom:100,yMin:0,yMax:100,padTop:0,innerH:100};
    const lines = [{ id:'h',type:'hline' as const,price:50,color:'#000' }];
    expect(hitTestDrawings(50,50,lines,coords)).toBe('h');
    expect(hitTestDrawings(150,50,lines,coords)).toBeNull();
    expect(hitTestDrawings(50,-1,lines,coords)).toBeNull();
  });
});
