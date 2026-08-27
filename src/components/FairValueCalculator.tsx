import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Calculator, Shield, Activity, BookOpen, RefreshCw, Loader2, Sparkles, SlidersHorizontal, LineChart } from 'lucide-react';
import { fetchBatchPSXPrices } from '../services/psxData';
import { fetchCompanyFundamentals, syncWithGoogleSheet } from '../services/financials';

interface FairValueCalculatorProps {
  cache: Record<string, any>;
  onSaveCache: (newCache: Record<string, any>) => void;
}

export const FairValueCalculator: React.FC<FairValueCalculatorProps> = ({ cache, onSaveCache }) => {
  const [isFetching, setIsFetching] = useState(false);
  
  // Initialize with completely empty fields (Baseline)
  const [inputs, setInputs] = useState<any>({
    ticker: '',
    price: '',
    eps: '',
    bookValue: '',
    fairPE: '',
    expectedDiv: '',
    requiredReturn: 10.51, // Default fallback
    cagr: 10,              // Default fallback
    fcf: '',
    liabilities: '',
    equity: '',
    currentAssets: '', 
    currentLiabilities: '', 
    inventory: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'ticker') {
        const upperTicker = value.toUpperCase();
        // 3. DRIVE MEMORY: Auto-load data if we've synced this ticker before
        if (cache[upperTicker]) {
            setInputs({ ticker: upperTicker, ...cache[upperTicker] });
        } else {
            // New ticker: Start with empty fields but keep essential default rates
            setInputs({
                ticker: upperTicker,
                price: '', eps: '', bookValue: '', fairPE: '', expectedDiv: '',
                requiredReturn: 10.51, cagr: 10, fcf: '', liabilities: '',
                equity: '', currentAssets: '', currentLiabilities: '', inventory: ''
            });
        }
    } else {
        // Handle empty strings gracefully to avoid NaN math errors
        setInputs((prev: any) => ({ 
            ...prev, 
            [name]: value === '' ? '' : Number(value) 
        }));
    }
  };

  const handleAutoFill = async () => {
      if (!inputs.ticker) return;
      setIsFetching(true);
      const upperTicker = inputs.ticker.toUpperCase();

      try {
          let newPrice = inputs.price;
          let newEps = inputs.eps;
          let baseData: any = {};

          // A. Fetch Live Price from PSX
          const priceData = await fetchBatchPSXPrices([upperTicker]);
          if (priceData[upperTicker] && priceData[upperTicker].price > 0) {
              newPrice = priceData[upperTicker].price;
          }

          // B. 🚀 SYNC WITH GOOGLE SHEET (Bridge to SCS Trade)
          const sheetData = await syncWithGoogleSheet(upperTicker);
          
          if (sheetData) {
              // Extract Fundamentals
              if (sheetData.fundamentals) {
                  if (sheetData.fundamentals.price) newPrice = sheetData.fundamentals.price;
                  if (sheetData.fundamentals.eps) newEps = sheetData.fundamentals.eps;
                  if (sheetData.fundamentals.bookValue) baseData.bookValue = sheetData.fundamentals.bookValue;
                  if (sheetData.fundamentals.dividend) baseData.expectedDiv = sheetData.fundamentals.dividend;
                  if (sheetData.fundamentals.currentPE) baseData.fairPE = sheetData.fundamentals.currentPE;
              }
              
              // Extract Balance Sheet (using the clean object sent by Google Sheets)
              if (sheetData.balanceSheet) {
                  if (sheetData.balanceSheet.liabilities != null) baseData.liabilities = sheetData.balanceSheet.liabilities;
                  if (sheetData.balanceSheet.equity != null) baseData.equity = sheetData.balanceSheet.equity;
                  if (sheetData.balanceSheet.currentAssets != null) baseData.currentAssets = sheetData.balanceSheet.currentAssets;
                  if (sheetData.balanceSheet.currentLiabilities != null) baseData.currentLiabilities = sheetData.balanceSheet.currentLiabilities;
                  if (sheetData.balanceSheet.inventory != null) baseData.inventory = sheetData.balanceSheet.inventory;
              }
          }

          // C. Fallback for FCF from PSX
          const fundamentals = await fetchCompanyFundamentals(upperTicker);
          if (fundamentals && fundamentals.annual.financials.length > 0) {
              const validData = fundamentals.annual.financials.filter(f => f.year !== '-');
              if (validData.length > 0) {
                  const latest = validData[validData.length - 1];
                  const rawFCF = latest.fcf?.replace(/[^0-9.()-]/g, '');
                  if (rawFCF && rawFCF !== '-') {
                      const isNegative = rawFCF.includes('(') && rawFCF.includes(')');
                      const fcfNum = parseFloat(rawFCF.replace(/[(),]/g, '')) * (isNegative ? -1 : 1);
                      if (!isNaN(fcfNum)) baseData.fcf = fcfNum * 1000;
                  }
              }
          }

          // D. Combine all data
          const finalFetchedData = {
              price: newPrice !== '' ? newPrice : inputs.price,
              eps: newEps !== '' ? newEps : inputs.eps,
              bookValue: baseData.bookValue ?? inputs.bookValue,
              fairPE: baseData.fairPE ?? inputs.fairPE,
              expectedDiv: baseData.expectedDiv ?? inputs.expectedDiv,
              requiredReturn: inputs.requiredReturn || 10.51,
              cagr: inputs.cagr || 10,
              fcf: baseData.fcf ?? inputs.fcf,
              liabilities: baseData.liabilities ?? inputs.liabilities,
              equity: baseData.equity ?? inputs.equity,
              currentAssets: baseData.currentAssets ?? inputs.currentAssets,
              currentLiabilities: baseData.currentLiabilities ?? inputs.currentLiabilities,
              inventory: baseData.inventory ?? inputs.inventory,
          };

          // Update Form instantly
          setInputs((prev: any) => ({ ...prev, ...finalFetchedData }));

          // E. 💾 PERMANENT STORAGE: Save research to App state (which saves to Drive)
          const updatedCache = { 
              ...cache, 
              [upperTicker]: finalFetchedData 
          };
          onSaveCache(updatedCache);

      } catch (error) {
          console.error("Auto-fill failed:", error);
          alert("Failed to fetch data from Google Sheet.");
      } finally {
          setIsFetching(false);
      }
  };

  const results = useMemo(() => {
    // Treat blank strings as 0 for calculations
    const price = Number(inputs.price) || 0;
    const eps = Number(inputs.eps) || 0;
    const expectedDiv = Number(inputs.expectedDiv) || 0;
    const equity = Number(inputs.equity) || 0;
    const liabilities = Number(inputs.liabilities) || 0;
    const cagr = Number(inputs.cagr) || 0;
    const currentLiabilities = Number(inputs.currentLiabilities) || 0;
    const currentAssets = Number(inputs.currentAssets) || 0;
    const inventory = Number(inputs.inventory) || 0;
    const fairPE = Number(inputs.fairPE) || 0;
    const requiredReturn = Number(inputs.requiredReturn) || 0;
    const bookValue = Number(inputs.bookValue) || 0;

    const peRatio = eps > 0 ? price / eps : 0;
    const divYield = price > 0 ? (expectedDiv / price) * 100 : 0;
    const debtToEquity = equity > 0 ? liabilities / equity : 0;
    
    const growthReality = cagr > 0 ? peRatio / cagr : 0;
    const forwardEPS = eps * (1 + (cagr / 100));
    const forwardPE = forwardEPS > 0 ? price / forwardEPS : 0;

    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    const stockStatus = currentLiabilities > 0 ? inventory / currentLiabilities : 0;

    const peFairValue = eps * fairPE;
    const ddmValue = (requiredReturn / 100) > 0 ? expectedDiv / (requiredReturn / 100) : 0;
    const grahamNumber = (eps > 0 && bookValue > 0) ? Math.sqrt(22.5 * eps * bookValue) : 0;

    const getValuationStatus = (fairValue: number, currentPrice: number) => {
        if (fairValue <= 0 || currentPrice <= 0) return { text: 'N/A', diff: 0, isUnder: false };
        const diff = ((fairValue - currentPrice) / currentPrice) * 100;
        return { 
            text: diff > 0 ? `Undervalued by ${diff.toFixed(1)}%` : `Overvalued by ${Math.abs(diff).toFixed(1)}%`, 
            diff, 
            isUnder: diff > 0 
        };
    };

    return {
      peRatio, divYield, debtToEquity, growthReality, forwardPE,
      currentRatio, quickRatio, stockStatus,
      peFairValue, ddmValue, grahamNumber,
      peStatus: getValuationStatus(peFairValue, price),
      ddmStatus: getValuationStatus(ddmValue, price),
      grahamStatus: getValuationStatus(grahamNumber, price)
    };
  }, [inputs]);

  return (
    <div className="space-y-6 w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* -------------------------------------------------------- */}
      {/* SECTION B: EVALUATIONS METHODS (COMPACT DESIGN) */}
      {/* -------------------------------------------------------- */}
      <Card title="B: EVALUATION METHODS" icon={<Activity size={18} className="text-indigo-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
            
            {/* Method 1: P/E */}
            <div className="border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/40 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-all duration-300 flex flex-col justify-between group">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <LineChart size={12} className="text-blue-500" /> P/E Fair Value
                        </h4>
                        <div className="text-3xl font-display font-black text-slate-900 dark:text-white my-1.5 tracking-tight tabular-nums group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            Rs. {results.peFairValue.toFixed(1)}
                        </div>
                    </div>
                    {results.peStatus.text !== 'N/A' && (
                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md w-fit shadow-sm border ${results.peStatus.isUnder ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}>
                            {results.peStatus.text}
                        </div>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 leading-relaxed font-medium">
                    <strong className="text-slate-700 dark:text-slate-300 mr-1">Best For:</strong> 
                    Almost every stock, but especially useful for comparing two companies in the same sector.
                </p>
            </div>

            {/* Method 2: DDM */}
            <div className="border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/40 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all duration-300 flex flex-col justify-between group">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <RefreshCw size={12} className="text-emerald-500" /> DDM Value
                        </h4>
                        <div className="text-3xl font-display font-black text-slate-900 dark:text-white my-1.5 tracking-tight tabular-nums group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            Rs. {results.ddmValue.toFixed(1)}
                        </div>
                    </div>
                    {results.ddmStatus.text !== 'N/A' && (
                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md w-fit shadow-sm border ${results.ddmStatus.isUnder ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}>
                            {results.ddmStatus.text}
                        </div>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 leading-relaxed font-medium">
                    <strong className="text-slate-700 dark:text-slate-300 mr-1">Best For:</strong> 
                    Companies that pay regular, sustainable dividends (Fertilizers, Power, Banks).
                </p>
            </div>

            {/* Method 3: Graham */}
            <div className="border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/40 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-800/60 transition-all duration-300 flex flex-col justify-between group">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Shield size={12} className="text-purple-500" /> Graham Number
                        </h4>
                        <div className="text-3xl font-display font-black text-slate-900 dark:text-white my-1.5 tracking-tight tabular-nums group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            Rs. {results.grahamNumber.toFixed(1)}
                        </div>
                    </div>
                    {results.grahamStatus.text !== 'N/A' && (
                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md w-fit shadow-sm border ${results.grahamStatus.isUnder ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20'}`}>
                            {results.grahamStatus.text}
                        </div>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 leading-relaxed font-medium">
                    <strong className="text-slate-700 dark:text-slate-300 mr-1">Best For:</strong> 
                    Finding fundamentally "Safe" value stocks, especially useful during a market crash.
                </p>
            </div>

          </div>
      </Card>

      {/* CONCEPTS BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white/60 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-md">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-slate-400"/> Face Value
              </h4>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">The "Legal" price. Used only for calculating dividends and accounting (Usually Rs. 10).</p>
          </div>
          <div className="bg-white/60 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-md">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-slate-400"/> Book Value
              </h4>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">The "Asset" price. What you really own in factories, cash, and land per share.</p>
          </div>
          <div className="bg-white/60 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-md">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-slate-400"/> Market Value
              </h4>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">The "Trading" price. What you have to pay to buy the stock today in the live market.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* --- LEFT COLUMN: INPUT DATA --- */}
        <div className="xl:col-span-4 space-y-6">
          <Card title="1. Input Data" icon={<Calculator size={18} className="text-blue-500" />}>
            <div className="space-y-6 mt-4">
                
                {/* Core Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Ticker</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            name="ticker" 
                            list="saved-tickers"
                            value={inputs.ticker} 
                            onChange={handleInputChange} 
                            className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-display font-black text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 uppercase transition-all shadow-sm" 
                            placeholder="e.g. ENGRO" 
                        />
                        <datalist id="saved-tickers">
                            {Object.keys(cache).sort().map((savedTicker) => (
                                <option key={savedTicker} value={savedTicker} />
                            ))}
                        </datalist>
                        <button 
                            onClick={handleAutoFill}
                            disabled={isFetching}
                            title="Auto-fill Data from PSX & StockAnalysis"
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 p-3 rounded-xl transition-all flex items-center justify-center shrink-0 border border-indigo-200/60 dark:border-indigo-500/20 shadow-sm"
                        >
                            {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Current Price</label>
                    <input type="number" step="any" name="price" value={inputs.price} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono font-bold text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">EPS (TTM)</label>
                    <input type="number" step="any" name="eps" value={inputs.eps} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Book Value / Share</label>
                    <input type="number" step="any" name="bookValue" value={inputs.bookValue} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                </div>

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800/60"></div>

                {/* Valuation Inputs */}
                <div className="bg-amber-50/30 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <SlidersHorizontal size={14} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest">Subjective / External Inputs</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Fair P/E Multiple</label>
                            <input type="number" step="any" name="fairPE" placeholder="e.g. 10" value={inputs.fairPE} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/60 dark:border-amber-700/50 font-mono text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm tabular-nums" />
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 leading-snug font-medium">Usually 100 / Interest Rate. <br/>Sector averages: Banks (2-5), Fertilizer/Power (7-9), Cement (5-7), Tech (18-25).</p>
                        </div>
                        
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Expected Div.</label>
                            <input type="number" step="any" name="expectedDiv" placeholder="e.g. 4" value={inputs.expectedDiv} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/60 dark:border-amber-700/50 font-mono text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm tabular-nums" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Req. Return %</label>
                            <input type="number" step="any" name="requiredReturn" placeholder="e.g. 10.5" value={inputs.requiredReturn} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/60 dark:border-amber-700/50 font-mono text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm tabular-nums" />
                        </div>
                        
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">CAGR (%)</label>
                            <input type="number" step="any" name="cagr" placeholder="e.g. 10" value={inputs.cagr} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/60 dark:border-amber-700/50 font-mono text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm tabular-nums" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Free Cash Flow</label>
                            <input type="number" step="any" name="fcf" placeholder="e.g. 95" value={inputs.fcf} onChange={handleInputChange} className="w-full bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/60 dark:border-amber-700/50 font-mono text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm tabular-nums" />
                        </div>
                    </div>
                </div>

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800/60"></div>

                {/* Balance Sheet Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Balance Sheet (For Ratios)</div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Total Liabilities</label>
                    <input type="number" step="any" name="liabilities" value={inputs.liabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Total Equity</label>
                    <input type="number" step="any" name="equity" value={inputs.equity} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Current Assets</label>
                    <input type="number" step="any" name="currentAssets" value={inputs.currentAssets} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Current Liab.</label>
                    <input type="number" step="any" name="currentLiabilities" value={inputs.currentLiabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Inventory</label>
                    <input type="number" step="any" name="inventory" value={inputs.inventory} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm tabular-nums" />
                  </div>
                </div>

            </div>
          </Card>
        </div>

        {/* --- RIGHT COLUMN: CHECKS --- */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* SECTION A: IMPORTANT CHECKS */}
          <Card title="A: Important Checks" icon={<Shield size={18} className="text-emerald-500" />}>
             <div className="overflow-x-auto mt-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm custom-scrollbar">
                 <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead className="bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-700/60 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">
                        <tr>
                            <th className="px-5 py-4 w-1/3">Metric</th>
                            <th className="px-5 py-4 text-center w-24">Value</th>
                            <th className="px-5 py-4">Status / Applied Rule</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                        
                        {/* P/E Ratio */}
                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Stock's P/E Ratio</td>
                            <td className={`px-5 py-4 text-center font-mono font-black text-base ${inputs.fairPE && results.peRatio < Number(inputs.fairPE) ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {results.peRatio > 0 ? results.peRatio.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4">
                                <div className={`text-xs font-bold px-2.5 py-1 rounded-md w-fit ${!inputs.fairPE ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : results.peRatio < Number(inputs.fairPE) ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                                    {!inputs.fairPE ? 'Requires Fair P/E input' : results.peRatio < Number(inputs.fairPE) ? 'Good Value' : 'Expensive'}
                                </div>
                            </td>
                        </tr>

                        {/* Dividend Yield */}
                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Dividend Yield %</td>
                            <td className="px-5 py-4 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                                {results.divYield > 0 ? `${results.divYield.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.divYield > 10 ? 'High Yield' : 'Low Yield'}</span>
                                15% is standard here.
                            </td>
                        </tr>

                        {/* Bankruptcy Check */}
                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">
                                Bankruptcy Check <br/><span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1 block">(Debt-to-Equity Ratio)</span>
                            </td>
                            <td className={`px-5 py-4 text-center font-mono font-black text-base ${results.debtToEquity < 1 ? 'text-emerald-600 dark:text-emerald-400' : results.debtToEquity > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-500'}`}>
                                {results.debtToEquity > 0 ? results.debtToEquity.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">{results.debtToEquity === 0 ? '-' : results.debtToEquity < 1 ? 'Safe' : results.debtToEquity > 5 ? 'Dangerous Risk' : 'Moderate Risk'}</span>
                                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{'< 1.0 (Safe)'}</span> | <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{'> 2.0 (Risky)'}</span> | <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{'> 5.0 (Avoid)'}</span>
                            </td>
                        </tr>

                        {/* Growth Reality Check */}
                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">
                                Growth Reality Check <br/><span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1 block">(PEG Ratio)</span>
                            </td>
                            <td className={`px-5 py-4 text-center font-mono font-black text-base ${results.growthReality < 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {results.growthReality > 0 ? results.growthReality.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">{results.growthReality === 0 ? '-' : results.growthReality < 1 ? 'Undervalued (Growth is Cheap)' : 'Fair / Expensive'}</span>
                                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{'< 1.0 (Undervalued)'}</span>. Around 1.0 (Fair). <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{'> 1.5 (Expensive)'}</span>
                            </td>
                        </tr>

                        {/* Forward P/E */}
                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Forward P/E Formula</td>
                            <td className="px-5 py-4 text-center font-mono font-black text-blue-600 dark:text-blue-400 text-base">
                                {results.forwardPE > 0 ? results.forwardPE.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs">
                                <span className={`font-bold px-2.5 py-1 rounded-md w-fit ${results.forwardPE === 0 ? 'text-slate-500' : results.forwardPE < Number(inputs.fairPE) ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    {results.forwardPE === 0 ? '-' : results.forwardPE < Number(inputs.fairPE) ? 'Cheap (Growth makes it attractive)' : 'Normal'}
                                </span>
                            </td>
                        </tr>

                        {/* Survival Ratios Header */}
                        <tr className="bg-slate-100/80 dark:bg-slate-800/80">
                            <td colSpan={3} className="px-5 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center shadow-inner">Survival Ratios</td>
                        </tr>

                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Current Ratio</td>
                            <td className="px-5 py-4 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                                {results.currentRatio > 0 ? results.currentRatio.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.currentRatio === 0 ? '-' : results.currentRatio > 1 ? 'Safe / Good' : 'Poor'}</span>
                                Checks if you can pay bills if business is normal. <br/><span className="text-[10px] uppercase tracking-wider opacity-70">Curr Assets / Curr Liabilities</span>
                            </td>
                        </tr>

                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Quick Ratio</td>
                            <td className="px-5 py-4 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                                {results.quickRatio > 0 ? results.quickRatio.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.quickRatio === 0 ? '-' : results.quickRatio >= 1 ? 'Excellent Liquidity' : 'Standard'}</span>
                                Checks if you can pay bills in an emergency without selling inventory. <br/><span className="text-[10px] uppercase tracking-wider opacity-70">(Curr Assets - Inv) / Curr Liab</span>
                            </td>
                        </tr>

                        <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-200">Stock Status</td>
                            <td className="px-5 py-4 text-center font-mono font-black text-slate-600 dark:text-slate-300 text-base">
                                {results.stockStatus > 0 ? results.stockStatus.toFixed(2) : '-'}
                            </td>
                            <td className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                Efficient Inventory
                            </td>
                        </tr>

                    </tbody>
                 </table>
             </div>
          </Card>

        </div>
      </div>

    </div>
  );
};
