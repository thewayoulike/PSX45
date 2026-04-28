import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { Calculator, Shield, Activity, BookOpen, RefreshCw, Loader2 } from 'lucide-react';
import { fetchBatchPSXPrices } from '../services/psxData';
import { fetchCompanyFundamentals, syncWithGoogleSheet } from '../services/financials';
import { loadFromDrive, saveToDrive } from '../services/driveStorage';

export const FairValueCalculator: React.FC = () => {
  const [isFetching, setIsFetching] = useState(false);
  const [cache, setCache] = useState<Record<string, any>>({});
  
  // 1. Load your research from Google Drive when you open the page
  useEffect(() => {
      const initCache = async () => {
          const driveData = await loadFromDrive();
          if (driveData && driveData.fairValueCache) {
              setCache(driveData.fairValueCache);
          }
      };
      initCache();
  }, []);

  // 2. Initialize with completely empty fields as requested
  const [inputs, setInputs] = useState<any>({
    ticker: '',
    price: '',
    eps: '',
    bookValue: '',
    fairPE: '',
    expectedDiv: '',
    requiredReturn: 10.51, 
    cagr: 10,              
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
        // 3. AUTO-LOAD: If we have this stock saved in Drive, show it immediately!
        if (cache[upperTicker]) {
            setInputs({ ticker: upperTicker, ...cache[upperTicker] });
        } else {
            // Otherwise, keep the fields empty for the new ticker
            setInputs({
                ticker: upperTicker,
                price: '', eps: '', bookValue: '', fairPE: '', expectedDiv: '',
                requiredReturn: 10.51, cagr: 10, fcf: '', liabilities: '',
                equity: '', currentAssets: '', currentLiabilities: '', inventory: ''
            });
        }
    } else {
        setInputs((prev: any) => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
    }
  };

  const handleAutoFill = async () => {
      if (!inputs.ticker) return;
      setIsFetching(true);

      try {
          let newPrice = inputs.price;
          let newEps = inputs.eps;
          let baseData: any = {};
          let extraData: any = {};

          // 1. Fetch Price
          const priceData = await fetchBatchPSXPrices([inputs.ticker]);
          if (priceData[inputs.ticker] && priceData[inputs.ticker].price > 0) {
              newPrice = priceData[inputs.ticker].price;
          }

          // 2. 🚀 SYNC WITH GOOGLE SHEET
          const sheetData = await syncWithGoogleSheet(inputs.ticker);
          
          if (sheetData) {
              // Fundamentals
              if (sheetData.fundamentals) {
                  if (sheetData.fundamentals.price) newPrice = sheetData.fundamentals.price;
                  if (sheetData.fundamentals.eps) newEps = sheetData.fundamentals.eps;
                  if (sheetData.fundamentals.bookValue) baseData.bookValue = sheetData.fundamentals.bookValue;
                  if (sheetData.fundamentals.dividend) extraData.expectedDiv = sheetData.fundamentals.dividend;
                  if (sheetData.fundamentals.currentPE) extraData.fairPE = sheetData.fundamentals.currentPE;
              }
              
              // 👇 THE CRITICAL FIX: Directly grab the clean 'balanceSheet' object sent by Google
              if (sheetData.balanceSheet) {
                  if (sheetData.balanceSheet.liabilities != null) baseData.liabilities = sheetData.balanceSheet.liabilities;
                  if (sheetData.balanceSheet.equity != null) baseData.equity = sheetData.balanceSheet.equity;
                  if (sheetData.balanceSheet.currentAssets != null) baseData.currentAssets = sheetData.balanceSheet.currentAssets;
                  if (sheetData.balanceSheet.currentLiabilities != null) baseData.currentLiabilities = sheetData.balanceSheet.currentLiabilities;
                  if (sheetData.balanceSheet.inventory != null) baseData.inventory = sheetData.balanceSheet.inventory;
              }
          }

          // 3. Fallback for FCF
          const fundamentals = await fetchCompanyFundamentals(inputs.ticker);
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

          const finalFetchedData = {
              price: newPrice !== '' ? newPrice : inputs.price,
              eps: newEps !== '' ? newEps : inputs.eps,
              bookValue: baseData.bookValue ?? inputs.bookValue,
              fairPE: extraData.fairPE ?? inputs.fairPE,
              expectedDiv: extraData.expectedDiv ?? inputs.expectedDiv,
              requiredReturn: inputs.requiredReturn || 10.51,
              cagr: inputs.cagr || 10,
              fcf: baseData.fcf ?? inputs.fcf,
              liabilities: baseData.liabilities ?? inputs.liabilities,
              equity: baseData.equity ?? inputs.equity,
              currentAssets: baseData.currentAssets ?? inputs.currentAssets,
              currentLiabilities: baseData.currentLiabilities ?? inputs.currentLiabilities,
              inventory: baseData.inventory ?? inputs.inventory,
          };

          // Update the form immediately
          setInputs((prev: any) => ({ ...prev, ...finalFetchedData }));

          // 4. 💾 PERMANENT STORAGE: Save this result to Google Drive automatically
          try {
              let driveData = await loadFromDrive();
              if (!driveData) driveData = {};
              const updatedCache = { ...(driveData.fairValueCache || {}), [inputs.ticker]: finalFetchedData };
              driveData.fairValueCache = updatedCache;
              await saveToDrive(driveData);
              setCache(updatedCache);
          } catch (e) { console.error("Drive save failed", e); }

      } catch (error) {
          console.error("Auto-fill failed:", error);
          alert("Failed to fetch data from Google Sheet.");
      } finally {
          setIsFetching(false);
      }
  };

  const results = useMemo(() => {
    // Treat empty as 0 for math
    const price = Number(inputs.price) || 0;
    const eps = Number(inputs.eps) || 0;
    const expectedDiv = Number(inputs.expectedDiv) || 0;
    const equity = Number(inputs.equity) || 0;
    const liabilities = Number(inputs.liabilities) || 0;
    const cagr = Number(inputs.cagr) || 0;
    const cl = Number(inputs.currentLiabilities) || 0;
    const ca = Number(inputs.currentAssets) || 0;
    const inv = Number(inputs.inventory) || 0;
    const fairPE = Number(inputs.fairPE) || 0;
    const reqReturn = Number(inputs.requiredReturn) || 0;
    const bv = Number(inputs.bookValue) || 0;

    const peRatio = eps > 0 ? price / eps : 0;
    const divYield = price > 0 ? (expectedDiv / price) * 100 : 0;
    const debtToEquity = equity > 0 ? liabilities / equity : 0;
    const forwardEPS = eps * (1 + (cagr / 100));
    const forwardPE = forwardEPS > 0 ? price / forwardEPS : 0;
    const peFairValue = eps * fairPE;
    const ddmValue = (reqReturn / 100) > 0 ? expectedDiv / (reqReturn / 100) : 0;
    const grahamNumber = (eps > 0 && bv > 0) ? Math.sqrt(22.5 * eps * bv) : 0;

    const getValStatus = (fairValue: number, currentPrice: number) => {
        if (fairValue <= 0 || currentPrice <= 0) return { text: 'N/A', diff: 0, isUnder: false };
        const diff = ((fairValue - currentPrice) / currentPrice) * 100;
        return { 
            text: diff > 0 ? `Undervalued by ${diff.toFixed(1)}%` : `Overvalued by ${Math.abs(diff).toFixed(1)}%`, 
            diff, isUnder: diff > 0 
        };
    };

    return {
      peRatio, divYield, debtToEquity, forwardPE, peFairValue, ddmValue, grahamNumber,
      peStatus: getValStatus(peFairValue, price),
      ddmStatus: getValStatus(ddmValue, price),
      grahamStatus: getValStatus(grahamNumber, price),
      currentRatio: cl > 0 ? ca / cl : 0,
      quickRatio: cl > 0 ? (ca - inv) / cl : 0
    };
  }, [inputs]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 animate-in fade-in slide-in-from-bottom-4">
      <Card title="EVALUATION METHODS" icon={<Activity size={18} className="text-indigo-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            {/* Method 1: P/E */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">METHOD 1: P/E FAIR VALUE</h4>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100 my-1">Rs. {results.peFairValue.toFixed(1)}</div>
                {results.peStatus.text !== 'N/A' && (
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-md w-fit ${results.peStatus.isUnder ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {results.peStatus.text}
                    </div>
                )}
            </div>

            {/* Method 2: DDM */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">METHOD 2: DDM VALUE</h4>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100 my-1">Rs. {results.ddmValue.toFixed(1)}</div>
                {results.ddmStatus.text !== 'N/A' && (
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-md w-fit ${results.ddmStatus.isUnder ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {results.ddmStatus.text}
                    </div>
                )}
            </div>

            {/* Method 3: Graham */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm flex flex-col justify-between">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">METHOD 3: GRAHAM NUMBER</h4>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100 my-1">Rs. {results.grahamNumber.toFixed(1)}</div>
                {results.grahamStatus.text !== 'N/A' && (
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-md w-fit ${results.grahamStatus.isUnder ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {results.grahamStatus.text}
                    </div>
                )}
            </div>
          </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <Card title="1. Input Data" icon={<Calculator size={18} className="text-blue-500" />}>
            <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Ticker</label>
                    <div className="flex gap-2">
                        <input type="text" name="ticker" value={inputs.ticker} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold outline-none focus:border-blue-500 uppercase" placeholder="e.g. ENGRO" />
                        <button onClick={handleAutoFill} disabled={isFetching} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 shrink-0">
                            {isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Price</label>
                    <input type="number" name="price" value={inputs.price} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">EPS</label>
                    <input type="number" name="eps" value={inputs.eps} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="h-px w-full bg-slate-100 dark:bg-slate-800"></div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 text-xs font-bold text-slate-700 dark:text-slate-300">Balance Sheet</div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Liabilities</label>
                    <input type="number" name="liabilities" value={inputs.liabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equity</label>
                    <input type="number" name="equity" value={inputs.equity} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Current Assets</label>
                    <input type="number" name="currentAssets" value={inputs.currentAssets} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Current Liab.</label>
                    <input type="number" name="currentLiabilities" value={inputs.currentLiabilities} onChange={handleInputChange} className="w-full bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 text-xs" />
                  </div>
                </div>
            </div>
          </Card>
        </div>

        <div className="xl:col-span-8 space-y-6">
          <Card title="Analysis & Checks" icon={<Shield size={18} className="text-emerald-500" />}>
             <div className="overflow-x-auto mt-4">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase text-slate-500">
                        <tr>
                            <th className="p-3">Metric</th>
                            <th className="p-3 text-center">Value</th>
                            <th className="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                        <tr>
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">P/E Ratio</td>
                            <td className="p-3 text-center font-black">{results.peRatio.toFixed(2)}</td>
                            <td className="p-3 text-xs font-bold">{results.peRatio < Number(inputs.fairPE) ? 'Good Value' : 'Expensive'}</td>
                        </tr>
                        <tr>
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">D/E Ratio</td>
                            <td className="p-3 text-center font-black">{results.debtToEquity.toFixed(2)}</td>
                            <td className="p-3 text-xs font-bold">{results.debtToEquity < 1 ? 'Safe' : 'Risky'}</td>
                        </tr>
                        <tr>
                            <td className="p-3 font-bold text-slate-700 dark:text-slate-300">Current Ratio</td>
                            <td className="p-3 text-center font-black">{results.currentRatio.toFixed(2)}</td>
                            <td className="p-3 text-xs font-bold">{results.currentRatio > 1 ? 'Safe' : 'Poor'}</td>
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
