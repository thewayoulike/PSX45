import React, { useState, useEffect } from 'react';
import { Transaction, Broker, ParsedTrade } from '../types';
import { X, Plus, ChevronDown, RefreshCw, Loader2, Save, Trash2, Check, ArrowRight } from 'lucide-react';
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
  // Mode State
  const [mode, setMode] = useState<'MANUAL' | 'SCAN'>('MANUAL');
  
  // --- MANUAL FORM STATE ---
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

  // --- SCANNER STATE ---
  const [scanFiles, setScanFiles] = useState<FileList | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedTrades, setScannedTrades] = useState<ParsedTrade[]>([]);

  // Auto-Select Default Broker
  useEffect(() => {
    if (brokers.length > 0 && !selectedBrokerId) {
        const def = brokers.find(b => b.isDefault) || brokers[0];
        if (def) setSelectedBrokerId(def.id);
    }
  }, [brokers, selectedBrokerId]);

  // Reset/Load on Open
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
            // Reset All
            resetManualForm();
            setScanFiles(null);
            setScanError('');
            setScannedTrades([]);
        }
    }
  }, [isOpen, editingTransaction, brokers]);

  const resetManualForm = () => {
      setTicker(''); setQuantity(''); setPrice('');
      setCommission(''); setTax(''); setCdcCharges('');
      setMode('MANUAL'); setIsAutoCalc(true);
      setDate(new Date().toISOString().split('T')[0]);
  };

  // --- AUTO CALCULATION (Manual Mode) ---
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

  // --- ACTIONS ---

  const handleManualSubmit = (e: React.FormEvent) => {
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
    setScannedTrades([]);
    
    try {
        const result = await parseTradeDocumentOCRSpace(scanFiles[0]);
        if (result.trades.length > 0) {
            setScannedTrades(result.trades);
        } else {
            setScanError("No valid trades found in document.");
        }
    } catch (err: any) {
        setScanError(err.message || "Failed to scan document");
    } finally {
        setIsScanning(false);
    }
  };

  // --- BULK REVIEW ACTIONS ---

  const updateScannedTrade = (index: number, field: keyof ParsedTrade, value: any) => {
      const updated = [...scannedTrades];
      updated[index] = { ...updated[index], [field]: value };
      setScannedTrades(updated);
  };

  const addSingleScannedTrade = (index: number) => {
      const t = scannedTrades[index];
      if (!t.ticker || !t.quantity || !t.price) return;

      onAddTransaction({
          ticker: t.ticker.toUpperCase(),
          type: t.type === 'SELL' ? 'SELL' : 'BUY', // Safe cast
          quantity: Number(t.quantity),
          price: Number(t.price),
          date: t.date || new Date().toISOString().split('T')[0],
          commission: Number(t.commission) || 0,
          tax: Number(t.tax) || 0,
          cdcCharges: Number(t.cdcCharges) || 0,
          broker: t.broker || 'Scanned',
      });

      // Remove from list
      setScannedTrades(prev => prev.filter((_, i) => i !== index));
      if (scannedTrades.length === 1) {
          onClose(); // Close if last one
      }
  };

  const addAllScannedTrades = () => {
      scannedTrades.forEach(t => {
          if (t.ticker && t.quantity && t.price) {
            onAddTransaction({
                ticker: t.ticker.toUpperCase(),
                type: t.type === 'SELL' ? 'SELL' : 'BUY',
                quantity: Number(t.quantity),
                price: Number(t.price),
                date: t.date || new Date().toISOString().split('T')[0],
                commission: Number(t.commission) || 0,
                tax: Number(t.tax) || 0,
                cdcCharges: Number(t.cdcCharges) || 0,
                broker: t.broker || 'Scanned',
            });
          }
      });
      setScannedTrades([]);
      onClose();
  };

  const removeScannedTrade = (index: number) => {
      setScannedTrades(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${scannedTrades.length > 0 ? 'max-w-5xl' : 'max-w-lg'}`}>
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">
            {scannedTrades.length > 0 ? 'Review Scanned Trades' : (editingTransaction ? 'Edit Transaction' : 'Add Transaction')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {/* TABS (Only show if not editing and no scan results yet) */}
            {!editingTransaction && scannedTrades.length === 0 && (
                <div className="flex border-b border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'MANUAL' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Manual Entry</button>
                    <button onClick={() => setMode('SCAN')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'SCAN' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Scan Document</button>
                </div>
            )}
            
            {/* --- VIEW 1: MANUAL FORM --- */}
            {mode === 'MANUAL' && (
                <form onSubmit={handleManualSubmit} className="space-y-5">
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
            )}

            {/* --- VIEW 2: SCANNER UPLOAD (If no trades yet) --- */}
            {mode === 'SCAN' && scannedTrades.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center w-full hover:bg-slate-50 transition-colors cursor-pointer relative">
                        <input 
                            type="file" 
                            accept="image/*,.pdf"
                            onChange={(e) => setScanFiles(e.target.files)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center text-slate-500">
                            {scanFiles && scanFiles.length > 0 ? (
                                <span className="font-bold text-emerald-600">{scanFiles[0].name}</span>
                            ) : (
                                <>
                                    <span className="font-bold text-lg mb-1">Click to Upload</span>
                                    <span className="text-xs">Supports Images & PDF</span>
                                </>
                            )}
                        </div>
                    </div>

                    {scanError && (
                        <div className="text-rose-500 text-xs bg-rose-50 p-2 rounded w-full text-center border border-rose-100">
                            {scanError}
                        </div>
                    )}

                    <button 
                        onClick={handleScan}
                        disabled={!scanFiles || isScanning}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {isScanning ? <Loader2 className="animate-spin" /> : 'Process Document'}
                    </button>
                    
                    <button onClick={() => setMode('MANUAL')} className="text-slate-400 hover:text-slate-600 text-sm">
                        Cancel
                    </button>
                </div>
            )}

            {/* --- VIEW 3: BULK REVIEW TABLE --- */}
            {scannedTrades.length > 0 && (
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-sm text-slate-500">
                            Found <b>{scannedTrades.length}</b> trades. Review and verify fees before adding.
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => setScannedTrades([])} className="text-xs text-rose-500 hover:text-rose-700 font-bold px-3 py-1">Discard All</button>
                             <button onClick={addAllScannedTrades} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm">
                                <Save size={14} /> Add All
                             </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Ticker</th>
                                    <th className="px-3 py-2 w-20">Qty</th>
                                    <th className="px-3 py-2 w-20">Price</th>
                                    <th className="px-3 py-2 w-16 text-slate-400">Comm</th>
                                    <th className="px-3 py-2 w-16 text-slate-400">Tax</th>
                                    <th className="px-3 py-2 w-16 text-slate-400">CDC</th>
                                    <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {scannedTrades.map((trade, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 group">
                                        <td className="p-2">
                                            <input type="date" value={trade.date || ''} onChange={(e) => updateScannedTrade(idx, 'date', e.target.value)} className="w-24 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <select value={trade.type} onChange={(e) => updateScannedTrade(idx, 'type', e.target.value)} className={`bg-transparent font-bold outline-none ${trade.type === 'BUY' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                <option value="BUY">BUY</option>
                                                <option value="SELL">SELL</option>
                                            </select>
                                        </td>
                                        <td className="p-2">
                                            <input type="text" value={trade.ticker} onChange={(e) => updateScannedTrade(idx, 'ticker', e.target.value.toUpperCase())} className="w-16 font-bold text-slate-700 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" value={trade.quantity} onChange={(e) => updateScannedTrade(idx, 'quantity', Number(e.target.value))} className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" step="0.01" value={trade.price} onChange={(e) => updateScannedTrade(idx, 'price', Number(e.target.value))} className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        
                                        {/* Fees Columns */}
                                        <td className="p-2">
                                            <input type="number" step="0.01" value={trade.commission || 0} onChange={(e) => updateScannedTrade(idx, 'commission', Number(e.target.value))} className="w-full text-slate-500 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" step="0.01" value={trade.tax || 0} onChange={(e) => updateScannedTrade(idx, 'tax', Number(e.target.value))} className="w-full text-slate-500 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" step="0.01" value={trade.cdcCharges || 0} onChange={(e) => updateScannedTrade(idx, 'cdcCharges', Number(e.target.value))} className="w-full text-slate-500 bg-transparent border-b border-transparent focus:border-indigo-400 outline-none" />
                                        </td>

                                        <td className="p-2 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => addSingleScannedTrade(idx)} className="p-1.5 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200" title="Add this trade">
                                                    <Check size={14} />
                                                </button>
                                                <button onClick={() => removeScannedTrade(idx)} className="p-1.5 bg-rose-50 text-rose-500 rounded hover:bg-rose-100" title="Remove">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
