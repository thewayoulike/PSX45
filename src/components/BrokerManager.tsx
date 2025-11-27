import React, { useState } from 'react';
import { Broker, CommissionType, CDCType } from '../types';
import { X, Plus, Pencil, Trash2, Save, AlertCircle, Settings2 } from 'lucide-react';

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
  
  // Commission State
  const [name, setName] = useState('');
  const [commType, setCommType] = useState<CommissionType>('HIGHER_OF');
  const [rate1, setRate1] = useState<number | ''>(0.15);
  const [rate2, setRate2] = useState<number | ''>(0.05);
  const [sstRate, setSstRate] = useState<number | ''>(15);

  // NEW: CDC State
  const [cdcType, setCdcType] = useState<CDCType>('PER_SHARE');
  const [cdcRate, setCdcRate] = useState<number | ''>(0.005);
  const [cdcMin, setCdcMin] = useState<number | ''>('');

  const handleEdit = (b: Broker) => {
    setEditingId(b.id);
    setName(b.name);
    setCommType(b.commissionType);
    setRate1(b.rate1);
    setRate2(b.rate2 || '');
    setSstRate(b.sstRate);
    
    // Load CDC settings or defaults
    setCdcType(b.cdcType || 'PER_SHARE');
    setCdcRate(b.cdcRate !== undefined ? b.cdcRate : 0.005);
    setCdcMin(b.cdcMin || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setRate1(0.15);
    setRate2(0.05);
    setCommType('HIGHER_OF');
    setSstRate(15);
    setCdcType('PER_SHARE');
    setCdcRate(0.005);
    setCdcMin('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const brokerData: Omit<Broker, 'id'> = {
      name,
      commissionType: commType,
      rate1: Number(rate1),
      rate2: Number(rate2),
      sstRate: Number(sstRate),
      // Save CDC Data
      cdcType,
      cdcRate: Number(cdcRate),
      cdcMin: Number(cdcMin)
    };

    if (editingId) {
        const original = brokers.find(b => b.id === editingId);
        if (original) onUpdateBroker({ ...original, ...brokerData, id: editingId });
    } else {
        onAddBroker(brokerData);
    }
    handleCancelEdit();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="text-emerald-600" /> Manage Brokers
          </h2>
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
               
               <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Name */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Broker Name</label>
                    <input type="text" required placeholder="e.g., KASB, AKD" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-300 text-sm focus:border-emerald-500 outline-none shadow-sm" />
                  </div>

                  <hr className="border-slate-200" />

                  {/* Commission Section */}
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Commission
                      </div>
                      <div>
                        <select value={commType} onChange={e => setCommType(e.target.value as CommissionType)} className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:border-emerald-500 outline-none bg-white">
                            <option value="HIGHER_OF">Max ( % or Rate )</option>
                            <option value="PERCENTAGE">Flat Percentage</option>
                            <option value="PER_SHARE">Per Share Only</option>
                            <option value="FIXED">Fixed per Trade</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                             <input type="number" step="0.01" placeholder="Rate 1" value={rate1} onChange={e => setRate1(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-xs outline-none" />
                             <span className="text-[9px] text-slate-400">
                                {commType === 'HIGHER_OF' ? '%' : commType === 'FIXED' ? 'Rs' : commType === 'PER_SHARE' ? 'Rs' : '%'}
                             </span>
                         </div>
                         {commType === 'HIGHER_OF' && (
                             <div>
                                <input type="number" step="0.01" placeholder="Rate 2" value={rate2} onChange={e => setRate2(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-xs outline-none" />
                                <span className="text-[9px] text-slate-400">Rs/share</span>
                             </div>
                         )}
                      </div>
                      <div>
                         <label className="text-[9px] text-slate-400 block mb-1">Sales Tax (SST) %</label>
                         <input type="number" value={sstRate} onChange={e => setSstRate(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-xs outline-none" />
                      </div>
                  </div>

                  <hr className="border-slate-200" />

                  {/* CDC Section */}
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> CDC / Regulatory
                      </div>
                      <div>
                        <select value={cdcType} onChange={e => setCdcType(e.target.value as CDCType)} className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:border-emerald-500 outline-none bg-white">
                            <option value="PER_SHARE">Per Share (Standard)</option>
                            <option value="FIXED">Fixed per Trade</option>
                            <option value="HIGHER_OF">Max (Share Rate vs Fixed)</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                             <input type="number" step="0.001" placeholder="Rate" value={cdcRate} onChange={e => setCdcRate(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-xs outline-none" />
                             <span className="text-[9px] text-slate-400">
                                {cdcType === 'FIXED' ? 'Rs Fixed' : 'Rs / Share'}
                             </span>
                         </div>
                         {cdcType === 'HIGHER_OF' && (
                             <div>
                                <input type="number" step="0.01" placeholder="Min" value={cdcMin} onChange={e => setCdcMin(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 text-xs outline-none" />
                                <span className="text-[9px] text-slate-400">Minimum Rs</span>
                             </div>
                         )}
                      </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    {editingId && (
                      <button type="button" onClick={handleCancelEdit} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-bold hover:bg-slate-100 transition-colors">
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
                       <Save size={16} /> {editingId ? 'Update' : 'Save Broker'}
                    </button>
                  </div>
               </form>
            </div>

            {/* TABLE SECTION */}
            <div className="lg:col-span-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200 bg-slate-50/30">
                    <th className="px-4 py-3 font-semibold">Broker Name</th>
                    <th className="px-4 py-3 font-semibold">Commission</th>
                    <th className="px-4 py-3 font-semibold">CDC Structure</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {brokers.map(b => (
                    <tr key={b.id} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{b.name}</div>
                          <div className="text-[10px] text-slate-400">SST: {b.sstRate}%</div>
                      </td>
                      <td className="px-4 py-3">
                         <div className="text-xs text-slate-700 font-medium">{b.commissionType.replace('_', ' ')}</div>
                         <div className="text-[10px] text-slate-500 font-mono">
                             {b.commissionType === 'HIGHER_OF' && `${b.rate1}% or Rs.${b.rate2}`}
                             {b.commissionType === 'PERCENTAGE' && `${b.rate1}%`}
                             {b.commissionType === 'PER_SHARE' && `Rs.${b.rate1}`}
                             {b.commissionType === 'FIXED' && `Rs.${b.rate1}`}
                         </div>
                      </td>
                      <td className="px-4 py-3">
                         <div className="text-xs text-slate-700 font-medium">{b.cdcType ? b.cdcType.replace('_', ' ') : 'PER SHARE'}</div>
                         <div className="text-[10px] text-slate-500 font-mono">
                             {(!b.cdcType || b.cdcType === 'PER_SHARE') && `Rs.${b.cdcRate || 0.005}/sh`}
                             {b.cdcType === 'FIXED' && `Rs.${b.cdcRate} Fixed`}
                             {b.cdcType === 'HIGHER_OF' && `Max(Rs.${b.cdcRate}/sh, ${b.cdcMin})`}
                         </div>
                      </td>
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
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
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
