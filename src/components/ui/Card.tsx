import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, icon }) => {
  return (
    <div
      className={`group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 md:p-6 shadow-card dark:shadow-card-dark overflow-hidden transition-shadow duration-300 hover:shadow-card-hover h-full flex flex-col ${className}`}
    >
      <div className="relative z-10 flex-1 flex flex-col">
        {(title || icon) && (
          <div className="flex items-center gap-3 mb-5 shrink-0">
            {icon && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 shrink-0">
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
