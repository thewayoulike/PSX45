import React, { useState, useEffect, useRef } from 'react';
import { Transaction, Broker, ParsedTrade, EditableTrade } from '../types';
import { X, Plus, ChevronDown, Loader2, Save, Sparkles, ScanText, Keyboard, FileText, FileSpreadsheet, Search, AlertTriangle, History, Wallet, ArrowRightLeft, Briefcase, RefreshCcw, CalendarClock, AlertCircle, Lock, CheckSquare } from 'lucide-react';
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
  portfolioDefaultBrokerId?: string;
  freeCash?: number;
  // NEW: Props for persistence
  savedScannedTrades?: EditableTrade[];
  onSaveScannedTrades?: (trades: EditableTrade[]) => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onAddTransaction, 
  onUpdateTransaction,
  onManageBrokers,
  isOpen, 
  onClose, 
  existingTransactions = [], 
  editingTransaction,
  brokers = [],
  portfolioDefaultBrokerId,
  freeCash,
  savedScannedTrades = [],
  onSaveScannedTrades
}) => {
  const [mode, setMode] = useState<'MANUAL' | 'AI_SCAN' | 'OCR_SCAN'>('MANUAL');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'TAX' | 'HISTORY' | 'DEPOSIT' | 'WITHDRAWAL' | 'ANNUAL_FEE'>('BUY');
  
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

  // Scanner State (Now derived from props for persistence)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedScanIndices, setSelectedScanIndices] = useState<Set<number>>(new Set());

  // Helper to update parent
  const updateScannedTrades = (trades: EditableTrade[]) => {
      if (onSaveScannedTrades) onSaveScannedTrades(trades);
  };

  // Validation State
  const [formError, setFormError] = useState<string | null>(null);

  const [cgtProfit, setCgtProfit] = useState<number | ''>('');
  const [cgtMonth, setCgtMonth] = useState(new Date().toISOString().substring(0, 7));
  const [histAmount, setHistAmount] = useState<number | ''>('');
  const [histTaxType, setHistTaxType] = useState<'BEFORE_TAX' | 'AFTER_TAX'>('AFTER_TAX');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
        if (portfolioDefaultBrokerId) {
            setSelectedBrokerId(portfolioDefaultBrokerId);
        } else if (brokers.length > 0 && !selectedBrokerId) {
            const def = brokers.find(b => b.isDefault) || brokers[0];
            if (def) setSelectedBrokerId(def.id);
        }
    }
  }, [isOpen, brokers, selectedBrokerId, portfolioDefaultBrokerId]);

  useEffect(() => {
    if (isOpen) {
        setFormError(null); 
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
            setIsAutoCalc(true);
            if (editingTransaction.brokerId) setSelectedBrokerId(editingTransaction.brokerId);
            
            if (editingTransaction.type === 'TAX') {
                setPrice(editingTransaction.price);
                setHistAmount(editingTransaction.price); 
            }
            if (editingTransaction.type === 'HISTORY') {
                 setHistAmount(editingTransaction.price);
                 setHistTaxType(editingTransaction.tax > 0 ? 'BEFORE_TAX' : 'AFTER_TAX');
            }
            if (['DEPOSIT', 'WITHDRAWAL', 'ANNUAL_FEE'].includes(editingTransaction.type)) {
                setHistAmount(editingTransaction.price); 
            }
        } else {
            setTicker(''); setQuantity(''); setPrice(''); 
            setCommission(''); setTax(''); setCdcCharges(''); setOtherFees('');
            
            // NOTE: We do NOT reset savedScannedTrades here to keep them persistent
            if (savedScannedTrades.length > 0) {
                setMode('AI_SCAN'); // Re-open scan tab if items exist
            } else {
                setMode('MANUAL'); 
            }

            setIsAutoCalc(true); 
            setDate(new Date().toISOString().split('T')[0]);
            setCgtMonth(new Date().toISOString().substring(0, 7));
            setCgtProfit('');
            setHistAmount(''); setHistTaxType('AFTER_TAX');
            setScanError(null); setSelectedFile(null);
            
            if (portfolioDefaultBrokerId) setSelectedBrokerId(portfolioDefaultBrokerId);
        }
    }
  }, [isOpen, editingTransaction, portfolioDefaultBrokerId]); // Removed savedScannedTrades from dep array to avoid loops

  // Clear selections when list changes
  useEffect(() => {
      setSelectedScanIndices(new Set());
  }, [savedScannedTrades, mode]);

  // Auto-Calculation Logic
  useEffect(() => {
    if (isAutoCalc && mode === 'MANUAL') {
        if (type === 'TAX' && typeof histAmount === 'number') { setPrice(histAmount); setQuantity(1); setTicker('CGT'); setCommission(0); setTax(0); setCdcCharges(0); setOtherFees(0); } 
        else if (type === 'HISTORY' && typeof histAmount === 'number') { setQuantity(1); setTicker('PREV-PNL'); if (histTaxType === 'BEFORE_TAX') { if (histAmount > 0) { const t = histAmount * 0.15; setTax(parseFloat(t.toFixed(2))); } else setTax(0); } else setTax(0); setPrice(histAmount); setCommission(0); setCdcCharges(0); setOtherFees(0); }
        else if ((type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'ANNUAL_FEE') && typeof histAmount === 'number') { setQuantity(1); setTicker(type === 'ANNUAL_FEE' ? 'ANNUAL FEE' : 'CASH'); setPrice(histAmount); setCommission(0); setTax(0); setCdcCharges(0); setOtherFees(0); }
        else if (typeof quantity === 'number' && quantity > 0 && typeof price === 'number' && price > 0) {
             const gross = quantity * price;
             if (type === 'DIVIDEND') { setCommission(0); setCdcCharges(0); setOtherFees(0); const wht = gross * 0.15; setTax(parseFloat(wht.toFixed(2))); } else {
                 let estComm = 0; const currentBroker = brokers.find(b => b.id === selectedBrokerId); if (currentBroker) { if (currentBroker.commissionType === 'PERCENTAGE') estComm = gross * (currentBroker.rate1 / 100); else if (currentBroker.commissionType === 'FIXED') estComm = currentBroker.rate1; else if (currentBroker.commissionType === 'PER_SHARE') estComm = quantity * currentBroker.rate1; else if (currentBroker.commissionType === 'HIGHER_OF') { const pct = gross * (currentBroker.rate1 / 100); const fixed = quantity * (currentBroker.rate2 || 0); estComm = Math.max(pct, fixed); } } else estComm = gross * 0.0015;
                 const taxRate = currentBroker ? (currentBroker.sstRate / 100) : 0.15; const estTax = estComm * taxRate; let estCdc = 0; if (currentBroker) { const cdcType = currentBroker.cdcType || 'PER_SHARE'; const cdcRate = currentBroker.cdcRate !== undefined ? currentBroker.cdcRate : 0.005; if (cdcType === 'PER_SHARE') estCdc = quantity * cdcRate; else if (cdcType === 'FIXED') estCdc = cdcRate; else if (cdcType === 'HIGHER_OF') { const shareVal = quantity * cdcRate; const fixedVal = currentBroker.cdcMin || 0; estCdc = Math.max(shareVal, fixedVal); } } else estCdc = quantity * 0.005;
                 setCommission(parseFloat(estComm.toFixed(2))); setTax(parseFloat(estTax.toFixed(2))); setCdcCharges(parseFloat(estCdc.toFixed(2)));
             }
        } else { if (commission !== '') setCommission(''); if (tax !== '') setTax(''); if (cdcCharges !== '') setCdcCharges(''); }
    }
  }, [quantity, price, isAutoCalc, mode, editingTransaction, selectedBrokerId, brokers, type, cgtProfit, cgtMonth, histAmount, histTaxType]);

  const getHoldingQty = (ticker: string, brokerId: string) => {
      let qty = 0;
      const cleanTicker = ticker.toUpperCase();
      const brokerObj = brokers.find(b => b.id === brokerId);
      const brokerName = brokerObj?.name;

      existingTransactions.forEach(t => {
          const isSameBroker = t.brokerId === brokerId || (t.broker && brokerName && t.broker === brokerName);
          if (t.ticker === cleanTicker && isSameBroker) {
              if (t.type === 'BUY') qty += t.quantity;
              if (t.type === 'SELL') qty -= t.quantity;
          }
      });
      return Math.max(0, qty);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null); 

    const cleanTicker = ticker.toUpperCase();
    let brokerName = undefined;
    const b = brokers.find(b => b.id === selectedBrokerId);
    if (b) brokerName = b.name;

    const qtyNum = Number(quantity);

    if (type === 'SELL') {
        const heldQty = getHoldingQty(cleanTicker, selectedBrokerId);
        let adjustedQty = heldQty;
        if (editingTransaction && editingTransaction.type === 'SELL' && editingTransaction.ticker === cleanTicker) {
             adjustedQty += editingTransaction.quantity; 
        } else if (editingTransaction && editingTransaction.type === 'BUY' && editingTransaction.ticker === cleanTicker) {
             adjustedQty -= editingTransaction.quantity; 
        }

        if (qtyNum > adjustedQty) {
            setFormError(`Insufficient holdings! You only have ${adjustedQty} shares of ${cleanTicker} at ${brokerName || 'this broker'}.`);
            return; 
        }
    }

    if (type === 'BUY' && !editingTransaction && freeCash !== undefined) {
        const totalCost = (qtyNum * Number(price)) + Number(commission) + Number(tax) + Number(cdcCharges) + Number(otherFees);
        if (totalCost > freeCash) {
             setFormError(`Insufficient Buying Power! You need Rs. ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} but only have Rs. ${freeCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`);
             return;
        }
    }

    const txData = {
      ticker: cleanTicker, type, quantity: qtyNum, price: Number(price), date, broker: brokerName, brokerId: selectedBrokerId,
      commission: Number(commission) || 0, tax: Number(tax) || 0, cdcCharges: Number(cdcCharges) || 0, otherFees: Number(otherFees) || 0
    };

    if (editingTransaction && onUpdateTransaction) onUpdateTransaction({ ...editingTransaction, ...txData });
    else onAddTransaction(txData);
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { setSelectedFile(e.target.files[0]); setScanError(null); updateScannedTrades([]); } };
  const handleProcessScan = async () => { if (!selectedFile) return; setIsScanning(true); setScanError(null); updateScannedTrades([]); try { let trades: ParsedTrade[] = []; if (mode === 'AI_SCAN') { trades = await parseTradeDocument(selectedFile); } else { const res = await parseTradeDocumentOCRSpace(selectedFile); trades = res.trades; } if (trades.length === 0) throw new Error("No trades found in this file."); const enrichedTrades: EditableTrade[] = trades.map(t => ({ ...t, brokerId: selectedBrokerId || undefined, broker: selectedBrokerId ? brokers.find(b => b.id === selectedBrokerId)?.name : t.broker })); updateScannedTrades(enrichedTrades); } catch (err: any) { setScanError(err.message || "Failed to scan document."); } finally { setIsScanning(false); } };
  
  const toggleScanSelection = (index: number) => {
      const next = new Set(selectedScanIndices);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      setSelectedScanIndices(next);
  };

  const toggleSelectAll = () => {
      if (selectedScanIndices.size === savedScannedTrades.length) setSelectedScanIndices(new Set());
      else setSelectedScanIndices(new Set(savedScannedTrades.map((_, i) => i)));
  };

  const getTradeCost = (t: EditableTrade) => {
      return (Number(t.quantity) * Number(t.price)) + (Number(t.commission)||0) + (Number(t.tax)||0) + (Number(t.cdcCharges)||0) + (Number(t.otherFees)||0);
  };

  const addSingleTrade = (trade: EditableTrade) => {
      let finalBrokerName = trade.broker;
      if (trade.brokerId) {
          const b = brokers.find(br => br.id === trade.brokerId);
          if (b) finalBrokerName = b.name;
      }
      onAddTransaction({
          ticker: trade.ticker,
          type: trade.type as any,
          quantity: Number(trade.quantity),
          price: Number(trade.price),
          date: trade.date || new Date().toISOString().split('T')[0],
          broker: finalBrokerName,
          brokerId: trade.brokerId,
          commission: Number(trade.commission) || 0,
          tax: Number(trade.tax) || 0,
          cdcCharges: Number(trade.cdcCharges) || 0,
          otherFees: Number(trade.otherFees) || 0
      });
  };

  const handleAcceptTrade = (trade: EditableTrade) => {
      setFormError(null);
      if (trade.type === 'BUY' && freeCash !== undefined) {
          const cost = getTradeCost(trade);
          if (cost > freeCash) {
              setFormError(`Insufficient Buying Power! This trade costs Rs. ${cost.toLocaleString()} but you have Rs. ${freeCash.toLocaleString()}.`);
              return;
          }
      }
      if (trade.type === 'SELL') {
          const targetBrokerId = trade.brokerId || selectedBrokerId;
          const currentQty = getHoldingQty(trade.ticker, targetBrokerId);
          if (Number(trade.quantity) > currentQty) {
               setFormError(`Insufficient Holdings! You are trying to sell ${trade.quantity} ${trade.ticker}, but you only own ${currentQty}.`);
               return;
          }
      }
      addSingleTrade(trade);
      updateScannedTrades(savedScannedTrades.filter(t => t !== trade));
  };

  const handleAcceptSelected = () => {
      setFormError(null);
      const selectedTrades = savedScannedTrades.filter((_, i) => selectedScanIndices.has(i));
      
      const totalBuyCost = selectedTrades.reduce((acc, t) => {
          return t.type === 'BUY' ? acc + getTradeCost(t) : acc;
      }, 0);

      if (freeCash !== undefined && totalBuyCost > freeCash) {
           setFormError(`Insufficient Buying Power! Selected trades cost Rs. ${totalBuyCost.toLocaleString()} but you have Rs. ${freeCash.toLocaleString()}.`);
           return;
      }

      for (const trade of selectedTrades) {
          if (trade.type === 'SELL') {
              const targetBrokerId = trade.brokerId || selectedBrokerId;
              const currentQty = getHoldingQty(trade.ticker, targetBrokerId);
              if (Number(trade.quantity) > currentQty) {
                   setFormError(`Insufficient Holdings for ${trade.ticker}! You own ${currentQty}, trying to sell ${trade.quantity}. Bulk action cancelled.`);
                   return; 
              }
          }
      }

      selectedTrades.forEach(addSingleTrade);
      updateScannedTrades(savedScannedTrades.filter((_, i) => !selectedScanIndices.has(i)));
      setSelectedScanIndices(new Set());
  };

  const updateSingleScannedTrade = (index: number, field: keyof EditableTrade, value: any) => { 
      const updated = [...savedScannedTrades]; 
      updated[index] = { ...updated[index], [field]: value }; 
      updateScannedTrades(updated); 
  };
  
  const getFileIcon = () => { if (selectedFile) { const isSheet = selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'); if (isSheet) return <FileSpreadsheet size={32} />; return <FileText size={32} />; } if (mode === 'AI_SCAN') return <Sparkles size={32} className="text-indigo-500" />; return <ScanText size={32} className="text-emerald-500" />; };
  const themeButton = mode === 'AI_SCAN' ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600';
  const themeText = mode === 'AI_SCAN' ? 'text-indigo-600' : 'text-emerald-600';
  const themeShadow = mode === 'AI_SCAN' ? 'shadow-indigo-200' : 'shadow-emerald-200';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${savedScannedTrades.length > 0 ? 'max-w-6xl' : 'max-w-md'}`}>
        
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-white rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-800">
             {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
        </div>

        {!editingTransaction && (
            <div className="px-6 pt-6">
                <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'MANUAL' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}> <Keyboard size={16} /> Manual </button>
                    <button onClick={() => setMode('AI_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'AI_SCAN' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}> <Sparkles size={16} /> AI Scan </button>
                    <button onClick={() => setMode('OCR_SCAN')} className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'OCR_SCAN' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}> <ScanText size={16} /> OCR </button>
                </div>
            </div>
        )}

        <div className="p-6 pt-0 flex-1 overflow-y-auto custom-scrollbar">
            
            {formError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2 mb-4">
                    <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-rose-800 text-sm">Action Blocked</h4>
                        <p className="text-xs text-rose-600 mt-1">{formError}</p>
                    </div>
                </div>
            )}

            {mode === 'MANUAL' && (
                <form onSubmit={handleManualSubmit} className="space-y-5">
                    
                    <div className="grid grid-cols-7 gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                        <button type="button" onClick={() => setType('BUY')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'BUY' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>BUY</button>
                        <button type="button" onClick={() => setType('SELL')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'SELL' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>SELL</button>
                        <button type="button" onClick={() => setType('DIVIDEND')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'DIVIDEND' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>DIV</button>
                        <button type="button" onClick={() => setType('TAX')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'TAX' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>CGT</button>
                        <button type="button" onClick={() => setType('HISTORY')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'HISTORY' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>HIST</button>
                        <button type="button" onClick={() => setType('DEPOSIT')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'DEPOSIT' || type === 'WITHDRAWAL' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>CASH</button>
                        <button type="button" onClick={() => setType('ANNUAL_FEE')} className={`py-2 rounded-lg text-[10px] font-bold ${type === 'ANNUAL_FEE' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>FEE</button>
                    </div>

                    {type === 'TAX' ? (
                        <>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
                                <p className="text-xs text-slate-600 leading-relaxed">
                                    <strong>Manual CGT Entry:</strong> <br/>
                                    • Enter a <strong>positive amount</strong> for tax paid. <br/>
                                    • Enter a <strong>negative amount</strong> for tax refund/credit.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-3 top-3.5 text-slate-400" size={14} /></div></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                            </div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">Tax Amount (PKR)</label><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="e.g. 1500 or -500"/></div>
                        </>
                    ) : type === 'HISTORY' ? (
                        <>
                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex gap-3 items-start"><History className="text-blue-500 shrink-0 mt-0.5" size={18} /><div className="text-xs text-blue-700"><p className="font-bold mb-0.5">Record Past Performance</p><p className="opacity-80">Add realized profits/losses from before using this app.</p></div></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-3 top-3.5 text-slate-400" size={14} /></div></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Date Recorded</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                            </div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">Realized Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className={`w-full border border-slate-200 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none ${Number(histAmount) < 0 ? 'text-rose-500' : 'text-emerald-600'}`} placeholder="-5000 or 10000"/><span className="absolute right-3 top-3.5 text-xs text-slate-400">PKR</span></div></div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-2">Tax Calculation</label><div className="grid grid-cols-2 gap-3"><label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${histTaxType === 'AFTER_TAX' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}><input type="radio" name="taxType" checked={histTaxType === 'AFTER_TAX'} onChange={() => setHistTaxType('AFTER_TAX')} className="hidden" /><span className="text-sm font-bold">After Tax (Net)</span></label><label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${histTaxType === 'BEFORE_TAX' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}><input type="radio" name="taxType" checked={histTaxType === 'BEFORE_TAX'} onChange={() => setHistTaxType('BEFORE_TAX')} className="hidden" /><span className="text-sm font-bold">Before Tax (Gross)</span></label></div></div>
                        </>
                    ) : type === 'DEPOSIT' || type === 'WITHDRAWAL' ? (
                        <>
                            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex gap-3 items-start"><Wallet className="text-emerald-500 shrink-0 mt-0.5" size={18} /><div className="text-xs text-emerald-700"><p className="font-bold mb-0.5">Cash Management</p><p className="opacity-80">Track deposits and withdrawals for accurate principal calculation.</p></div></div>
                            <div className="flex bg-slate-100 p-1 rounded-xl mb-2"><button type="button" onClick={() => setType('DEPOSIT')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${type === 'DEPOSIT' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}> <Plus size={14} strokeWidth={3} /> Add Funds (Deposit) </button><button type="button" onClick={() => setType('WITHDRAWAL')} className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${type === 'WITHDRAWAL' ? 'bg-white shadow text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}> <ArrowRightLeft size={14} strokeWidth={3} /> Withdraw Cash </button></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-3 top-3.5 text-slate-400" size={14} /></div></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                            </div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-800" placeholder="50000"/><span className="absolute right-3 top-3.5 text-xs text-slate-400">PKR</span></div></div>
                        </>
                    ) : type === 'ANNUAL_FEE' ? (
                        <>
                            <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 flex gap-3 items-start"><CalendarClock className="text-amber-500 shrink-0 mt-0.5" size={18} /><div className="text-xs text-amber-700"><p className="font-bold mb-0.5">Annual Fee</p><p className="opacity-80">Recurring maintenance fee.</p></div></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Broker</label><div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-3 top-3.5 text-slate-400" size={14} /></div></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                            </div>
                            <div><label className="block text-xs font-bold text-slate-500 mb-1">Fee Amount</label><div className="relative"><input required type="number" value={histAmount} onChange={e=>setHistAmount(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-800" placeholder="e.g. 500"/><span className="absolute right-3 top-3.5 text-xs text-slate-400">PKR</span></div></div>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"/></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Ticker</label><input required type="text" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-bold uppercase focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="e.g. OGDC"/></div>
                            </div>
                            <div className="mb-1">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-slate-500">Broker</label>
                                    {type === 'BUY' && !editingTransaction && freeCash !== undefined && ( <span className={`text-[10px] font-bold ${freeCash >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}> Buying Power: Rs. {freeCash.toLocaleString()} </span> )}
                                </div>
                                <div className="relative"><select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><Lock className="absolute right-3 top-3.5 text-slate-400" size={16} /></div>
                                <p className="text-[10px] text-slate-400 mt-1">This portfolio is linked strictly to <strong>{brokers.find(b=>b.id === selectedBrokerId)?.name}</strong>.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">{type === 'DIVIDEND' ? 'Eligible Shares' : 'Quantity'}</label><input required type="number" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0"/></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">{type === 'DIVIDEND' ? 'Dividend Amount (DPS)' : 'Price'}</label><input required type="number" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" placeholder="0.00"/></div>
                            </div>
                            {type === 'DIVIDEND' && typeof quantity === 'number' && quantity > 0 && typeof price === 'number' && price > 0 && ( <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex justify-between items-center text-xs text-indigo-800 px-4"><span className="opacity-80">Gross: <strong>{(quantity * price).toLocaleString()}</strong></span><span className="font-bold bg-white px-2 py-1 rounded border border-indigo-100">Net: Rs. {((quantity * price) - (Number(tax) || 0)).toLocaleString()}</span></div> )}
                            <div className="pt-2">
                                <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-slate-400 uppercase">Fees & Taxes</label><button type="button" onClick={() => setIsAutoCalc(!isAutoCalc)} className={`text-[10px] px-2 py-1 rounded border flex items-center gap-1 transition-colors ${isAutoCalc ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-200 font-bold shadow-sm'}`}> {!isAutoCalc && <AlertTriangle size={10} />} {isAutoCalc ? 'Auto-Calc On' : 'Manual Mode'} </button></div>
                                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div><label className="text-[10px] text-slate-400 block mb-1">Commission</label><input type="number" step="any" value={commission} onChange={e=>setCommission(Number(e.target.value))} disabled={type === 'DIVIDEND' && isAutoCalc} className="w-full text-xs p-2 rounded border border-slate-200 disabled:bg-slate-100"/></div>
                                    <div><label className="text-[10px] text-slate-400 block mb-1">Tax / WHT</label><input type="number" step="any" value={tax} onChange={e=>setTax(Number(e.target.value))} className="w-full text-xs p-2 rounded border border-slate-200"/></div>
                                    <div><label className="text-[10px] text-slate-400 block mb-1">CDC Charges</label><input type="number" step="any" value={cdcCharges} onChange={e=>setCdcCharges(Number(e.target.value))} disabled={type === 'DIVIDEND' && isAutoCalc} className="w-full text-xs p-2 rounded border border-slate-200 disabled:bg-slate-100"/></div>
                                    <div><label className="text-[10px] text-slate-400 block mb-1">Other Fees</label><input type="number" step="any" value={otherFees} onChange={e=>setOtherFees(Number(e.target.value))} disabled={type === 'DIVIDEND' && isAutoCalc} className="w-full text-xs p-2 rounded border border-slate-200 disabled:bg-slate-100"/></div>
                                </div>
                            </div>
                        </>
                    )}

                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 mt-4">
                        <Save size={18} /> Save Transaction
                    </button>
                </form>
            )}

            {/* Scanner Mode View */}
            {(mode === 'AI_SCAN' || mode === 'OCR_SCAN') && (
                <div className="flex flex-col min-h-[360px] relative">
                    {!isScanning && savedScannedTrades.length === 0 && (
                        <>
                            <div className="mb-6">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Default Broker for Import</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <select disabled value={selectedBrokerId} className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 focus:outline-none appearance-none cursor-not-allowed">
                                            {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                        <Lock className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" size={18} />
                                    </div>
                                    <button onClick={onManageBrokers} disabled className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-300 cursor-not-allowed" title="Manage Brokers"> <Briefcase size={20} /> </button>
                                </div>
                            </div>
                            {!scanError && (
                                <div onClick={() => fileInputRef.current?.click()} className={`w-full flex-1 border-2 border-dashed ${selectedFile ? 'border-indigo-400 bg-indigo-50/50' : `border-emerald-200 bg-emerald-50`} rounded-2xl cursor-pointer hover:bg-white transition-all group flex flex-col items-center justify-center p-8`}>
                                    <input ref={fileInputRef} type="file" accept={mode === 'AI_SCAN' ? "image/*,.pdf,.csv,.xlsx,.xls" : "image/*,.pdf"} onChange={handleFileSelect} className="hidden" />
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-sm ${selectedFile ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-400'}`}>
                                        {getFileIcon()}
                                    </div>
                                    {selectedFile ? ( <> <h3 className="text-lg font-bold text-slate-800 mb-1">{selectedFile.name}</h3> <p className="text-slate-500 text-sm">Click to change file</p> </> ) : ( <> <h3 className="text-lg font-bold text-slate-700 mb-1">Click to Upload</h3> <p className="text-slate-400 text-sm font-medium text-center max-w-[200px]">{mode === 'AI_SCAN' ? 'Screenshot, PDF, Excel or CSV (Gemini AI)' : 'Standard Image OCR'}</p> </> )}
                                </div>
                            )}
                            {scanError && (
                                <div className={`w-full flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 ${scanError.includes("No trades found") ? "border-amber-200 bg-amber-50/50" : "border-rose-200 bg-rose-50/50"}`}>
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-sm ${scanError.includes("No trades found") ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-500"}`}>
                                        {scanError.includes("No trades found") ? <Search size={32} /> : <AlertTriangle size={32} />}
                                    </div>
                                    <h3 className={`text-lg font-bold mb-1 ${scanError.includes("No trades found") ? "text-amber-800" : "text-rose-700"}`}>{scanError.includes("No trades found") ? "No Results Found" : "Scan Failed"}</h3>
                                    <p className={`text-sm font-medium text-center max-w-[240px] mb-6 ${scanError.includes("No trades found") ? "text-amber-600" : "text-rose-500"}`}>{scanError}</p>
                                    <button onClick={() => { setScanError(null); setSelectedFile(null); }} className={`px-6 py-2.5 bg-white border rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${scanError.includes("No trades found") ? "border-amber-200 text-amber-600" : "border-rose-200 text-rose-600"}`}> <RefreshCcw size={16} /> Try Different File </button>
                                </div>
                            )}
                            {!scanError && (
                                <button onClick={handleProcessScan} disabled={!selectedFile} className={`w-full mt-6 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${selectedFile ? `${themeButton} ${themeShadow} cursor-pointer` : 'bg-slate-300 text-slate-100 cursor-not-allowed shadow-none'}`}>
                                    {mode === 'AI_SCAN' ? <Sparkles size={18} /> : <ScanText size={18} />} {mode === 'AI_SCAN' ? 'Analyze with AI' : 'Extract Text'}
                                </button>
                            )}
                        </>
                    )}
                    {isScanning && (
                        <div className="flex flex-col items-center justify-center h-full py-20">
                            <Loader2 size={48} className={`animate-spin mb-6 ${themeText}`} />
                            <h3 className="text-lg font-bold text-slate-700 mb-2">Analyzing Document</h3>
                            <p className="text-slate-400 text-sm text-center max-w-[200px]">Extracting trade details, please wait...</p>
                        </div>
                    )}
                    {savedScannedTrades.length > 0 && (
                        <div className="w-full flex-1 flex flex-col overflow-hidden">
                            <div className="flex justify-between items-center mb-2 px-1">
                                <h3 className="font-bold text-slate-800 text-lg">Found {savedScannedTrades.length} Trades</h3>
                                <div className="flex items-center gap-2">
                                    {selectedScanIndices.size > 0 && (
                                        <button onClick={handleAcceptSelected} className="text-xs bg-emerald-600 text-white hover:bg-emerald-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm">
                                            <Plus size={14} /> Add Selected ({selectedScanIndices.size})
                                        </button>
                                    )}
                                    <button onClick={() => { updateScannedTrades([]); setSelectedFile(null); setSelectedScanIndices(new Set()); }} className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 px-2 py-1.5 hover:bg-rose-50 rounded-lg transition-all"> <RefreshCcw size={12} /> Clear All </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                            <th className="px-3 py-3 text-center w-10">
                                                <input type="checkbox" onChange={toggleSelectAll} checked={selectedScanIndices.size === savedScannedTrades.length && savedScannedTrades.length > 0} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"/>
                                            </th>
                                            <th className="px-3 py-3">Type</th> <th className="px-3 py-3">Date</th> <th className="px-3 py-3">Ticker</th> <th className="px-3 py-3">Broker</th> <th className="px-3 py-3 w-24">Qty</th> <th className="px-3 py-3 w-24">Price</th> <th className="px-2 py-3 w-20 text-slate-400">Comm</th> <th className="px-2 py-3 w-20 text-slate-400">Tax</th> <th className="px-2 py-3 w-20 text-slate-400">CDC</th> <th className="px-2 py-3 w-20 text-slate-400">Other</th> <th className="px-3 py-3 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {savedScannedTrades.map((t, idx) => (
                                            <tr key={idx} className={`hover:bg-slate-50/50 transition-colors group ${selectedScanIndices.has(idx) ? 'bg-indigo-50/40' : ''}`}>
                                                <td className="px-3 py-2 text-center">
                                                    <input type="checkbox" checked={selectedScanIndices.has(idx)} onChange={() => toggleScanSelection(idx)} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"/>
                                                </td>
                                                <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-1 rounded border ${t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{t.type}</span></td>
                                                <td className="px-3 py-2"><input type="date" value={t.date || ''} onChange={(e) => updateSingleScannedTrade(idx, 'date', e.target.value)} className="w-24 bg-transparent text-xs font-medium text-slate-700 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white transition-all" /></td>
                                                <td className="px-3 py-2"><input type="text" value={t.ticker} onChange={(e) => updateSingleScannedTrade(idx, 'ticker', e.target.value.toUpperCase())} className="w-16 bg-transparent text-xs font-bold text-slate-800 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white uppercase transition-all" /></td>
                                                <td className="px-3 py-2"><select disabled value={t.brokerId || ''} onChange={(e) => updateSingleScannedTrade(idx, 'brokerId', e.target.value)} className="w-24 bg-transparent text-xs text-slate-500 outline-none border-b border-transparent appearance-none truncate cursor-not-allowed bg-slate-100"><option value="">{t.broker || 'Select'}</option>{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
                                                <td className="px-3 py-2"><input type="number" value={t.quantity} onChange={(e) => updateSingleScannedTrade(idx, 'quantity', Number(e.target.value))} className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white transition-all" placeholder="0" /></td>
                                                <td className="px-3 py-2"><input type="number" step="0.01" value={t.price} onChange={(e) => updateSingleScannedTrade(idx, 'price', Number(e.target.value))} className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white transition-all" placeholder="0.00" /></td>
                                                <td className="px-2 py-2"><input type="number" step="any" value={t.commission || ''} onChange={(e) => updateSingleScannedTrade(idx, 'commission', Number(e.target.value))} className="w-full bg-transparent text-[10px] text-slate-500 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white placeholder-slate-300" placeholder="0" /></td>
                                                <td className="px-2 py-2"><input type="number" step="any" value={t.tax || ''} onChange={(e) => updateSingleScannedTrade(idx, 'tax', Number(e.target.value))} className="w-full bg-transparent text-[10px] text-slate-500 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white placeholder-slate-300" placeholder="0" /></td>
                                                <td className="px-2 py-2"><input type="number" step="any" value={t.cdcCharges || ''} onChange={(e) => updateSingleScannedTrade(idx, 'cdcCharges', Number(e.target.value))} className="w-full bg-transparent text-[10px] text-slate-500 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white placeholder-slate-300" placeholder="0" /></td>
                                                <td className="px-2 py-2"><input type="number" step="any" value={t.otherFees || ''} onChange={(e) => updateSingleScannedTrade(idx, 'otherFees', Number(e.target.value))} className="w-full bg-transparent text-[10px] text-slate-500 outline-none border-b border-transparent focus:border-indigo-400 focus:bg-white placeholder-slate-300" placeholder="0" /></td>
                                                <td className="px-3 py-2 text-center"><button onClick={() => handleAcceptTrade(t)} className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg transition-all shadow-sm" title="Add Transaction"> <Plus size={14} strokeWidth={3} /> </button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
