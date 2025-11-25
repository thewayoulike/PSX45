import React, { useState, useEffect } from 'react';
import { Transaction, Broker, ParsedTrade } from '../types';
import { X, Plus, ChevronDown, RefreshCw, Loader2, Save, Trash2, Check, Briefcase, AlertCircle } from 'lucide-react';
import { parseTradeDocumentOCRSpace } from '../services/ocrSpace';

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

const DEFAULT_CDC_RATE = 0.005; 
const DEFAULT_WHT_RATE = 0.15; 

export const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onAddTransaction, 
  onUpdateTransaction,
  onManageBrokers,
  isOpen, 
  onClose, 
  editingTransaction,
  brokers = []
}) => {
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

  // --- HELPER: Fee Calculation Logic ---
  const calculateFees = (broker: Broker | undefined, qty: number, prc: number, txType: string) => {
      // Dividend Logic
      if (txType === 'DIVIDEND') {
          const totalDiv = qty * prc;
          return {
              comm: 0,
              cdc: 0,
              tax: parseFloat((totalDiv * DEFAULT_WHT_RATE).toFixed(2))
          };
      }

      // If no broker, return 0 fees
      if (!broker) return { comm: 0, tax: 0, cdc: 0 };

      const val = qty * prc;
      let finalComm = 0;

      // Broker Commission Logic
      switch (broker.commissionType) {
          case 'PERCENTAGE': 
              finalComm = val * (broker.rate1 / 100); 
              break;
          case 'PER_SHARE': 
              finalComm = qty * broker.rate1; 
              break;
          case 'HIGHER_OF': 
              const commPct = val * (broker.rate1 / 100);
              const commShare = qty * (broker.rate2 || 0);
              finalComm = Math.max(commPct, commShare);
              break;
          case 'FIXED': 
              finalComm = broker.rate1; 
              break;
      }

      const sst = finalComm * (broker.sstRate / 100);
      const cdc = qty * DEFAULT_CDC_RATE;

      return {
          comm: parseFloat(finalComm.toFixed(2)),
          tax: parseFloat(sst.toFixed(2)),
          cdc: parseFloat(cdc.toFixed(2))
      };
  };

  // Auto-Select Default Broker (Manual Form)
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

  // --- AUTO CALC (Manual Form) ---
  useEffect(() => {
    if (!isAutoCalc) return;
    const qty = Number(quantity);
    const prc = Number(price);
    const broker = brokers.find(b => b.id === selectedBrokerId);

    if (qty && prc) {
        const { comm, tax, cdc } = calculateFees(broker, qty, prc, type);
        setCommission(comm);
        setTax(tax);
        setCdcCharges(cdc);
    }
  }, [quantity, price, selectedBrokerId, type, isAutoCalc, brokers]);


  // --- MANUAL SUBMIT ---
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

  // --- SCANNER LOGIC ---
  const handleScan = async () => {
    if (!scanFiles || scanFiles.length === 0) return;
    setIsScanning(true);
    setScanError('');
    setScannedTrades([]);
    
    try {
        const result = await parseTradeDocumentOCRSpace(scanFiles[0]);
        if (result.trades.length > 0) {
            // Try to match brokers automatically
            const processed = result.trades.map(t => {
                const matched = brokers.find(b => 
                    b.name.toLowerCase().includes((t.broker || '').toLowerCase()) ||
                    (t.broker || '').toLowerCase().includes(b.name.toLowerCase())
                );
                return { ...t, brokerId: matched ? matched.id : undefined };
            });
            setScannedTrades(processed);
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
  
  // Update a field in the row
  const updateScannedTrade = (index: number, field: string, value: any) => {
      const updatedTrades = [...scannedTrades];
      // @ts-ignore
      updatedTrades[index] = { ...updatedTrades[index], [field]: value };
      
      // Auto-Calc Fees if Qty or Price changed and a Broker is selected
      const trade = updatedTrades[index];
      // @ts-ignore
      const brokerId = trade.brokerId;
      
      if (brokerId && (field === 'quantity' || field === 'price')) {
         const broker = brokers.find(b => b.id === brokerId);
         const { comm, tax, cdc } = calculateFees(broker, Number(trade.quantity), Number(trade.price), trade.type);
         updatedTrades[index].commission = comm;
         updatedTrades[index].tax = tax;
         updatedTrades[index].cdcCharges = cdc;
      }
      
      setScannedTrades(updatedTrades);
  };

  // Update Broker -> Recalculate Fees
  const handleBrokerSelectChange = (index: number, value: string) => {
      if (value === 'ADD_NEW') {
          if (onManageBrokers) onManageBrokers();
          return;
      }

      const updatedTrades = [...scannedTrades];
      // @ts-ignore
      updatedTrades[index] = { ...updatedTrades[index], brokerId: value };
      
      // Calculate Fees for this row
      const trade = updatedTrades[index];
      const broker = brokers.find(b => b.id === value);
      
      if (broker && trade.quantity && trade.price) {
          const { comm, tax, cdc } = calculateFees(broker, Number(trade.quantity), Number(trade.price), trade.type);
          updatedTrades[index].commission = comm;
          updatedTrades[index].tax = tax;
          updatedTrades[index].cdcCharges = cdc;
      }

      setScannedTrades(updatedTrades);
  };

  const saveTrade = (t: ParsedTrade & { brokerId?: string }) => {
      let brokerName = t.broker;
      let brokerId = t.brokerId;

      if (brokerId) {
          const b = brokers.find(br => br.id === brokerId);
          if (b) brokerName = b.name;
      }

      onAddTransaction({
          ticker: t.ticker.toUpperCase(),
          type: t.type === 'SELL' ? 'SELL' : 'BUY',
          quantity: Number(t.quantity),
          price: Number(t.price),
          date: t.date || new Date().toISOString().split('T')[0],
          commission: Number(t.commission) || 0,
          tax: Number(t.tax) || 0,
          cdcCharges: Number(t.cdcCharges) || 0,
          broker: brokerName,
          brokerId: brokerId
      });
  };

  const addSingleScannedTrade = (index: number) => {
      const t = scannedTrades[index];
      if (!t.ticker || !t.quantity || !t.price) return;
      saveTrade(t as any);
      setScannedTrades(prev => prev.filter((_, i) => i !== index));
      if (scannedTrades.length === 1) onClose(); 
  };

  const addAllScannedTrades = () => {
      scannedTrades.forEach(t => {
          if (t.ticker && t.quantity && t.price) saveTrade(t as any);
      });
      setScannedTrades([]);
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${scannedTrades.length > 0 ? 'max-w-[90vw]' : 'max-w-lg'}`}>
        
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
            {/* TABS */}
            {!editingTransaction && scannedTrades.length === 0 && (
                <div className="flex border-b border-slate-200 mb-6">
                    <button onClick={() => setMode('MANUAL')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'MANUAL' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Manual Entry</button>
                    <button onClick={() => setMode('SCAN')} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'SCAN' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}>Scan Document</button>
                </div>
            )}
            
            {/* MANUAL FORM */}
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
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Price</label>
                            <input type="number" required min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value ? Number(e.target.value) : '')} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono" />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all">
                        {editingTransaction ? 'Update' : 'Save Transaction'}
                    </button>
                </form>
            )}

            {/* SCANNER UPLOAD */}
            {mode === 'SCAN' && scannedTrades.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center w-full hover:bg-slate-50 transition-colors cursor-pointer relative">
                        <input type="file" accept="image/*,.pdf" onChange={(e) => setScanFiles(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <span className="font-bold text-lg text-slate-500">Click to Upload</span>
                    </div>
                    {scanError && <p className="text-rose-500 text-sm">{scanError}</p>}
                    <button onClick={handleScan} disabled={!scanFiles || isScanning} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center">
                         {isScanning && <Loader2 className="animate-spin mr-2" size={18}/>} Process Document
                    </button>
                </div>
            )}

            {/* BULK REVIEW TABLE */}
            {scannedTrades.length > 0 && (
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-sm text-slate-500">Found <b>{scannedTrades.length}</b> trades.</div>
                        <div className="flex gap-2">
                             <button onClick={() => setScannedTrades([])} className="text-xs text-rose-500 hover:text-rose-700 font-bold px-3 py-1">Discard</button>
                             <button onClick={addAllScannedTrades} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1">
                                <Save size={14} /> Add All
                             </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-3 w-32">Ticker</th>
                                    <th className="px-3 py-3 w-20">Type</th>
                                    <th className="px-3 py-3 w-20">Qty</th>
                                    <th className="px-3 py-3 w-20">Price</th>
                                    <th className="px-3 py-3 w-16">Comm</th>
                                    <th className="px-3 py-3 w-16">Tax</th>
                                    <th className="px-3 py-3 w-16">CDC</th>
                                    <th className="px-3 py-3 w-56">Broker</th>
                                    <th className="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {scannedTrades.map((trade, idx) => {
                                    // @ts-ignore
                                    const brokerId = trade.brokerId;
                                    const hasBroker = !!brokerId;
                                    
                                    return (
                                    <tr key={idx} className="hover:bg-slate-50 group">
                                        <td className="p-2">
                                            <input 
                                                type="text" 
                                                value={trade.ticker} 
                                                onChange={(e) => updateScannedTrade(idx, 'ticker', e.target.value.toUpperCase())} 
                                                className="w-full font-bold bg-white border border-slate-200 rounded px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <select value={trade.type} onChange={(e) => updateScannedTrade(idx, 'type', e.target.value)} className="bg-transparent font-bold outline-none">
                                                <option value="BUY">BUY</option><option value="SELL">SELL</option>
                                            </select>
                                        </td>
                                        <td className="p-2"><input type="number" value={trade.quantity} onChange={(e) => updateScannedTrade(idx, 'quantity', Number(e.target.value))} className="w-full bg-transparent outline-none" /></td>
                                        <td className="p-2"><input type="number" value={trade.price} onChange={(e) => updateScannedTrade(idx, 'price', Number(e.target.value))} className="w-full bg-transparent outline-none" /></td>
                                        
                                        {/* FEES */}
                                        <td className="p-2"><input type="number" step="0.01" value={trade.commission || 0} onChange={(e) => updateScannedTrade(idx, 'commission', Number(e.target.value))} className="w-full text-slate-500 bg-transparent outline-none" /></td>
                                        <td className="p-2"><input type="number" step="0.01" value={trade.tax || 0} onChange={(e) => updateScannedTrade(idx, 'tax', Number(e.target.value))} className="w-full text-slate-500 bg-transparent outline-none" /></td>
                                        <td className="p-2"><input type="number" step="0.01" value={trade.cdcCharges || 0} onChange={(e) => updateScannedTrade(idx, 'cdcCharges', Number(e.target.value))} className="w-full text-slate-500 bg-transparent outline-none" /></td>

                                        {/* BROKER COLUMN */}
                                        <td className="p-2">
                                            <div className="flex items-center gap-1">
                                                <select 
                                                    value={brokerId || ''} 
                                                    onChange={(e) => handleBrokerSelectChange(idx, e.target.value)} 
                                                    className={`w-full bg-transparent outline-none text-xs ${!hasBroker ? 'text-rose-500 font-bold' : ''}`}
                                                >
                                                    <option value="">Select Broker...</option>
                                                    {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                    {/* Fallback option, though we have a better button now */}
                                                    <option value="ADD_NEW">+ Add New Broker</option>
                                                </select>
                                                
                                                {/* Explicit ADD BUTTON to ensure it works */}
                                                <button 
                                                    type="button" 
                                                    onClick={onManageBrokers} 
                                                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 border border-emerald-200"
                                                    title="Create New Broker"
                                                >
                                                    <Plus size={14} />
                                                </button>

                                                {!hasBroker && trade.broker && <div className="hidden text-[10px] text-slate-400">Scanned: {trade.broker}</div>}
                                            </div>
                                        </td>

                                        <td className="p-2 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => addSingleScannedTrade(idx)} className="p-1.5 bg-emerald-100 text-emerald-600 rounded"><Check size={14} /></button>
                                                <button onClick={() => setScannedTrades(p => p.filter((_, i) => i !== idx))} className="p-1.5 bg-rose-50 text-rose-500 rounded"><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )})}
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
