import { beforeEach, expect, it, vi } from 'vitest';
import { preparePortfolioAccount, scrubSecretsFromRecoveryCopies, stripSecrets } from './localAccount';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  });
});

it('never archives the previous account’s API key when switching accounts', () => {
  store.set('psx_local_account', 'a@x.test'); store.set('psx_transactions', '[1]'); store.set('psx_gemini_api_key', 'AIza-secret');
  preparePortfolioAccount('b@x.test');
  const archive = [...store.entries()].find(([k]) => k.startsWith('psx_cloud_recovery:'))![1];
  expect(archive).toContain('psx_transactions'); expect(archive).not.toContain('AIza-secret');
});
it('removes API keys from older recovery copies on sign-out and keeps the portfolio data', () => {
  store.set('psx_cloud_recovery:a:1', JSON.stringify({ format: 'browser-cache', data: { psx_gemini_api_key: 'AIza-old', psx_transactions: '[1]' } }));
  store.set('psx_cloud_recovery:a:2', JSON.stringify({ revision: 'r', data: { geminiApiKey: 'AIza-old2', transactions: [{ id: 't' }] } }));
  scrubSecretsFromRecoveryCopies();
  const all = [...store.values()].join('');
  expect(all).not.toContain('AIza-old'); expect(all).toContain('psx_transactions'); expect(all).toContain('"id":"t"');
  expect(stripSecrets('not json')).toBe('not json');
});
