import { describe, expect, it } from 'vitest';
import { isPriceStale, priceFreshnessLabel, STALE_PRICE_MS } from './priceFreshness';

describe('priceFreshness', () => {
  const now = Date.parse('2026-09-22T12:00:00.000Z');

  it('treats missing timestamps as not stale (unknown)', () => {
    expect(isPriceStale(undefined, now)).toBe(false);
    expect(priceFreshnessLabel(null, now)).toBe('unknown');
  });

  it('labels prices older than 24h as stale', () => {
    const old = new Date(now - STALE_PRICE_MS - 1000).toISOString();
    expect(isPriceStale(old, now)).toBe(true);
    expect(priceFreshnessLabel(old, now)).toBe('stale');
  });

  it('labels recent prices as live', () => {
    const recent = new Date(now - 60_000).toISOString();
    expect(isPriceStale(recent, now)).toBe(false);
    expect(priceFreshnessLabel(recent, now)).toBe('live');
  });
});
