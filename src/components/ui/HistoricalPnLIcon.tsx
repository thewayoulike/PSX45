import React from 'react';

export const HistoricalPnLIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Main Blue Circle Background */}
      <circle cx="32" cy="32" r="22" fill="#3b82f6" />

      {/* Dollar Sign (White) */}
      <path 
        d="M32 18V22M32 42V46M28 24H32C34.2 24 36 25.8 36 28C36 30.2 34.2 32 32 32H28V24ZM28 32V40H32C34.2 40 36 38.2 36 36C36 33.8 34.2 32 32 32H28Z" 
        stroke="white" 
        strokeWidth="4" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />

      {/* Up Arrow (Dark Blue/Black) - Left Side */}
      <path d="M14 28V48" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
      <path d="M14 16L6 28H22L14 16Z" fill="#1e293b" />

      {/* Down Arrow (Dark Blue/Black) - Right Side */}
      <path d="M50 16V36" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
      <path d="M50 48L58 36H42L50 48Z" fill="#1e293b" />
    </svg>
  );
};
