import { EditableTrade } from '../types';
import { MutualFundRecord } from './mufapData';
import { resolveFundFromScan } from '../utils/fundMatch';
import { todayPK } from '../utils/dates';

export interface FundBalanceRow {
  fundCode: string;
  fundName?: string;
  units: number;
  nav: number;
  investmentValue: number;
  gainToDate?: number;
  gainFytd?: number;
}

export interface FundBalanceScan {
  statementDate?: string;
  amc?: string;
  holdings: FundBalanceRow[];
}

/** Convert AI-parsed AMC balance summary into editable transaction rows. */
export function fundScanToTrades(
  scan: FundBalanceScan,
  catalog: Record<string, MutualFundRecord>,
  fallbackDate?: string
): EditableTrade[] {
  const date = scan.statementDate || fallbackDate || todayPK();
  const trades: EditableTrade[] = [];

  const openHoldings = scan.holdings.filter(h => h.units > 0 && h.nav > 0);
  const totalValue = openHoldings.reduce((s, h) => s + (h.investmentValue || h.units * h.nav), 0);

  if (totalValue > 0) {
    trades.push({
      ticker: 'CASH',
      type: 'DEPOSIT',
      quantity: 1,
      price: Math.round(totalValue * 100) / 100,
      date,
      notes: scan.amc ? `Opening balance — ${scan.amc}` : 'Opening balance from AMC statement',
    });
  }

  for (const h of openHoldings) {
    const { id, record } = resolveFundFromScan(h.fundCode, h.fundName, catalog);
    trades.push({
      ticker: id,
      type: 'BUY',
      quantity: h.units,
      price: h.nav,
      date,
      broker: record?.amc || scan.amc,
      notes: h.fundCode !== id ? `${h.fundCode}${h.fundName ? ` — ${h.fundName}` : ''}` : h.fundName,
    });
  }

  for (const h of scan.holdings) {
    if (h.units > 0 || !h.gainToDate) continue;
    trades.push({
      ticker: 'PREV-PNL',
      type: 'HISTORY',
      quantity: 1,
      price: h.gainToDate,
      date,
      notes: `${h.fundCode}${h.fundName ? ` — ${h.fundName}` : ''} (closed / fully redeemed)`,
    });
  }

  return trades;
}
