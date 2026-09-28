import { describe, expect, it } from 'vitest';
import { oversellCashCredit } from './oversellCash';
import {
  applyOpeningCorporateActions,
  buildCorporateTransaction,
  parseBonusPercent,
  previewBonus,
  previewRights,
  previewSplit,
} from './corporateActions';

describe('bonus, split, and rights', () => {
  it('dilutes the average on a bonus and leaves cash and total cost alone', () => {
    const preview = previewBonus(500, 142_500, 10);
    expect(preview.sharesAfter).toBe(550);
    expect(preview.costAfter).toBe(142_500);
    expect(preview.avgAfter).toBeCloseTo(259.090909, 4);
    expect(preview.cashChange).toBe(0);
  });

  it('spreads the same cost across a split', () => {
    const lots = [{ id: 'buy', quantity: 500, costPerShare: 285, commPerShare: 1 }];
    applyOpeningCorporateActions(lots, [
      { id: 'split', type: 'SPLIT', quantity: 500, price: 2, date: '2026-02-01' },
    ]);
    expect(lots[0].quantity).toBe(1000);
    expect(lots[0].costPerShare).toBeCloseTo(142.5, 6);
    expect(lots[0].commPerShare).toBeCloseTo(0.5, 6);
    expect(lots[0].quantity * lots[0].costPerShare).toBeCloseTo(142_500, 4);

    const preview = previewSplit(500, 142_500, 2);
    expect(preview.sharesAfter).toBe(1000);
    expect(preview.costAfter).toBe(142_500);
    expect(preview.avgAfter).toBeCloseTo(142.5, 6);
    expect(preview.cashChange).toBe(0);
  });

  it('adds only the rights shares that were paid for', () => {
    const preview = previewRights(500, 142_500, 50, 200);
    expect(preview.sharesAfter).toBe(550);
    expect(preview.costAfter).toBe(152_500);
    expect(preview.avgAfter).toBeCloseTo(277.272727, 4);
    expect(preview.cashChange).toBe(-10_000);
  });

  it('builds one confirmable row and does not turn a bonus into a buy', () => {
    const row = buildCorporateTransaction({
      kind: 'bonus',
      ticker: 'OGDC',
      date: '2026-09-28',
      broker: 'AKD',
      sharesHeld: 500,
      totalCost: 142_500,
      bonusPercent: 10,
    });
    expect(row.type).toBe('BONUS');
    expect(row.quantity).toBe(50);
    expect(row.price).toBe(0);
    expect(row.commission + row.tax + row.cdcCharges + row.otherFees).toBe(0);
  });

  it('lets a later sale of bonus and split shares count as cash', () => {
    const credit = oversellCashCredit([
      { type: 'BUY', ticker: 'OGDC', quantity: 500, price: 285, date: '2026-01-01' },
      { type: 'BONUS', ticker: 'OGDC', quantity: 50, price: 0, date: '2026-02-01' },
      { type: 'SPLIT', ticker: 'OGDC', quantity: 550, price: 2, date: '2026-03-01' },
      { type: 'SELL', ticker: 'OGDC', quantity: 1100, price: 150, date: '2026-04-01' },
    ]);
    expect(credit).toBeCloseTo(1100 * 150, 4);
  });

  it('reads a bonus percent off an announcement', () => {
    expect(parseBonusPercent('10%')).toBe(10);
    expect(parseBonusPercent('Bonus: 12.5%')).toBe(12.5);
    expect(parseBonusPercent('-')).toBeNull();
  });
});
