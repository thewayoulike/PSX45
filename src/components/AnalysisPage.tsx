import React, { useState, useEffect } from 'react';
import { Search, Sparkles, TrendingUp, DollarSign, Activity, AlertCircle, Loader2 } from 'lucide-react';
import PSXChart from './PSXChart';
import { fetchCompanyFundamentals } from '../services/financials';
import { getFinancialAnalysis } from '../services/gemini';
import { FundamentalsData } from '../types';

export const AnalysisPage: React.FC = () => {
  const [ticker, setTicker] = useState<string>(() => localStorage.getItem('psx_analysis_ticker') || 'OGDC');
  const [searchInput, setSearchInput] = useState('');
  const [financials, setFinancials] = useState<FundamentalsData | null>(null);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Load data when ticker changes
  useEffect(() => {
    if (!ticker) return;
    const load = async () => {
      setLoading(true);
      setAiInsight(''); // Clear previous insight
      try {
        const data = await fetchCompanyFundamentals(ticker);
        setFinancials(data);
        
        if (data) {
          setAiLoading(true);
          // Fetch AI Analysis in background
          getFinancialAnalysis(ticker, data)
            .then(text => setAiInsight(text))
            .finally(() => setAiLoading(false));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
    localStorage.setItem('psx_analysis_ticker', ticker);
  }, [ticker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setTicker(searchInput.toUpperCase().trim());
      setSearchInput('');
    }
  };

  // Helper to get latest year data safely
  const latest = financials?.annual?.financials?.[0] || {};
  const previous = financials?.annual?.financials?.[1] || {};

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. TOP BAR: Search & Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            {ticker} <span className="text-sm bg-slate-100 text-slate-500 px-2 py-1 rounded-lg border border-slate-200">PSX</span>
          </h2>
          <p className="text-slate-500 text-sm font-medium">AI-Powered Market Terminal</p>
        </div>

        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Enter Symbol (e.g. TRG, LUCK)..." 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 2. LEFT COLUMN: Chart & AI (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Chart Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-1 overflow-hidden h-[450px]">
             <PSXChart symbol={ticker} height={440} />
          </div>

          {/* AI Analyst Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="relative z-10">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
                <Sparkles className="text-yellow-300" size={20} /> 
                AI Market Analyst
              </h3>
              
              {aiLoading ? (
                <div className="flex items-center gap-2 text-indigo-100 py-4">
                  <Loader2 className="animate-spin" size={18} />
                  <span className="text-sm">Analyzing financials and generating insights...</span>
                </div>
              ) : aiInsight ? (
                <p className="text-indigo-50 text-sm leading-relaxed font-medium">
                  {aiInsight}
                </p>
              ) : (
                <p className="text-indigo-200 text-sm italic">
                  Data unavailable for analysis.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 3. RIGHT COLUMN: Fundamental Stats (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 h-full">
            <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
              <Activity size={18} className="text-emerald-500" />
              Latest Financials ({latest.year || 'N/A'})
            </h3>

            {loading ? (
               <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" /></div>
            ) : financials ? (
              <div className="space-y-6">
                
                {/* Stat Row 1 */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm"><DollarSign size={18} /></div>
                    <span className="text-xs font-bold text-slate-500 uppercase">EPS</span>
                  </div>
                  <span className="text-lg font-black text-slate-800">{latest.eps}</span>
                </div>

                {/* Stat Row 2 */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm"><TrendingUp size={18} /></div>
                    <span className="text-xs font-bold text-slate-500 uppercase">Sales</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{latest.sales}</span>
                </div>

                {/* Stat Row 3 */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg text-violet-600 shadow-sm"><DollarSign size={18} /></div>
                    <span className="text-xs font-bold text-slate-500 uppercase">Net Profit</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{latest.profitAfterTax}</span>
                </div>

                {/* Comparison Badge */}
                {previous.eps && latest.eps !== '-' && (
                   <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <div className="text-xs font-bold text-emerald-800 uppercase mb-1">Growth (YoY)</div>
                      <div className="text-sm text-emerald-700">
                        EPS moved from <span className="font-bold">{previous.eps}</span> to <span className="font-bold">{latest.eps}</span>
                      </div>
                   </div>
                )}

              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <AlertCircle className="mx-auto mb-2 opacity-50" />
                <p className="text-xs">No Data Found</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
