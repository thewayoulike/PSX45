import { describe, expect, it } from 'vitest';
import { labelSwingStructure } from './chartStructure';

describe('labelSwingStructure', () => {
  it('labels pivot highs against the previous high', () => {
    const labels = labelSwingStructure(
      [
        { i: 4, price: 20 },
        { i: 8, price: 24 },
        { i: 12, price: 23 },
      ],
      'high'
    );

    expect(labels).toEqual([
      { i: 8, price: 24, label: 'HH' },
      { i: 12, price: 23, label: 'LH' },
    ]);
  });

  it('labels pivot lows against the previous low', () => {
    const labels = labelSwingStructure(
      [
        { i: 3, price: 10 },
        { i: 7, price: 12 },
        { i: 11, price: 9 },
      ],
      'low'
    );

    expect(labels).toEqual([
      { i: 7, price: 12, label: 'HL' },
      { i: 11, price: 9, label: 'LL' },
    ]);
  });
});
