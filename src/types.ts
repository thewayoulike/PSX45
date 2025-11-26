export interface Transaction {
  id: string;
  portfolioId: string;
  ticker: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  quantity: number;
  price: number;
  date: string;
  broker?: string;
  brokerId?: string;
  commission: number;
  tax: number;
  cdcCharges: number;
  otherFees: number; // NEW
}

export interface Holding {
  ticker: string;
  sector: string;
  broker?: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  lastUpdated?: string;
  totalCommission: number;
  totalTax: number;
  totalCDC: number;
  totalOtherFees: number; // NEW
}

export interface RealizedTrade {
  id: string;
  ticker: string;
  broker?: string;
  quantity: number;
  buyAvg: number;
  sellPrice: number;
  date: string;
  profit: number;
  fees: number;
  commission: number;
  tax: number;
  cdcCharges: number;
  otherFees: number; // NEW
}

export interface ParsedTrade {
  ticker: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date?: string;
  broker?: string;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number; // NEW
}

export interface PortfolioStats {
  totalValue: number;
  totalCost: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  totalDividends: number;
  dailyPL: number; 
}

export interface Portfolio {
  id: string;
  name: string;
}

export interface DividendAnnouncement {
    ticker: string;
    amount: number;
    exDate: string;
    payoutDate?: string;
    type: 'Interim' | 'Final';
    period?: string;
}

export type CommissionType = 'PERCENTAGE' | 'PER_SHARE' | 'HIGHER_OF' | 'FIXED';

export interface Broker {
  id: string;
  name: string;
  commissionType: CommissionType;
  rate1: number; 
  rate2?: number; 
  sstRate: number; 
  isDefault?: boolean;
}
