import { describe, expect, it } from 'vitest';
import {
  resolveInitialChartSymbol,
  resolveSelectedAfterMarketLoad,
} from './chartExplorerSelection';

describe('resolveInitialChartSymbol', () => {
  it('returns empty for normal mode with no URL symbol (no OGDC / storage default)', () => {
    expect(
      resolveInitialChartSymbol({
        previewMode: false,
        urlSymbol: null,
        storedSymbol: 'OGDC',
        defaultSymbol: 'OGDC',
      }),
    ).toBe('');
  });

  it('uses URL symbol when present', () => {
    expect(
      resolveInitialChartSymbol({
        previewMode: false,
        urlSymbol: 'ppl',
        storedSymbol: 'OGDC',
      }),
    ).toBe('PPL');
  });

  it('uses defaultSymbol only in previewMode', () => {
    expect(
      resolveInitialChartSymbol({
        previewMode: true,
        defaultSymbol: 'LUCK',
        urlSymbol: null,
        storedSymbol: 'OGDC',
      }),
    ).toBe('LUCK');
  });
});

describe('resolveSelectedAfterMarketLoad', () => {
  it('keeps selected when still in the market list', () => {
    expect(resolveSelectedAfterMarketLoad('HBL', ['OGDC', 'HBL'])).toBe('HBL');
  });

  it('clears selected when missing instead of picking the first stock', () => {
    expect(resolveSelectedAfterMarketLoad('ZZZZ', ['OGDC', 'HBL'])).toBe('');
  });

  it('keeps empty selection empty', () => {
    expect(resolveSelectedAfterMarketLoad('', ['OGDC', 'HBL'])).toBe('');
  });
});
