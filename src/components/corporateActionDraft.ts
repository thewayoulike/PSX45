export interface CorporateActionDraft {
  ticker: string;
  shares: number;
  cost: number;
  broker?: string;
  brokerId?: string;
  kind?: 'bonus' | 'split' | 'rights';
  bonusPercent?: number | null;
}
