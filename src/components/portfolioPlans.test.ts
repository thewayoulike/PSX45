import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorporateActionModal } from './CorporateActionModal';
import { Dashboard } from './DashboardStats';
import type { Holding, PortfolioStats } from '../types';

describe('portfolio plan screens', () => {
  it('shows a bonus confirm card and does not save it during render', () => {
    let saved = false;
    const html = renderToStaticMarkup(React.createElement(CorporateActionModal, {
      draft: { ticker: 'OGDC', shares: 500, cost: 142500, broker: 'AKD', kind: 'bonus', bonusPercent: 10 },
      onClose: () => {},
      onConfirm: () => { saved = true; },
    }));
    expect(saved).toBe(false);
    expect(html).toContain('550');
    expect(html).toContain('Nothing is saved until you confirm');
    expect(html).toContain('None');
  });

  it('puts a why-this-number hover on fund and stock figures', () => {
    const stats: PortfolioStats = {
      totalValue: 11000, totalCost: 10000, unrealizedPL: 1000, unrealizedPLPercent: 10,
      realizedPL: 0, netRealizedPL: 0, totalDividends: 0, totalDividendTax: 0,
      dailyPL: 0, dailyPLPercent: 0, freeCash: 100000, totalCommission: 0, totalSalesTax: 0,
      totalCDC: 0, totalOtherFees: 0, totalCGT: 0, cashInvestment: 100000, totalDeposits: 100000,
      netPrincipal: 100000, peakNetPrincipal: 100000, reinvestedProfits: 0, roi: 1, mwrr: null,
    };
    const holding = (ticker: string): Holding => ({
      ticker, sector: '', quantity: 110, avgPrice: 10000 / 110, currentPrice: 100,
      totalCommission: 0, totalTax: 0, totalCDC: 0, totalOtherFees: 0,
    });
    const fundHtml = renderToStaticMarkup(React.createElement(Dashboard, {
      stats, portfolioType: 'MUTUAL_FUND', holdings: [holding('MF:meezan-growth')],
      displayNames: { 'MF:meezan-growth': 'Meezan Growth' },
      transactions: [
        { id: 'd', portfolioId: 'p', type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100000, date: '2026-01-01', commission: 0, tax: 0, cdcCharges: 0, otherFees: 0 },
        { id: 'r', portfolioId: 'p', type: 'DIVIDEND_REINVEST', ticker: 'MF:meezan-growth', quantity: 10, price: 100, date: '2026-03-01', commission: 0, tax: 0, cdcCharges: 0, otherFees: 0 },
      ],
    }));
    expect(fundHtml).toContain('Why this fund value');
    expect(fundHtml).toContain('Why this cash balance');
    expect(fundHtml).toContain('Why this net invested');
    expect(fundHtml).toContain('Score breakdown');
    expect(fundHtml).not.toContain('>Why this number<');

    const stockHtml = renderToStaticMarkup(React.createElement(Dashboard, {
      stats: { ...stats, totalValue: 6000 },
      portfolioType: 'PSX',
      holdings: [holding('OGDC')],
      transactions: [],
    }));
    expect(stockHtml).toContain('Why this stock value');
    expect(stockHtml).toContain('Why this cash balance');
    expect(stockHtml).toContain('Why this net invested');
  });
});
