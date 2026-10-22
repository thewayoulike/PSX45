import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { TRIAL_DAYS } from '../../config/product.js';
import { GoogleAuthButton } from './GoogleAuthButton';
import { signUp, signIn, isAuthConfigured, requestPasswordReset } from '../services/auth';
import { signInWithDrive } from '../services/driveStorage';
const LoginEmailAuth: React.FC<{ onAuthSuccess?: () => void; onGoogleLogin?: () => void }> = ({ onAuthSuccess, onGoogleLogin }) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'signup-done'>('idle');
  const [msg, setMsg] = useState('');
  const [resetMode, setResetMode] = useState(false);

  const inputCls = "w-full px-3 py-3 text-base bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:text-white transition-all";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthConfigured()) { setStatus('error'); setMsg('Login is not configured yet. Please contact the owner.'); return; }
    if (resetMode) {
      setStatus('loading');
      try { await requestPasswordReset(email); setStatus('idle'); setMsg('If that email has an account, a reset link is on its way. Check your inbox and spam folder.'); }
      catch (error) { setStatus('error'); setMsg(error instanceof Error ? error.message : 'Please retry shortly.'); }
      return;
    }
    if (!email.trim() || !password) { setStatus('error'); setMsg('Enter your email and password.'); return; }
    if (tab === 'signup' && !name.trim()) { setStatus('error'); setMsg('Please enter your name.'); return; }
    if (tab === 'signup' && password.length < 10) { setStatus('error'); setMsg('Password must be at least 10 characters.'); return; }

    setStatus('loading'); setMsg('');
    try {
      if (tab === 'signup') {
        await signUp(name.trim(), email.trim(), password);
        setStatus('signup-done');
        setMsg('Check your inbox for an email confirmation if required, then log in. Your free trial starts straight away.');
      } else {
        await signIn(email.trim(), password);
        onAuthSuccess?.(); // App re-checks session + approval and routes accordingly
      }
    } catch (err: any) {
      setStatus('error');
      setMsg(err?.message || 'Something went wrong. Please try again.');
    }
  };

  if (status === 'signup-done') {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl shadow-lg p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="text-xl font-display font-black tracking-tight mb-2">Check your email</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">{msg}</p>
        <button onClick={() => { setStatus('idle'); setTab('login'); setPassword(''); }} className="text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Back to log in</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl shadow-lg p-7">
      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-6">
        {(['login', 'signup'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setResetMode(false); setStatus('idle'); setMsg(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            {t === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === 'signup' && (
          <div className="relative">
            <label htmlFor="signup-name" className="block text-sm mb-1">Your name</label><input id="signup-name" autoComplete="name" value={name} onChange={e => { setName(e.target.value); setStatus('idle'); }} placeholder="Your name" className={inputCls} />
          </div>
        )}
        <div className="relative">
          <label htmlFor="login-email" className="block text-sm mb-1">Email</label><input id="login-email" autoComplete="email" required type="email" value={email} onChange={e => { setEmail(e.target.value); setStatus('idle'); }} placeholder="Email" className={inputCls} />
        </div>
        {!resetMode && <div className="relative">
          <label htmlFor="login-password" className="block text-sm mb-1">Password</label>
          <input id="login-password" required minLength={tab === 'signup' ? 10 : undefined} maxLength={72} type="password" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => { setPassword(e.target.value); setStatus('idle'); }} placeholder={tab === 'signup' ? 'At least 10 characters' : 'Password'} className={inputCls} />
        </div>}
        {msg && status !== 'error' && <p role="status" className="text-sm">{msg}</p>}
        {tab === 'login' && <button type="button" className="text-sm underline py-2" onClick={() => { setResetMode(!resetMode); setMsg(''); setStatus('idle'); }}>{resetMode ? 'Back to password login' : 'Forgot password?'}</button>}

        {status === 'error' && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 flex items-start gap-2 text-rose-600 dark:text-rose-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="text-sm font-medium">{msg}</span>
          </div>
        )}

        <button type="submit" disabled={status === 'loading'} className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
          {status === 'loading' ? <><Loader2 size={18} className="animate-spin" /> Please wait…</> : resetMode ? 'Send reset link' : (tab === 'login' ? 'Log in' : 'Create account')}
        </button>
      </form>

      <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center mt-4 leading-snug">
        {tab === 'signup'
          ? `New accounts get a ${TRIAL_DAYS}-day full free trial from the moment they sign up — then Free forever with limits, or upgrade to Paid.`
          : "Can't get in? Email itruth2011@gmail.com and we'll help."}
      </p>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      <GoogleAuthButton
        onClick={onGoogleLogin || (() => signInWithDrive())}
        className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:shadow-md text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl transition-all"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5 shrink-0" alt="" />
        Sign in with Google
        <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">Recommended</span>
      </GoogleAuthButton>
      <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center mt-1.5">Your portfolio stays in your Drive. We retain encrypted Google permission so linked password logins can reopen it. Disconnect anytime in Profile & security.</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 text-center mt-4 leading-relaxed">By creating an account, you agree to our <a href="/terms" className="underline">Terms & Conditions</a>. Read how your information is used in our <a href="/privacy" className="underline">Privacy Policy</a>.</p>
    </div>
  );
};


export default LoginEmailAuth;
