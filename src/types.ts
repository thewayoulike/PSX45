export interface Transaction {
  id: string;
  portfolioId: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'TAX' | 'HISTORY' | 'DEPOSIT' | 'WITHDRAWAL' | 'ANNUAL_FEE'; 
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

export interface EditableTrade extends ParsedTrade {
    brokerId?: string;
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
  dailyPLPercent: number;
  totalCommission: number;
  totalSalesTax: number; 
  totalDividendTax: number; 
  totalCDC: number;
  totalOtherFees: number;
  totalCGT: number;
  
  freeCash: number;       
  cashInvestment: number; 
  totalDeposits: number;  
  netPrincipal: number;
  peakNetPrincipal: number;
  reinvestedProfits: number;
  roi: number;
  
  mwrr: number;
}

export interface Portfolio {
  id: string;
  name: string;
  defaultBrokerId: string;
}

export interface DividendAnnouncement {
    ticker: string;
    amount: number;
    exDate: string;
    payoutDate?: string;
    type: 'Interim' | 'Final';
    period?: string;
}

export interface FoundDividend extends DividendAnnouncement {
    eligibleQty: number;
    broker: string;
}

// UPDATE: Added 'SLAB' type
export type CommissionType = 'PERCENTAGE' | 'PER_SHARE' | 'HIGHER_OF' | 'FIXED' | 'SLAB';
export type CDCType = 'PER_SHARE' | 'FIXED' | 'HIGHER_OF';

// NEW: Slab Interface
export interface CommissionSlab {
    min: number;
    max: number;
    rate: number;
    type: 'FIXED' | 'PERCENTAGE'; // Fixed Rs or % of value
}

export interface Broker {
  id: string;
  name: string;
  commissionType: CommissionType;
  rate1: number; 
  rate2?: number; 
  sstRate: number;
  cdcType?: CDCType;
  cdcRate?: number; 
  cdcMin?: number;
  annualFee?: number;
  feeStartDate?: string; 
  isDefault?: boolean;
  // NEW: Slabs Array
  slabs?: CommissionSlab[];
}
