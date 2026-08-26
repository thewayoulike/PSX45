import React, { useState } from 'react';
import { Broker, CommissionType, CDCType, CommissionSlab } from '../types';
import { X, Plus, Pencil, Trash2, Save, Settings2, ArrowDown, Mail, AlertCircle, Briefcase, Zap, ShieldCheck } from 'lucide-react';

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
  const [email, setEmail] = useState(''); 
  const [commType, setCommType] = useState<CommissionType>('HIGHER_OF');
  const [rate1, setRate1] = useState<number | ''>(0.15);
  const [rate2, setRate2] = useState<number | ''>(0.05);
  const [sstRate, setSstRate] = useState<number | ''>(15);

  // Slab State
  const [slabs, setSlabs] = useState<CommissionSlab[]>([
      { min: 0, max: 10, rate: 0.03, type: 'FIXED' },
      { min: 10.01, max: 999999, rate: 0.15, type: 'PERCENTAGE' }
  ]);

  // CDC State
  const [cdcType, setCdcType] = useState<CDCType>('PER_SHARE');
  const [cdcRate, setCdcRate] = useState<number | ''>(0.005);
  const [cdcMin, setCdcMin] = useState<number | ''>('');

  const [annualFee, setAnnualFee] = useState<number | ''>('');
  const [feeStartDate, setFeeStartDate] = useState<string>('');

  const handleEdit = (b: Broker) => {
    setEditingId(b.id);
    setName(b.name);
    setEmail(b.email || '');
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
    setEmail('');
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
      email: email.trim() || undefined,
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-start justify-center p-4 pt-16 md:pt-20 overflow-y-auto transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-5xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 shrink-0">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                <Settings2 size={20} />
            </div>
            Manage Brokers
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* FORM SECTION */}
            <div className="lg:col-span-1 bg-slate-50/50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 h-fit shadow-sm">
               <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2 uppercase tracking-wide">
                 {editingId ? <Pencil size={16} className="text-blue-500" /> : <Plus size={16} className="text-emerald-500" />}
                 {editingId ? 'Edit Broker Setup' : 'Add New Broker'}
               </h3>
               
               <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Broker Name</label>
                        <input type="text" required placeholder="e.g., KASB, AKD" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-medium text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Email (For Import)</label>
                        <div className="relative">
                            <input type="email" placeholder="alerts@broker.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl pl-9 pr-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-medium text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm" />
                            <Mail className="absolute left-3.5 top-3 text-slate-400" size={14} />
                        </div>
                      </div>
                  </div>

                  <div className="h-px bg-slate-200 dark:bg-slate-700/60 w-full my-5"></div>

                  {/* Commission Section */}
                  <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          <Zap size={14} className="text-blue-500" /> Commission Rules
                      </div>
                      <div>
                        <select value={commType} onChange={e => setCommType(e.target.value as CommissionType)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-medium text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm">
                            <option value="HIGHER_OF">Max ( % or Rate )</option>
                            <option value="SLAB">Share Price Slabs (Variable)</option>
                            <option value="PERCENTAGE">Flat Percentage</option>
                            <option value="PER_SHARE">Per Share Only</option>
                            <option value="FIXED">Fixed per Trade</option>
                        </select>
                      </div>

                      {commType === 'SLAB' ? (
                          <div className="space-y-3">
                              <div className="bg-blue-50/60 dark:bg-blue-900/20 p-3.5 rounded-xl border border-blue-100 dark:border-blue-800/50 shadow-sm">
                                  <div className="flex items-center justify-between mb-2">
                                      <label className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Compare with % (Optional)</label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <input type="number" step="0.01" value={rate1} onChange={e => setRate1(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 text-sm font-bold text-blue-700 dark:text-blue-300 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 shadow-sm transition-colors" placeholder="e.g. 0.15" />
                                      <span className="text-xs text-blue-400 font-black">%</span>
                                  </div>
                              </div>
                              <div className="space-y-2.5">
                                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Price Ranges</label>
                                  {slabs.map((slab, idx) => (
                                      <div key={idx} className="flex gap-1.5 items-center">
                                          <div className="flex flex-col flex-1"><input type="number" step="0.01" value={slab.min} onChange={e => updateSlab(idx, 'min', Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs text-center tabular-nums shadow-sm focus:border-blue-500 outline-none transition-colors" placeholder="Min" /></div>
                                          <span className="text-slate-300 dark:text-slate-600 text-[10px]">-</span>
                                          <div className="flex flex-col flex-1"><input type="number" step="0.01" value={slab.max} onChange={e => updateSlab(idx, 'max', Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs text-center tabular-nums shadow-sm focus:border-blue-500 outline-none transition-colors" placeholder="Max" /></div>
                                          <div className="flex flex-col w-16"><input type="number" step="0.01" value={slab.rate} onChange={e => updateSlab(idx, 'rate', Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs text-center font-bold tabular-nums shadow-sm focus:border-blue-500 outline-none transition-colors" placeholder="Rate" /></div>
                                          <select value={slab.type} onChange={e => updateSlab(idx, 'type', e.target.value)} className="w-14 p-2 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs shadow-sm focus:border-blue-500 outline-none transition-colors"><option value="FIXED">Rs</option><option value="PERCENTAGE">%</option></select>
                                          {slabs.length > 1 && (<button type="button" onClick={() => removeSlab(idx)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"><X size={14} /></button>)}
                                      </div>
                                  ))}
                                  <button type="button" onClick={addSlab} className="w-full py-2 mt-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"><Plus size={14} /> Add Range</button>
                              </div>
                          </div>
                      ) : (
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                 <input type="number" step="0.01" placeholder="Rate 1" value={rate1} onChange={e => setRate1(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm" />
                                 <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 block tracking-wider">{commType === 'HIGHER_OF' ? '%' : commType === 'FIXED' ? 'Rs' : commType === 'PER_SHARE' ? 'Rs' : '%'}</span>
                             </div>
                             {commType === 'HIGHER_OF' && (
                                 <div>
                                    <input type="number" step="0.01" placeholder="Rate 2" value={rate2} onChange={e => setRate2(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 block tracking-wider">Rs/share</span>
                                 </div>
                             )}
                          </div>
                      )}

                      <div>
                         <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Sales Tax (SST) %</label>
                         <input type="number" value={sstRate} onChange={e => setSstRate(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm" />
                      </div>
                  </div>

                  <div className="h-px bg-slate-200 dark:bg-slate-700/60 w-full my-5"></div>

                  <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          <ShieldCheck size={14} className="text-orange-500" /> CDC / Regulatory
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                             <input type="number" step="0.001" placeholder="Rate" value={cdcRate} onChange={e => setCdcRate(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all shadow-sm" />
                             <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 block tracking-wider">{cdcType === 'FIXED' ? 'Rs Fixed' : 'Rs / Share'}</span>
                         </div>
                         {cdcType === 'HIGHER_OF' && (
                             <div>
                                 <input type="number" step="0.01" placeholder="Min" value={cdcMin} onChange={e => setCdcMin(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all shadow-sm" />
                                 <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 block tracking-wider">Minimum Rs</span>
                             </div>
                         )}
                      </div>
                  </div>

                  <div className="h-px bg-slate-200 dark:bg-slate-700/60 w-full my-5"></div>

                  <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          <Briefcase size={14} className="text-purple-500" /> Annual Maintenance
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Start Date</label>
                             <input type="date" value={feeStartDate} onChange={e => setFeeStartDate(e.target.value)} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-sm dark:color-scheme-dark" />
                         </div>
                         <div>
                             <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">Amount (Rs)</label>
                             <input type="number" placeholder="e.g. 5000" value={annualFee} onChange={e => setAnnualFee(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-sm" />
                         </div>
                      </div>
                  </div>

                  <div className="flex gap-3 pt-6 border-t border-slate-200 dark:border-slate-700/60">
                    {editingId && (
                        <button type="button" onClick={handleCancelEdit} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm">
                            Cancel
                        </button>
                    )}
                    <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0">
                        <Save size={18} /> {editingId ? 'Update Config' : 'Save Broker'}
                    </button>
                  </div>
               </form>
            </div>

            {/* TABLE SECTION */}
            <div className="lg:col-span-2 overflow-x-auto custom-scrollbar rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white dark:bg-slate-900 h-fit max-h-full">
              <table className="w-full text-left border-collapse min-w-[550px] whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-md shadow-sm border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                    <th className="px-5 py-4">Broker Name</th>
                    <th className="px-5 py-4">Commission</th>
                    <th className="px-5 py-4">CDC Structure</th>
                    <th className="px-5 py-4">Annual Fee</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                  {brokers.map(b => (
                    <tr key={b.id} className="even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors group">
                      <td className="px-5 py-4">
                          <div className="font-display font-black text-slate-800 dark:text-slate-100">{b.name}</div>
                          {b.email && <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5 mt-0.5"><Mail size={12} /> {b.email}</div>}
                      </td>
                      <td className="px-5 py-4">
                         <div className="text-xs text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">{b.commissionType.replace('_', ' ')}</div>
                      </td>
                      <td className="px-5 py-4">
                         <div className="text-xs text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">{b.cdcType ? b.cdcType.replace('_', ' ') : 'PER SHARE'}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-700 dark:text-slate-300 tabular-nums font-medium text-sm">
                         {b.annualFee ? `Rs. ${b.annualFee.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-60 md:group-hover:opacity-100 transition-opacity">
                           <button onClick={() => handleEdit(b)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-500/20 shadow-sm"><Pencil size={16} /></button>
                           <button onClick={() => onDeleteBroker(b.id)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20 shadow-sm"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {brokers.length === 0 && (
                    <tr>
                        <td colSpan={5} className="px-5 py-16 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-3">
                                <AlertCircle size={32} className="opacity-20" />
                                <span className="font-bold text-sm uppercase tracking-widest">No brokers configured. Add one to start.</span>
                            </div>
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
