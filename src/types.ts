export interface Transaction {
  id: string;
  portfolioId: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'DIVIDEND_REINVEST' | 'TAX' | 'HISTORY' | 'DEPOSIT' | 'WITHDRAWAL' | 'ANNUAL_FEE' | 'OTHER' | 'TRANSFER_IN' | 'TRANSFER_OUT';
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
  category?: 'ADJUSTMENT' | 'OTHER_TAX' | 'CDC_CHARGE'; 
  createdAt?: string; // ISO time the row was added; used to order same-day trades deterministically
}

export interface Holding {
  ticker: string;
  sector: string;
  broker?: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  lastUpdated?: string;
  listedIn?: string; // <--- ADDED THIS FOR DYNAMIC INDEX TAGS
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
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'HISTORY' | 'WITHDRAWAL' | 'DIVIDEND' | 'DIVIDEND_REINVEST' | 'TAX' | 'OTHER';
  quantity: number;
  price: number;
  date?: string;
  broker?: string;
  commission?: number;
  tax?: number;
  cdcCharges?: number;
  otherFees?: number;
  notes?: string;
  category?: 'ADJUSTMENT' | 'OTHER_TAX' | 'CDC_CHARGE';
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
  totalDividendTax: number;
  dailyPL: number;
  dailyPLPercent: number;
  totalCommission: number;
  totalSalesTax: number; 
  totalCDC: number;
  totalOtherFees: number;
  totalCGT: number;
  
  freeCash: number;        
  cashInvestment: number; 
  totalDeposits: number;  
  netPrincipal: number;
  peakNetPrincipal: number;
  reinvestedProfits: number;
  dividendReinvested?: number;
  roi: number;
  
  mwrr: number;
}

export type PortfolioType = 'PSX' | 'MUTUAL_FUND';

export interface Portfolio {
  id: string;
  name: string;
  defaultBrokerId: string;
  /** PSX stocks (default) or Pakistani mutual funds */
  type?: PortfolioType;
}

export type AppView = 'DASHBOARD' | 'REALIZED' | 'HISTORY' | 'STOCKS' | 'SIMULATOR' | 'CALCULATOR' | 'ALERTS' | 'SIGNALS' | 'AI_AGENT' | 'WATCHLIST' | 'SECTOR' | 'BROKERS' | 'API_KEYS' | 'DASH_CUSTOMIZE' | 'ADMIN_USERS';

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

export type CommissionType = 'PERCENTAGE' | 'PER_SHARE' | 'HIGHER_OF' | 'FIXED' | 'SLAB';
export type CDCType = 'PER_SHARE' | 'FIXED' | 'HIGHER_OF';

export interface CommissionSlab {
    min: number;
    max: number;
    rate: number;
    type: 'FIXED' | 'PERCENTAGE'; 
}

export interface Broker {
  id: string;
  name: string;
  email?: string; 
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
  slabs?: CommissionSlab[];
}

export interface CompanyPayout {
    ticker: string;
    announceDate: string;
    financialResult: string;
    details: string; 
    bookClosure: string; 
    isUpcoming: boolean;
}