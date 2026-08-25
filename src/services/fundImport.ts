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

export interface FundScanAdjustments {
  trades: EditableTrade[];
  warnings: string[];
}

const roundUnits = (n: number) => Math.round(n * 1000) / 1000;
const roundMoney = (n: number) => Math.round(n * 100) / 100;

/**
 * AMC statements print Units, NAV, and Investment Value — they must satisfy
 * Units × NAV ≈ Investment Value. AI often misreads units or picks avg cost as NAV.
 */
export function normalizeFundScanRow(
  h: FundBalanceRow,
  catalog?: Record<string, MutualFundRecord>
): { row: FundBalanceRow; warning?: string } {
  let { units, nav, investmentValue: inv } = h;
  const label = h.fundCode || h.fundName || 'Fund';

  if (nav <= 0 && units > 0 && inv > 0) nav = inv / units;
  if (inv <= 0 && units > 0 && nav > 0) inv = units * nav;
  if (inv <= 0) return { row: h };

  // If AI picked avg cost instead of NAV, catalog repurchase/NAV may reconcile investment value.
  if (catalog && h.fundCode) {
    const { id, record } = resolveFundFromScan(h.fundCode, h.fundName, catalog);
    const catalogNav = record ? (record.repurchase > 0 ? record.repurchase : record.nav) : 0;
    if (catalogNav > 0) {
      const catalogUnits = inv / catalogNav;
      const aiDrift = nav > 0 && units > 0 ? Math.abs(units * nav - inv) / inv : 1;
      const catalogDrift = Math.abs(catalogUnits * catalogNav - inv) / inv;
      if (catalogDrift < 0.005 && (aiDrift > 0.005 || catalogDrift < aiDrift)) {
        const prevUnits = units;
        const prevNav = nav;
        units = roundUnits(catalogUnits);
        nav = catalogNav;
        inv = roundMoney(units * nav);
        const parts: string[] = [];
        if (prevUnits > 0 && Math.abs(prevUnits - units) / units > 0.005) {
          parts.push(`units ${prevUnits.toLocaleString()} → ${units.toLocaleString()}`);
        }
        if (prevNav > 0 && Math.abs(prevNav - nav) / nav > 0.005) {
          parts.push(`NAV ${prevNav} → ${nav}`);
        }
        return {
          row: { ...h, units, nav, investmentValue: inv },
          warning: parts.length ? `${label}: fixed ${parts.join(', ')} using Investment Value` : undefined,
        };
      }
    }
  }

  if (nav <= 0) return { row: h };

  const impliedUnits = inv / nav;
  const statedValue = units > 0 ? units * nav : 0;
  const drift = units > 0 ? Math.abs(statedValue - inv) / inv : 1;

  if (drift > 0.005) {
    const prevUnits = units;
    units = roundUnits(impliedUnits);
    inv = roundMoney(units * nav);
    const warning =
      prevUnits > 0
        ? `${label}: adjusted units ${prevUnits.toLocaleString()} → ${units.toLocaleString()} to match Investment Value ÷ NAV`
        : `${label}: derived ${units.toLocaleString()} units from Investment Value ÷ NAV`;
    return { row: { ...h, units, nav, investmentValue: inv }, warning };
  }

  units = roundUnits(units);
  inv = roundMoney(units * nav);
  return { row: { ...h, units, nav, investmentValue: inv } };
}

/** Convert AI-parsed AMC balance summary into editable transaction rows. */
export function fundScanToTrades(
  scan: FundBalanceScan,
  catalog: Record<string, MutualFundRecord>,
  fallbackDate?: string
): FundScanAdjustments {
  const date = scan.statementDate || fallbackDate || todayPK();
  const trades: EditableTrade[] = [];
  const warnings: string[] = [];

  const normalized = scan.holdings.map(h => {
    const { row, warning } = normalizeFundScanRow(h, catalog);
    if (warning) warnings.push(warning);
    return row;
  });

  const openHoldings = normalized.filter(h => h.units > 0 && h.nav > 0);
  const totalValue = openHoldings.reduce((s, h) => s + h.investmentValue, 0);

  if (totalValue > 0) {
    trades.push({
      ticker: 'CASH',
      type: 'DEPOSIT',
      quantity: 1,
      price: roundMoney(totalValue),
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

  for (const h of normalized) {
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

  return { trades, warnings };
}
