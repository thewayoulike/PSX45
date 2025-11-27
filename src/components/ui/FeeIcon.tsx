import React from 'react';

export const FeeIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Background Document */}
      <rect x="12" y="8" width="40" height="48" rx="4" fill="#fefce8" stroke="currentColor" strokeWidth="2" />
      
      {/* Header Lines */}
      <line x1="20" y1="18" x2="44" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="26" x2="36" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      
      {/* Alert/Exclamation Badge */}
      <circle cx="44" cy="44" r="10" fill="#f59e0b" stroke="currentColor" strokeWidth="2" />
      <path d="M44 38V44" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="44" cy="48" r="1.5" fill="white" />
    </svg>
  );
};
