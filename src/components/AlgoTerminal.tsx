import React, { useState, useEffect } from 'react';
import { OHLCData, fetchStockOHLC } from '../services/psxData';
import { calculateRSI, calculatePivots, calculateATR, calculateSMA, generateSignal } from '../utils/technicalAnalysis';
import { X, Terminal, Loader2, Target, Shield, Zap, TrendingUp, BarChart4, ArrowUp, ArrowDown, Activity, AlertCircle, Search } from 'lucide-react';
import { AreaChart, Area, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface AlgoTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTicker?: string | null;
}

export const AlgoTerminal: React.FC<AlgoTerminalProps> = ({ isOpen, onClose, defaultTicker }) => {
  const [ticker, setTicker] = useState(defaultTicker || '');
  const [data, setData] = useState<OHLCData[]>([]);
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
          // Need at least 14 periods for RSI/ATR
          if (!ohlc || ohlc.length < 14) {
              setErrorMsg(`Insufficient historical data for ${symbol}. Cannot calculate Indicators.`);
              setLoading(false);
              return;
          }
          setData(ohlc);
          setAnalyzedTicker(symbol.toUpperCase());
      } catch (e) {
          setErrorMsg("Connection failed. Proxies might be blocked.");
      } finally {
          setLoading(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); handleAnalyze(ticker); };

  if (!isOpen) return null;

  // --- CALCULATION LOGIC ---
  const latest = data[data.length - 1];
  const prev = data[data.length - 2]; // Yesterday's close is critical for pivots
  
  const currentPrice = latest?.close || 0;
  const rsi = calculateRSI(data);
  const atr = calculateATR(data);
  const sma50 = calculateSMA(data, 50);
  const sma200 = calculateSMA(data, 200);
  
  // Pivot Points (Using Previous Candle)
  const pivots = prev ? calculatePivots(prev.high, prev.low, prev.close) : null;
  const { trend, signal, strength } = generateSignal(currentPrice, rsi, sma50, sma200);

  // 1. Support & Resistance (Based on Pivots)
  const resistance = pivots ? pivots.r1 : currentPrice * 1.02;
  const support = pivots ? pivots.s1 : currentPrice * 0.98;
  
  // 2. Distances (%)
  const distRes = ((resistance - currentPrice) / currentPrice) * 100;
  const distSup = ((currentPrice - support) / currentPrice) * 100; // Negative usually

  // 3. Short Term Targets (TP = Resistance, SL = Support)
  const tpMin = resistance;
  const tpMax = resistance + (atr * 0.5);
  const potentialProfit = ((tpMin - currentPrice) / currentPrice) * 100;

  const slMin = support - (atr * 0.5);
  const slMax = support;

  // 4. Long Term Targets (R2)
  const longTpMin = pivots ? pivots.r2 : currentPrice * 1.05;
  const longTpMax = longTpMin + atr;
  const longProfit = ((longTpMin - currentPrice) / currentPrice) * 100;

  // 5. Risk Management
  const trailingSL = currentPrice - (2.5 * atr); // 2.5x ATR Trailing
  const buyZoneMin = support;
  const buyZoneMax = support + (atr * 0.25);

  const fmt = (n: number) => n ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
  const isGreen = latest && prev ? latest.close >= prev.close : true;
  const chartColor = isGreen ? '#22c55e' : '#f43f5e';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1e1f22] w-full max-w-3xl rounded-xl shadow-2xl border border-[#2b2d31] overflow-hidden flex flex-col max-h-[90vh] font-sans text-[#dbdee1]">
        
        {/* Header */}
        <div className="bg-[#2b2d31] p-4 flex items-center justify-between border-b border-[#1e1f22]">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Terminal size={20} />
                </div>
                <div>
                    <h2 className="text-white font-bold text-sm tracking-wide">PSX ALGO</h2>
                    <p className="text-[10px] text-[#949ba4] font-medium">AI Market Analysis</p>
                </div>
            </div>
            <button onClick={onClose} className="text-[#949ba4] hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-[#2b2d31]/50 border-b border-[#1e1f22]">
            <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-[#949ba4]" size={16} />
                    <input 
                        value={ticker} 
                        onChange={e => setTicker(e.target.value.toUpperCase())} 
                        placeholder="ENTER TICKER (e.g. AVN)..." 
                        className="w-full bg-[#111214] text-white pl-10 pr-4 py-2 rounded-lg outline-none border border-[#1e1f22] focus:border-[#5865F2] text-sm font-bold placeholder-[#4e5058]" 
                        autoFocus 
                    />
                </div>
                <button disabled={loading} className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                    SCAN
                </button>
            </form>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#313338] overflow-y-auto custom-scrollbar p-6">
            {errorMsg && (
                <div className="flex flex-col items-center justify-center py-10 text-rose-400 text-center">
                    <AlertCircle size={40} className="mb-2" />
                    <span className="font-bold">{errorMsg}</span>
                    <p className="text-xs mt-2 text-[#949ba4]">Try refreshing to switch proxies.</p>
                </div>
            )}

            {!analyzedTicker && !loading && !errorMsg && (
                <div className="flex flex-col items-center justify-center h-full opacity-30 py-10">
                    <BarChart4 size={64} className="mb-4 text-white" />
                    <p className="text-white font-bold">READY TO ANALYZE</p>
                </div>
            )}
            
            {analyzedTicker && latest && pivots && !loading && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    {/* TOP SUMMARY */}
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-baseline gap-3">
                                <h1 className="text-3xl font-black text-white tracking-tight">{analyzedTicker}</h1>
                                <span className="text-2xl font-mono text-[#f2f3f5] font-bold">Rs. {fmt(currentPrice)}</span>
                                {prev && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${isGreen ? 'bg-green-500/20 text-green-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                        {((currentPrice - prev.close) / prev.close * 100).toFixed(2)}%
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs font-bold">
                                <span className="text-[#949ba4]">{new Date(latest.time).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-[#b9bbbe] uppercase font-bold">Signal</div>
                            <div className={`text-xl font-black ${signal.includes('BUY') ? 'text-green-400' : signal.includes('SELL') ? 'text-rose-400' : 'text-[#facc15]'}`}>
                                {signal}
                            </div>
                        </div>
                    </div>

                    {/* ANALYSIS GRID - Matches Screenshot Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* 1. Market Analysis */}
                        <div className="bg-[#2b2d31] rounded-lg p-4 border-l-4 border-[#facc15]">
                            <h3 className="text-[#f2f3f5] font-bold text-sm mb-3 flex items-center gap-2">
                                <Activity size={16} className="text-[#facc15]" /> Market Analysis
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Trend:</span>
                                    <span className="text-white font-bold">{trend} ({strength})</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Recommendation:</span>
                                    <span className={`font-bold ${signal.includes('BUY') ? 'text-green-400' : signal.includes('SELL') ? 'text-rose-400' : 'text-yellow-400'}`}>{signal}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Distance to Resistance:</span>
                                    <span className="text-rose-400 font-mono">{distRes.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Distance to Support:</span>
                                    <span className="text-green-400 font-mono">{Math.abs(distSup).toFixed(2)}%</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Short-Term Targets */}
                        <div className="bg-[#2b2d31] rounded-lg p-4 border-l-4 border-[#22c55e]">
                            <h3 className="text-[#f2f3f5] font-bold text-sm mb-3 flex items-center gap-2">
                                <Target size={16} className="text-[#22c55e]" /> Short-Term Targets
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4] flex items-center gap-1"><Target size={12} className="text-green-500"/> Take Profit (TP):</span>
                                    <span className="text-green-400 font-mono font-bold">{fmt(tpMin)} - {fmt(tpMax)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4] flex items-center gap-1"><Shield size={12} className="text-rose-500"/> Stoploss (SL):</span>
                                    <span className="text-rose-400 font-mono font-bold">{fmt(slMin)} - {fmt(slMax)}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[#3f4147] mt-1">
                                    <span className="text-[#949ba4]">Potential Profit:</span>
                                    <span className="text-[#facc15] font-bold">{potentialProfit.toFixed(2)}%</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Long-Term Targets */}
                        <div className="bg-[#2b2d31] rounded-lg p-4 border-l-4 border-[#5865F2]">
                            <h3 className="text-[#f2f3f5] font-bold text-sm mb-3 flex items-center gap-2">
                                <TrendingUp size={16} className="text-[#5865F2]" /> Long-Term Targets
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Take Profit (TP):</span>
                                    <span className="text-[#5865F2] font-mono font-bold">{fmt(longTpMin)} - {fmt(longTpMax)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Potential Profit:</span>
                                    <span className="text-[#facc15] font-bold">{longProfit.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Long-term Trend:</span>
                                    <span className={`font-bold ${currentPrice > sma200 ? 'text-green-400' : 'text-rose-400'}`}>
                                        {currentPrice > sma200 ? 'BULLISH' : 'BEARISH'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 4. Risk Management */}
                        <div className="bg-[#2b2d31] rounded-lg p-4 border-l-4 border-[#ec4899]">
                            <h3 className="text-[#f2f3f5] font-bold text-sm mb-3 flex items-center gap-2">
                                <Shield size={16} className="text-[#ec4899]" /> Risk Management
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Trailing Stoploss:</span>
                                    <span className="text-rose-400 font-mono font-bold">{fmt(trailingSL)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#949ba4]">Buy Zone:</span>
                                    <span className="text-green-400 font-mono font-bold">{fmt(buyZoneMin)} - {fmt(buyZoneMax)}</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Chart Visualization */}
                    <div className="bg-[#111214] border border-[#1e1f22] rounded-lg p-4 relative h-56">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <span className="text-xs font-bold text-[#949ba4]">PRICE ACTION & ZONES</span>
                            <div className="flex gap-3 text-[10px]">
                                <span className="flex items-center gap-1 text-[#facc15]"><div className="w-2 h-2 rounded-full bg-[#facc15]"></div> Price</span>
                                <span className="flex items-center gap-1 text-green-500"><div className="w-2 h-2 rounded-full bg-green-500"></div> TP</span>
                                <span className="flex items-center gap-1 text-rose-500"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SL</span>
                            </div>
                        </div>
                        <div className="h-full w-full pb-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.slice(-30)}>
                                    <defs>
                                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <YAxis domain={['auto', 'auto']} hide />
                                    <XAxis dataKey="time" hide />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1e1f22', borderColor: '#2b2d31', color: '#f2f3f5' }}
                                        labelStyle={{ display: 'none' }}
                                        formatter={(val: number) => [`Rs. ${val.toFixed(2)}`, 'Price']}
                                    />
                                    
                                    {/* Target Lines Visuals */}
                                    <ReferenceLine y={tpMin} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'TP', position: 'right', fill: '#22c55e', fontSize: 10 }} />
                                    <ReferenceLine y={slMax} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'SL', position: 'right', fill: '#f43f5e', fontSize: 10 }} />
                                    <ReferenceLine y={currentPrice} stroke="#facc15" strokeWidth={1} />

                                    <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={2} fill="url(#chartGrad)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            )}
        </div>
      </div>
    </div>
  );
};
