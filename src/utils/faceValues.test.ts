import { describe, expect, it } from 'vitest';
import { faceValueGuide, getFaceValue, percentToRs } from './faceValues';

describe('dividend face values from the 30 Sep 2026 board', () => {
  it('turns a 100% dividend into rupees at the current face value', () => {
    expect(percentToRs(100, 'SYS')).toBe(2);
    expect(percentToRs(100, 'UBL')).toBe(5);
    expect(percentToRs(100, 'KOHC')).toBe(2);
    expect(percentToRs(100, 'KTML')).toBe(2);
    expect(percentToRs(100, 'MTL')).toBe(5);
    expect(percentToRs(100, 'AHCL')).toBe(1);
    expect(percentToRs(100, 'BFBIO')).toBe(3);
    expect(percentToRs(100, 'KEL')).toBe(3.5);
    expect(percentToRs(100, 'PINL')).toBe(10);
    expect(percentToRs(100, 'OGDC')).toBe(10);
    expect(getFaceValue('ANNT')).toBe(5);
    expect(getFaceValue('PIAB')).toBe(5);
  });

  it('keeps the pre-split face value on earlier ex-dates', () => {
    expect(getFaceValue('SYS', '2025-05-27')).toBe(10);
    expect(getFaceValue('SYS', '2025-06-02')).toBe(2);
    expect(percentToRs(100, 'UBL', '2025-06-20')).toBe(10);
    expect(percentToRs(100, 'UBL', '2025-06-23')).toBe(5);
  });

  it('tells the dividend search the same face values', () => {
    const guide = faceValueGuide();
    expect(guide).toContain('SYS Rs 2');
    expect(guide).toContain('UBL Rs 5');
    expect(guide).toContain('2025-06-02');
    expect(guide).toContain('2025-06-23');
  });
});
