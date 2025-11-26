import React, { useState, useEffect } from 'react';
import { Transaction, Broker, ParsedTrade } from '../types';
import { X, Plus, ChevronDown, Loader2, Save, Trash2, Check, Briefcase, Sparkles, ScanText, Keyboard, FileText, UploadCloud } from 'lucide-react';
import { parseTradeDocumentOCRSpace } from '../services/ocrSpace';
import { parseTradeDocument } from '../services/gemini';

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onManageBrokers?: () => void;
  isOpen: boolean;
  onClose: () => void;
  existingTransactions?: Transaction[];
  editingTransaction?: Transaction | null;
  brokers?: Broker[]; 
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onAddTransaction, 
  onUpdateTransaction,
  onManageBrokers,
  isOpen, 
  onClose, 
  editingTransaction,
  brokers = []
}) => {
  const [mode, setMode] = useState<'MANUAL' | 'AI_SCAN' | 'OCR_SCAN'>('MANUAL');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'TAX'>('BUY');
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [commission, setCommission] = useState<number | ''>('');
  const [tax, setTax] = useState<number | ''>('');
  const [cdcCharges, setCdcCharges] = useState<number | ''>('');
  const [otherFees, setOtherFees] = useState<number | ''>('');
  const [isAutoCalc, setIsAutoCalc] = useState(true);

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedTrades, setScannedTrades] = useState<ParsedTrade[]>([]);

  // Auto-Select Default Broker
  useEffect(() => {
    if (brokers.length > 0 && !selectedBrokerId) {
        const def = brokers.find(b => b.isDefault) || brokers[0];
        if (def) setSelectedBrokerId(def.id);
    }
  }, [brokers, selectedBrokerId]);

  // Reset/Init on Open
  useEffect(() => {
    if (isOpen) {
        if (editingTransaction) {
            setMode('MANUAL');
            setType(editingTransaction.type);
            setDate(editingTransaction.date);
            setTicker(editingTransaction.ticker);
            setQuantity(editingTransaction.quantity);
            setPrice(editingTransaction.price);
            setCommission(editingTransaction.commission);
            setTax(editingTransaction.tax || 0);
            setCdcCharges(editingTransaction.cdcCharges || 0);
            setOtherFees(editingTransaction.otherFees || 0);
            setIsAutoCalc(false);
            if (editingTransaction.brokerId) setSelectedBrokerId(editingTransaction.brokerId);
        } else {
            // Reset for new entry
            setTicker(''); setQuantity(''); setPrice(''); 
            setCommission(''); setTax(''); setCdcCharges(''); setOtherFees('');
            setMode('MANUAL'); setIsAutoCalc(true); 
            setDate(new Date().toISOString().split('T')[0]);
            setScannedTrades([]); setScanError(null);
        }
    }
  }, [isOpen, editingTransaction]);

  // Auto-Calculate Fees (Simple estimation if enabled)
  useEffect(() => {
    if (isAutoCalc && mode === 'MANUAL' && !editingTransaction) {
        if (typeof quantity === 'number' && typeof price === 'number') {
             const gross = quantity * price;
             // Default rough estimates if no broker logic applied perfectly
             const estComm = gross * 0.0015; // 0.15% approx
             const estTax = estComm * 0.13; // 13% SST approx
             const estCdc = Math.max(5, quantity * 0.005); // CDC
             
             setCommission(parseFloat(estComm.toFixed(2)));
             setTax(parseFloat(estTax.toFixed(2)));
             setCdcCharges(parseFloat(estCdc.toFixed(2)));
        }
    }
  }, [quantity, price, isAutoCalc, mode, editingTransaction]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !quantity || !price) return;
    
    let brokerName = undefined;
    if (type !== 'DIVIDEND' && type !== 'TAX') {
        const b = brokers.find(b => b.id === selectedBrokerId);
        if (b) brokerName = b.name;
    }

    const txData = {
      ticker: ticker.toUpperCase(),
      type,
      quantity: Number(quantity),
      price: Number(price),
      date,
      broker: brokerName,
      brokerId: selectedBrokerId,
      commission: Number(commission) || 0,
      tax: Number(tax) || 0,
      cdcCharges: Number(cdcCharges) || 0,
      otherFees: Number(otherFees) || 0
    };

    if (editingTransaction && onUpdateTransaction) {
      onUpdateTransaction({ ...editingTransaction, ...txData });
    } else {
      onAddTransaction(txData);
    }
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsScanning(true);
      setScanError(null);
      setScannedTrades([]);

      try {
          let trades: ParsedTrade[] = [];
          if (mode === 'AI_SCAN') {
              trades = await parseTradeDocument(file); // Gemini
          } else {
              const res = await parseTradeDocumentOCRSpace(file); // OCR Space
              trades = res.trades;
          }

          if (trades.length === 0) throw new Error("No trades detected in image.");
          setScannedTrades(trades);
      } catch (err: any) {
          setScanError(err.message || "Failed to scan document.");
      } finally {
          setIsScanning(false);
      }
  };

  const handleAcceptTrade = (trade: ParsedTrade) => {
      onAddTransaction({
          ticker: trade.ticker,
          type: trade.type as any, // SAFE CAST
          quantity: trade.quantity,
          price: trade.price,
          date: trade.date || new Date().toISOString().split('T')[0],
          broker: trade.broker, // Use scanned broker name
          commission: trade.commission || 0,
          tax: trade.tax || 0,
          cdcCharges: trade.cdcCharges || 0,
          otherFees: trade.otherFees || 0
      });
      // Remove from list
      setScannedTrades(prev => prev.filter(t => t !== trade));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${scannedTrades.length > 0 ? 'max-w-4xl' : 'max-w-lg'}`}>
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">
             {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
        </div>

        {/* MODE SWITCHER - THIS WAS MISSING */}
        {!editingTransaction && (
            <div className="px-6 pt-6">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'MANUAL' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Keyboard size={16} /> Manual
                    </button>
                    <button onClick={() => setMode('AI_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'AI_SCAN' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Sparkles size={16} /> AI Scan
                    </button>
                    <button onClick={() => setMode('OCR_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'OCR_SCAN' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        <ScanText size={16} /> OCR
                    </button>
                </div>
            </div>
        )}

        {/* CONTENT */}
        <div className="p-6 pt-0 flex-1 overflow-y-auto custom-scrollbar">
            
            {/* 1. MANUAL FORM */}
            {mode === 'MANUAL' && (
                <form onSubmit={handleManualSubmit} className="space-y-5">
                    {/* Type Select */}
                    <div className="grid grid-cols-4 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                        {(['BUY', 'SELL', 'DIVIDEND', 'TAX'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setType(t)} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === t ? 'bg-white shadow text-slate-900 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Date</label>
                            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Ticker</label>
                            <input type="text" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold uppercase focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="e.g. OGDC"/>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Quantity</label>
                            <input type="number" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Price</label>
                            <input type="number" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0.00"/>
                        </div>
                    </div>

                    {/* Fees Toggle */}
                    <div className="pt-2">
                         <div className="flex items-center justify-between mb-2">
                             <label className="text-xs font-bold text-slate-400 uppercase">Fees & Taxes</label>
                             <button type="button" onClick={() => setIsAutoCalc(!isAutoCalc)} className={`text-[10px] px-2 py-0.5 rounded border ${isAutoCalc ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                {isAutoCalc ? 'Auto-Calc On' : 'Manual Entry'}
                             </button>
                         </div>
                         <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                             <div><label className="text-[10px] text-slate-400 block mb-1">Commission</label><input type="number" step="any" value={commission} onChange={e=>setCommission(Number(e.target.value))} className="w-full text-xs p-2 rounded border border-slate-200"/></div>
                             <div><label className="text-[10px] text-slate-400 block mb-1">Tax / WHT</label><input type="number" step="any" value={tax} onChange={e=>setTax(Number(e.target.value))} className="w-full text-xs p-2 rounded border border-slate-200"/></div>
                             <div><label className="text-[10px] text-slate-400 block mb-1">CDC Charges</label><input type="number" step="any" value={cdcCharges} onChange={e=>setCdcCharges(Number(e.target.value))} className="w-full text-xs p-2 rounded border border-slate-200"/></div>
                             <div><label className="text-[10px] text-slate-400 block mb-1">Other Fees</label><input type="number" step="any" value={otherFees} onChange={e=>setOtherFees(Number(e.target.value))} className="w-full text-xs p-2 rounded border border-slate-200"/></div>
                         </div>
                    </div>

                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 mt-4">
                        <Save size={18} /> Save Transaction
                    </button>
                </form>
            )}

            {/* 2. SCANNER INTERFACE */}
            {(mode === 'AI_SCAN' || mode === 'OCR_SCAN') && (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                    {!isScanning && scannedTrades.length === 0 && (
                        <div className="w-full border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative group p-10 flex flex-col items-center text-center">
                            <input 
                                type="file" 
                                accept="image/*,.pdf" 
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <UploadCloud size={32} className={mode === 'AI_SCAN' ? "text-indigo-500" : "text-emerald-500"} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">
                                {mode === 'AI_SCAN' ? 'Upload Trade Screenshot' : 'Upload Ledger Image'}
                            </h3>
                            <p className="text-slate-400 text-sm mt-2 max-w-xs">
                                {mode === 'AI_SCAN' 
                                    ? 'Uses Gemini AI to intelligently read trade confirmations, PDFs, or screenshots.' 
                                    : 'Uses Standard OCR to extract text tables from clean images.'}
                            </p>
                        </div>
                    )}

                    {isScanning && (
                        <div className="text-center py-10">
                            <Loader2 size={40} className={`animate-spin mx-auto mb-4 ${mode === 'AI_SCAN' ? 'text-indigo-600' : 'text-emerald-600'}`} />
                            <p className="text-slate-500 font-medium">Analyzing document...</p>
                        </div>
                    )}

                    {scanError && (
                        <div className="w-full bg-rose-50 border border-rose-200 rounded-xl p-4 text-center mb-4">
                            <p className="text-rose-600 font-bold text-sm mb-2">Scan Failed</p>
                            <p className="text-rose-500 text-xs">{scanError}</p>
                            <button onClick={() => setScanError(null)} className="mt-3 text-xs bg-white border border-rose-200 px-3 py-1 rounded-lg text-rose-600">Try Again</button>
                        </div>
                    )}

                    {/* RESULTS LIST */}
                    {scannedTrades.length > 0 && (
                        <div className="w-full space-y-3">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-slate-700">Found {scannedTrades.length} Trades</h3>
                                <button onClick={() => setScannedTrades([])} className="text-xs text-rose-500 hover:underline">Clear All</button>
                            </div>
                            {scannedTrades.map((t, idx) => (
                                <div key={idx} className="bg-white border border-slate-200 p-3 rounded-xl flex justify-between items-center shadow-sm">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{t.type}</span>
                                            <span className="font-bold text-slate-800">{t.ticker}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {t.quantity} @ {t.price} <span className="mx-1">•</span> {t.date}
                                        </div>
                                    </div>
                                    <button onClick={() => handleAcceptTrade(t)} className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                                        <Check size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
