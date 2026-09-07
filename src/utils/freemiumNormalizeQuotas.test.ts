import { describe, expect, it } from 'vitest';
import { normalizeQuotas } from '../components/FreemiumContext';

describe('normalizeQuotas', () => {
  it('uses Free caps when isFree and quotas missing', () => {
    const q = normalizeQuotas(true, null);
    expect(q.alertsTp).toBe(2);
    expect(q.alertsSl).toBe(2);
    expect(q.alertsTickers).toBe(3);
    expect(q.exportPerDay).toBe(1);
  });

  it('uses Paid alert caps when not Free even if quotas missing', () => {
    const q = normalizeQuotas(false, null);
    expect(q.alertsTp).toBe(4);
    expect(q.alertsSl).toBe(4);
    expect(q.alertsTickers).toBe(15);
    expect(q.chartViewsPerDay).toBe(Number.POSITIVE_INFINITY);
  });

  it('maps JSON null unlimited fields to Infinity for Paid', () => {
    const q = normalizeQuotas(false, {
      alertsTp: 4,
      alertsSl: 4,
      alertsTickers: 15,
      chartViewsPerDay: null as unknown as number,
      exportPerDay: null as unknown as number,
    });
    expect(q.alertsTp).toBe(4);
    expect(q.chartViewsPerDay).toBe(Number.POSITIVE_INFINITY);
    expect(q.exportPerDay).toBe(Number.POSITIVE_INFINITY);
  });
});
