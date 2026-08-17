import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, RefreshCw, Loader2, Check, Ban, Trash2, KeyRound, AlertCircle, Search } from 'lucide-react';

interface AllowUser {
  email: string;
  name?: string | null;
  approved?: boolean;
  created_at?: string;
}

const SECRET_KEY = 'psx_admin_secret';

export const AdminUsers: React.FC = () => {
  const [secret, setSecret] = useState<string>(() => {
    try { return localStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
  });
  const [secretInput, setSecretInput] = useState('');
  const [users, setUsers] = useState<AllowUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // email being acted on
  const [query, setQuery] = useState('');

  const load = async (sec = secret) => {
    if (!sec) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin-users', { headers: { 'x-admin-secret': sec } });
      if (res.status === 401) {
        setError('That admin key is not correct.');
        setSecret('');
        try { localStorage.removeItem(SECRET_KEY); } catch {}
        return;
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (secret) load(secret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const unlock = () => {
    const s = secretInput.trim();
    if (!s) return;
    try { localStorage.setItem(SECRET_KEY, s); } catch {}
    setSecret(s);
    setSecretInput('');
  };

  const act = async (email: string, action: 'approve' | 'disable' | 'remove') => {
    if (action === 'remove' && !window.confirm(`Remove ${email}? They'll need to request access again.`)) return;
    setBusy(email);
    setError(null);
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ action, email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server error ${res.status}`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  // ---- Locked (no valid secret yet) ----
  if (!secret) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-md mx-auto">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-100 dark:border-brand-500/20 flex items-center justify-center">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-display font-black text-slate-900 dark:text-white tracking-tight">Admin access</h2>
              <p className="text-xs text-slate-400 font-medium">Enter your admin key to manage users.</p>
            </div>
          </div>
          <input
            type="password"
            value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') unlock(); }}
            placeholder="Admin key"
            className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:text-slate-100"
          />
          <button
            onClick={unlock}
            disabled={!secretInput.trim()}
            className="mt-3 w-full px-4 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-colors disabled:opacity-40"
          >
            Unlock
          </button>
          {error && <p className="mt-3 text-xs text-rose-500 font-medium flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
          <p className="mt-4 text-[11px] text-slate-400">This is your <span className="font-mono">APPROVE_SECRET</span> (same key used in the approval email links).</p>
        </div>
      </div>
    );
  }

  const filtered = users.filter(u => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
  });
  const approvedCount = users.filter(u => u.approved).length;
  const pendingCount = users.length - approvedCount;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-100 dark:border-brand-500/20 flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-slate-900 dark:text-white tracking-tight">Users</h2>
              <p className="text-xs text-slate-400 font-medium">
                {users.length} total · <span className="text-emerald-500 font-bold">{approvedCount} approved</span> · <span className="text-amber-500 font-bold">{pendingCount} pending / blocked</span>
              </p>
            </div>
          </div>
          <button onClick={() => load()} disabled={loading} className="p-2.5 rounded-xl text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors disabled:opacity-40" title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="relative mt-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by email or name…"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-brand-400 dark:text-slate-100"
          />
        </div>

        {error && <p className="mt-3 text-xs text-rose-500 font-medium flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-card dark:shadow-card-dark p-2 sm:p-4">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-14">{users.length === 0 ? 'No users yet.' : 'No matches.'}</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(u => {
              const isBusy = busy === u.email;
              return (
                <div key={u.email} className="flex items-center gap-3 py-3 px-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-white text-sm truncate">{u.name || u.email.split('@')[0]}</span>
                      {u.approved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20"><ShieldCheck size={10} /> Approved</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20">Pending / Blocked</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{u.email}{u.created_at ? ` · joined ${new Date(u.created_at).toLocaleDateString()}` : ''}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBusy ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                      <>
                        {u.approved ? (
                          <button onClick={() => act(u.email, 'disable')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors" title="Block sign-in (keeps the account)">
                            <Ban size={13} /> Disable
                          </button>
                        ) : (
                          <button onClick={() => act(u.email, 'approve')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors" title="Approve sign-in">
                            <Check size={13} /> Approve
                          </button>
                        )}
                        <button onClick={() => act(u.email, 'remove')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Remove from allowlist">
                          <Trash2 size={13} /> Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
