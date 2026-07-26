import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, icon }) => {
  return (
    <div className={`group relative bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-5 md:p-6 shadow-card dark:shadow-card-dark overflow-hidden transition-all duration-300 hover:shadow-md h-full flex flex-col ${className}`}>
      
      {/* Crystal Gloss/Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent opacity-50 dark:from-slate-800/30 dark:opacity-20 pointer-events-none"></div>
      
      {/* Interactive Glow - Disabled on mobile to prevent lag */}
      <div className="hidden md:block absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-[60px] group-hover:bg-emerald-500/10 dark:group-hover:bg-emerald-500/20 transition-all duration-500 pointer-events-none"></div>
      
      {/* Inner Content */}
      <div className="relative z-10 flex-1 flex flex-col">
        {(title || icon) && (
          <div className="flex items-center gap-3 mb-5 shrink-0">
            {icon && (
              <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-500/20 shadow-sm shrink-0 transition-transform duration-300 group-hover:scale-105">
                {icon}
              </div>
            )}
            {title && (
              <h3 className="text-slate-500 dark:text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest truncate">
                {title}
              </h3>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
