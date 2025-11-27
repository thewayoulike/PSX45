export interface Transaction {
  id: string;
  portfolioId: string;
  ticker: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'TAX' | 'HISTORY' | 'DEPOSIT' | 'WITHDRAWAL'; 
  quantity: number;
  price: number;
  date: string;
  broker?: string;
  brokerId?: string;
  commission: number;
  tax: number;
  cdcCharges: number;
  otherFees: number;
  notes?: string; 
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
  totalOtherFees: number;
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
  otherFees: number;
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
  otherFees?: number;
}

export interface PortfolioStats {
  totalValue: number;
  totalCost: number; 
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  netRealizedPL: number;
  totalDividends: number;
  dailyPL: number;
  totalCommission: number;
  totalSalesTax: number; 
  totalDividendTax: number; 
  totalCDC: number;
  totalOtherFees: number;
  totalCGT: number;
  
  freeCash: number;       
  cashInvestment: number; // Net Principal (Deposits - Withdrawals)
  totalDeposits: number;  // Gross Deposits (for ROI calc)
  netPrincipal: number;   // Same as cashInvestment, kept for clarity in logic
  reinvestedProfits: number;
  roi: number;
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

// NEW: Exported so App can manage this state
export interface FoundDividend extends DividendAnnouncement {
    eligibleQty: number;
    broker: string;
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
