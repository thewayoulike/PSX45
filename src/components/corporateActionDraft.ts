export interface CorporateActionDraft {
  ticker: string;
  shares: number;
  cost: number;
  broker?: string;
  brokerId?: string;
  kind?: 'bonus' | 'split' | 'rights';
  bonusPercent?: number | null;
  /** Prefill from an exchange record: ex-date, split ratio, rights shares and price. */
  date?: string;
  splitRatio?: number;
  rightsShares?: number;
  rightsPrice?: number;
  /** Shown above the form when the action came from the exchange record. */
  source?: string;
}
