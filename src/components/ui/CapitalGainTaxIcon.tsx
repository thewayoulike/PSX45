import React from 'react';

export const CapitalGainTaxIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Stamp Border */}
      <rect x="4" y="10" width="56" height="44" rx="2" stroke="#dc2626" strokeWidth="3" />
      
      {/* Top Text: CAPITAL GAINS */}
      <text 
        x="32" 
        y="23" 
        textAnchor="middle" 
        fontSize="6" 
        fontWeight="bold" 
        fill="#dc2626"
        style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}
      >
        CAPITAL GAINS
      </text>

      {/* Decoration Lines next to Capital Gains */}
      <line x1="6" y1="20" x2="18" y2="20" stroke="#dc2626" strokeWidth="2" />
      <line x1="46" y1="20" x2="58" y2="20" stroke="#dc2626" strokeWidth="2" />

      {/* Main Text: TAX */}
      <text 
        x="32" 
        y="48" 
        textAnchor="middle" 
        fontSize="26" 
        fontWeight="900" 
        fill="#dc2626"
        style={{ fontFamily: 'Times New Roman, serif', letterSpacing: '2px' }}
      >
        TAX
      </text>
    </svg>
  );
};
