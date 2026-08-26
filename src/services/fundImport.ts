import { EditableTrade } from '../types';
import { MutualFundRecord } from './mufapData';
import { resolveFundFromScan } from '../utils/fundMatch';
import { todayPK } from '../utils/dates';
import { roundFundNav, roundFundUnits } from '../utils/fundFormat';

export interface FundBalanceRow {
  fundCode: string;
  fundName?: string;
  units: number;
  nav: number;
  investmentValue: number;
  gainToDate?: number;
  gainFytd?: number;
}

/** Activity rows from transaction statements (cash, tax, dividends, subscribe/redeem). */
export type FundCashFlowType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'DIVIDEND'
  | 'DIVIDEND_REINVEST'
  | 'TAX'
  | 'SUBSCRIBE'
  | 'REDEEM'
  | 'OTHER';

export interface FundCashFlowRow {
  type: FundCashFlowType;
  date?: string;
  amount: number;
  fundCode?: string;
  fundName?: string;
  units?: number;
  nav?: number;
  notes?: string;
}

export interface FundBalanceScan {
  statementDate?: string;
  amc?: string;
  holdings: FundBalanceRow[];
  cashFlows?: FundCashFlowRow[];
}

export interface FundScanAdjustments {
  trades: EditableTrade[];
  warnings: string[];
}

const roundUnits = roundFundUnits;
const roundMoney = (n: number) => Math.round(n * 100) / 100;
const roundNav = roundFundNav;

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
        nav = roundNav(catalogNav);
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
    void id;
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

const cashFlowToTrade = (
  cf: FundCashFlowRow,
  catalog: Record<string, MutualFundRecord>,
  fallbackDate: string
): EditableTrade | null => {
  const date = cf.date || fallbackDate;
  const amount = roundMoney(Math.abs(Number(cf.amount) || 0));
  const notes = cf.notes || undefined;

  switch (cf.type) {
    case 'DEPOSIT':
      if (!(amount > 0)) return null;
      return { ticker: 'CASH', type: 'DEPOSIT', quantity: 1, price: amount, date, notes: notes || 'Cash deposit / transfer in' };
    case 'WITHDRAWAL':
      if (!(amount > 0)) return null;
      return { ticker: 'CASH', type: 'WITHDRAWAL', quantity: 1, price: amount, date, notes: notes || 'Cash withdrawal / transfer out' };
    case 'TAX':
      if (!(amount > 0)) return null;
      return { ticker: 'CGT', type: 'TAX', quantity: 1, price: amount, date, notes: notes || 'Tax / WHT' };
    case 'DIVIDEND': {
      const { id } = resolveFundFromScan(cf.fundCode || '', cf.fundName, catalog);
      if (!(amount > 0)) return null;
      // quantity=1, price=net dividend amount (same pattern as cash dividend rows)
      return {
        ticker: id || 'CASH',
        type: 'DIVIDEND',
        quantity: 1,
        price: amount,
        date,
        notes: notes || `${cf.fundCode || cf.fundName || 'Fund'} dividend`,
      };
    }
    case 'DIVIDEND_REINVEST':
      if (!(amount > 0)) return null;
      return {
        ticker: 'DIV REINVEST',
        type: 'DIVIDEND_REINVEST',
        quantity: 1,
        price: amount,
        date,
        notes: notes || 'Dividend reinvested',
      };
    case 'SUBSCRIBE': {
      const { id } = resolveFundFromScan(cf.fundCode || '', cf.fundName, catalog);
      const units = Number(cf.units) || 0;
      const nav = Number(cf.nav) || 0;
      if (units > 0 && nav > 0) {
        return {
          ticker: id,
          type: 'BUY',
          quantity: roundUnits(units),
          price: roundNav(nav),
          date,
          notes: notes || (cf.fundCode ? `${cf.fundCode}${cf.fundName ? ` — ${cf.fundName}` : ''}` : cf.fundName),
        };
      }
      if (amount > 0 && nav > 0) {
        return {
          ticker: id,
          type: 'BUY',
          quantity: roundUnits(amount / nav),
          price: roundNav(nav),
          date,
          notes: notes || 'New investment / subscribe',
        };
      }
      return null;
    }
    case 'REDEEM': {
      const { id } = resolveFundFromScan(cf.fundCode || '', cf.fundName, catalog);
      const units = Number(cf.units) || 0;
      const nav = Number(cf.nav) || 0;
      if (units > 0 && nav > 0) {
        return {
          ticker: id,
          type: 'SELL',
          quantity: roundUnits(units),
          price: roundNav(nav),
          date,
          notes: notes || (cf.fundCode ? `${cf.fundCode}${cf.fundName ? ` — ${cf.fundName}` : ''}` : cf.fundName),
        };
      }
      if (amount > 0 && nav > 0) {
        return {
          ticker: id,
          type: 'SELL',
          quantity: roundUnits(amount / nav),
          price: roundNav(nav),
          date,
          notes: notes || 'Redemption',
        };
      }
      return null;
    }
    case 'OTHER':
      if (!(amount > 0)) return null;
      return {
        ticker: 'CASH',
        type: 'OTHER',
        quantity: 1,
        price: Number(cf.amount) || amount,
        date,
        notes: notes || 'Other adjustment',
      };
    default:
      return null;
  }
};

