// Isolated fixture: no real Google requests, account changes, or portfolio data.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DriveSetupPrompt } from '../../src/components/DriveSetupPrompt';
import { GoogleAuthButton } from '../../src/components/GoogleAuthButton';
import { clearDriveSession, getRememberedDriveConfig, initDriveAuth, signInWithDrive } from '../../src/services/driveStorage';
import '../../src/index.css';

const memory = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key),
} });
let connected = true;
let securityBlocked = new URLSearchParams(location.search).has('challenge');
let showResult = (text: string) => {};
const identity = { email: 'demo@example.invalid', email_verified: true, name: 'Demo member' };
const script = document.createElement('script'); script.id = 'google-gsi-script'; document.head.appendChild(script);
window.google = { accounts: { oauth2: {
  initTokenClient: (options: any) => ({ requestAccessToken: ({ prompt }: any) => {
    showResult(`Normal sign-in; forced consent: ${prompt === 'consent' ? 'yes' : 'no'}`);
    void options.callback({ access_token: 'synthetic-access', expires_in: 3600 });
  } }),
  initCodeClient: (options: any) => ({ requestCode: () => {
    showResult('One-time connection setup requested');
    void options.callback({ code: 'synthetic-code' });
  } }),
} } };
window.fetch = async (input, init) => {
  if (String(input).endsWith('/userinfo')) return Response.json(identity);
  if (input !== '/api/cloud-sync') throw Error('Live requests are disabled.');
  const { action } = JSON.parse(String(init?.body));
  if (action === 'drive-config') return securityBlocked
    ? new Response('<html>Synthetic hosting checkpoint</html>', { status: 429, headers: { 'x-vercel-mitigated': 'challenge' } })
    : Response.json({ enabled: true, clientId: 'synthetic-client' });
  if (action === 'drive-status') return Response.json({ connected });
  if (action === 'drive-connect') {
    connected = true;
    return Response.json({ connected: true, accessToken: 'synthetic-access', expiresIn: 3600, user: identity });
  }
  throw Error('Unexpected action');
};
function Fixture() {
  const [result, setResult] = useState('Preparing test…');
  useEffect(() => {
    showResult = setResult;
    const cleanup = initDriveAuth(user => setResult(previous => `${previous}. Opened ${user.email}`));
    void getRememberedDriveConfig().then(() => setResult('Ready. Returning member selected.'), () => setResult('Simulated security checkpoint. No real accounts or portfolio data are used.'));
    return cleanup;
  }, []);
  return <main className="p-5 min-h-screen bg-slate-50 text-slate-900">
    <h1 className="font-bold text-xl">Google login flow — synthetic check</h1>
    <div className="flex flex-wrap gap-3 my-5">
      <button className="border p-3 rounded" onClick={() => { clearDriveSession(); connected = true; setResult('Returning member selected.'); }}>Returning member</button>
      <button className="border p-3 rounded" onClick={() => { clearDriveSession(); connected = false; setResult('New connection selected.'); }}>New connection</button>
      <button className="border p-3 rounded" onClick={() => { securityBlocked = false; setResult('Test requests allowed. Tap Retry Google sign-in.'); }}>Allow requests (test only)</button>
    </div>
    <section className="max-w-sm mx-auto rounded-2xl bg-white border border-slate-200 p-5 my-5">
      <GoogleAuthButton className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 p-3 font-bold" onClick={() => signInWithDrive()}>Sign in with Google</GoogleAuthButton>
      <p className="mt-2 text-xs text-slate-500 text-center">Your portfolio stays in your Drive.</p>
    </section>
    <p role="status">{result}</p>
    <DriveSetupPrompt />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
