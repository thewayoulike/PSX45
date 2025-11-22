import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Professional Abstract Icon */}
      <div className="w-11 h-11 relative flex-shrink-0">
        <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
            {/* Background Container */}
            <rect width="44" height="44" rx="12" fill="#0f172a"/>
            
            {/* Chart Bars */}
            <path d="M12 32V22" stroke="#10b981" strokeWidth="3" strokeLinecap="round"/>
            <path d="M22 32V14" stroke="#34d399" strokeWidth="3" strokeLinecap="round"/>
            <path d="M32 32V26" stroke="#059669" strokeWidth="3" strokeLinecap="round"/>
            
            {/* Trend Line */}
            <path d="M9 31L16 20L25 24L35 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Typography Lockup */}
      <div className="flex flex-col justify-center h-full">
        <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none flex items-baseline">
            PSX
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full ml-0.5 mb-0.5"></span>
        </h1>
        <p className="text-[10px] font-bold text-slate-500 tracking-[0.25em] uppercase leading-none mt-1.5">
            Tracker
        </p>
      </div>
    </div>
  );
};