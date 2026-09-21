import { describe, expect, it } from 'vitest';
import { calculateFairValue, compareEstimate, emptyInputs, finiteNumber, readResearch, type FairValueInputs } from './fairValue';

const baseline: FairValueInputs = { price: 100, eps: 10, fairPE: 12, bookValue: 40, expectedDiv: 6, requiredReturn: 12, cagr: 10, liabilities: 100, equity: 200, currentAssets: 300, currentLiabilities: 150, inventory: 60 };

describe('fair value arithmetic and applicability', () => {
  it('matches independently calculated estimates and ratios for the audit example', () => {
    const result = calculateFairValue(baseline);
    for (const [key, value] of Object.entries({ peValue: 120, dividendValue: 50, grahamValue: 94.868329805, pe: 10, dividendYield: 6, liabilitiesToEquity: 0.5, peg: 1, forwardPE: 9.09090909, currentRatio: 2, quickRatio: 1.6 })) {
      expect(result[key].value, key).toBeCloseTo(value, 7);
    }
  });

  it('keeps every missing result unavailable rather than zero', () => {
    for (const result of Object.values(calculateFairValue(emptyInputs()))) {
      expect(result.value).toBeNull();
      expect(result.reason).toBeTruthy();
    }
  });

  it.each([-10, 0])('does not value earnings or compute P/E/PEG for EPS %s', eps => {
    const result = calculateFairValue({ ...baseline, eps });
    for (const key of ['peValue', 'grahamValue', 'pe', 'peg', 'forwardPE']) expect(result[key].value).toBeNull();
    expect(result.dividendValue.value).toBe(50);
  });

  it.each([-1, 0])('requires positive return, target multiple and book value (%s)', value => {
    const result = calculateFairValue({ ...baseline, fairPE: value, bookValue: value, requiredReturn: value });
    expect(result.peValue.value).toBeNull();
    expect(result.grahamValue.value).toBeNull();
    expect(result.dividendValue.value).toBeNull();
  });

  it('preserves valid zero dividends, growth and balance-sheet amounts', () => {
    const result = calculateFairValue({ ...baseline, expectedDiv: 0, cagr: 0, liabilities: 0, currentAssets: 0, inventory: 0 });
    expect(result.dividendValue.value).toBe(0);
    expect(result.dividendYield.value).toBe(0);
    expect(result.forwardPE.value).toBe(10);
    expect(result.peg.value).toBeNull();
    expect(result.liabilitiesToEquity.value).toBe(0);
    expect(result.currentRatio.value).toBe(0);
    expect(result.quickRatio.value).toBe(0);
  });

  it('supports declining earnings without applying PEG to negative growth', () => {
    const result = calculateFairValue({ ...baseline, cagr: -20 });
    expect(result.forwardPE.value).toBe(12.5);
    expect(result.peg.value).toBeNull();
    expect(calculateFairValue({ ...baseline, cagr: -100 }).forwardPE.value).toBeNull();
  });

  it('does not hide negative equity or impossible inventory', () => {
    const result = calculateFairValue({ ...baseline, equity: -50, currentAssets: 100, inventory: 200 });
    expect(result.liabilitiesToEquity).toEqual({ value: null, reason: expect.stringContaining('negative') });
    expect(result.quickRatio).toEqual({ value: null, reason: expect.stringContaining('Inventory exceeds') });
  });

  it.each(['liabilities', 'currentAssets', 'currentLiabilities', 'inventory', 'expectedDiv'])('rejects invalid negative %s in affected ratios', key => {
    const result = calculateFairValue({ ...baseline, [key]: -1 });
    const expected = { liabilities: 'liabilitiesToEquity', currentAssets: 'currentRatio', currentLiabilities: 'quickRatio', inventory: 'quickRatio', expectedDiv: 'dividendValue' }[key];
    expect(result[expected!].value).toBeNull();
  });

  it('does not silently substitute zero for non-finite inputs or overflowed earnings', () => {
    const result = calculateFairValue({ ...baseline, eps: Infinity, expectedDiv: NaN });
    expect(result.peValue.value).toBeNull();
    expect(result.dividendValue.value).toBeNull();
    expect(calculateFairValue({ ...baseline, eps: 1e308, cagr: 1e308 }).forwardPE.value).toBeNull();
  });

  it('keeps the dividend model independent of earnings growth', () => {
    expect(calculateFairValue({ ...baseline, cagr: 75 }).dividendValue.value).toBe(50);
  });

  it('uses price-based upside/downside and an equality state', () => {
    expect(compareEstimate(100, 80)).toBe('25.0% upside to this estimate');
    expect(compareEstimate(80, 100)).toBe('20.0% downside to this estimate');
    expect(compareEstimate(0, 100)).toBe('100.0% downside to this estimate');
    expect(compareEstimate(100, 100)).toContain('At the entered price');
    expect(compareEstimate(100, 0)).not.toMatch(/upside|downside/);
  });
});

describe('research persistence and number normalization', () => {
  it.each([null, undefined, '', ' ', false, {}, 'N/A', '12%', '42garbage', 'Infinity', Infinity, NaN])('rejects %s rather than inventing a number', value => {
    expect(finiteNumber(value)).toBeNull();
  });
  it('accepts explicit zero and loss figures', () => {
    expect(finiteNumber('0')).toBe(0);
    expect(finiteNumber(' -5.4 ')).toBe(-5.4);
  });
  it('migrates legacy figures without trusting old automatic assumptions or unused FCF', () => {
    const original = { ...baseline, fcf: 20000 };
    const migrated = readResearch(original);
    expect(migrated.inputs.price).toBe(100);
    for (const key of ['fairPE', 'expectedDiv', 'requiredReturn', 'cagr']) expect(migrated.inputs[key]).toBe('');
    expect(migrated.inputs).not.toHaveProperty('fcf');
    expect(migrated.needsReview).toBe(true);
    expect(migrated.sources.price?.retrievedAt).toBeNull();
    expect(original.fairPE).toBe(12);
  });
  it('round trips modern assumptions, zeros, source metadata and save date', () => {
    const record = { ...readResearch(), inputs: { ...baseline, cagr: 0, expectedDiv: 0 }, savedAt: '2026-09-21T12:00:00Z', sources: { price: { name: 'Market quote', retrievedAt: '2026-09-21T11:59:00Z' } }, reportedDividend: { value: 0, retrievedAt: '2026-09-21T11:59:00Z' } };
    const restored = readResearch(JSON.parse(JSON.stringify(record)));
    expect(restored.inputs).toEqual(record.inputs);
    expect(restored.sources.price).toEqual(record.sources.price);
    expect(restored.reportedDividend?.value).toBe(0);
    expect(restored.savedAt).toBe(record.savedAt);
    expect(restored.needsReview).toBe(false);
  });
});
