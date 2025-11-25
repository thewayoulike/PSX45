import React from 'react';
// Import the image directly from the src folder
// We go up two levels (../../) to get from "components/ui" back to "src"
import logo from '../../logo.png';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`${className}`}>
      <img 
        src={logo} 
        alt="PSX Tracker" 
        className="h-16 w-auto object-contain mix-blend-multiply" 
      />
    </div>
  );
};
