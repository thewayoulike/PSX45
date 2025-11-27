import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, Lock, ExternalLink, Save } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSave: (key: string) => void;
  isDriveConnected: boolean;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ 
  isOpen, onClose, apiKey, onSave, isDriveConnected 
}) => {
  const [inputKey, setInputKey] = useState(apiKey);
  
  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // FIX: Aggressively remove any non-ASCII characters before saving
    // This removes hidden spaces, newlines, or formatting artifacts
    const sanitizedKey = inputKey.replace(/[^\x00-\x7F]/g, "").trim();
    
    onSave(sanitizedKey);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Key className="text-indigo-600" size={20} />
            AI Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
            {!isDriveConnected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <Lock className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-amber-800 text-sm">Sync Disabled</h4>
                        <p className="text-xs text-amber-700 mt-1">
                            You must be logged in to Google Drive to save your API Key securely.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                    <ShieldCheck className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="font-bold text-emerald-800 text-sm">Secure Storage</h4>
                        <p className="text-xs text-emerald-700 mt-1">
                            Your key will be encrypted and saved to your personal Google Drive (psx_tracker_data.json).
                        </p>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Gemini API Key</label>
                    <input 
                        type="password" 
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="AIzaSy..." 
                        disabled={!isDriveConnected}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                    />
                </div>

                <div className="text-xs text-slate-500 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="font-bold text-slate-700">How to get a key:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                        <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5">Google AI Studio <ExternalLink size={10} /></a></li>
                        <li>Click "Create API Key"</li>
                        <li>Copy the key and paste it above</li>
                    </ol>
                    <p className="italic opacity-70 mt-2">
                        Free tier is sufficient for personal use. <br/>
                        <span className="font-bold text-rose-500 not-italic">Please refresh the page after saving KEY.</span>
                    </p>
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