/** Convert AI-parsed AMC balance / activity statement into editable transaction rows. */
export function fundScanToTrades(
  scan: FundBalanceScan,
  catalog: Record<string, MutualFundRecord>,
  fallbackDate?: string
): FundScanAdjustments {
  const date = scan.statementDate || fallbackDate || todayPK();
  const trades: EditableTrade[] = [];
  const warnings: string[] = [];

  const flows = (scan.cashFlows || []).filter(Boolean);
  const hasActivity = flows.length > 0;

  if (hasActivity) {
    for (const cf of flows) {
      const t = cashFlowToTrade(cf, catalog, date);
      if (t) trades.push(t);
      else warnings.push(`Skipped incomplete ${cf.type} row${cf.fundCode ? ` (${cf.fundCode})` : ''}`);
    }
  }

  const normalized = (scan.holdings || []).map(h => {
    const { row, warning } = normalizeFundScanRow(h, catalog);
    if (warning) warnings.push(warning);
    return row;
  });

  const openHoldings = normalized.filter(h => h.units > 0 && h.nav > 0);

  // Balance-summary path: opening Deposit + Subscribe when no activity ledger was found
  if (!hasActivity && openHoldings.length > 0) {
    const totalValue = openHoldings.reduce((s, h) => s + h.investmentValue, 0);
    if (totalValue > 0) {
      trades.push({
        ticker: 'CASH',
        type: 'DEPOSIT',
        quantity: 1,
        price: roundMoney(totalValue),
        date,
        notes: scan.amc
          ? `Starting balance (Investment Value) — ${scan.amc}`
          : 'Starting balance from AMC Investment Value',
      });
    }
    for (const h of openHoldings) {
      const { id } = resolveFundFromScan(h.fundCode, h.fundName, catalog);
      trades.push({
        ticker: id,
        type: 'BUY',
        quantity: h.units,
        price: roundNav(h.nav),
        date,
        notes: h.fundCode !== id ? `${h.fundCode}${h.fundName ? ` — ${h.fundName}` : ''}` : h.fundName,
      });
    }
  } else if (hasActivity && openHoldings.length > 0) {
    // Activity statement + holdings snapshot: only add Subscribe rows for funds not already in cashFlows
    const subscribed = new Set(
      flows
        .filter(f => f.type === 'SUBSCRIBE' || f.type === 'REDEEM')
        .map(f => resolveFundFromScan(f.fundCode || '', f.fundName, catalog).id)
    );
    for (const h of openHoldings) {
      const { id } = resolveFundFromScan(h.fundCode, h.fundName, catalog);
      if (subscribed.has(id)) continue;
      // Snapshot-only fund with no activity row — treat as opening subscribe
      trades.push({
        ticker: id,
        type: 'BUY',
        quantity: h.units,
        price: roundNav(h.nav),
        date,
        notes: h.fundCode !== id ? `${h.fundCode}${h.fundName ? ` — ${h.fundName}` : ''} (from holdings)` : `${h.fundName || h.fundCode} (from holdings)`,
      });
      warnings.push(`${h.fundCode || h.fundName}: added Subscribe from holdings snapshot (no activity row)`);
    }
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
