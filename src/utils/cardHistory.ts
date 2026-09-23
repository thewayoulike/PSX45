type CashTx = {
  type: string;
  date: string;
  quantity?: number;
  price?: number;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
  category?: string;
};

/** Cash in the account, and the capital you put in, using trades up to and including `asOf`. */
export function ledgerAsOf(txs: CashTx[], asOf: string): { cash: number; contributed: number } {
  let cash = 0;
  let deposits = 0;
  let withdrawals = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const t of txs) {
    if (t.date > asOf) continue;
    const val = (t.price || 0) * (t.quantity || 0);
    const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
    if (t.type === 'DEPOSIT') { cash += t.price || 0; deposits += t.price || 0; }
    else if (t.type === 'WITHDRAWAL') { cash -= t.price || 0; withdrawals += t.price || 0; }
    else if (t.type === 'BUY') cash -= val + fees;
    else if (t.type === 'SELL') cash += val - fees;
    else if (t.type === 'DIVIDEND') cash += val - (t.tax || 0) - (t.otherFees || 0);
    else if (t.type === 'ANNUAL_FEE' || t.type === 'TAX') cash -= t.price || 0;
    else if (t.type === 'HISTORY') cash += t.price || 0;
    else if (t.type === 'OTHER') {
      if (t.category === 'OTHER_TAX' || t.category === 'CDC_CHARGE') cash -= Math.abs(t.price || 0);
      else cash += t.price || 0;
    } else if (t.type === 'TRANSFER_IN') transferIn += val;
    else if (t.type === 'TRANSFER_OUT') transferOut += val;
  }
  return { cash, contributed: deposits + transferIn - withdrawals - transferOut };
}

export function daySnapshot(marketValue: number, ledger: { cash: number; contributed: number }) {
  const netWorth = marketValue + ledger.cash;
  return { netWorth, totalReturn: netWorth - ledger.contributed };
}

export type HistoryRow = { rawDate?: string; netWorth?: number; totalReturn?: number; Portfolio?: number };

/** Last 7 saved sessions for the dashboard cards. */
export function cardSparklines(rows: HistoryRow[]) {
  const last = (rows || []).filter(row => row && row.rawDate).slice(-7);
  const numbers = (pick: (row: HistoryRow) => number | undefined) => {
    const values = last.map(pick);
    return values.length >= 2 && values.every(value => typeof value === 'number') ? values as number[] : [];
  };
  return {
    netWorth: numbers(row => row.netWorth),
    totalReturn: numbers(row => row.totalReturn),
    dailyReturn: numbers(row => row.Portfolio),
  };
}
