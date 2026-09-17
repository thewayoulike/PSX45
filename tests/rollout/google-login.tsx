// Isolated fixture: no real Google requests, account changes, or portfolio data.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DriveSetupPrompt } from '../../src/components/DriveSetupPrompt';
import { clearDriveSession, getRememberedDriveConfig, initDriveAuth, signInWithDrive } from '../../src/services/driveStorage';
import '../../src/index.css';

const memory = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key),
} });
let connected = true;
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
  if (action === 'drive-config') return Response.json({ enabled: true, clientId: 'synthetic-client' });
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
    void getRememberedDriveConfig().then(() => setResult('Ready. Returning member selected.'));
    return cleanup;
  }, []);
  return <main className="p-5 min-h-screen bg-slate-50 text-slate-900">
    <h1 className="font-bold text-xl">Google login flow — synthetic check</h1>
    <div className="flex flex-wrap gap-3 my-5">
      <button className="border p-3 rounded" onClick={() => { clearDriveSession(); connected = true; setResult('Returning member selected.'); }}>Returning member</button>
      <button className="border p-3 rounded" onClick={() => { clearDriveSession(); connected = false; setResult('New connection selected.'); }}>New connection</button>
      <button className="bg-emerald-600 text-white p-3 rounded" onClick={() => signInWithDrive()}>Sign in with Google</button>
    </div>
    <p role="status">{result}</p>
    <DriveSetupPrompt />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
