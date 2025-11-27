import React from 'react';

export const TaxIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Document Background (Blue) */}
      <rect x="12" y="4" width="40" height="56" rx="2" fill="#dbeafe" stroke="currentColor" strokeWidth="2" />
      
      {/* Header Bar (Red) */}
      <path d="M12 4H52V14H12V4Z" fill="#fca5a5" stroke="currentColor" strokeWidth="2"/>

      {/* TAX Text */}
      <path d="M28 8H36M32 8V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 8H24M20 8V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 8L48 18M48 8L40 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* Lines */}
      <path d="M18 24H46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 30H46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 36H46" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 42H32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* Percentage Badge (Red Circle) */}
      <circle cx="44" cy="44" r="14" fill="#fca5a5" stroke="currentColor" strokeWidth="2" />
      <path d="M39 39L49 49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="48" r="2" fill="currentColor" />
      <circle cx="48" cy="40" r="2" fill="currentColor" />
      
      {/* Dollar Sign */}
      <path d="M20 52C20 52 18 52 18 50C18 48 20 48 22 48C24 48 24 50 24 52C24 54 20 54 20 56C20 58 24 58 24 58" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 46V60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};
