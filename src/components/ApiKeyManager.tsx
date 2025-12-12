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
    // Allow saving even if fields are empty (to clear keys)
    const cleanGemini = inputGeminiKey ? inputGeminiKey.trim() : '';
    const cleanScraper = inputScraperKey ? inputScraperKey.trim() : '';
    const cleanWebAI = inputWebScrapingAIKey ? inputWebScrapingAIKey.trim() : '';
    
    onSave(cleanGemini, cleanScraper, cleanWebAI);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"> 
            <Key className="text-indigo-600 dark:text-indigo-400" size={20} /> API Configurations 
          </h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"> <X size={24} /> </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            {!isDriveConnected ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                    <Lock className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div> 
                        <h4 className="font-bold text-amber-800 dark:text-amber-200 text-sm">Sync Disabled</h4> 
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1"> Keys will be saved to this device only. Login to Drive to sync them across devices. </p> 
                    </div>
                </div>
            ) : (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3">
                    <ShieldCheck className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                    <div> 
                        <h4 className="font-bold text-emerald-800 dark:text-emerald-200 text-sm">Secure Storage</h4> 
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1"> Keys are encrypted and stored in your private Google Drive file. </p> 
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2"> <Key size={14} /> Gemini AI Key </label>
                    <input type="password" value={inputGeminiKey} onChange={(e) => setInputGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 outline-none font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40" />
                </div>
                
                <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>

                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2"> <Globe size={14} /> Scrape.do Token </label>
                    <input type="password" value={inputScraperKey} onChange={(e) => setInputScraperKey(e.target.value)} placeholder="e.g. 54a1..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 outline-none font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40" />
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2"> <Server size={14} /> WebScraping.AI Key </label>
                    <input type="password" value={inputWebScrapingAIKey} onChange={(e) => setInputWebScrapingAIKey(e.target.value)} placeholder="e.g. xx-xxxx-xxxx" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 outline-none font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/40" />
                </div>

                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"> <Save size={18} /> Save Configuration </button>
            </form>
        </div>
      </div>
    </div>
  );
};
