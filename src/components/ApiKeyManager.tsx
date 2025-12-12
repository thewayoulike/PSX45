import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, Lock, ExternalLink, Save, Globe } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;         // Gemini Key
  scrapingApiKey: string; // NEW: Scraper Key
  onSave: (geminiKey: string, scraperKey: string) => void;
  isDriveConnected: boolean;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ 
  isOpen, onClose, apiKey, scrapingApiKey, onSave, isDriveConnected 
}) => {
  const [inputGeminiKey, setInputGeminiKey] = useState(apiKey);
  const [inputScraperKey, setInputScraperKey] = useState(scrapingApiKey);
  
  useEffect(() => {
    setInputGeminiKey(apiKey);
    setInputScraperKey(scrapingApiKey);
  }, [apiKey, scrapingApiKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGemini = inputGeminiKey.replace(/[^\x00-\x7F]/g, "").trim();
    const cleanScraper = inputScraperKey.replace(/[^\x00-\x7F]/g, "").trim();
    onSave(cleanGemini, cleanScraper);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Key className="text-indigo-600" size={20} />
            API Configurations
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            {!isDriveConnected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <Lock className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-amber-800 text-sm">Sync Disabled</h4>
                        <p className="text-xs text-amber-700 mt-1">
                            Login to Google Drive to securely save your keys for cross-device access.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                    <ShieldCheck className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-emerald-800 text-sm">Secure Storage</h4>
                        <p className="text-xs text-emerald-700 mt-1">
                            Keys are encrypted and stored in your private Google Drive file.
                        </p>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                
                {/* GEMINI AI KEY SECTION */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                        <Key size={14} /> Gemini AI Key (for Scanning)
                    </label>
                    <input 
                        type="password" 
                        value={inputGeminiKey}
                        onChange={(e) => setInputGeminiKey(e.target.value)}
                        placeholder="AIzaSy..." 
                        disabled={!isDriveConnected}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none font-mono text-sm"
                    />
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 hover:underline inline-flex items-center gap-1">
                        Get free key from Google <ExternalLink size={10} />
                    </a>
                </div>

                <div className="h-px bg-slate-100 w-full"></div>

                {/* SCRAPER API KEY SECTION */}
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                        <Globe size={14} /> Scrape.do Token (for Sync)
                    </label>
                    <input 
                        type="password" 
                        value={inputScraperKey}
                        onChange={(e) => setInputScraperKey(e.target.value)}
                        placeholder="e.g. 54a1..." 
                        disabled={!isDriveConnected}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none font-mono text-sm"
                    />
                     <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-[10px] text-blue-700 leading-relaxed">
                        <p className="font-bold mb-1">Why do I need this?</p>
                        <p>Public proxies get blocked often. A free Scrape.do token gives you ~1000 reliable syncs/month.</p>
                        <a href="https://scrape.do/" target="_blank" rel="noopener noreferrer" className="text-blue-800 hover:underline font-bold mt-1 inline-block">
                            Get Free Token &rarr;
                        </a>
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={!isDriveConnected}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                >
                    <Save size={18} />
                    Save Configuration
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};
