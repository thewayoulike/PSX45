export const CASH_TARGET = 'CASH';

export interface WeightTarget {
  ticker: string;
  percent: number;
}

export interface WeightPosition {
  ticker: string;
  value: number;
}

export interface RebalanceGap {
  ticker: string;
  value: number;
  currentPercent: number;
  targetPercent: number;
  gapPercent: number;
  /** Positive means the holding is short of its target. This is not an order. */
  gapRupees: number;
}

export interface RebalancePlan {
  ok: boolean;
  sum: number;
  rows: RebalanceGap[];
}

/** Compare today's weights with saved targets. Targets must add up to 100. */
export function rebalanceGaps(
  positions: WeightPosition[],
  cash: number,
  targets: WeightTarget[],
): RebalancePlan {
  const sum = targets.reduce((total, target) => total + target.percent, 0);
  if (targets.some(target => target.percent < 0) || Math.abs(sum - 100) > 0.05) {
    return { ok: false, sum, rows: [] };
  }

  const total = positions.reduce((value, position) => value + position.value, 0) + cash;
  const tickers = new Set<string>([CASH_TARGET]);
  positions.forEach(position => tickers.add(position.ticker));
  targets.forEach(target => tickers.add(target.ticker));

  const rows = [...tickers].map(ticker => {
    const value = ticker === CASH_TARGET
      ? cash
      : (positions.find(position => position.ticker === ticker)?.value ?? 0);
    const currentPercent = total > 0 ? (value / total) * 100 : 0;
    const targetPercent = targets.find(target => target.ticker === ticker)?.percent ?? 0;
    const gapRupees = (total * targetPercent) / 100 - value;
    return {
      ticker,
      value,
      currentPercent,
      targetPercent,
      gapPercent: targetPercent - currentPercent,
      gapRupees,
    };
  }).filter(row => Math.abs(row.value) > 0.005 || row.targetPercent > 0);

  return { ok: true, sum, rows };
}
