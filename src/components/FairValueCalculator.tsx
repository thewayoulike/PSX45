import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import { Calculator, AlertTriangle, CheckCircle2, TrendingUp, Shield, Zap, Info } from 'lucide-react';

export const FairValueCalculator: React.FC = () => {
  const [inputs, setInputs] = useState({
    ticker: 'FFC',
    price: 81.84,
    eps: 14.66,
    bookValue: 139.56,
    fairPE: 10,
    expectedDiv: 4,
    requiredReturn: 10.51,
    cagr: 10,
    liabilities: 314588131,
    equity: 256014337
  });

  const results = useMemo(() => {
    const peRatio = inputs.price / inputs.eps;
    const divYield = (inputs.expectedDiv / inputs.price) * 100;
    const debtToEquity = inputs.liabilities / inputs.equity;
    
    // Evaluation Methods
    const peFairValue = inputs.eps * inputs.fairPE;
    const ddmValue = inputs.expectedDiv / (inputs.requiredReturn / 100);
    const grahamNumber = Math.sqrt(22.5 * inputs.eps * inputs.bookValue);

    return {
      peRatio,
      divYield,
      debtToEquity,
      peFairValue,
      ddmValue,
      grahamNumber,
      peStatus: inputs.price < peFairValue ? 'Undervalued' : 'Overvalued',
      peDiff: ((peFairValue - inputs.price) / inputs.price) * 100
    };
  }, [inputs]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card title="Input Data" icon={<Calculator size={18} />}>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">Ticker</label>
              <input type="text" value={inputs.ticker} onChange={e => setInputs({...inputs, ticker: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">Share Price</label>
              <input type="number" value={inputs.price} onChange={e => setInputs({...inputs, price: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">EPS (TTM)</label>
              <input type="number" value={inputs.eps} onChange={e => setInputs({...inputs, eps: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase">Book Value</label>
              <input type="number" value={inputs.bookValue} onChange={e => setInputs({...inputs, bookValue: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700" />
            </div>
          </div>
        </Card>

        {/* Results Summary */}
        <Card title="Safety Checks" icon={<Shield size={18} className="text-emerald-500" />}>
           <div className="space-y-4 mt-4">
              <div className="flex justify-between items-center">
                 <span className="text-sm text-slate-500">P/E Ratio</span>
                 <span className={`font-bold ${results.peRatio < inputs.fairPE ? 'text-emerald-500' : 'text-rose-500'}`}>{results.peRatio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                 <span className="text-sm text-slate-500">Debt to Equity</span>
                 <span className={`font-bold ${results.debtToEquity < 1 ? 'text-emerald-500' : 'text-amber-500'}`}>{results.debtToEquity.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                 <span className="text-sm text-slate-500">Div. Yield</span>
                 <span className="font-bold text-slate-700 dark:text-slate-300">{results.divYield.toFixed(2)}%</span>
              </div>
           </div>
        </Card>
      </div>

      {/* Valuation Methods */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ValuationCard title="P/E Fair Value" value={results.peFairValue} currentPrice={inputs.price} />
        <ValuationCard title="DDM Value" value={results.ddmValue} currentPrice={inputs.price} />
        <ValuationCard title="Graham Number" value={results.grahamNumber} currentPrice={inputs.price} />
      </div>
    </div>
  );
};

const ValuationCard = ({ title, value, currentPrice }: { title: string, value: number, currentPrice: number }) => {
  const isUnder = currentPrice < value;
  const diff = Math.abs(((value - currentPrice) / currentPrice) * 100);
  return (
    <Card className="text-center">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
      <div className="text-2xl font-black text-slate-800 dark:text-slate-100 my-2">Rs. {value.toFixed(2)}</div>
      <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${isUnder ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {isUnder ? `Undervalued by ${diff.toFixed(1)}%` : `Overvalued by ${diff.toFixed(1)}%`}
      </div>
    </Card>
  );
};
