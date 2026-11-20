import React from 'react';
import type { PortfolioStats } from '../types';

type ChargeTotals = Pick<PortfolioStats, 'totalCommission' | 'totalSalesTax' | 'totalCDC' | 'totalOtherFees'>;

export function DashboardChargesStrip({ stats, format }: { stats: ChargeTotals; format: (amount: number) => string }) {
  const charges = [
    { label: 'Commission', amount: stats.totalCommission, color: '#138267' },
    { label: 'Taxes (SST)', amount: stats.totalSalesTax, color: '#77bca6' },
    { label: 'CDC charges', amount: stats.totalCDC, color: '#c98532' },
    { label: 'Other fees', amount: stats.totalOtherFees, color: '#76877c' }
  ];
  const total = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const canShowShares = total > 0 && charges.every(charge => charge.amount >= 0);

  return (
    <section className="dashboard-charges-strip" aria-label="Charges paid, all time">
      <div className="dashboard-charges-total">
        <span>Charges paid, all time</span>
        <strong>{format(total)}</strong>
        <small>Commission, tax, CDC &amp; other fees</small>
      </div>
      <div className="dashboard-charges-breakdown">
        <div className="dashboard-charges-bar" aria-hidden="true">
          {canShowShares && charges.filter(charge => charge.amount > 0).map(charge => (
            <span key={charge.label} style={{ flexGrow: charge.amount, backgroundColor: charge.color }} />
          ))}
        </div>
        <dl className="dashboard-charges-items">
          {charges.map(charge => (
            <div key={charge.label}>
              <dt><span aria-hidden="true" style={{ backgroundColor: charge.color }} />{charge.label}</dt>
              <dd>{format(charge.amount)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
