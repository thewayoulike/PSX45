import React, { useState, useEffect, useRef } from 'react';
import { Transaction, Broker, ParsedTrade } from '../types';
import { X, Plus, ChevronDown, Loader2, Save, Trash2, Check, Briefcase, Sparkles, ScanText, Keyboard, FileText, UploadCloud, RefreshCcw } from 'lucide-react';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedTrades, setScannedTrades] = useState<ParsedTrade[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            setScannedTrades([]); setScanError(null); setSelectedFile(null);
        }
    }
  }, [isOpen, editingTransaction]);

  // Mode change reset
  useEffect(() => {
    setSelectedFile(null);
    setScannedTrades([]);
    setScanError(null);
  }, [mode]);

  // --- UPDATED AUTO-CALCULATION LOGIC ---
  useEffect(() => {
    if (isAutoCalc && mode === 'MANUAL' && !editingTransaction) {
        if (typeof quantity === 'number' && quantity > 0 && typeof price === 'number' && price > 0) {
             const gross = quantity * price;

             // 1. Calculate Commission based on Broker Settings
             let estComm = 0;
             const currentBroker = brokers.find(b => b.id === selectedBrokerId);

             if (currentBroker) {
                 if (currentBroker.commissionType === 'PERCENTAGE') {
                     estComm = gross * (currentBroker.rate1 / 100);
                 } else if (currentBroker.commissionType === 'FIXED') {
                     estComm = currentBroker.rate1;
                 } else if (currentBroker.commissionType === 'PER_SHARE') {
                     estComm = quantity * currentBroker.rate1;
                 } else if (currentBroker.commissionType === 'HIGHER_OF') {
                     const pct = gross * (currentBroker.rate1 / 100);
                     const fixed = quantity * (currentBroker.rate2 || 0);
                     estComm = Math.max(pct, fixed);
                 }
             } else {
                 // Fallback if no broker selected (approx 0.15%)
                 estComm = gross * 0.0015;
             }

             // 2. Calculate Sales Tax (SST)
             // Use broker's SST rate or default to 15%
             const taxRate = currentBroker ? (currentBroker.sstRate / 100) : 0.15;
             const estTax = estComm * taxRate;

             // 3. CDC Charges (Fixed 0.005 per share)
             const estCdc = quantity * 0.005;

             setCommission(parseFloat(estComm.toFixed(2)));
             setTax(parseFloat(estTax.toFixed(2)));
             setCdcCharges(parseFloat(estCdc.toFixed(2)));
        } else {
             // Clear if invalid inputs
             if (commission !== '') setCommission('');
             if (tax !== '') setTax('');
             if (cdcCharges !== '') setCdcCharges('');
        }
    }
  }, [quantity, price, isAutoCalc, mode, editingTransaction, selectedBrokerId, brokers]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setSelectedFile(e.target.files[0]);
          setScanError(null);
          setScannedTrades([]);
      }
  };

  const handleProcessScan = async () => {
      if (!selectedFile) return;

      setIsScanning(true);
      setScanError(null);
      setScannedTrades([]);

      try {
          let trades: ParsedTrade[] = [];
          if (mode === 'AI_SCAN') {
              trades = await parseTradeDocument(selectedFile); 
          } else {
              const res = await parseTradeDocumentOCRSpace(selectedFile); 
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
      let brokerName = trade.broker;
      if (selectedBrokerId) {
          const b = brokers.find(br => br.id === selectedBrokerId);
          if (b) brokerName = b.name;
      }

      onAddTransaction({
          ticker: trade.ticker,
          type: trade.type as any,
          quantity: trade.quantity,
          price: trade.price,
          date: trade.date || new Date().toISOString().split('T')[0],
          broker: brokerName,
          brokerId: selectedBrokerId,
          commission: trade.commission || 0,
          tax: trade.tax || 0,
          cdcCharges: trade.cdcCharges || 0,
          otherFees: trade.otherFees || 0
      });
      setScannedTrades(prev => prev.filter(t => t !== trade));
  };

  if (!isOpen) return null;

  // Theme Colors based on mode
  const themeColor = mode === 'AI_SCAN' ? 'indigo' : 'emerald';
  const themeText = mode === 'AI_SCAN' ? 'text-indigo-600' : 'text-emerald-600';
  const themeBg = mode === 'AI_SCAN' ? 'bg-indigo-50' : 'bg-emerald-50';
  const themeButton = mode === 'AI_SCAN' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600';
  const themeBorder = mode === 'AI_SCAN' ? 'border-indigo-200' : 'border-emerald-200';
  const themeShadow = mode === 'AI_SCAN' ? 'shadow-indigo-200' : 'shadow-emerald-200';

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${scannedTrades.length > 0 ? 'max-w-4xl' : 'max-w-md'}`}>
        
        {/* HEADER */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-white rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-800">
             {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
        </div>

        {/* MODE SWITCHER */}
        {!editingTransaction && (
            <div className="px-6 pt-6">
                <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'MANUAL' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Keyboard size={16} /> Manual
                    </button>
                    <button onClick={() => setMode('AI_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'AI_SCAN' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Sparkles size={16} /> AI Scan
                    </button>
                    <button onClick={() => setMode('OCR_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'OCR_SCAN' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
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
                    {/* ... (Manual Form Fields kept same) ... */}
                    <div className="grid grid-cols-4 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                        {(['BUY', 'SELL', 'DIVIDEND', 'TAX'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setType(t)} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === t ? 'bg-white shadow text-slate-900 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Ticker</label><input type="text" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold uppercase focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="e.g. OGDC"/></div>
                    </div>

                    {(type === 'BUY' || type === 'SELL') && (
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-slate-500">Broker</label>
                                {onManageBrokers && <button type="button" onClick={onManageBrokers} className="text-[10px] text-emerald-600 hover:underline">Manage</button>}
                            </div>
                            <div className="relative">
                                <select value={selectedBrokerId} onChange={e => setSelectedBrokerId(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none appearance-none bg-white">
                                    {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" size={16} />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Quantity</label><input type="number" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0"/></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Price</label><input type="number" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0.00"/></div>
                    </div>

                    <div className="pt-2">
                         <div className="flex items-center justify-between mb-2">
                             <label className="text-xs font-bold text-slate-400 uppercase">Fees & Taxes</label>
                             <button type="button" onClick={() => setIsAutoCalc(!isAutoCalc)} className={`text-[10px] px-2 py-0.5 rounded border ${isAutoCalc ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{isAutoCalc ? 'Auto-Calc On' : 'Manual Entry'}</button>
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
                <div className="flex flex-col min-h-[360px] relative">
                    
                    {!isScanning && scannedTrades.length === 0 && (
                        <>
                            {/* BROKER SELECTION ROW */}
                            <div className="mb-6">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Broker for Import</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <select 
                                            value={selectedBrokerId} 
                                            onChange={e => setSelectedBrokerId(e.target.value)} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none appearance-none"
                                        >
                                            {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" size={18} />
                                    </div>
                                    <button onClick={onManageBrokers} className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-500 transition-colors" title="Manage Brokers">
                                        <Briefcase size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* UPLOAD AREA */}
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`w-full flex-1 border-2 border-dashed ${selectedFile ? 'border-indigo-400 bg-indigo-50/50' : `${themeBorder} ${themeBg}`} rounded-2xl cursor-pointer hover:bg-white transition-all group flex flex-col items-center justify-center p-8`}
                            >
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept="image/*,.pdf" 
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-sm ${selectedFile ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-400'}`}>
                                    {selectedFile ? <FileText size={32} /> : (mode === 'AI_SCAN' ? <Sparkles size={32} className="text-indigo-500" /> : <ScanText size={32} className="text-emerald-500" />)}
                                </div>

                                {selectedFile ? (
                                    <>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">{selectedFile.name}</h3>
                                        <p className="text-slate-500 text-sm">Click to change file</p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-bold text-slate-700 mb-1">Click to Upload</h3>
                                        <p className="text-slate-400 text-sm font-medium">
                                            {mode === 'AI_SCAN' ? 'Smart AI Detection (Gemini)' : 'Standard Text Extraction'}
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* ACTION BUTTON */}
                            <button 
                                onClick={handleProcessScan}
                                disabled={!selectedFile}
                                className={`w-full mt-6 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2
                                    ${selectedFile ? `${themeButton} ${themeShadow} cursor-pointer` : 'bg-slate-300 text-slate-100 cursor-not-allowed shadow-none'}
                                `}
                            >
                                {mode === 'AI_SCAN' ? <Sparkles size={18} /> : <ScanText size={18} />}
                                {mode === 'AI_SCAN' ? 'Analyze with AI' : 'Extract Text'}
                            </button>
                        </>
                    )}

                    {/* LOADING STATE */}
                    {isScanning && (
                        <div className="flex flex-col items-center justify-center h-full py-20">
                            <Loader2 size={48} className={`animate-spin mb-6 ${themeText}`} />
                            <h3 className="text-lg font-bold text-slate-700 mb-2">Analyzing Document</h3>
                            <p className="text-slate-400 text-sm text-center max-w-[200px]">Extracting trade details, please wait...</p>
                        </div>
                    )}

                    {/* ERROR STATE */}
                    {scanError && !isScanning && (
                         <div className="w-full bg-rose-50 border border-rose-200 rounded-xl p-6 text-center my-auto">
                            <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <X size={24} />
                            </div>
                            <p className="text-rose-700 font-bold mb-1">Analysis Failed</p>
                            <p className="text-rose-500 text-sm mb-4">{scanError}</p>
                            <button onClick={() => setScanError(null)} className="px-4 py-2 bg-white border border-rose-200 rounded-lg text-rose-600 text-sm font-bold shadow-sm">Try Again</button>
                        </div>
                    )}

                    {/* RESULTS LIST */}
                    {scannedTrades.length > 0 && (
                        <div className="w-full flex-1 flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800 text-lg">Found {scannedTrades.length} Trades</h3>
                                <button onClick={() => { setScannedTrades([]); setSelectedFile(null); }} className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1">
                                    <RefreshCcw size={12} /> Clear All
                                </button>
                            </div>
                            
                            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                                {scannedTrades.map((t, idx) => (
                                    <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex justify-between items-center shadow-sm group hover:border-indigo-300 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${t.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{t.type}</span>
                                            <div>
                                                <div className="font-bold text-slate-800 text-base">{t.ticker}</div>
                                                <div className="text-xs text-slate-500 mt-0.5 font-medium">
                                                    {t.quantity.toLocaleString()} shares @ <span className="text-slate-800">{t.price}</span> • {t.date}
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleAcceptTrade(t)} className="p-2.5 bg-slate-50 group-hover:bg-emerald-50 text-slate-400 group-hover:text-emerald-600 rounded-xl transition-all shadow-sm border border-slate-200 group-hover:border-emerald-200">
                                            <Check size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
