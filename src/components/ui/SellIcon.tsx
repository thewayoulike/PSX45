import React from 'react';

export const SellIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Red Background Circle */}
      <circle cx="32" cy="32" r="30" fill="#f43f5e" />
      
      {/* Gloss/Highlight Effect (Top) */}
      <path d="M32 4C18 4 6 14 4 28C4 16 16 4 32 4Z" fill="white" opacity="0.2" />
      
      {/* White Border Ring */}
      <circle cx="32" cy="32" r="27" stroke="white" strokeWidth="2" opacity="0.8" />
      
      {/* SELL Text */}
      <text 
        x="32" 
        y="40" 
        textAnchor="middle" 
        fontSize="20" 
        fontWeight="900" 
        fill="white"
        style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '1px' }}
      >
        SELL
      </text>
    </svg>
  );
};
