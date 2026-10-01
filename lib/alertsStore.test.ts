import { expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ ilike: [] as [string, string][] }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
  const q: any = { select: () => q, order: () => q, ilike: (col: string, pat: string) => { calls.ilike.push([col, pat]); return q; },
    limit: async () => ({ data: [
      { sid: '1', record: { userEmail: 'Ali_Khan@Example.com', alerts: [] } },
      { sid: '2', record: { userEmail: 'aliXkhan@example.com', alerts: [] } },
    ], error: null }) };
  return q;
} }) }));
import { getRecordsForOwner } from './alertsStore.js';

it('reads only the signed-in account, escaping LIKE wildcards in the email', async () => {
  const rows = await getRecordsForOwner(' Ali_Khan@example.com ');
  expect(calls.ilike[0]).toEqual(['record->>userEmail', 'ali\\_khan@example.com']);
  expect(rows.map(r => r.sid)).toEqual(['1']);
  expect(await getRecordsForOwner('')).toEqual([]);
});
