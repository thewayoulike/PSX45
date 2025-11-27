import React from 'react';

export const BuyIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Green Background Circle */}
      <circle cx="32" cy="32" r="30" fill="#10b981" />
      
      {/* Gloss/Highlight Effect (Top) */}
      <path d="M32 4C18 4 6 14 4 28C4 16 16 4 32 4Z" fill="white" opacity="0.2" />
      
      {/* White Border Ring */}
      <circle cx="32" cy="32" r="27" stroke="white" strokeWidth="2" opacity="0.8" />
      
      {/* BUY Text */}
      <text 
        x="32" 
        y="40" 
        textAnchor="middle" 
        fontSize="22" 
        fontWeight="900" 
        fill="white"
        style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '1px' }}
      >
        BUY
      </text>
    </svg>
  );
};
