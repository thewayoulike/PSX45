import {it,expect} from 'vitest';
import {matchHeadlines,newsSector,sectorNewsTerms} from './research';
const headlines=(titles:string[])=>titles.map((title,i)=>({id:String(i),title,url:'https://example.test',source:'test',indexedAt:'',topics:['commodities']}));
it('matches sector and commodity headlines even without the selected company name',()=>{
  const sector=newsSector('PPL');expect(sector).toMatch(/Oil.*Gas/i);
  const items=headlines(['Crude prices rise after OPEC decision','LNG supply agreement signed','Gas exploration policy revised','Textile exports grow','Boiler equipment factory opens','Police fire tear gas at protesters']);
  expect(matchHeadlines(items,sectorNewsTerms(sector).join(', ')).map(i=>i.id)).toEqual(['0','1','2']);
  expect(matchHeadlines(items,'PPL')).toHaveLength(0);
});
it('uses the market sector before the static fallback and resolves PSX codes',()=>{
  expect(newsSector('HBL','0820')).toBe('Oil & Gas Exploration Companies');
  expect(newsSector('CNERGY')).toMatch(/Refin/i);
  expect(newsSector('NEWSTOCK','Commercial Banks')).toBe('Commercial Banks');
  expect(matchHeadlines(headlines(['SBP cuts interest rates','Banking earnings rise','Crude oil falls']),sectorNewsTerms('Commercial Banks').join(', '))).toHaveLength(2);
});
it('does not turn unknown sectors into an unfiltered news search',()=>{
  expect(newsSector('UNKNOWN')).toBe('');expect(newsSector('HBL','Unclassified')).toBe('');
  expect(sectorNewsTerms('')).toEqual([]);
  expect(sectorNewsTerms('New Specific Sector')).toEqual(['New Specific Sector']);
});
it('covers textile, fertilizer and technology vocabulary without matching word fragments',()=>{
  expect(matchHeadlines(headlines(['Cotton prices recover','Yarn exports rise','Sugar prices rise']),sectorNewsTerms('Textile Composite').join(', '))).toHaveLength(2);
  expect(matchHeadlines(headlines(['Urea demand increases','Fertiliser imports fall','Radar demand rises']),sectorNewsTerms('Fertilizer').join(', '))).toHaveLength(2);
  expect(matchHeadlines(headlines(['IT exports increase','Telecom spectrum auction','City exports increase']),sectorNewsTerms('Technology & Communication').join(', '))).toHaveLength(2);
});
