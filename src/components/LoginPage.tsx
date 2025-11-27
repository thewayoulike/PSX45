import React from 'react';
import { Logo } from './ui/Logo';
import { User } from 'lucide-react';

interface LoginPageProps {
  onGuestLogin: () => void;
  onGoogleLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onGuestLogin, onGoogleLogin }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background blobs matching main app theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-400/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-400/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="z-10 flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500 w-full max-w-4xl">
        <div className="scale-150 mb-6 transform hover:scale-155 transition-transform duration-500">
             <Logo />
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 mt-4 md:mt-8">
            {/* Guest Option */}
            <button 
                onClick={onGuestLogin}
                className="group relative bg-white/60 backdrop-blur-xl border border-white/80 p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl transition-all hover:-translate-y-1 w-full md:w-72 flex flex-col items-center text-center"
            >
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors duration-300">
                    <User size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Guest Mode</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                    Start using immediately. Data is stored locally on this device.
                </p>
            </button>

            {/* Google Option */}
            <button 
                onClick={onGoogleLogin}
                className="group relative bg-white/60 backdrop-blur-xl border border-emerald-100 p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-emerald-500/20 transition-all hover:-translate-y-1 w-full md:w-72 flex flex-col items-center text-center ring-2 ring-emerald-500/0 hover:ring-emerald-500/10"
            >
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                     <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" alt="Google" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Sign in with Google</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                    Sync your portfolio securely across all your devices using Drive.
                </p>
            </button>
        </div>
        
        <p className="text-slate-400 text-xs font-bold tracking-wider uppercase mt-8 opacity-60">
            Select an option to continue
        </p>
      </div>
    </div>
  );
};
