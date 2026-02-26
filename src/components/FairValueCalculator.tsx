import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Calculator, Shield, Activity, BookOpen, RefreshCw, Loader2 } from 'lucide-react';
import { fetchBatchPSXPrices } from '../services/psxData';
import { fetchCompanyFundamentals } from '../services/financials';

export const FairValueCalculator: React.FC = () => {
  const [isFetching, setIsFetching] = useState(false);
  const [inputs, setInputs] = useState({
    ticker: 'FFC',
    price: 81.84,
    eps: 14.66,
    bookValue: 139.56,
    fairPE: 10,
    expectedDiv: 4,
    requiredReturn: 10.51,
    cagr: 10,
    fcf: 95,
    liabilities: 314588131,
    equity: 256014337,
    currentAssets: 1300000, 
    currentLiabilities: 1000000, 
    inventory: 300000,
    method4TargetYield: 12,
    method4Eps: 70
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: name === 'ticker' ? value.toUpperCase() : Number(value)
    }));
  };

  const handleAutoFill = async () => {
      if (!inputs.ticker) return;
      setIsFetching(true);
      
      try {
          // 1. Fetch Current Market Price
          const priceData = await fetchBatchPSXPrices([inputs.ticker]);
          let newPrice = inputs.price;
          if (priceData[inputs.ticker] && priceData[inputs.ticker].price > 0) {
              newPrice = priceData[inputs.ticker].price;
          }

          // 2. Fetch Fundamentals (EPS, Book Value, Liabilities, Equity, etc.)
          const fundamentals = await fetchCompanyFundamentals(inputs.ticker);
          
          if (fundamentals && fundamentals.annual.financials.length > 0) {
              // Helper to parse strings like "1,300,000" or "(500)" to numbers safely
              const parseNum = (val: string | undefined) => {
                  if (!val || val === '-') return null;
                  const isNegative = val.includes('(') && val.includes(')');
                  const num = parseFloat(val.replace(/[(),]/g, ''));
                  return isNaN(num) ? null : (isNegative ? -num : num);
              };

              // Look at the most recent annual filing
              const validData = fundamentals.annual.financials.filter(f => f.year !== '-');
              if (validData.length > 0) {
                  const latest = validData[validData.length - 1];
                  
                  setInputs(prev => ({
                      ...prev,
                      price: newPrice,
                      eps: parseNum(latest.eps) ?? prev.eps,
                      bookValue: parseNum(latest.bookValue) ?? prev.bookValue,
                      liabilities: parseNum(latest.totalLiabilities) ?? prev.liabilities,
                      equity: parseNum(latest.totalEquity) ?? prev.equity,
                      currentAssets: parseNum(latest.currentAssets) ?? prev.currentAssets,
                      currentLiabilities: parseNum(latest.currentLiabilities) ?? prev.currentLiabilities,
                      inventory: parseNum(latest.inventory) ?? prev.inventory,
                      fcf: parseNum(latest.fcf) ?? prev.fcf
                  }));
                  return; // Successfully updated
              }
          }
          
          // If fundamentals failed, at least update the price
          setInputs(prev => ({ ...prev, price: newPrice }));

      } catch (error) {
          console.error("Failed to auto-fill data:", error);
          alert("Failed to fetch some PSX data. The site might be blocking the request.");
      } finally {
          setIsFetching(false);
      }
  };

  const results = useMemo(() => {
    const peRatio = inputs.eps > 0 ? inputs.price / inputs.eps : 0;
    const divYield = inputs.price > 0 ? (inputs.expectedDiv / inputs.price) * 100 : 0;
    const debtToEquity = inputs.equity > 0 ? inputs.liabilities / inputs.equity : 0;
    
    const growthReality = inputs.cagr > 0 ? peRatio / inputs.cagr : 0;
    
    const forwardEPS = inputs.eps * (1 + (inputs.cagr / 100));
    const forwardPE = forwardEPS > 0 ? inputs.price / forwardEPS : 0;

    const currentRatio = inputs.currentLiabilities > 0 ? inputs.currentAssets / inputs.currentLiabilities : 0;
    const quickRatio = inputs.currentLiabilities > 0 ? (inputs.currentAssets - inputs.inventory) / inputs.currentLiabilities : 0;
    const stockStatus = inputs.currentLiabilities > 0 ? inputs.inventory / inputs.currentLiabilities : 0;

    const peFairValue = inputs.eps * inputs.fairPE;
    
    const requiredReturnDecimal = inputs.requiredReturn / 100;
    const ddmValue = requiredReturnDecimal > 0 ? inputs.expectedDiv / requiredReturnDecimal : 0;
    
    const grahamNumber = (inputs.eps > 0 && inputs.bookValue > 0) ? Math.sqrt(22.5 * inputs.eps * inputs.bookValue) : 0;
    
    const method4Value = (inputs.method4TargetYield / 100) > 0 ? inputs.method4Eps / (inputs.method4TargetYield / 100) : 0;

    const getValuationStatus = (fairValue: number, currentPrice: number) => {
        if (fairValue <= 0) return { text: 'N/A', diff: 0, isUnder: false };
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
      peFairValue, ddmValue, grahamNumber, method4Value,
      peStatus: getValuationStatus(peFairValue, inputs.price),
      ddmStatus: getValuationStatus(ddmValue, inputs.price),
      grahamStatus: getValuationStatus(grahamNumber, inputs.price),
      m4Status: getValuationStatus(method4Value, inputs.price)
    };
  }, [inputs]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 animate-in fade-in slide-in-from-bottom-4">
      
      {/* -------------------------------------------------------- */}
      {/* SECTION B: EVALUATIONS METHODS (MOVED TO VERY TOP) */}
      {/* -------------------------------------------------------- */}
      <Card title="B: EVALUATION METHODS" icon={<Activity size={18} className="text-indigo-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            
            {/* Method 1: P/E */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">METHOD 1: P/E FAIR VALUE</h4>
                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 my-3 tracking-tight">Rs. {results.peFairValue.toFixed(1)}</div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-lg w-fit ${results.peStatus.isUnder ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                        {results.peStatus.text}
                    </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 leading-relaxed">
                    <strong>Best For:</strong> Almost every stock, but especially useful for comparing two companies in the same sector (e.g., comparing Lucky Cement vs. DG Khan Cement).
                </p>
            </div>

            {/* Method 2: DDM */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">METHOD 2: DDM VALUE</h4>
                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 my-3 tracking-tight">Rs. {results.ddmValue.toFixed(1)}</div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-lg w-fit ${results.ddmStatus.isUnder ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                        {results.ddmStatus.text}
                    </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 leading-relaxed">
                    <strong>Best For:</strong> Companies that pay regular dividends (Fertilizers, Power, Banks). <em>Dividend Discount Model.</em>
                </p>
            </div>

            {/* Method 3: Graham */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">METHOD 3: GRAHAM NUMBER</h4>
                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 my-3 tracking-tight">Rs. {results.grahamNumber.toFixed(1)}</div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-lg w-fit ${results.grahamStatus.isUnder ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                        {results.grahamStatus.text}
                    </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 leading-relaxed">
                    <strong>Best For:</strong> Finding "Safe" stocks during a market crash (it will almost always tell you "Don't Buy" because it is too strict).
                </p>
            </div>

            {/* Method 4: Custom Yield */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">METHOD 4: FAIR PRICE (RESPECT TO %)</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">DESIRED %</label>
                            <input type="number" name="method4TargetYield" value={inputs.method4TargetYield} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">FUTURE EPS</label>
                            <input type="number" name="method4Eps" value={inputs.method4Eps} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        </div>
                    </div>

                    <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 my-3 tracking-tight">Rs. {results.method4Value.toFixed(2)}</div>
                </div>
            </div>

          </div>
      </Card>


      {/* CONCEPTS BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><BookOpen size={14}/> Face Value</h4>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">The "Legal" price. Used only for calculating dividends and accounting (Usually Rs. 10).</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><BookOpen size={14}/> Book Value</h4>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">The "Asset" price. What you really own in factories, cash, and land.</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><BookOpen size={14}/> Market Value</h4>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">The "Trading" price. What you pay to buy the stock today.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* --- LEFT COLUMN: INPUT DATA --- */}
        <div className="xl:col-span-4 space-y-6">
          <Card title="1. Input Data" icon={<Calculator size={18} className="text-blue-500" />}>
            <div className="space-y-4 mt-4">
                
                {/* Core Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ticker</label>
                    <div className="flex gap-2">
                        <input type="text" name="ticker" value={inputs.ticker} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-sm outline-none focus:border-blue-500 uppercase" />
                        <button 
                            onClick={handleAutoFill}
                            disabled={isFetching}
                            title="Auto-fill Data from PSX"
                            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/50 dark:text-emerald-400 p-2.5 rounded-lg transition-colors flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800"
                        >
                            {isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Current Price</label>
                    <input type="number" step="any" name="price" value={inputs.price} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">EPS (TTM)</label>
                    <input type="number" step="any" name="eps" value={inputs.eps} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Book Value / Share</label>
                    <input type="number" step="any" name="bookValue" value={inputs.bookValue} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800"></div>

                {/* Valuation Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fair P/E Multiple</label>
                    <input type="number" step="any" name="fairPE" value={inputs.fairPE} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">Usually 100/Interest Rate. Sector averages: Banks (2-5), Fertilizer/Power (7-9), Cement (5-7), Tech (18-25).</p>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Expected Div.</label>
                    <input type="number" step="any" name="expectedDiv" value={inputs.expectedDiv} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Req. Return %</label>
                    <input type="number" step="any" name="requiredReturn" value={inputs.requiredReturn} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CAGR (%)</label>
                    <input type="number" step="any" name="cagr" value={inputs.cagr} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Free Cash Flow</label>
                    <input type="number" step="any" name="fcf" value={inputs.fcf} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800"></div>

                {/* Balance Sheet Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 text-xs font-bold text-slate-700 dark:text-slate-300">Balance Sheet (For Ratios)</div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total Liabilities</label>
                    <input type="number" step="any" name="liabilities" value={inputs.liabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total Equity</label>
                    <input type="number" step="any" name="equity" value={inputs.equity} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Current Assets</label>
                    <input type="number" step="any" name="currentAssets" value={inputs.currentAssets} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Current Liab.</label>
                    <input type="number" step="any" name="currentLiabilities" value={inputs.currentLiabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inventory</label>
                    <input type="number" step="any" name="inventory" value={inputs.inventory} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-blue-500" />
                  </div>
                </div>

            </div>
          </Card>
        </div>

        {/* --- RIGHT COLUMN: CHECKS --- */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* SECTION A: IMPORTANT CHECKS */}
          <Card title="A: Important Checks" icon={<Shield size={18} className="text-emerald-500" />}>
             <div className="overflow-x-auto mt-4">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="p-3 font-semibold w-1/3">Metric</th>
                            <th className="p-3 font-semibold text-center w-24">Value</th>
                            <th className="p-3 font-semibold">Status / Applied Rule</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                        
                        {/* P/E Ratio */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Stock's P/E Ratio</td>
                            <td className={`p-3 text-center font-black ${results.peRatio < inputs.fairPE ? 'text-emerald-600' : 'text-rose-600'}`}>{results.peRatio.toFixed(2)}</td>
                            <td className="p-3 text-xs">
                                <span className="font-bold">{results.peRatio < inputs.fairPE ? 'Good Value' : 'Expensive'}</span>
                            </td>
                        </tr>

                        {/* Dividend Yield */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors bg-emerald-50/30 dark:bg-emerald-900/10">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Dividend Yield %</td>
                            <td className="p-3 text-center font-black text-emerald-600">{results.divYield.toFixed(2)}%</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.divYield > 10 ? 'High Yield' : 'Low Yield'}</span>
                                15% is standard here.
                            </td>
                        </tr>

                        {/* Bankruptcy Check */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Bankruptcy Check <br/><span className="text-[10px] font-normal text-slate-400">(Debt-to-Equity Ratio)</span></td>
                            <td className={`p-3 text-center font-black ${results.debtToEquity < 1 ? 'text-emerald-600' : results.debtToEquity > 5 ? 'text-rose-600' : 'text-amber-500'}`}>{results.debtToEquity.toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.debtToEquity < 1 ? 'Safe' : results.debtToEquity > 5 ? 'Dangerous Risk' : 'Moderate Risk'}</span>
                                Verdict Rule: &lt; 1.0 (Safe) | &gt; 2.0 (Risky) | &gt; 5.0 (Dangerous/Avoid)
                            </td>
                        </tr>

                        {/* Growth Reality Check */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors bg-amber-50/30 dark:bg-amber-900/10">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Growth Reality Check <br/><span className="text-[10px] font-normal text-slate-400">(PEG Ratio)</span></td>
                            <td className={`p-3 text-center font-black ${results.growthReality < 1 ? 'text-emerald-600' : results.growthReality > 1.5 ? 'text-rose-600' : 'text-amber-500'}`}>{results.growthReality.toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.growthReality < 1 ? 'Undervalued (Growth is Cheap)' : 'Fair/Expensive'}</span>
                                Verdict Rule: &lt; 1.0 (Undervalued). Around 1.0 (Fair). &gt; 1.5 (Expensive, price running faster than growth).
                            </td>
                        </tr>

                        {/* Forward P/E */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Forward P/E Formula</td>
                            <td className="p-3 text-center font-black text-blue-600">{results.forwardPE.toFixed(2)}</td>
                            <td className="p-3 text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-300">{results.forwardPE < inputs.fairPE ? 'Cheap (Growth makes it attractive)' : 'Normal'}</span>
                            </td>
                        </tr>

                        {/* Survival Ratios */}
                        <tr className="bg-slate-100/50 dark:bg-slate-800">
                            <td colSpan={3} className="p-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Survival Ratios</td>
                        </tr>

                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Current Ratio</td>
                            <td className="p-3 text-center font-black text-emerald-600">{results.currentRatio.toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.currentRatio > 1 ? 'Safe / Good' : 'Poor'}</span>
                                Checks if you can pay bills if business is normal (using Cash + selling Inventory). Formula: Curr Assets / Curr Liabilities
                            </td>
                        </tr>

                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Quick Ratio</td>
                            <td className="p-3 text-center font-black text-emerald-600">{results.quickRatio.toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">{results.quickRatio >= 1 ? 'Excellent Liquidity' : 'Standard'}</span>
                                Checks if you can pay bills in an emergency (using only Cash, without selling a single product). Formula: (Curr Assets - Inventory) / Curr Liab
                            </td>
                        </tr>

                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Stock Status</td>
                            <td className="p-3 text-center font-black text-slate-600 dark:text-slate-300">{results.stockStatus.toFixed(2)}</td>
                            <td className="p-3 text-xs text-slate-600 dark:text-slate-400 font-bold">Efficient Inventory</td>
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
