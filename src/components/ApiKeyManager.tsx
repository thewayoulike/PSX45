import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, Lock, ExternalLink, Save, Globe, Server } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  scrapingApiKey: string;
  webScrapingAIKey: string;
  onSave: (geminiKey: string, scraperKey: string, webScrapingAIKey: string) => void;
  isDriveConnected: boolean;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ 
  isOpen, onClose, apiKey, scrapingApiKey, webScrapingAIKey, onSave, isDriveConnected 
}) => {
  const [inputGeminiKey, setInputGeminiKey] = useState(apiKey);
  const [inputScraperKey, setInputScraperKey] = useState(scrapingApiKey);
  const [inputWebScrapingAIKey, setInputWebScrapingAIKey] = useState(webScrapingAIKey);
  
  useEffect(() => { 
    setInputGeminiKey(apiKey); 
    setInputScraperKey(scrapingApiKey); 
    setInputWebScrapingAIKey(webScrapingAIKey); 
  }, [apiKey, scrapingApiKey, webScrapingAIKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(inputGeminiKey.trim(), inputScraperKey.trim(), inputWebScrapingAIKey.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    // MODAL CONTAINER: Top Aligned with Blur
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[70] flex items-start justify-center p-4 pt-20 md:pt-32 transition-opacity">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl shadow-card dark:shadow-card-dark w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
          <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3"> 
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                <Key size={20} /> 
            </div>
            API Configs
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 rounded-full transition-colors"
          > 
            <X size={20} /> 
          </button>
        </div>

        {/* Body Area */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            
            {/* Status Banners */}
            {!isDriveConnected ? (
                <div className="bg-amber-50/50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                    <Lock className="text-amber-500 dark:text-amber-400 mt-0.5" size={20} />
                    <div> 
                        <h4 className="font-bold text-amber-800 dark:text-amber-300 text-sm">Sync Disabled</h4> 
                        <p className="text-xs font-medium text-amber-700/80 dark:text-amber-400/80 mt-1 leading-snug"> 
                            Login to Google Drive to save your keys securely to the cloud. 
                        </p> 
                    </div>
                </div>
            ) : (
                <div className="bg-emerald-50/50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                    <ShieldCheck className="text-emerald-500 dark:text-emerald-400 mt-0.5" size={20} />
                    <div> 
                        <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">Secure Storage Active</h4> 
                        <p className="text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80 mt-1 leading-snug"> 
                            Your API keys are encrypted and saved to your personal Drive. 
                        </p> 
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                
                {/* GEMINI KEY */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5"> 
                            <Key size={14} /> Gemini AI Key 
                        </label>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-bold transition-colors uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-md"> 
                            Get Key <ExternalLink size={10} /> 
                        </a>
                    </div>
                    <input 
                        type="password" 
                        value={inputGeminiKey} 
                        onChange={(e) => setInputGeminiKey(e.target.value)} 
                        placeholder="AIzaSy..." 
                        disabled={!isDriveConnected} 
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-3.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50" 
                    />
                </div>
                
                <div className="h-px bg-slate-100 dark:bg-slate-800/60 w-full"></div>

                {/* SCRAPE.DO KEY */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5"> 
                            <Globe size={14} /> Scrape.do Token 
                        </label>
                        <a href="https://dashboard.scrape.do/login" target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-bold transition-colors uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-md"> 
                            Get Key <ExternalLink size={10} /> 
                        </a>
                    </div>
                    <input 
                        type="password" 
                        value={inputScraperKey} 
                        onChange={(e) => setInputScraperKey(e.target.value)} 
                        placeholder="e.g. 54a1..." 
                        disabled={!isDriveConnected} 
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-3.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50" 
                    />
                </div>

                {/* WEBSCRAPING.AI KEY */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5"> 
                            <Server size={14} /> WebScraping.AI Key 
                        </label>
                        <a href="https://webscraping.ai/dashboard" target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-bold transition-colors uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-md"> 
                            Get Key <ExternalLink size={10} /> 
                        </a>
                    </div>
                    <input 
                        type="password" 
                        value={inputWebScrapingAIKey} 
                        onChange={(e) => setInputWebScrapingAIKey(e.target.value)} 
                        placeholder="e.g. xx-xxxx-xxxx" 
                        disabled={!isDriveConnected} 
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-3.5 text-slate-900 dark:text-slate-100 outline-none font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50" 
                    />
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={!isDriveConnected} 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                    > 
                        <Save size={18} /> Save Configuration 
                    </button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
};
