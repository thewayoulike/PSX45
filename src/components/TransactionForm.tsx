import React, { useState, useEffect } from 'react';
import { Transaction, Broker, ParsedTrade } from '../types';
import { X, Plus, ChevronDown, Loader2, Save, Trash2, Check, Briefcase, Sparkles, ScanText, Keyboard, FileText } from 'lucide-react';
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
  const [mode, setMode] = useState<'MANUAL' | 'AI_SCAN' | 'OCR_SCAN'>('MANUAL');
  
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'TAX'>('BUY'); // Updated Type
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

  // ... (Scanner State and Fee Calculation Logic - SAME AS BEFORE)
  // ...

  // Auto-Select Default Broker
  useEffect(() => {
    if (brokers.length > 0) {
        const def = brokers.find(b => b.isDefault) || brokers[0];
        if (!selectedBrokerId) setSelectedBrokerId(def.id);
    }
  }, [brokers, selectedBrokerId]);

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
            setTicker(''); setQuantity(''); setPrice(''); setCommission(''); setTax(''); setCdcCharges(''); setOtherFees('');
            setMode('MANUAL'); setIsAutoCalc(true); setDate(new Date().toISOString().split('T')[0]);
        }
    }
  }, [isOpen, editingTransaction, brokers]);

  // ... (Manual Calculation Effect - SAME AS BEFORE)
  // ...

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

  // ... (Handle Scan logic - SAME AS BEFORE)
  // ...

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all duration-300 ${/*scannedTrades check*/ 'max-w-lg'}`}>
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">
             {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {/* MANUAL FORM */}
            <form onSubmit={handleManualSubmit} className="space-y-5">
                <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {(['BUY', 'SELL', 'DIVIDEND', 'TAX'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setType(t)} className={`py-2 rounded-lg text-xs font-bold transition-all ${type === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                {/* ... rest of form (Date, Ticker, etc) ... */}
                {/* This part is standard, just ensuring TAX type is supported in the button grid above */}
                
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border rounded-lg p-2"/></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Ticker</label><input type="text" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full border rounded-lg p-2 font-bold"/></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Qty</label><input type="number" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="w-full border rounded-lg p-2"/></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Price</label><input type="number" value={price} onChange={e=>setPrice(Number(e.target.value))} className="w-full border rounded-lg p-2"/></div>
                </div>
                 <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl">Save</button>
            </form>
        </div>
      </div>
    </div>
  );
};
