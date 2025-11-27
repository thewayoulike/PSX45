import React from 'react';

export const DividendIcon = ({ className = "w-4 h-4" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Money Bag Body (Green) */}
      <path 
        d="M32 14C22 14 14 20 14 32C14 48 18 58 32 58C46 58 50 48 50 32C50 20 42 14 32 14Z" 
        fill="#22c55e" 
        stroke="#15803d" 
        strokeWidth="2" 
      />
      
      {/* Bag Neck (Tied part) */}
      <path d="M24 14L22 8C20 6 26 4 32 4C38 4 44 6 42 8L40 14" fill="#22c55e" stroke="#15803d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 14H40" stroke="#15803d" strokeWidth="2" />
      
      {/* Tie Knot */}a
      <circle cx="26" cy="14" r="2" fill="#15803d" />

      {/* Top Flaps (Leaves style) */}
      <path d="M22 8C20 4 14 4 14 8C14 12 22 12 22 14" fill="#4ade80" stroke="#15803d" strokeWidth="1" />
      <path d="M42 8C44 4 50 4 50 8C50 12 42 12 42 14" fill="#4ade80" stroke="#15803d" strokeWidth="1" />

      {/* Dollar Sign (Yellow/Gold) */}
      <text 
        x="32" 
        y="42" 
        textAnchor="middle" 
        fontSize="28" 
        fontWeight="900" 
        fill="#fef08a" 
        stroke="#ca8a04"
        strokeWidth="1"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        $
      </text>
    </svg>
  );
};
