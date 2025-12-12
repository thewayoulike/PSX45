import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl transition-all duration-300 bg-white/50 border border-slate-200 hover:bg-white text-slate-600 shadow-sm dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
      title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
};
