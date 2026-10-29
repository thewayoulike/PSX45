import React from 'react';
import { Dashboard } from './DashboardStats';
import { MobilePortfolioValue } from './MobilePortfolioValue';
import type { Holding, PortfolioStats, Transaction } from '../types';
import '../mobile-layout.css';
import '../mobile-clean-layout.css';

// Illustrative account only. Reuse the signed-in components so the public preview
// follows the real mobile dashboard instead of maintaining a second card layout.
const stats: PortfolioStats = {
  totalValue: 84000, totalCost: 80000, freeCash: 20000,
  unrealizedPL: 4000, unrealizedPLPercent: 5, realizedPL: 0, netRealizedPL: 0,
  totalDividends: 0, totalDividendTax: 0, dailyPL: -420, dailyPLPercent: -0.5,
  totalCommission: 0, totalSalesTax: 0, totalCDC: 0, totalOtherFees: 0, totalCGT: 0,
  cashInvestment: 100000, totalDeposits: 100000, netPrincipal: 100000,
  peakNetPrincipal: 100000, reinvestedProfits: 0, roi: 4, totalNetReturn: 4000, mwrr: null,
};
const transactions: Transaction[] = [
  { id: 'sample-deposit', portfolioId: 'sample', date: '2026-10-01', type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100000, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0 },
  { id: 'sample-buy', portfolioId: 'sample', date: '2026-10-01', type: 'BUY', ticker: 'FFC', quantity: 200, price: 400, commission: 0, tax: 0, cdcCharges: 0, otherFees: 0 },
];
const holdings = [{ ticker: 'FFC', quantity: 200, avgPrice: 400, currentPrice: 420 }] as Holding[];
const dates = ['01','02','05','06','07','08','09','12','13','14','15','16','19','20','21','22','23','26','27','28'];
const values = [100000,100400,100100,100800,101200,100900,101500,101100,101800,102000,101700,102500,102100,102800,103100,102900,103500,103900,104420,104000];
const rows = values.map((netWorth, i) => ({ rawDate: `2026-10-${dates[i]}`, netWorth }));

export default function LoginMobileDashboard() {
  return <section className="mobile-layout-app login-dashboard-preview" data-design-variant="structured" data-mobile-view="DASHBOARD" aria-label="Example of the signed-in mobile dashboard">
    <div className="login-preview-label">Sample portfolio · Illustrative figures</div>
    <div className="app-page-scroll"><div className="dashboard-preview-content">
      <MobilePortfolioValue rows={rows} value={104000} dayChange={-420} sessionDate="2026-10-28" quoteTime="2026-10-28T11:30:00Z" />
      <Dashboard stats={stats} holdings={holdings} transactions={transactions} />
    </div></div>
  </section>;
}
