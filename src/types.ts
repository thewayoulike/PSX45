export interface Transaction {
  id: string;
  portfolioId: string; // NEW: Associates transaction with a specific portfolio
  ticker: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  quantity: number;
  price: number; // For BUY/SELL: Share Price. For DIVIDEND: Dividend Per Share (DPS)
  date: string;
  broker?: string;
  commission: number; // Brokerage Fee
  tax?: number;       // SST, FED, or WHT (for Dividends)
  cdcCharges?: number; // CDC, CVT, Regulatory
}

export interface Holding {
  ticker: string;
  sector: string; // Industry Sector
  broker?: string; // NEW: distinct broker for this holding
  quantity: number;
  avgPrice: number; // Break-even price (includes all fees)
  currentPrice: number; // Fetched from Gemini
  lastUpdated?: string;
  totalCommission: number;
  totalTax: number;
  totalCDC: number;
}

export interface RealizedTrade {
  id: string;
  ticker: string;
  broker?: string; // NEW: Broker used for the trade
  quantity: number;
  buyAvg: number; // Cost basis per share at time of sale
  sellPrice: number;
  date: string;
  profit: number; // Net P&L after fees
  fees: number; // Total fees paid on sale
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
  unrealizedPL: number; // Paper Profit/Loss
  unrealizedPLPercent: number;
  realizedPL: number; // Booked Profit/Loss
  totalDividends: number; // New: Total Net Dividends Received
  dailyPL: number; 
}

export interface PriceUpdateResult {
  ticker: string;
  price: number;
}

export interface GroundingMetadata {
  groundingChunks: Array<{
    web?: {
      uri: string;
      title: string;
    };
  }>;
}

export interface Portfolio {
  id: string;
  name: string;
}

export interface DividendAnnouncement {
    ticker: string;
    amount: number; // DPS
    exDate: string; // YYYY-MM-DD
    payoutDate?: string;
    type: 'Interim' | 'Final';
    period?: string; // e.g. "Year ended June 30"
}

export interface MarketAnalysisData {
    name: string;
    description: string;
    sector: string;
    currentPrice: string;
    marketCap: string;
    peRatio: string;
    eps: string;
    dividendYield: string;
    yearHigh: string;
    yearLow: string;
    financialPeriod: string;
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    sentimentReason: string;
    supportLevel: string;
    resistanceLevel: string;
    news: Array<{
        title: string;
        source: string;
        date: string;
        url: string;
    }>;
}