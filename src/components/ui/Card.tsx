import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, icon }) => {
  return (
    // Added 'h-full' and 'flex flex-col' to the outer div
    <div className={`group relative bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all hover:shadow-[0_8px_30px_rgba(16,185,129,0.1)] h-full flex flex-col ${className}`}>
      {/* Crystal Gloss/Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-transparent to-transparent opacity-80 pointer-events-none"></div>
      
      {/* Interactive Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/5 rounded-full blur-[60px] group-hover:bg-emerald-500/10 transition-all duration-500 pointer-events-none"></div>
      
      {/* Inner Content: Added 'flex-1 flex flex-col' to fill space */}
      <div className="relative z-10 flex-1 flex flex-col">
        {(title || icon) && (
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5 shrink-0">
            {icon && (
              <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-50 text-emerald-600 shadow-sm group-hover:text-emerald-700 transition-colors">
                {icon}
              </div>
            )}
            {title && <h3 className="text-slate-500 font-semibold text-[10px] md:text-xs uppercase tracking-[0.1em] truncate">{title}</h3>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
