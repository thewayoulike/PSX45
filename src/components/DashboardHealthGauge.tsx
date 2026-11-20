import React from 'react';

type HoldingPrice = { currentPrice: number; avgPrice: number };
type Props = React.PropsWithChildren<{
  score: number;
  status: string;
  statusColor: string;
  holdings?: HoldingPrice[];
}>;

export function DashboardHealthGauge({ score, status, statusColor, holdings, children }: Props) {
  const priced = (holdings || []).filter(holding =>
    Number.isFinite(holding.currentPrice) && holding.currentPrice > 0 &&
    Number.isFinite(holding.avgPrice) && holding.avgPrice > 0
  );
  const belowCost = priced.filter(holding => holding.currentPrice < holding.avgPrice).length;
  const summary = priced.length
    ? belowCost
      ? `${belowCost} of ${priced.length} priced holdings below cost.`
      : 'All priced holdings are at or above cost.'
    : 'No priced holdings to compare.';
  const sweep = Math.min(100, Math.max(0, score)) * 1.8;

  return (
    <div className="dashboard-health-content">
      <div className="dashboard-health-dial" style={{ '--health-sweep': `${sweep}deg` } as React.CSSProperties}>
        <span className="dashboard-health-arc" aria-hidden="true" />
        <div className="dashboard-health-figure"><strong>{score}</strong><span>out of 100</span></div>
      </div>
      <div className="dashboard-health-info">
        <span className="dashboard-health-label">Health score</span>
        <strong className={statusColor}>{status}</strong>
        <p>{summary}</p>
        {children}
      </div>
    </div>
  );
}
