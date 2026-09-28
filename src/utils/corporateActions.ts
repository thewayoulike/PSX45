export interface PositionPreview {
  sharesNow: number;
  sharesAfter: number;
  sharesAdded: number;
  costNow: number;
  costAfter: number;
  avgNow: number;
  avgAfter: number;
  cashChange: number;
}

export interface OpeningLot {
  id?: string;
  quantity: number;
  costPerShare: number;
  date?: string;
  commPerShare?: number;
  taxPerShare?: number;
  cdcPerShare?: number;
  otherPerShare?: number;
}

export interface OpeningAction {
  id: string;
  type: string;
  quantity: number;
  price: number;
  date: string;
}

export interface CorporateTransactionDraft {
  type: 'BONUS' | 'SPLIT' | 'RIGHTS';
  ticker: string;
  quantity: number;
  price: number;
  date: string;
  broker?: string;
  brokerId?: string;
  commission: number;
  tax: number;
  cdcCharges: number;
  otherFees: number;
  notes: string;
}

const previewOf = (
  shares: number,
  cost: number,
  added: number,
  costAdded: number,
  cashChange: number,
): PositionPreview => {
  const sharesAfter = shares + added;
  const costAfter = cost + costAdded;
  return {
    sharesNow: shares,
    sharesAfter,
    sharesAdded: added,
    costNow: cost,
    costAfter,
    avgNow: shares > 0 ? cost / shares : 0,
    avgAfter: sharesAfter > 0 ? costAfter / sharesAfter : 0,
    cashChange,
  };
};

export function previewBonus(shares: number, totalCost: number, bonusPercent: number): PositionPreview {
  if (!(shares > 0) || !(bonusPercent > 0)) throw new Error('Enter the shares you hold and a bonus percent.');
  return previewOf(shares, totalCost, shares * (bonusPercent / 100), 0, 0);
}

export function previewSplit(shares: number, totalCost: number, newSharesForEachOld: number): PositionPreview {
  if (!(shares > 0) || !(newSharesForEachOld > 1)) throw new Error('A split needs more than one new share for each old share.');
  return previewOf(shares, totalCost, shares * (newSharesForEachOld - 1), 0, 0);
}

export function previewRights(
  shares: number,
  totalCost: number,
  rightsShares: number,
  pricePaid: number,
): PositionPreview {
  if (!(rightsShares > 0) || pricePaid < 0) throw new Error('Enter the rights shares you paid for and the price.');
  const costAdded = rightsShares * pricePaid;
  return previewOf(shares, totalCost, rightsShares, costAdded, -costAdded);
}

/** Bonus shares are new free shares. A split rescales the shares already held. */
export function applyOpeningCorporateActions<T extends OpeningLot>(
  lots: T[],
  actions: OpeningAction[],
  unitScale?: Record<string, number>,
): void {
  for (const action of actions) {
    if (action.type === 'BONUS') {
      if (!(action.quantity > 0)) continue;
      lots.push({
        id: action.id,
        quantity: action.quantity,
        costPerShare: 0,
        date: action.date,
        commPerShare: 0,
        taxPerShare: 0,
        cdcPerShare: 0,
        otherPerShare: 0,
      } as T);
    } else if (action.type === 'SPLIT' && action.price > 1) {
      const ratio = action.price;
      for (const lot of lots) {
        lot.quantity *= ratio;
        lot.costPerShare /= ratio;
        if (lot.commPerShare) lot.commPerShare /= ratio;
        if (lot.taxPerShare) lot.taxPerShare /= ratio;
        if (lot.cdcPerShare) lot.cdcPerShare /= ratio;
        if (lot.otherPerShare) lot.otherPerShare /= ratio;
        if (unitScale && lot.id) unitScale[lot.id] = (unitScale[lot.id] || 1) * ratio;
      }
    }
  }
}

export function buildCorporateTransaction(input: {
  kind: 'bonus' | 'split' | 'rights';
  ticker: string;
  date: string;
  broker?: string;
  brokerId?: string;
  sharesHeld: number;
  totalCost: number;
  bonusPercent?: number;
  newSharesForEachOld?: number;
  rightsShares?: number;
  pricePaid?: number;
}): CorporateTransactionDraft {
  const base = {
    ticker: input.ticker,
    date: input.date,
    broker: input.broker,
    brokerId: input.brokerId,
    commission: 0,
    tax: 0,
    cdcCharges: 0,
    otherFees: 0,
  };
  if (input.kind === 'bonus') {
    const preview = previewBonus(input.sharesHeld, input.totalCost, input.bonusPercent || 0);
    return { ...base, type: 'BONUS', quantity: preview.sharesAdded, price: 0, notes: `Bonus ${input.bonusPercent}%` };
  }
  if (input.kind === 'split') {
    const ratio = input.newSharesForEachOld || 0;
    const preview = previewSplit(input.sharesHeld, input.totalCost, ratio);
    return { ...base, type: 'SPLIT', quantity: preview.sharesAdded, price: ratio, notes: `Split ${ratio}-for-1` };
  }
  const shares = input.rightsShares || 0;
  const price = input.pricePaid || 0;
  previewRights(input.sharesHeld, input.totalCost, shares, price);
  return { ...base, type: 'RIGHTS', quantity: shares, price, notes: 'Rights' };
}

export function parseBonusPercent(text: string): number | null {
  const match = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 ? value : null;
}
