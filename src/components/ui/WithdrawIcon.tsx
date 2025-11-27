import React from 'react';

export const WithdrawIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* ATM Top Bar (Dark Grey) */}
      <rect x="4" y="4" width="56" height="12" rx="2" fill="#475569" stroke="currentColor" strokeWidth="2" />
      
      {/* Dispenser Slot (Black) */}
      <rect x="16" y="16" width="32" height="4" rx="2" fill="#1e293b" />

      {/* Cash Bill (Green) emerging from slot */}
      <path d="M20 18H44V54C44 56.2 42.2 58 40 58H24C21.8 58 20 56.2 20 54V18Z" fill="#6ee7b7" stroke="currentColor" strokeWidth="2" />
      
      {/* Dollar/Currency Symbol on Bill */}
      <circle cx="32" cy="36" r="8" stroke="currentColor" strokeWidth="2" className="text-emerald-700 opacity-50" />
      <path d="M32 32V40M30 34H32C33.1 34 34 33.1 34 32C34 30.9 33.1 30 32 30H30V34ZM30 34V38H32C33.1 38 34 38.9 34 40C34 41.1 33.1 42 32 42H30V38Z" stroke="#065f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Arrows indicating motion (Sides) */}
      <path d="M10 24V32M10 32L6 28M10 32L14 28" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M54 24V32M54 32L50 28M54 32L58 28" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Hand holding the bill (Stylized) */}
      <path d="M20 54V60H44V54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};
