import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorporateActionModal } from './CorporateActionModal';
import { FundNumberPanel } from './FundNumberPanel';

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

  it('explains a fund value without treating reinvested units as cash', () => {
    const html = renderToStaticMarkup(React.createElement(FundNumberPanel, {
      holdings: [{ name: 'Meezan Growth', units: 110, avgNav: 10000 / 110, nav: 100 }],
      transactions: [
        { type: 'DEPOSIT', ticker: 'CASH', quantity: 1, price: 100000, date: '2026-01-01' },
        { type: 'DIVIDEND_REINVEST', ticker: 'MF:meezan-growth', quantity: 10, price: 100, date: '2026-03-01' },
        { type: 'REFUND_OF_CAPITAL', ticker: 'MF:meezan-growth', quantity: 5, price: 0, date: '2026-03-01' },
      ],
      fundValue: 11000,
      cash: 100000,
      netInvested: 100000,
    }));
    expect(html).toContain('Why this number');
    expect(html).toContain('Meezan Growth');
    expect(html).toContain('Not cash');
    expect(html).toContain('Bonus units');
  });
});
