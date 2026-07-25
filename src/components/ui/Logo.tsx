import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    
    {/* Shadow Layer for 3D Arrow Effect */}
    <path d="M 22 66 L 42 40 L 52 50 L 72 24" stroke="#10753b" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <polygon points="62,26 84,18 72,36" fill="#10753b" />

    {/* Main Vibrant Green Arrow Layer */}
    <path d="M 22 62 L 42 36 L 52 46 L 72 20" stroke="#1da355" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <polygon points="62,22 84,14 72,32" fill="#1da355" />

    {/* Viewfinder Corners (Cyan) */}
    <path d="M 32 18 L 18 18 L 18 32" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 68 18 L 82 18 L 82 32" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 32 82 L 18 82 L 18 68" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 68 82 L 82 82 L 82 68" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />

    {/* Viewfinder Straight Edges (Cyan) */}
    <path d="M 50 8 L 50 20" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M 50 92 L 50 80" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M 8 50 L 20 50" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M 92 50 L 80 50" stroke="#1ea5c1" strokeWidth="6" fill="none" strokeLinecap="round" />
    
  </svg>
);
