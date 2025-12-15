import React, { useState } from 'react';
import { Broker, CommissionType, CDCType, CommissionSlab } from '../types';
import { X, Plus, Pencil, Trash2, Save, Settings2, ArrowDown, Mail } from 'lucide-react';

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
  const [email, setEmail] = useState(''); // <--- NEW STATE
  const [commType, setCommType] = useState<CommissionType>('HIGHER_OF');
  const [rate1, setRate1] = useState<number | ''>(0.15);
  const [rate2, setRate2] = useState<number | ''>(0.05);
  const [sstRate, setSstRate] = useState<number | ''>(15);

  const [slabs, setSlabs] = useState<CommissionSlab[]>([
      { min: 0, max: 10, rate: 0.03, type: 'FIXED' },
      { min: 10.01, max: 999999, rate: 0.15, type: 'PERCENTAGE' }
  ]);

  const [cdcType, setCdcType] = useState<CDCType>('PER_SHARE');
  const [cdcRate, setCdcRate] = useState<number | ''>(0.005);
  const [cdcMin, setCdcMin] = useState<number | ''>('');

  const [annualFee, setAnnualFee] = useState<number | ''>('');
  const [feeStartDate, setFeeStartDate] = useState<string>('');

  const handleEdit = (b: Broker) => {
    setEditingId(b.id);
    setName(b.name);
    setEmail(b.email || ''); // <--- LOAD EMAIL
    setCommType(b.commissionType);
    setRate1(b.rate1);
    setRate2(b.rate2 || '');
    setSstRate(b.sstRate);
    
    if (b.slabs && b.slabs.length > 0) {
        setSlabs(b.slabs);
    } else {
        setSlabs([{ min: 0, max: 999999, rate: 0.15, type: 'PERCENTAGE' }]);
    }
    
    setCdcType(b.cdcType || 'PER_SHARE');
    setCdcRate(b.cdcRate !== undefined ? b.cdcRate : 0.005);
    setCdcMin(b.cdcMin || '');

    setAnnualFee(b.annualFee || '');
    setFeeStartDate(b.feeStartDate || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setEmail(''); // <--- RESET EMAIL
    setRate1(0.15);
    setRate2(0.05);
    setCommType('HIGHER_OF');
    setSstRate(15);
    setSlabs([{ min: 0, max: 10, rate: 0.03, type: 'FIXED' }, { min: 10.01, max: 999999, rate: 0.15, type: 'PERCENTAGE' }]);
    setCdcType('PER_SHARE');
    setCdcRate(0.005);
    setCdcMin('');
    setAnnualFee('');
    setFeeStartDate('');
  };

  const updateSlab = (index: number, field: keyof CommissionSlab, value: any) => {
      const newSlabs = [...slabs];
      newSlabs[index] = { ...newSlabs[index], [field]: value };
      setSlabs(newSlabs);
  };

  const addSlab = () => {
      const lastMax = slabs.length > 0 ? slabs[slabs.length - 1].max : 0;
      setSlabs([...slabs, { min: lastMax + 0.01, max: 999999, rate: 0, type: 'FIXED' }]);
  };

  const removeSlab = (index: number) => {
      if (slabs.length > 1) {
          setSlabs(slabs.filter((_, i) => i !== index));
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const brokerData: Omit<Broker, 'id'> = {
      name,
      email: email.trim() || undefined, // <--- SAVE EMAIL
      commissionType: commType,
      rate1: Number(rate1),
      rate2: Number(rate2),
      sstRate: Number(sstRate),
      cdcType,
      cdcRate: Number(cdcRate),
      cdcMin: Number(cdcMin),
      annualFee: Number(annualFee) || 0,
      feeStartDate: feeStartDate || undefined,
      slabs: commType === 'SLAB' ? slabs : undefined
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-start justify-center p-4 pt-16 md:pt-24 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Settings2 className="text-emerald-600 dark:text-emerald-400" /> Manage Brokers
          </h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* FORM SECTION */}
            <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 h-fit">
               <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                 {editingId ? <Pencil size={16} /> : <Plus size={16} />}
                 {editingId ? 'Edit Broker' : 'Add New Broker'}
               </h3>
               
               <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block mb-1">Broker Name</label>
                        <input type="text" required placeholder="e.g., KASB, AKD" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm focus:border-emerald-500 outline-none shadow-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block mb-1">Email (For Import)</label>
                        <div className="relative">
                            <input type="email" placeholder="alerts@broker.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2.5 pl-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm focus:border-emerald-500 outline-none shadow-sm" />
                            <Mail className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                  </div>

                  <hr className="border-slate-200 dark:border-slate-700" />

                  {/* Commission Section */}
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Commission
                      </div>
                      <div>
                        <select value={commType} onChange={e => setCommType(e.target.value as CommissionType)} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs focus:border-emerald-500 outline-none">
                            <option value="HIGHER_OF">Max ( % or Rate )</option>
                            <option value="SLAB">Share Price Slabs (Variable)</option>
                            <option value="PERCENTAGE">Flat Percentage</option>
                            <option value="PER_SHARE">Per Share Only</option>
                            <option value="FIXED">Fixed per Trade</option>
                        </select>
                      </div>

                      {/* DYNAMIC SLAB UI */}
                      {commType === 'SLAB' ? (
                          <div className="space-y-3">
                              {/* Comparison Rate Input */}
                              <div className="bg-indigo-50/60 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                                  <div className="flex items-center justify-between mb-1">
                                      <label className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                                          Compare with % (Optional)
                                      </label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <input 
                                          type="number" 
                                          step="0.01" 
                                          value={rate1} 
                                          onChange={e => setRate1(Number(e.target.value))} 
                                          className="w-full p-2 rounded border border-indigo-200 dark:border-indigo-700 text-xs font-bold text-indigo-700 dark:text-indigo-300 focus:border-indigo-500 outline-none bg-white dark:bg-slate-900"
                                          placeholder="e.g. 0.15" 
                                      />
                                      <span className="text-xs text-indigo-400 font-bold">%</span>
                                  </div>
                              </div>
                              {/* ... Slabs UI (Abbreviated for space, assume same as before) ... */}
                              {/* NOTE: You should include the full slab logic from previous response here if needed */}
                               <div className="space-y-2">
                                  <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Price Ranges</label>
                                  {slabs.map((slab, idx) => (
                                      <div key={idx} className="flex gap-1 items-center">
                                          <div className="flex flex-col flex-1"><input type="number" step="0.01" value={slab.min} onChange={e => updateSlab(idx, 'min', Number(e.target.value))} className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px] text-center" placeholder="Min" /></div>
                                          <span className="text-slate-300 dark:text-slate-600 text-[10px]">-</span>
                                          <div className="flex flex-col flex-1"><input type="number" step="0.01" value={slab.max} onChange={e => updateSlab(idx, 'max', Number(e.target.value))} className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px] text-center" placeholder="Max" /></div>
                                          <div className="flex flex-col w-16"><input type="number" step="0.01" value={slab.rate} onChange={e => updateSlab(idx, 'rate', Number(e.target.value))} className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px] text-center font-bold" placeholder="Rate" /></div>
                                          <select value={slab.type} onChange={e => updateSlab(idx, 'type', e.target.value)} className="w-14 p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px]"><option value="FIXED">Rs</option><option value="PERCENTAGE">%</option></select>
                                          {slabs.length > 1 && (<button type="button" onClick={() => removeSlab(idx)} className="text-rose-400 hover:text-rose-600"><X size={14} /></button>)}
                                      </div>
                                  ))}
                                  <button type="button" onClick={addSlab} className="w-full py-1.5 mt-1 border border-dashed border-slate-300 dark:border-slate-600 rounded text-[10px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-1 transition-colors"><Plus size={12} /> Add Range</button>
                              </div>
                          </div>
                      ) : (
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                 <input type="number" step="0.01" placeholder="Rate 1" value={rate1} onChange={e => setRate1(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" />
                                 <span className="text-[9px] text-slate-400">
                                    {commType === 'HIGHER_OF' ? '%' : commType === 'FIXED' ? 'Rs' : commType === 'PER_SHARE' ? 'Rs' : '%'}
                                 </span>
                             </div>
                             {commType === 'HIGHER_OF' && (
                                 <div>
                                    <input type="number" step="0.01" placeholder="Rate 2" value={rate2} onChange={e => setRate2(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" />
                                    <span className="text-[9px] text-slate-400">Rs/share</span>
                                 </div>
                             )}
                          </div>
                      )}

                      <div>
                         <label className="text-[9px] text-slate-400 block mb-1">Sales Tax (SST) %</label>
                         <input type="number" value={sstRate} onChange={e => setSstRate(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" />
                      </div>
                  </div>

                  <hr className="border-slate-200 dark:border-slate-700" />

                  {/* CDC & Fee Sections (Same as before) */}
                   <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> CDC / Regulatory</div>
                      <div className="grid grid-cols-2 gap-3">
                         <div><input type="number" step="0.001" placeholder="Rate" value={cdcRate} onChange={e => setCdcRate(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" /></div>
                         {cdcType === 'HIGHER_OF' && (<div><input type="number" step="0.01" placeholder="Min" value={cdcMin} onChange={e => setCdcMin(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" /></div>)}
                      </div>
                  </div>
                  <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300"><Settings2 size={12} className="text-purple-500" /> Annual Maintenance</div>
                      <div className="grid grid-cols-2 gap-3">
                         <div><input type="date" value={feeStartDate} onChange={e => setFeeStartDate(e.target.value)} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none dark:color-scheme-dark" /></div>
                         <div><input type="number" placeholder="e.g. 5000" value={annualFee} onChange={e => setAnnualFee(Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs outline-none" /></div>
                      </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    {editingId && (
                      <button type="button" onClick={handleCancelEdit} className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
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
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30">
                    <th className="px-4 py-3 font-semibold">Broker Name</th>
                    <th className="px-4 py-3 font-semibold">Commission</th>
                    <th className="px-4 py-3 font-semibold">CDC Structure</th>
                    <th className="px-4 py-3 font-semibold">Annual Fee</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                  {brokers.map(b => (
                    <tr key={b.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors group">
                      <td className="px-4 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{b.name}</div>
                          {/* SHOW SAVED EMAIL */}
                          {b.email && <div className="text-[10px] text-slate-400 flex items-center gap-1"><Mail size={10} /> {b.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                         <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">{b.commissionType.replace('_', ' ')}</div>
                      </td>
                      <td className="px-4 py-3">
                         <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">{b.cdcType ? b.cdcType.replace('_', ' ') : 'PER SHARE'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                         {b.annualFee ? `Rs. ${b.annualFee}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => handleEdit(b)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"><Pencil size={14} /></button>
                           <button onClick={() => onDeleteBroker(b.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg"><Trash2 size={14} /></button>
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
