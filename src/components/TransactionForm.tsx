import React, { useState, useEffect } from 'react';
import { Transaction, ParsedTrade } from '../types';
import { X, Plus, Check, Upload, FileText, Loader2, Trash2, AlertCircle, ChevronDown, ChevronUp, Pencil, Save } from 'lucide-react';
import { parseTradeDocumentOCRSpace } from '../services/ocrSpace';

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'portfolioId'>) => void;
  isOpen: boolean;
  onClose: () => void;
  existingTransactions?: Transaction[];
}

const BROKERS = [
  'AKD Securities', 'Arif Habib Ltd', 'JS Global', 'KASB Securities', 'Topline Securities', 
  'BMA Capital', 'Alfalah Securities', 'Next Capital', 'Sherman Securities', 'Standard Capital'
];

const DEFAULT_COMM_RATE = 0.15; 
const MIN_COMM_PER_SHARE = 0.05; 
const SST_RATE = 0.15;
const CDC_RATE = 0.005; 
const WHT_RATE = 0.15;

export const TransactionForm: React.FC<TransactionFormProps> = ({ onAddTransaction, isOpen, onClose, existingTransactions = [] }) => {
  const [mode, setMode] = useState<'MANUAL' | 'SCAN'>('MANUAL');
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND'>('BUY');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [price, setPrice] = useState<number | ''>('');
  
  const [broker, setBroker] = useState(BROKERS[0]);
  const [commission, setCommission] = useState<number | ''>('');
  const [tax, setTax] = useState<number | ''>('');
  const [cdcCharges, setCdcCharges] = useState<number | ''>('');
  const [isAutoCalc, setIsAutoCalc] = useState(true);

  const [customBrokers, setCustomBrokers] = useState<Array<{name: string, rate: number}>>(() => {
      try {
          const saved = localStorage.getItem('psx_custom_brokers');
          return saved ? JSON.parse(saved) : [];
      } catch { return []; }
  });
  const [isAddingBroker, setIsAddingBroker] = useState(false);
  const [newBrokerName, setNewBrokerName] = useState('');
  const [newBrokerRate, setNewBrokerRate] = useState<number>(0.15);

  const [scanFiles, setScanFiles] = useState<FileList | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [parsedTrades, setParsedTrades] = useState<ParsedTrade[]>([]);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [rawDebugText, setRawDebugText] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
      localStorage.setItem('psx_custom_brokers', JSON.stringify(customBrokers));
  }, [customBrokers]);

  useEffect(() => {
    if (!isAutoCalc) return;
    const qty = Number(quantity);
    const prc = Number(price);

    if (type === 'DIVIDEND') {
        if (qty && prc) {
            const totalDiv = qty * prc;
            setTax(parseFloat((totalDiv * WHT_RATE).toFixed(2))); 
            setCommission(0);
            setCdcCharges(0);
        }
        return;
    }

    if (qty && prc) {
        const val = qty * prc;
        let commRate = DEFAULT_COMM_RATE;
        const custom = customBrokers.find(b => b.name === broker);
        if (custom) commRate = custom.rate;

        const commByVal = (val * commRate) / 100;
        const commByQty = qty * MIN_COMM_PER_SHARE;
        const finalComm = Math.max(commByVal, commByQty);
        
        const sst = finalComm * SST_RATE;
        const cdc = qty * CDC_RATE;

        setCommission(parseFloat(finalComm.toFixed(2)));
        setTax(parseFloat(sst.toFixed(2)));
        setCdcCharges(parseFloat(cdc.toFixed(2)));
    }
  }, [quantity, price, broker, type, isAutoCalc, customBrokers]);

  const handleAddBroker = () => {
      if (newBrokerName && !BROKERS.includes(newBrokerName)) {
          setCustomBrokers([...customBrokers, { name: newBrokerName, rate: newBrokerRate }]);
          setBroker(newBrokerName);
          setIsAddingBroker(false);
          setNewBrokerName('');
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !quantity || !price) return;

    onAddTransaction({
      ticker: ticker.toUpperCase(),
      type,
      quantity: Number(quantity),
      price: Number(price),
      date,
      broker: type === 'DIVIDEND' ? undefined : broker,
      commission: Number(commission) || 0,
      tax: Number(tax) || 0,
      cdcCharges: Number(cdcCharges) || 0
    });

    resetForm();
    onClose();
  };

  const resetForm = () => {
      setTicker('');
      setQuantity('');
      setPrice('');
      setCommission('');
      setTax('');
      setCdcCharges('');
      setParsedTrades([]);
      setScanFiles(null);
      setMode('MANUAL');
      setRawDebugText('');
      setShowDebug(false);
      setEditingRow(null);
  };

  const handleScan = async () => {
    if (!scanFiles || scanFiles.length === 0) return;
    setIsScanning(true);
    setScanError('');
    setParsedTrades([]);
    setRawDebugText('');
    setEditingRow(null);
    
    const allTrades: ParsedTrade[] = [];
    let combinedText = '';

    try {
        for (let i = 0; i < scanFiles.length; i++) {
            const file = scanFiles[i];
            try {
                const result = await parseTradeDocumentOCRSpace(file);
                allTrades.push(...result.trades);
                combinedText += `--- File ${i+1} ---\n${result.text}\n\n`;
            } catch (fileErr: any) {
                 if (fileErr.message && fileErr.message.includes('Quota')) throw fileErr; 
                 combinedText += `--- File ${i+1} Error ---\n${fileErr.message}\n\n`;
            }
        }

        if (allTrades.length === 0) {
            setScanError("No valid trades found. Check image clarity and raw text.");
            setRawDebugText(combinedText);
            setShowDebug(true);
        } else {
            setParsedTrades(allTrades);
        }
    } catch (err: any) {
        const msg = err.message || "Scanning failed.";
        setScanError(msg);
    } finally {
        setIsScanning(false);
    }
  };

  const handleUpdateParsed = (index: number, updated: ParsedTrade) => {
      const newList = [...parsedTrades];
      newList[index] = updated;
      setParsedTrades(newList);
      setEditingRow(null);
  };

  const handleImportAll = () => {
      let imported = 0;
      let skipped = 0;

      parsedTrades.forEach(trade => {
          const qty = trade.quantity;
          const prc = trade.price;
          const val = qty * prc;
          let commRate = DEFAULT_COMM_RATE;
          const custom = customBrokers.find(b => b.name === broker);
          if (custom) commRate = custom.rate;
          const commByVal = (val * commRate) / 100;
          const commByQty = qty * MIN_COMM_PER_SHARE;
          const finalComm = Math.max(commByVal, commByQty);

          const fees = {
              commission: trade.commission !== undefined ? trade.commission : parseFloat(finalComm.toFixed(2)),
              tax: trade.tax !== undefined ? trade.tax : parseFloat((finalComm * SST_RATE).toFixed(2)),
              cdcCharges: trade.cdcCharges !== undefined ? trade.cdcCharges : parseFloat((qty * CDC_RATE).toFixed(2))
          };

          const isDup = checkDuplicate({
              ticker: trade.ticker,
              type: trade.type,
              quantity: trade.quantity,
              price: trade.price,
              date: trade.date || date
          });

          if (!isDup) {
              onAddTransaction({
                  ticker: trade.ticker,
                  type: trade.type,
                  quantity: trade.quantity,
                  price: trade.price,
                  date: trade.date || date,
                  broker: broker,
                  ...fees
              });
              imported++;
          } else {
              skipped++;
          }
      });

      alert(`Imported ${imported} trades.${skipped > 0 ? ` Skipped ${skipped} duplicates.` : ''}`);
      resetForm();
      onClose();
  };

  const handleRemoveParsed = (idx: number) => {
      setParsedTrades(prev => prev.filter((_, i) => i !== idx));
  };

  const checkDuplicate = (t: { ticker: string, type: string, quantity: number, price: number, date?: string }) => {
      return existingTransactions.some(ex => 
          ex.ticker === t.ticker &&
          ex.type === t.type &&
          Math.abs(ex.quantity - t.quantity) < 0.01 &&
          Math.abs(ex.price - t.price) < 0.01 &&
          (!t.date || ex.date === t.date)
      );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">Add Transaction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
            <button 
                onClick={() => setMode('MANUAL')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'MANUAL' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}
            >
                Manual Entry
            </button>
            <button 
                onClick={() => setMode('SCAN')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'SCAN' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30' : 'text-slate-500 hover:text-slate-800'}`}
            >
                Scan Document
            </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            
            {mode === 'SCAN' ? (
                <div className="space-y-6">
                    {!parsedTrades.length && (
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors relative">
                            <input 
                                type="file" 
                                multiple
                                accept="image/*,application/pdf"
                                onChange={(e) => setScanFiles(e.target.files)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-3 pointer-events-none">
                                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                                    <Upload size={24} />
                                </div>
                                <div>
                                    <p className="text-slate-800 font-semibold">Click to upload or drag files</p>
                                    <p className="text-xs text-slate-500 mt-1">Supports Screenshots & PDFs</p>
                                </div>
                                {scanFiles && (
                                    <div className="mt-2 text-xs font-mono text-emerald-700 bg-emerald-100 px-2 py-1 rounded border border-emerald-200">
                                        {scanFiles.length} file(s) selected
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {scanError && (
                        <div className="space-y-2">
                            <div className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-lg text-xs flex items-center gap-2">
                                <AlertCircle size={14} />
                                {scanError}
                            </div>
                            {rawDebugText && (
                                <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                                    <button 
                                        onClick={() => setShowDebug(!showDebug)}
                                        className="flex items-center justify-between w-full text-xs font-bold text-slate-600 hover:text-slate-900"
                                    >
                                        <span>Debug: See Raw Text</span>
                                        {showDebug ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showDebug && (
                                        <pre className="mt-2 text-[10px] font-mono text-slate-500 whitespace-pre-wrap break-all max-h-40 overflow-y-auto custom-scrollbar bg-white p-2 rounded border border-slate-200">
                                            {rawDebugText}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {!parsedTrades.length && (
                        <button 
                            onClick={handleScan}
                            disabled={!scanFiles || isScanning}
                            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                !scanFiles || isScanning 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg'
                            }`}
                        >
                            {isScanning ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                            {isScanning ? 'Processing...' : 'Scan Document'}
                        </button>
                    )}

                    {parsedTrades.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-800">Review Scanned Trades ({parsedTrades.length})</h3>
                                <button onClick={resetForm} className="text-xs text-rose-500 hover:underline">Clear All</button>
                            </div>
                            
                            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                                {parsedTrades.map((trade, idx) => {
                                    const isDup = checkDuplicate({ ...trade, date: trade.date || date });
                                    const isEditing = editingRow === idx;

                                    if (isEditing) {
                                        return (
                                            <div key={idx} className="bg-white border border-emerald-200 rounded-xl p-3 space-y-3 shadow-sm">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <select 
                                                        value={trade.type}
                                                        onChange={e => {
                                                            const newType = e.target.value as 'BUY' | 'SELL';
                                                            handleUpdateParsed(idx, { ...trade, type: newType });
                                                            setEditingRow(idx);
                                                        }}
                                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800"
                                                    >
                                                        <option value="BUY">BUY</option>
                                                        <option value="SELL">SELL</option>
                                                    </select>
                                                    <input 
                                                        type="text"
                                                        value={trade.ticker}
                                                        onChange={e => {
                                                            handleUpdateParsed(idx, { ...trade, ticker: e.target.value.toUpperCase() });
                                                            setEditingRow(idx);
                                                        }}
                                                        className="col-span-2 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 font-bold"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input 
                                                        type="number"
                                                        value={trade.quantity}
                                                        onChange={e => {
                                                            handleUpdateParsed(idx, { ...trade, quantity: Number(e.target.value) });
                                                            setEditingRow(idx);
                                                        }}
                                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800"
                                                    />
                                                    <input 
                                                        type="number"
                                                        value={trade.price}
                                                        onChange={e => {
                                                            handleUpdateParsed(idx, { ...trade, price: Number(e.target.value) });
                                                            setEditingRow(idx);
                                                        }}
                                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800"
                                                    />
                                                </div>
                                                <div className="flex justify-end">
                                                    <button onClick={() => setEditingRow(null)} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                                                        <Save size={12} /> Save
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={idx} className={`bg-slate-50 border ${isDup ? 'border-rose-200 bg-rose-50' : 'border-slate-200'} rounded-lg p-3 flex items-center justify-between group`}>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trade.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {trade.type}
                                                    </span>
                                                    <span className="text-slate-800 font-bold">{trade.ticker}</span>
                                                    {isDup && <span className="text-[9px] bg-rose-500 text-white px-1 rounded">Duplicate</span>}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    {trade.quantity.toLocaleString()} @ Rs. {trade.price}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setEditingRow(idx)} className="text-slate-400 hover:text-blue-500 p-1" title="Edit">
                                                    <Pencil size={16} />
                                                </button>
                                                <button onClick={() => handleRemoveParsed(idx)} className="text-slate-400 hover:text-rose-500 p-1" title="Remove">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <select 
                                    value={broker}
                                    onChange={e => setBroker(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm mb-4 outline-none"
                                >
                                    {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <button 
                                    onClick={handleImportAll}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2"
                                >
                                    <Check size={18} />
                                    Import All Valid
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Type Selector */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {(['BUY', 'SELL', 'DIVIDEND'] as const).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                    type === t 
                                    ? t === 'BUY' ? 'bg-emerald-500 text-white shadow' 
                                    : t === 'SELL' ? 'bg-rose-500 text-white shadow'
                                    : 'bg-indigo-500 text-white shadow'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* Date & Ticker */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Date</label>
                            <input 
                                type="date" 
                                required
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Ticker</label>
                            <input 
                                type="text" 
                                required
                                placeholder="e.g. OGDC"
                                value={ticker}
                                onChange={e => setTicker(e.target.value.toUpperCase())}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold tracking-wide"
                            />
                        </div>
                    </div>

                    {/* Broker Selection */}
                    {type !== 'DIVIDEND' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Broker</label>
                            {isAddingBroker ? (
                                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200 animate-in fade-in zoom-in-95">
                                    <input 
                                        type="text"
                                        autoFocus
                                        placeholder="Broker Name"
                                        value={newBrokerName}
                                        onChange={e => setNewBrokerName(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm"
                                    />
                                    <div className="flex gap-2 items-center">
                                        <input 
                                            type="number"
                                            placeholder="Rate %"
                                            step="0.01"
                                            value={newBrokerRate}
                                            onChange={e => setNewBrokerRate(Number(e.target.value))}
                                            className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm"
                                        />
                                        <button type="button" onClick={handleAddBroker} className="bg-emerald-600 text-white p-2 rounded-lg"><Check size={16}/></button>
                                        <button type="button" onClick={() => setIsAddingBroker(false)} className="bg-rose-500 text-white p-2 rounded-lg"><X size={16}/></button>
                                    </div>
                                </div>
                            ) : (
                                <select 
                                    value={broker}
                                    onChange={e => {
                                        if (e.target.value === 'ADD_NEW') setIsAddingBroker(true);
                                        else setBroker(e.target.value);
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                >
                                    <optgroup label="Standard">
                                        {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                                    </optgroup>
                                    {customBrokers.length > 0 && (
                                        <optgroup label="Custom">
                                            {customBrokers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                                        </optgroup>
                                    )}
                                    <option value="ADD_NEW" className="font-bold text-emerald-600">+ Add New Broker</option>
                                </select>
                            )}
                        </div>
                    )}

                    {/* Qty & Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Quantity</label>
                            <input 
                                type="number" 
                                required
                                min="1"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                                {type === 'DIVIDEND' ? 'DPS (Rs)' : 'Price (Rs)'}
                            </label>
                            <input 
                                type="number" 
                                required
                                min="0.01"
                                step="0.01"
                                value={price}
                                onChange={e => setPrice(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono"
                            />
                        </div>
                    </div>

                    {/* Charges Section */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-bold text-slate-400 uppercase">Transaction Charges</span>
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-slate-500 cursor-pointer select-none">Auto-Calc</label>
                                    <input 
                                    type="checkbox" 
                                    checked={isAutoCalc} 
                                    onChange={e => setIsAutoCalc(e.target.checked)} 
                                    className="accent-emerald-500 w-3 h-3 cursor-pointer"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3">
                                {type !== 'DIVIDEND' && (
                                <>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-1">Comm</label>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={commission}
                                            readOnly={isAutoCalc}
                                            onChange={e => setCommission(e.target.value ? Number(e.target.value) : '')}
                                            className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-1">CDC</label>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={cdcCharges}
                                            readOnly={isAutoCalc}
                                            onChange={e => setCdcCharges(e.target.value ? Number(e.target.value) : '')}
                                            className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`}
                                        />
                                    </div>
                                </>
                                )}
                                <div className={type === 'DIVIDEND' ? 'col-span-3' : ''}>
                                <label className="block text-[10px] text-slate-500 mb-1">{type === 'DIVIDEND' ? 'W.H. Tax (15%)' : 'Tax (SST/FED)'}</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={tax}
                                    readOnly={isAutoCalc}
                                    onChange={e => setTax(e.target.value ? Number(e.target.value) : '')}
                                    className={`w-full bg-transparent border-b ${isAutoCalc ? 'border-slate-200 text-slate-400' : 'border-emerald-300 text-slate-800'} py-1 text-xs font-mono outline-none`}
                                />
                                </div>
                            </div>
                    </div>
                    
                    <button 
                        type="submit"
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 ${
                            type === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : 
                            type === 'SELL' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' :
                            'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                        }`}
                    >
                        <Plus size={20} />
                        Add {type}
                    </button>
                </form>
            )}
        </div>
      </div>
    </div>
  );
}; 
