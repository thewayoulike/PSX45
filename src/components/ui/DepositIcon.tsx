import React from 'react';

export const DepositIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Blue Box (Wallet/Deposit Box) */}
      <rect x="8" y="24" width="48" height="32" rx="4" fill="#67e8f9" stroke="currentColor" strokeWidth="2" />
      
      {/* Dark Slot on Box */}
      <rect x="20" y="32" width="24" height="4" rx="2" fill="#1e293b" />

      {/* Gold Coin */}
      <circle cx="32" cy="14" r="12" fill="#fbbf24" stroke="currentColor" strokeWidth="2" />
      
      {/* Inner Ring of Coin (Orange-ish) */}
      <circle cx="32" cy="14" r="9" fill="none" stroke="#d97706" strokeWidth="1.5" opacity="0.5" />

      {/* "PKR" Text inside Coin */}
      <text 
        x="32" 
        y="17" 
        textAnchor="middle" 
        fontSize="7" 
        fontWeight="900" 
        fill="#78350f"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        PKR
      </text>

      {/* Arrow Circle Badge (Bottom Right) */}
      <circle cx="52" cy="52" r="10" fill="#ffffff" stroke="currentColor" strokeWidth="2" />
      
      {/* Down Arrow */}
      <path d="M52 46V58M52 58L48 54M52 58L56 54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
