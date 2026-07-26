import React from 'react';
import { Logo } from './ui/Logo';
import { User } from 'lucide-react';

interface LoginPageProps {
  onGuestLogin: () => void;
  onGoogleLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onGuestLogin, onGoogleLogin }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-emerald-200 dark:selection:bg-emerald-900 transition-colors duration-300">
      
      {/* Background blobs matching main app theme */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-400/10 dark:bg-emerald-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-400/10 dark:bg-teal-600/10 rounded-full blur-[120px]"></div>
      </div>
      
      <div className="z-10 flex flex-col items-center gap-10 animate-in fade-in zoom-in-95 duration-700 w-full max-w-4xl">
        <div className="scale-150 mb-4 transform hover:scale-155 transition-transform duration-500 drop-shadow-md">
             <Logo />
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 mt-4 md:mt-8 w-full md:w-auto px-4">
            
            {/* Guest Option */}
            <button 
                onClick={onGuestLogin}
                className="group relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 p-8 rounded-3xl shadow-card dark:shadow-card-dark hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:-translate-y-1 w-full md:w-72 flex flex-col items-center text-center"
            >
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700/50 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all duration-300 group-hover:scale-110 shadow-sm">
                    <User size={36} strokeWidth={2.5} />
                </div>
                <h3 className="text-xl font-display font-black text-slate-900 dark:text-white mb-2 tracking-tight">Guest Mode</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                    Start using immediately. Data is stored locally on this device.
                </p>
            </button>

            {/* Google Option */}
            <button 
                onClick={onGoogleLogin}
                className="group relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 p-8 rounded-3xl shadow-card dark:shadow-card-dark hover:shadow-card-hover hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all hover:-translate-y-1 w-full md:w-72 flex flex-col items-center text-center ring-2 ring-transparent hover:ring-emerald-500/10 dark:hover:ring-emerald-500/20"
            >
                <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-100 dark:border-slate-700/50 group-hover:scale-110 transition-transform duration-300">
                     <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10 drop-shadow-sm" alt="Google" />
                </div>
                <h3 className="text-xl font-display font-black text-slate-900 dark:text-white mb-2 tracking-tight">Sign in with Google</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                    Sync your portfolio securely across all your devices using Drive.
                </p>
            </button>
        </div>
        
        <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold tracking-widest uppercase mt-6 opacity-80">
            Select an option to continue
        </p>
      </div>
    </div>
  );
};
