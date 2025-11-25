import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Icon Graphic */}
      <div className="relative w-16 h-14 mb-1">
        <svg viewBox="0 0 100 80" className="w-full h-full overflow-visible filter drop-shadow-sm">
            {/* Gradient Definitions */}
            <defs>
                <linearGradient id="barGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#84cc16" />
                </linearGradient>
            </defs>

            {/* Chart Bars */}
            <rect x="15" y="45" width="10" height="25" fill="#0ea5e9" rx="1" />
            <rect x="32" y="35" width="10" height="35" fill="#06b6d4" rx="1" />
            <rect x="49" y="25" width="10" height="45" fill="#22c55e" rx="1" />
            <rect x="66" y="15" width="10" height="55" fill="#84cc16" rx="1" />

            {/* Trend Line (Rising Arrow) */}
            <path 
                d="M 10 50 L 35 30 L 55 35 L 85 10" 
                fill="none" 
                stroke="#0ea5e9" 
                strokeWidth="4" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
            />
            {/* Arrow Head */}
            <path 
                d="M 75 10 L 85 10 L 85 20" 
                fill="none" 
                stroke="#0ea5e9" 
                strokeWidth="4" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
            />
        </svg>
      </div>

      {/* Typography */}
      <div className="flex flex-col items-center -mt-2 leading-none">
        <div className="relative">
            <h1 className="text-4xl font-black text-[#1e293b] tracking-tighter flex items-center" style={{ fontFamily: 'Arial, sans-serif' }}>
                PS
                <span className="relative inline-block ml-0.5">
                    X
                    {/* Magnifying Glass Overlay on X */}
                    <div className="absolute -bottom-1 -right-2 w-6 h-6 transform rotate-12">
                       <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" className="w-full h-full">
                            <circle cx="10" cy="10" r="6" className="stroke-[#84cc16] fill-white" />
                            <line x1="20" y1="20" x2="15" y2="15" className="stroke-[#1e293b]" strokeLinecap="round" />
                       </svg>
                    </div>
                </span>
            </h1>
        </div>
        <span className="text-[10px] font-bold tracking-[0.4em] text-[#06b6d4] uppercase mt-1 ml-1">Tracker</span>
      </div>
    </div>
  );
};
