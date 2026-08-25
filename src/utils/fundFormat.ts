/** MUFAP / AMC NAV prices and unit balances are quoted to 4 decimal places. */
export const FUND_NAV_DECIMALS = 4;
export const FUND_UNIT_DECIMALS = 4;

export const roundFundNav = (n: number): number =>
  Math.round(n * 10 ** FUND_NAV_DECIMALS) / 10 ** FUND_NAV_DECIMALS;

export const roundFundUnits = (n: number): number =>
  Math.round(n * 10 ** FUND_UNIT_DECIMALS) / 10 ** FUND_UNIT_DECIMALS;

export const fmtFundNav = (n: number): string =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: FUND_NAV_DECIMALS,
    maximumFractionDigits: FUND_NAV_DECIMALS,
  });

export const fmtFundUnits = (n: number): string =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: FUND_UNIT_DECIMALS,
    maximumFractionDigits: FUND_UNIT_DECIMALS,
  });

/** Format subscribe/redemption price inputs on blur (mutual fund transactions). */
export const dpFundNav = (v: unknown): unknown => {
  const n = Number(v);
  return v === '' || v == null || isNaN(n) || n === 0 ? v : roundFundNav(n).toFixed(FUND_NAV_DECIMALS);
};

/** Format unit quantity inputs on blur (mutual fund transactions). */
export const dpFundUnits = (v: unknown): unknown => {
  const n = Number(v);
  return v === '' || v == null || isNaN(n) || n === 0 ? v : roundFundUnits(n).toFixed(FUND_UNIT_DECIMALS);
};

/** Round avg NAV for cost-basis math (matches AMC statements). */
export const fundAvgForCost = (avgPrice: number): number => roundFundNav(avgPrice);
