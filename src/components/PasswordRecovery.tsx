import React, { useEffect, useState } from 'react';
import { completePasswordReset, supabase } from '../services/auth';
export function PasswordRecovery() {
  const [ready, setReady] = useState(false), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('Checking reset link…'), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [completionMessage, setCompletionMessage] = useState('Password updated. You can now log in.');
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      const valid = !!data.session && !error && !`${window.location.hash}${window.location.search}`.includes('error=');
      setReady(valid); setMessage(valid ? 'Choose a new password with at least 10 characters.' : 'This reset link is invalid or expired. Return to login and request a new link.');
    };
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => void check(), 0); });
    void check();
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-5 text-slate-900 dark:text-white"><form className="w-full max-w-md bg-white dark:bg-slate-900 p-6 rounded-2xl shadow space-y-4" onSubmit={async e => {
    e.preventDefault(); if (password !== confirm) { setMessage('Passwords must match.'); return; }
    setBusy(true); try { const result = await completePasswordReset(password); setReady(false); setDone(true); setCompletionMessage(result.driveLinkFailed ? 'Password updated. Drive linking could not finish. Log in, then approve Google once to enable automatic Drive access.' : 'Password updated. You can now log in.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); }
  }}><h1 className="text-2xl font-bold">Set your PSX Tracker password</h1><p role="status">{done ? completionMessage : message}</p>
    {ready && !done && <><label className="block">New password<input className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded w-full p-3" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} /></label><label className="block">Confirm password<input className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded w-full p-3" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={busy} className="w-full rounded bg-emerald-600 text-white p-3">{busy ? 'Updating…' : 'Save password'}</button></>}
    <a href="/login" className="block underline py-3">Back to login</a>
  </form></main>;
}
