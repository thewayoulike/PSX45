import { isFundTicker } from './fundId';
import { oversellCashCredit } from './oversellCash';

export interface ExplainLine {
  label: string;
  amount: number;
  countsInTotal: boolean;
  note?: string;
}

export interface CashExplainTx {
  type: string;
  ticker: string;
  quantity: number;
  price: number;
  date?: string;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
  category?: string;
}

const feesOf = (t: CashExplainTx) =>
  (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);

/**
 * The lines that make the fund cash balance. Unit reinvestment and bonus units
 * are shown so they are not mistaken for cash. The counted lines use the same
 * cash rules as the dashboard balance.
 */
export function explainFundCash(txs: CashExplainTx[], book: 'fund' | 'stock' = 'fund'): { lines: ExplainLine[]; total: number } {
  let deposits = 0;
  let withdrawals = 0;
  let expenses = 0;
  let adjustments = 0;
  let historyPnL = 0;
  let totalCgt = 0;
  let fundTaxWithheld = 0;
  let totalReinvest = 0;
  let unitReinvestVal = 0;
  let buys = 0;
  let bonusQty = 0;
  let sawSplit = false;

  for (const t of txs) {
    const val = (t.price || 0) * (t.quantity || 0);
    const fees = feesOf(t);
    if (t.type === 'DEPOSIT') deposits += t.price || 0;
    else if (t.type === 'WITHDRAWAL') withdrawals += t.price || 0;
    else if (t.type === 'ANNUAL_FEE') expenses += t.price || 0;
    else if (t.type === 'OTHER') {
      if (t.category === 'OTHER_TAX' || t.category === 'CDC_CHARGE') expenses += Math.abs(t.price || 0);
      else adjustments += t.price || 0;
    } else if (t.type === 'DIVIDEND') {
      if (isFundTicker(t.ticker)) {
        fundTaxWithheld += t.tax || 0;
        totalCgt += t.tax || 0;
      }
    } else if (t.type === 'DIVIDEND_REINVEST') {
      const unitReinvest = isFundTicker(t.ticker);
      const amt = unitReinvest ? val : (t.price || 0);
      totalReinvest += amt;
      if (unitReinvest) {
        unitReinvestVal += val;
        fundTaxWithheld += t.tax || 0;
        totalCgt += t.tax || 0;
      }
    } else if (t.type === 'TAX') totalCgt += t.price || 0;
    else if (t.type === 'HISTORY') {
      totalCgt += t.tax || 0;
      historyPnL += t.price || 0;
    } else if (t.type === 'SELL' && (t.tax || 0) > 0 && isFundTicker(t.ticker)) {
      totalCgt += t.tax || 0;
      fundTaxWithheld += t.tax || 0;
    }     else if (t.type === 'BUY' || t.type === 'RIGHTS') buys += val + fees;
    else if (t.type === 'REFUND_OF_CAPITAL' || t.type === 'BONUS') bonusQty += t.quantity || 0;
    else if (t.type === 'SPLIT') sawSplit = true;
  }

  const matched = oversellCashCredit(txs.map(t => ({ ...t, date: t.date || '' })));
  const cashCgt = totalCgt - fundTaxWithheld;
  const reinvestLeftInCash = totalReinvest - unitReinvestVal;
  const lines: ExplainLine[] = [];
  const push = (label: string, amount: number, note?: string) => {
    if (Math.abs(amount) < 0.005) return;
    lines.push({ label, amount, countsInTotal: true, note });
  };

  push('Deposits', deposits);
  push(book === 'stock' ? 'Buys, with charges' : 'Subscriptions, with charges', -buys);
  push(book === 'stock' ? 'Sells, after charges' : 'Redemptions, after charges', matched);
  push('Withdrawals', -withdrawals);
  push('Tax paid from this cash', -cashCgt);
  push('Fees', -expenses);
  push('Dividends kept as cash', reinvestLeftInCash);
  push('Adjustments', adjustments);
  push('Earlier profit or loss', historyPnL);

  if (unitReinvestVal > 0) {
    lines.push({
      label: 'Dividends reinvested as units',
      amount: 0,
      countsInTotal: false,
      note: 'This dividend stayed in the fund as units. It is not cash.',
    });
  }
  if (bonusQty > 0) {
    lines.push({
      label: book === 'stock' ? 'Bonus shares' : 'Bonus units',
      amount: 0,
      countsInTotal: false,
      note: book === 'stock'
        ? 'These shares were added at no cost. Cash is unchanged.'
        : 'These units were added at no cost. Cash is unchanged.',
    });
  }
  if (sawSplit) {
    lines.push({
      label: 'Share split',
      amount: 0,
      countsInTotal: false,
      note: 'The share count changed. Cash is unchanged.',
    });
  }

  const total = lines.filter(line => line.countsInTotal).reduce((sum, line) => sum + line.amount, 0);
  return { lines, total };
}

export function explainFundValue(
  holdings: { name: string; units: number; avgNav: number; nav: number }[],
  book: 'fund' | 'stock' = 'fund',
): { lines: ExplainLine[]; total: number; cost: number; gain: number } {
  const lines = holdings
    .filter(holding => holding.units > 0.0001)
    .map(holding => {
      const qty = holding.units.toLocaleString(undefined, { maximumFractionDigits: 4 });
      const px = holding.nav.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return {
        label: holding.name,
        amount: holding.units * holding.nav,
        countsInTotal: true,
        note: book === 'stock' ? `${qty} shares × Rs. ${px}` : `${qty} units × NAV ${px}`,
      };
    });
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const cost = holdings.reduce((sum, holding) => sum + holding.units * holding.avgNav, 0);
  return { lines, total, cost, gain: total - cost };
}

/** Net invested, with profit-funded withdrawals called out so the lines add up. */
export function explainNetInvested(
  txs: { type: string; quantity: number; price: number; ticker?: string }[],
  netInvested: number,
): { lines: ExplainLine[]; total: number } {
  let deposits = 0;
  let withdrawals = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const t of txs) {
    const val = (t.price || 0) * (t.quantity || 0);
    if (t.type === 'DEPOSIT') deposits += t.price || 0;
    else if (t.type === 'WITHDRAWAL') withdrawals += t.price || 0;
    else if (t.type === 'TRANSFER_IN') transferIn += val;
    else if (t.type === 'TRANSFER_OUT') transferOut += val;
  }
  const putIn = deposits + transferIn;
  const takenOut = withdrawals + transferOut;
  const fromProfit = netInvested - (putIn - takenOut);
  const lines: ExplainLine[] = [
    { label: 'Money added', amount: putIn, countsInTotal: true },
    { label: 'Money taken out', amount: -takenOut, countsInTotal: true },
  ];
  if (Math.abs(fromProfit) > 0.005) {
    lines.push({
      label: 'Withdrawn from profit',
      amount: fromProfit,
      countsInTotal: true,
      note: 'A withdrawal uses profit before it reduces the amount you invested.',
    });
  }
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}
