import React, { useState, useEffect } from 'react';
import { Transaction, ParsedTrade, Broker } from '../types';
import { X, Plus, ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { parseTradeDocumentOCRSpace } from '../services/ocrSpace';

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  isOpen: boolean;
  onClose: () => void;
  existingTransactions?: Transaction[];
  editingTransaction?: Transaction | null;
  brokers?: Broker[]; 
}

const DEFAULT_CDC_RATE = 0.005; 
const DEFAULT_WHT_RATE = 0.15; 

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onAddTransaction, 
  onUpdateTransaction, 
  isOpen, 
  onClose, 
  editingTransaction,
  brokers = []
}) => {
  const [mode, setMode] = useState<'MANUAL' | 'SCAN'>('MANUAL');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND'>('BUY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  
  const [commission, setCommission] = useState<number | ''>('');
  const [tax, setTax] = useState<number | ''>('');
  const [cdcCharges, setCdcCharges] = useState<number | ''>('');
  const [isAutoCalc, setIsAutoCalc] = useState(true);

  const [scanFiles, setScanFiles] = useState<FileList | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  
  // Auto-Select Default Broker
  useEffect(() => {
    if (brokers.length > 0 && !selectedBrokerId) {
        const def = brokers.find(b => b.isDefault) || brokers[0];
        if (def) setSelectedBrokerId(def.id);
    }
  }, [brokers, selectedBrokerId]);

  // Reset/Load
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
            setIsAutoCalc(false);

            if (editingTransaction.brokerId) {
                setSelectedBrokerId(editingTransaction.brokerId);
            } else if (editingTransaction.broker) {
                const match = brokers.find(b => b.name === editingTransaction.broker);
                if (match) setSelectedBrokerId(match.id);
            }
        } else {
            // Reset
            setTicker(''); setQuantity(''); setPrice('');
            setCommission(''); setTax(''); setCdcCharges('');
            setMode('MANUAL'); setIsAutoCalc(true);
            setDate(new Date().toISOString().split('T')[0]);
        }
    }
  }, [isOpen, editingTransaction, brokers]);

  // Calculation Logic
  useEffect(() => {
    if (!isAutoCalc) return;
    const qty = Number(quantity);
    const prc = Number(price);

    if (type === 'DIVIDEND') {
        if (qty && prc) {
            const totalDiv = qty * prc;
            setTax(parseFloat((totalDiv * DEFAULT_WHT_RATE).toFixed(2))); 
            setCommission(0); setCdcCharges(0);
        }
        return;
    }

    if (qty && prc && selectedBrokerId && brokers.length > 0) {
        const broker = brokers.find(b => b.id === selectedBrokerId);
        if (!broker) return;

        const val = qty * prc;
        let finalComm = 0;

        switch (broker.commissionType) {
            case 'PERCENTAGE': finalComm = val * (broker.rate1 / 100); break;
            case 'PER_SHARE': finalComm = qty * broker.rate1; break;
            case 'HIGHER_OF': 
                const commPct = val * (broker.rate1 / 100);
                const commShare = qty * (broker.rate2 || 0);
                finalComm = Math.max(commPct, commShare);
                break;
            case 'FIXED': finalComm = broker.rate1; break;
        }

        const sst = finalComm * (broker.sstRate / 100);
        const cdc = qty * DEFAULT_CDC_RATE;

        setCommission(parseFloat(finalComm.toFixed(2)));
        setTax(parseFloat(sst.toFixed(2)));
        setCdcCharges(parseFloat(cdc.toFixed(2)));
    }
  }, [quantity, price, selectedBrokerId, type, isAutoCalc, brokers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !quantity || !price) return;
    
    let brokerName = undefined;
    if (type !== 'DIVIDEND') {
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
      cdcCharges: Number(cdcCharges) || 0
    };

    if (editingTransaction && onUpdateTransaction) {
      onUpdateTransaction({ ...editingTransaction, ...txData });
    } else {
      onAddTransaction(txData);
    }
    onClose();
  };

  const handleScan = async () => {
    if (!scanFiles || scanFiles.length === 0) return;
    setIsScanning(true);
    setScanError('');
    
    try {
        // Logic for scanning would go here (omitted for brevity as requested focus is on Broker UI)
        // In real app, you'd call parseTradeDocumentOCRSpace here
        alert("Scanner requires API implementation.");
    } catch (err: any) {
        setScanError(err.message);
    } finally {
        setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">
            {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {!editingTransaction && (
                <div className="flex border-b border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'MANUAL' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Manual Entry</button>
                    <button onClick={() => setMode('SCAN')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'SCAN' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Scan Document</button>
                </div>
            )}
            
            {mode === 'MANUAL' ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {(['BUY', 'SELL', 'DIVIDEND'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setType(t)} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === t ? (t === 'BUY' ? 'bg-emerald-500 text-white shadow' : t === 'SELL' ? 'bg-rose-500 text-white shadow' : 'bg-indigo-500 text-white shadow') : 'text-slate-500 hover:text-slate-800'}`}>
                                {t}
                            </button>
                        ))}
                    </div>

                    {type !== 'DIVIDEND' && (
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Broker</label>
                            </div>
                            <div className="relative">
                                <select value={selectedBrokerId} onChange={e => setSelectedBrokerId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none appearance-none">
                                    {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                <div className="absolute right-3 top-3 pointer-events-none text-slate-400"><ChevronDown size={16} /></div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Date</label>
                            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Ticker</label>
                            <input type="text" required placeholder="e.g. OGDC" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold tracking-wide" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Quantity</label>
                            <input type="number" required min="1" value={quantity} onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{type === 'DIVIDEND' ? 'DPS (Rs)' : 'Price (Rs)'}</label>
                            <input type="number" required min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono" />
                        </div>
                    </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase">Charges</span>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-slate-500 cursor-pointer select-none">Auto-Calc</label>
                                <input type="checkbox" checked={isAutoCalc} onChange={e => setIsAutoCalc(e.target.checked)} className="accent-emerald-500 w-3 h-3 cursor-pointer" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {type !== 'DIVIDEND' && (
                            <>
                                <div>
                                    <label className="block text-[10px] text-slate-500 mb-1">Comm</label>
                                    <input type="number" step="0.01" value={commission} readOnly={isAutoCalc} onChange={e => setCommission(e.target.value ? Number(e.target.value) : '')} className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`} />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-slate-500 mb-1">CDC</label>
                                    <input type="number" step="0.01" value={cdcCharges} readOnly={isAutoCalc} onChange={e => setCdcCharges(e.target.value ? Number(e.target.value) : '')} className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`} />
                                </div>
                            </>
                            )}
                            <div className={type === 'DIVIDEND' ? 'col-span-3' : ''}>
                                <label className="block text-[10px] text-slate-500 mb-1">{type === 'DIVIDEND' ? 'W.H. Tax (15%)' : 'Tax (SST/FED)'}</label>
                                <input type="number" step="0.01" value={tax} readOnly={isAutoCalc} onChange={e => setTax(e.target.value ? Number(e.target.value) : '')} className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`} />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 ${editingTransaction ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : type === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : type === 'SELL' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'}`}>
                        {editingTransaction ? <RefreshCw size={20} /> : <Plus size={20} />}
                        {editingTransaction ? 'Update Transaction' : `Add ${type}`}
                    </button>
                </form>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <p>Scanner feature requires OCR API setup.</p>
                    {isScanning && <Loader2 className="animate-spin mt-2" />}
                    {scanError && <p className="text-rose-500 text-sm mt-2">{scanError}</p>}
                    <button onClick={() => setMode('MANUAL')} className="text-emerald-600 underline mt-2">Go Back</button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
