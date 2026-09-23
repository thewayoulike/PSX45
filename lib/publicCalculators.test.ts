import { expect, it } from 'vitest';
import { capitalGain, dividendYield, fifoVsAverage, listedShareCgtRate, shareSaleTax, sipFutureValue, tradeCost, zakatDue } from '../public/calculators.js';

it('estimates a share disposal from the prices and fees you type', () => {
  const row = capitalGain({ quantity: 500, buyPrice: 100, sellPrice: 130, buyFees: 200, sellFees: 250, taxRatePct: 15 });
  expect(row.proceeds).toBe(65000);
  expect(row.cost).toBe(50200);
  expect(row.gain).toBe(14550);
  expect(row.tax).toBe(2182.5);
  expect(row.net).toBe(12367.5);
});

it('leaves tax blank until a rate is entered', () => {
  const row = capitalGain({ quantity: 10, buyPrice: 50, sellPrice: 40, buyFees: 0, sellFees: 0, taxRatePct: null });
  expect(row.gain).toBe(-100);
  expect(row.tax).toBe(null);
  expect(row.net).toBe(null);
});

it('uses the Finance Act 2025 filer and non-filer rates for one listed-share sale', () => {
  expect(listedShareCgtRate({ acquired: '2010-01-01', sold: '2026-01-01', onAtl: true }).rate).toBe(0);
  expect(listedShareCgtRate({ acquired: '2010-01-01', sold: '2026-01-01', onAtl: false }).rate).toBe(0);
  expect(listedShareCgtRate({ acquired: '2020-01-01', sold: '2026-01-01', onAtl: true }).rate).toBe(12.5);
  expect(listedShareCgtRate({ acquired: '2020-01-01', sold: '2026-01-01', onAtl: false }).rate).toBe(25);
  expect(listedShareCgtRate({ acquired: '2023-01-15', sold: '2024-01-15', onAtl: true }).rate).toBe(15);
  expect(listedShareCgtRate({ acquired: '2023-01-15', sold: '2024-01-16', onAtl: false }).rate).toBe(25);
  expect(listedShareCgtRate({ acquired: '2023-01-15', sold: '2025-01-15', onAtl: true }).rate).toBe(12.5);
  expect(listedShareCgtRate({ acquired: '2023-01-15', sold: '2025-01-16', onAtl: true }).rate).toBe(10);
  expect(listedShareCgtRate({ acquired: '2022-07-01', sold: '2028-07-01', onAtl: false }).rate).toBe(5);
  expect(listedShareCgtRate({ acquired: '2022-07-01', sold: '2028-07-02', onAtl: true }).rate).toBe(0);
  expect(listedShareCgtRate({ acquired: '2024-12-01', sold: '2026-09-23', onAtl: false }).rate).toBe(30);
  expect(listedShareCgtRate({ acquired: '2025-07-01', sold: '2026-09-23', onAtl: false }).rate).toBe(15);
  expect(listedShareCgtRate({ acquired: '2026-09-01', sold: '2026-08-01', onAtl: true })).toEqual({ error: 'The sell date is before the buy date.' });

  const row = shareSaleTax({
    quantity: 500, buyPrice: 100, sellPrice: 130, buyFees: 200, sellFees: 250,
    acquired: '2024-08-01', sold: '2026-09-01', onAtl: true,
  });
  expect(row.gain).toBe(14550);
  expect(row.filer).toEqual({ rate: 15, tax: 2182.5, net: 12367.5 });
  expect(row.nonFiler).toEqual({ rate: 30, tax: 4365, net: 10185 });
  expect(row.rate).toBe(15);
});

it('compares FIFO lot matching with average cost on a partial sell', () => {
  const row = fifoVsAverage(
    [{ quantity: 100, price: 200 }, { quantity: 100, price: 170 }],
    50,
    225,
  );
  expect(row.fifoGain).toBe(1250);
  expect(row.averageGain).toBe(2000);
});

it('refuses a sell larger than the lots entered', () => {
  expect(fifoVsAverage([{ quantity: 10, price: 5 }], 11, 6)).toEqual({ error: 'Sell quantity is larger than the lots entered.' });
});

it('computes dividend yield from a dividend and a price you supply', () => {
  expect(dividendYield(8, 200)).toEqual({ yieldPct: 4 });
  expect(dividendYield(8, 0)).toEqual({ error: 'Enter a price above zero.' });
});

it('projects a monthly SIP from a return you type', () => {
  const row = sipFutureValue({ monthly: 10000, annualReturnPct: 12, years: 1 });
  expect(row.invested).toBe(120000);
  expect(row.futureValue).toBeCloseTo(128093.28, 0);
  expect(row.gain).toBeCloseTo(row.futureValue - 120000, 5);
  expect(sipFutureValue({ monthly: 1000, annualReturnPct: 0, years: 2 }).futureValue).toBe(24000);
  expect(sipFutureValue({ monthly: 0, annualReturnPct: 10, years: 0 })).toEqual({ error: 'Enter a time longer than zero.' });
});

it('estimates zakat at 2.5% once wealth reaches the nisab you measure', () => {
  const below = zakatDue({ cash: 100000, silverPricePerGram: 200, nisabMetal: 'silver' });
  expect(below.nisab).toBeCloseTo(612.36 * 200, 5);
  expect(below.belowNisab).toBe(true);
  expect(below.zakat).toBe(0);
  const due = zakatDue({ cash: 200000, silverPricePerGram: 200 });
  expect(due.belowNisab).toBe(false);
  expect(due.zakat).toBe(5000);
  expect(zakatDue({ cash: 500000, goldPricePerGram: 0, nisabMetal: 'gold' })).toEqual({
    error: 'Enter a gold price per gram to measure nisab.',
  });
});
it('adds commission, tax on commission, and a CDC amount you supply', () => {
  expect(tradeCost({ value: 100000, commissionPct: 0.15, salesTaxPctOnCommission: 13, cdc: 25 })).toEqual({
    commission: 150,
    salesTax: 19.5,
    cdc: 25,
    total: 194.5,
  });
});
