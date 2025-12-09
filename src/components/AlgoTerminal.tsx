import React, { useState, useEffect } from 'react';
import { OHLCData, fetchStockOHLC } from '../services/psxData';
import { fetchCompanyFundamentals, FundamentalsData } from '../services/financials';
import { calculateRSI, calculatePivots, calculateVolatility, calculateChange, calculateSMA, generateSignal } from '../utils/technicalAnalysis';
import { X, Search, Terminal, Target, Zap, BarChart3, Loader2, AlertCircle, Layers, Activity } from 'lucide-react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';

interface AlgoTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTicker?: string | null;
}

export const AlgoTerminal: React.FC<AlgoTerminalProps> = ({ isOpen, onClose, defaultTicker }) => {
  const [ticker, setTicker] = useState(defaultTicker || '');
  const [data, setData] = useState<OHLCData[]>([]);
  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzedTicker, setAnalyzedTicker] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
      if (isOpen && defaultTicker) {
          setTicker(defaultTicker);
          handleAnalyze(defaultTicker);
      }
  }, [isOpen, defaultTicker]);

  const handleAnalyze = async (symbol: string) => {
      if (!symbol) return;
      setLoading(true);
      setErrorMsg(null);
      setAnalyzedTicker(null);
      
      try {
          const ohlc = await fetchStockOHLC(symbol);
          
          if (!ohlc || ohlc.length === 0) {
              setErrorMsg(`No data found for ${symbol}.`);
              setLoading(false);
              return;
          }

          setData(ohlc);
          setAnalyzedTicker(symbol.toUpperCase());
          fetchCompanyFundamentals(symbol).then(f => setFundamentals(f)).catch(() => {});

      } catch (e) {
          setErrorMsg("Connection failed.");
      } finally {
          setLoading(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); handleAnalyze(ticker); };

  if (!isOpen) return null;

  const latest = data.length > 0 ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const rsi = calculateRSI(data);
  const sma50 = calculateSMA(data, 50);
  const pivots = prev ? calculatePivots(prev.high, prev.low, prev.close) : null;
  const { trend, signal } = latest ? generateSignal(latest.close, rsi, sma50) : { trend: '-', signal: '-' };
  
  // Safe math for targets
  const range = latest ? (latest.high - latest.low) : 0;
  const tpShort = latest ? latest.close + (range || latest.close * 0.02) : 0;
  const slShort = latest ? latest.close - (range || latest.close * 0.01) : 0;

  // Safe formatting
  const fmt = (n: number | undefined) => (n && !isNaN(n)) ? n.toFixed(2) : '-';
  const isGreen = latest && prev ? latest.close >= prev.close : true;
  const color = isGreen ? '#22c55e' : '#f43f5e';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#202225] w-full max-w-2xl rounded-xl shadow-2xl border border-[#2f3136] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#2f3136] p-4 flex items-center justify-between border-b border-[#202225]">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white"><Terminal size={20} /></div>
                <div><h2 className="text-white font-bold text-sm">PSX Algo Bot</h2><p className="text-[10px] text-[#b9bbbe]">AI Market Analysis</p></div>
            </div>
            <button onClick={onClose} className="text-[#b9bbbe] hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 bg-[#36393f]">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="ENTER TICKER..." className="flex-1 bg-[#40444b] text-white px-4 py-2 rounded outline-none focus:border-[#5865F2]" autoFocus />
                <button disabled={loading} className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-6 py-2 rounded font-bold">{loading ? <Loader2 className="animate-spin" /> : 'SCAN'}</button>
            </form>
        </div>
        <div className="flex-1 bg-[#36393f] p-6 overflow-y-auto">
            {errorMsg && <div className="text-rose-400 text-center font-bold">{errorMsg}</div>}
            {!analyzedTicker && !loading && !errorMsg && <div className="text-[#72767d] text-center"><Zap size={40} className="mx-auto mb-2"/>Enter a symbol</div>}
            
            {analyzedTicker && latest && (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-black text-white">{analyzedTicker}</h1>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-2xl font-mono text-white">Rs. {fmt(latest.close)}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${isGreen ? 'bg-green-500/20 text-green-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                    {prev ? ((latest.close - prev.close) / prev.close * 100).toFixed(2) : 0}%
                                </span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-[#b9bbbe] uppercase font-bold">Signal</div>
                            <div className={`text-xl font-black ${signal.includes('BUY') ? 'text-[#22c55e]' : signal.includes('SELL') ? 'text-[#f43f5e]' : 'text-yellow-400'}`}>{signal}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-[#2f3136] p-4 rounded border-l-4 border-[#5865F2]">
                            <h3 className="text-[#b9bbbe] text-xs font-bold uppercase mb-2">Trend Analysis</h3>
                            <div className="flex justify-between text-sm text-white mb-1"><span>RSI (14)</span> <span className="font-mono">{rsi > 0 ? fmt(rsi) : 'N/A'}</span></div>
                            <div className="flex justify-between text-sm text-white"><span>Market Trend</span> <span className={`font-bold ${trend==='BULLISH'?'text-green-400':'text-rose-400'}`}>{trend}</span></div>
                        </div>
                        <div className="bg-[#2f3136] p-4 rounded border-l-4 border-[#facc15]">
                            <h3 className="text-[#b9bbbe] text-xs font-bold uppercase mb-2">Targets</h3>
                            <div className="flex justify-between text-sm text-green-400 mb-1"><span>TP (Short)</span> <span className="font-mono">{fmt(tpShort)}</span></div>
                            <div className="flex justify-between text-sm text-rose-400"><span>SL (Stop)</span> <span className="font-mono">{fmt(slShort)}</span></div>
                        </div>
                    </div>

                    {data.length > 2 && (
                        <div className="h-32 bg-[#202225] rounded border border-[#2f3136] p-2 relative overflow-hidden mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.3}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
                                    <YAxis domain={['auto', 'auto']} hide />
                                    <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#grad)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    
                    {pivots && (
                        <div className="grid grid-cols-3 text-center text-xs font-mono bg-[#202225] p-2 rounded">
                            <div className="text-rose-400">R1: {fmt(pivots.r1)}</div>
                            <div className="text-[#5865F2] font-bold">PV: {fmt(pivots.p)}</div>
                            <div className="text-green-400">S1: {fmt(pivots.s1)}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
