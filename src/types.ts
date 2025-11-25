export interface Transaction {
  id: string;
  portfolioId: string;
  ticker: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  quantity: number;
  price: number;
  date: string;
  broker?: string;
  brokerId?: string; // Links to specific broker config
  commission: number;
  tax: number;
  cdcCharges: number;
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

// --- BROKER TYPES ---

export type CommissionType = 'PERCENTAGE' | 'PER_SHARE' | 'HIGHER_OF' | 'FIXED';

export interface Broker {
  id: string;
  name: string;
  commissionType: CommissionType;
  rate1: number; // Primary Rate (e.g., 0.15 for %, 0.05 for Per Share)
  rate2?: number; // Secondary Rate (e.g., for "Higher Of" comparison)
  sstRate: number; // Sales Tax Rate (default 15%)
  isDefault?: boolean;
}
