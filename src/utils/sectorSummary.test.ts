import { describe, expect, it } from 'vitest';
import { parseSectorSummary, withSectorMoves } from './sectorSummary';

const ROW = `<tr><td>0804</td><td data-order="CEMENT"><a href="javascript:" data-code="0804"><strong>CEMENT</strong></a></td><td class="right">15</td><td class="right">3</td><td class="right">0</td><!-- td.right=numeral(sector.change).format('0.00')--><td class="right" data-order="21174607">21,174,607</td><td class="right">1,511.75</td></tr>`;
const APPAREL = `<tr><td>0839</td><td><strong>APPAREL</strong></td><td class="right">1</td><td class="right">3</td><td class="right">0</td><td class="right">479,581</td><td class="right">43.42</td></tr>`;

describe('PSX sector summary', () => {
  it('reads every sector from the exchange table and ignores the commented change cells', () => {
    const sectors = parseSectorSummary(`<table><thead><tr><th>Sector Code</th></tr></thead><tbody>${ROW}${APPAREL}</tbody></table>`);
    expect(sectors).toEqual([
      {
        code: '0804',
        name: 'Cement',
        advance: 15,
        decline: 3,
        unchanged: 0,
        turnover: 21174607,
        marketCapB: 1511.75,
      },
      {
        code: '0839',
        name: 'Apparel',
        advance: 1,
        decline: 3,
        unchanged: 0,
        turnover: 479581,
        marketCapB: 43.42,
      },
    ]);
  });

  it('returns nothing when the page has no sector rows', () => {
    expect(parseSectorSummary('')).toEqual([]);
    expect(parseSectorSummary('<table><tr><th>Sector</th></tr></table>')).toEqual([]);
  });

  it('averages each sector’s move from the previous close', () => {
    const withMoves = withSectorMoves(
      [
        { code: '0804', name: 'Cement', advance: 15, decline: 3, unchanged: 0, turnover: 1, marketCapB: 1 },
        { code: '0839', name: 'Apparel', advance: 1, decline: 3, unchanged: 0, turnover: 1, marketCapB: 1 },
      ],
      [
        { sector: 'Cement', price: 110, ldcp: 100 },
        { sector: 'Cement', price: 90, ldcp: 100 },
        { sector: 'CEMENT', price: 105, ldcp: 100 },
        { sector: 'Apparel', price: 0, ldcp: 100 },
      ],
    );
    expect(withMoves[0].changePct).toBeCloseTo((10 + -10 + 5) / 3, 5);
    expect(withMoves[1].changePct).toBeNull();
  });
});
