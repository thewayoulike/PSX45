import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Building2 } from 'lucide-react';
import { MutualFundRecord } from '../services/mufapData';

interface FundPickerProps {
  catalog: Record<string, MutualFundRecord>;
  value: string;
  onChange: (fundId: string, fund: MutualFundRecord | null) => void;
  disabled?: boolean;
}

export const FundPicker: React.FC<FundPickerProps> = ({ catalog, value, onChange, disabled }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const funds = useMemo(() => Object.values(catalog).sort((a, b) => {
    const amc = a.amc.localeCompare(b.amc);
    return amc !== 0 ? amc : a.fundName.localeCompare(b.fundName);
  }), [catalog]);

  const selected = value ? catalog[value] : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return funds.slice(0, 80);
    return funds.filter(f =>
      f.fundName.toLowerCase().includes(q) ||
      f.amc.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [funds, query]);

  useEffect(() => {
    if (selected && !query) {
      setQuery(selected.fundName);
    }
  }, [selected, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
        Mutual Fund
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          disabled={disabled}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('', null); }}
          onFocus={() => setOpen(true)}
          placeholder="Search fund or AMC (e.g. Meezan, Alfalah)"
          className="w-full bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl pl-10 pr-10 py-3.5 text-sm font-medium dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 outline-none shadow-sm"
        />
        <ChevronDown size={16} className="absolute right-4 top-3.5 text-slate-400 pointer-events-none" />
      </div>

      {selected && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 ml-1 flex items-center gap-1">
          <Building2 size={12} /> {selected.amc} · {selected.category}
          {selected.nav > 0 && <span className="ml-1 tabular-nums">· NAV {selected.nav.toFixed(4)}</span>}
        </p>
      )}

      {open && filtered.length > 0 && (
        <div className="absolute z-[80] mt-1 w-full max-h-56 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
          {filtered.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onChange(f.id, f);
                setQuery(f.fundName);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border-b border-slate-100 dark:border-slate-800 last:border-0 ${value === f.id ? 'bg-emerald-50/80 dark:bg-emerald-500/10' : ''}`}
            >
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{f.fundName}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{f.amc} · {f.category}</div>
            </button>
          ))}
        </div>
      )}

      {open && query && filtered.length === 0 && (
        <div className="absolute z-[80] mt-1 w-full p-3 text-xs text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
          No funds match. Sync NAV from MUFAP first if the catalog is empty.
        </div>
      )}
    </div>
  );
};
