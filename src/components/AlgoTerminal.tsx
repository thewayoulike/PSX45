import React, { useState, useEffect } from 'react';
import { OHLCData, fetchStockOHLC } from '../services/psxData';
import { fetchCompanyFundamentals, FundamentalsData } from '../services/financials';
import { calculateRSI, calculatePivots, calculateVolatility, calculateChange, calculateSMA, generateSignal } from '../utils/technicalAnalysis';
import { X, Search, Terminal, TrendingUp, AlertTriangle, Target, Activity, Zap, BarChart3, Loader2 } from 'lucide-react';
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

  useEffect(() => {
      if (isOpen && defaultTicker) {
          setTicker(defaultTicker);
          handleAnalyze(defaultTicker);
      }
  }, [isOpen, defaultTicker]);

  const handleAnalyze = async (symbol: string) => {
      if (!symbol) return;
      setLoading(true);
      setAnalyzedTicker(null);
      try {
          const [ohlc, fund] = await Promise.all([
              fetchStockOHLC(symbol),
              fetchCompanyFundamentals(symbol)
          ]);
          setData(ohlc);
          setFundamentals(fund);
          setAnalyzedTicker(symbol.toUpperCase());
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      handleAnalyze(ticker);
  };

  if (!isOpen) return null;

  // --- ANALYSIS LOGIC ---
  const latest = data.length > 0 ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  
  // Calculate Indicators
  const rsi = calculateRSI(data);
  const volatility = calculateVolatility(data);
  const pivots = prev ? calculatePivots(prev.high, prev.low, prev.close) : null;
  const sma50 = calculateSMA(data, 50);
  
  // Changes
  const chg1W = calculateChange(data, 5);
  const chg1M = calculateChange(data, 20);
  const chg3M = calculateChange(data, 60);

  // Volumes
  const vol = latest?.volume || 0;
  const avgVol10 = calculateSMA(data.map(d => ({...d, close: d.volume})), 10); // Hack to use SMA for volume

  // Signal
  const { trend, signal, sentiment } = latest ? generateSignal(latest.close, rsi, sma50) : { trend: '-', signal: '-', sentiment: '-' };

  // Targets (Simple ATR-like logic)
  const atr = latest && prev ? (prev.high - prev.low) : 0;
  const tpShort = latest ? latest.close + (atr * 1.5) : 0;
  const slShort = latest ? latest.close - (atr * 1.0) : 0;
  const tpLong = latest ? latest.close + (atr * 4.0) : 0;

  // Fundamentals
  const eps = fundamentals?.annual?.financials?.[0]?.eps || '-';
  const pe = (eps !== '-' && parseFloat(eps) > 0 && latest) ? (latest.close / parseFloat(eps)).toFixed(2) : 'N/A';

  // Discord Color Theme
  const isGreen = (latest?.close || 0) > (prev?.close || 0);
  const accentColor = isGreen ? '#22c55e' : '#f43f5e'; // Green vs Red

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#202225] w-full max-w-2xl rounded-xl shadow-2xl border border-[#2f3136] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="bg-[#2f3136] p-4 flex items-center justify-between border-b border-[#202225]">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white">
                    <Terminal size={20} />
                </div>
                <div>
                    <h2 className="text-white font-bold text-sm">PSX Algo Bot</h2>
                    <p className="text-[10px] text-[#b9bbbe]">AI Market Analysis & Signals</p>
                </div>
            </div>
            <button onClick={onClose} className="text-[#b9bbbe] hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* SEARCH */}
        <div className="p-4 bg-[#36393f]">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-2.5 text-[#72767d]"><Search size={16} /></div>
                    <input 
                        value={ticker} 
                        onChange={e => setTicker(e.target.value.toUpperCase())}
                        placeholder="ENTER TICKER (e.g. TRG)..." 
                        className="w-full bg-[#40444b] text-white text-sm py-2 pl-9 pr-4 rounded outline-none border border-transparent focus:border-[#5865F2] transition-colors font-mono"
                        autoFocus
                    />
                </div>
                <button type="submit" disabled={loading} className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-5 py-2 rounded text-sm font-bold transition-colors flex items-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'ANALYZE'}
                </button>
            </form>
        </div>

        {/* RESULTS SCROLL AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#36393f] p-4">
            
            {!analyzedTicker && !loading && (
                <div className="flex flex-col items-center justify-center h-40 text-[#72767d] gap-2">
                    <Zap size={32} />
                    <p className="text-sm font-bold">Waiting for command...</p>
                </div>
            )}

            {analyzedTicker && latest && (
                <div className="flex gap-4">
                    {/* Left Border Line */}
                    <div className="w-1.5 rounded-full" style={{ backgroundColor: accentColor }}></div>
                    
                    <div className="flex-1 space-y-5">
                        
                        {/* TITLE & PRICE */}
                        <div>
                            <div className="flex items-center justify-between">
                                <h1 className="text-white font-black text-xl tracking-wide">{analyzedTicker}</h1>
                                <span className="text-xs font-mono bg-[#202225] px-2 py-1 rounded text-[#b9bbbe]">
                                    {new Date(latest.time).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-white">Rs. {latest.close.toFixed(2)}</span>
                                <span className={`text-sm font-bold ${isGreen ? 'text-[#22c55e]' : 'text-[#f43f5e]'}`}>
                                    {isGreen ? '▲' : '▼'} {Math.abs(latest.close - (prev?.close || 0)).toFixed(2)} 
                                    ({((latest.close - (prev?.close || 1)) / (prev?.close || 1) * 100).toFixed(2)}%)
                                </span>
                            </div>
                        </div>

                        {/* SIGNAL BOX */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#2f3136] p-3 rounded border border-[#202225]">
                                <div className="text-[10px] text-[#b9bbbe] uppercase font-bold mb-1">Market Trend</div>
                                <div className={`text-sm font-black ${trend === 'BULLISH' ? 'text-[#22c55e]' : 'text-[#f43f5e]'}`}>
                                    {trend}
                                </div>
                            </div>
                            <div className="bg-[#2f3136] p-3 rounded border border-[#202225]">
                                <div className="text-[10px] text-[#b9bbbe] uppercase font-bold mb-1">Recommendation</div>
                                <div className={`text-sm font-black ${signal.includes('BUY') ? 'text-[#22c55e]' : signal.includes('SELL') ? 'text-[#f43f5e]' : 'text-[#facc15]'}`}>
                                    {signal}
                                </div>
                            </div>
                        </div>

                        {/* TARGETS */}
                        <div>
                            <h3 className="text-white text-xs font-bold uppercase mb-2 flex items-center gap-1"><Target size={12} className="text-[#5865F2]"/> Targets</h3>
                            <div className="text-xs space-y-1 font-mono text-[#dcddde]">
                                <div className="flex justify-between"><span className="text-[#22c55e]">🎯 Take Profit (Short)</span> <span>{tpShort.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span className="text-[#22c55e]">🚀 Take Profit (Long)</span> <span>{tpLong.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span className="text-[#f43f5e]">🛑 Stoploss (SL)</span> <span>{slShort.toFixed(2)}</span></div>
                            </div>
                        </div>

                        {/* METRICS GRID */}
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            {/* Vol Metrics */}
                            <div>
                                <h3 className="text-[#b9bbbe] text-[10px] font-bold uppercase mb-1">Volume Metrics</h3>
                                <div className="text-xs space-y-0.5 text-[#dcddde] font-mono">
                                    <div className="flex justify-between"><span>Vol:</span> <span>{vol.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Avg10:</span> <span>{avgVol10.toLocaleString()}</span></div>
                                </div>
                            </div>
                            {/* Stat Metrics */}
                            <div>
                                <h3 className="text-[#b9bbbe] text-[10px] font-bold uppercase mb-1">Stat Metrics</h3>
                                <div className="text-xs space-y-0.5 text-[#dcddde] font-mono">
                                    <div className="flex justify-between"><span>RSI:</span> <span className={rsi > 70 ? 'text-[#f43f5e]' : rsi < 30 ? 'text-[#22c55e]' : ''}>{rsi.toFixed(2)}</span></div>
                                    <div className="flex justify-between"><span>P/E:</span> <span>{pe}</span></div>
                                </div>
                            </div>
                        </div>

                        {/* PIVOT LEVELS */}
                        {pivots && (
                            <div className="bg-[#202225] p-3 rounded text-xs font-mono border border-[#2f3136]">
                                <div className="flex justify-between text-[#f43f5e] mb-1"><span>R2: {pivots.r2.toFixed(2)}</span> <span>R1: {pivots.r1.toFixed(2)}</span></div>
                                <div className="text-center font-bold text-[#5865F2] border-y border-[#2f3136] py-1 my-1">PIVOT: {pivots.p.toFixed(2)}</div>
                                <div className="flex justify-between text-[#22c55e] mt-1"><span>S1: {pivots.s1.toFixed(2)}</span> <span>S2: {pivots.s2.toFixed(2)}</span></div>
                            </div>
                        )}

                        {/* MINI CHART */}
                        <div className="h-24 w-full bg-[#202225] rounded border border-[#2f3136] pt-2 pr-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.slice(-30)}>
                                    <defs>
                                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={accentColor} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={accentColor} stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <YAxis domain={['auto', 'auto']} hide />
                                    <Area type="monotone" dataKey="close" stroke={accentColor} fillOpacity={1} fill="url(#colorClose)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="text-[9px] text-[#72767d] pt-2 border-t border-[#2f3136] flex justify-between">
                            <span>MoneyMachine v2.0</span>
                            <span>Not Financial Advice</span>
                        </div>

                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
