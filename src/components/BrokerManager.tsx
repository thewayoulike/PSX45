import React, { useState } from 'react';
import { Broker, CommissionType } from '../types';
import { X, Plus, Pencil, Trash2, Save, AlertCircle } from 'lucide-react';

interface BrokerManagerProps {
  isOpen: boolean;
  onClose: () => void;
  brokers: Broker[];
  onAddBroker: (broker: Omit<Broker, 'id'>) => void;
  onUpdateBroker: (broker: Broker) => void;
  onDeleteBroker: (id: string) => void;
}

export const BrokerManager: React.FC<BrokerManagerProps> = ({
  isOpen, onClose, brokers, onAddBroker, onUpdateBroker, onDeleteBroker
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [commType, setCommType] = useState<CommissionType>('HIGHER_OF');
  const [rate1, setRate1] = useState<number | ''>(0.15);
  const [rate2, setRate2] = useState<number | ''>(0.05);
  const [sstRate, setSstRate] = useState<number | ''>(15);

  // Pre-fill form for editing
  const handleEdit = (b: Broker) => {
    setEditingId(b.id);
    setName(b.name);
    setCommType(b.commissionType);
    setRate1(b.rate1);
    setRate2(b.rate2 || '');
    setSstRate(b.sstRate);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setRate1(0.15);
    setRate2(0.05);
    setCommType('HIGHER_OF');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const brokerData = {
      name,
      commissionType: commType,
      rate1: Number(rate1),
      rate2: Number(rate2),
      sstRate: Number(sstRate)
    };

    if (editingId) {
        const original = brokers.find(b => b.id === editingId);
        if (original) onUpdateBroker({ ...original, ...brokerData });
    } else {
        onAddBroker(brokerData);
    }
    handleCancelEdit();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">Manage Brokers</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* FORM SECTION */}
            <div className="lg:col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-200 h-fit">
               <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                 {editingId ? <Pencil size={16} /> : <Plus size={16} />}
                 {editingId ? 'Edit Broker' : 'Add New Broker'}
               </h3>
               
               <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Broker Name</label>
                    <input type="text" required placeholder="e.g., KASB, AKD" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-500 outline-none" />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Fee Structure</label>
                    <select value={commType} onChange={e => setCommType(e.target.value as CommissionType)} className="w-full p-2 rounded-lg border border-slate-300 text-sm focus:border-emerald-500 outline-none bg-white">
                        <option value="HIGHER_OF">Max ( % or Rate )</option>
                        <option value="PERCENTAGE">Flat Percentage</option>
                        <option value="PER_SHARE">Per Share Only</option>
                        <option value="FIXED">Fixed per Trade</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div>
                         <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Rate 1</label>
                         <input type="number" step="0.01" value={rate1} onChange={e => setRate1(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-sm outline-none" />
                         <span className="text-[10px] text-slate-400">
                            {commType === 'HIGHER_OF' ? '%' : commType === 'FIXED' ? 'Rs' : commType === 'PER_SHARE' ? 'Rs' : '%'}
                         </span>
                     </div>
                     {commType === 'HIGHER_OF' && (
                         <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Rate 2</label>
                            <input type="number" step="0.01" value={rate2} onChange={e => setRate2(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-sm outline-none" />
                            <span className="text-[10px] text-slate-400">Rs/share</span>
                         </div>
                     )}
                  </div>

                  <div>
                     <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Sales Tax (SST) %</label>
                     <input type="number" value={sstRate} onChange={e => setSstRate(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-sm outline-none" />
                  </div>

                  <div className="flex gap-2 pt-2">
                    {editingId && (
                      <button type="button" onClick={handleCancelEdit} className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-bold hover:bg-slate-100 transition-colors">
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
                       <Save size={16} /> {editingId ? 'Update' : 'Save'}
                    </button>
                  </div>
               </form>
            </div>

            {/* TABLE SECTION */}
            <div className="lg:col-span-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold">Broker Name</th>
                    <th className="px-4 py-3 font-semibold">Structure</th>
                    <th className="px-4 py-3 font-semibold">Rates</th>
                    <th className="px-4 py-3 font-semibold">Tax</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {brokers.map(b => (
                    <tr key={b.id} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-4 py-3 font-bold text-slate-800">{b.name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {b.commissionType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                         {b.commissionType === 'HIGHER_OF' && `${b.rate1}% or Rs.${b.rate2}`}
                         {b.commissionType === 'PERCENTAGE' && `${b.rate1}% Flat`}
                         {b.commissionType === 'PER_SHARE' && `Rs.${b.rate1}/share`}
                         {b.commissionType === 'FIXED' && `Rs.${b.rate1} Fixed`}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{b.sstRate}%</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => handleEdit(b)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                           <button onClick={() => onDeleteBroker(b.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {brokers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <AlertCircle size={24} />
                        <span>No brokers added yet. Add one to start.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
