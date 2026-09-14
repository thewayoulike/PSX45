// Isolated real PostgreSQL (WASM), never connects to a production database.
// Setup: npm install --prefix .audit-tools --no-save --package-lock=false @electric-sql/pglite
import { PGlite } from '../.audit-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.alert_store (sid text primary key, record jsonb not null, updated_at timestamptz default now());`);
  await db.exec(await readFile(new URL('../migrations/20260914_alert_safety.sql', import.meta.url), 'utf8'));
  const call = async (sid, owner, action, payload = {}) => (await db.query(
    'select public.psx_mutate_alerts($1,$2,$3,$4::jsonb) as result', [sid, owner, action, JSON.stringify(payload)]
  )).rows[0].result;
  const add = (id, ticker = 'AAA') => ({ subscription: { endpoint: 'https://push.test' },
    alerts: [{ id, ticker, direction: 'ABOVE', targetPrice: 10 }], quotas: { alertsTickers: 3, alertsTp: 2, alertsSl: 2 } });
  assert.deepEqual(await call('one', 'a@example.com', 'append', add('a')), {});
  for (const action of ['read', 'remove', 'append']) {
    assert.equal((await call('one', 'b@example.com', action, { ...add('b'), id: 'a' })).status, 403);
  }
  await db.query('insert into alert_store(sid,record) values($1,$2)', ['legacy', JSON.stringify({ alerts: [] })]);
  assert.equal((await call('legacy', 'a@example.com', 'append', add('x'))).status, 403);
  // Same account, different devices share a TP quota.
  assert.deepEqual(await call('two', 'a@example.com', 'append', add('b')), {});
  assert.equal((await call('three', 'a@example.com', 'append', add('c'))).status, 403);
  await call('two', 'a@example.com', 'remove', { id: 'b' });
  assert.deepEqual(await call('three', 'a@example.com', 'append', add('c')), {});
  // Claim -> concurrent append -> completion: only claimed alert is consumed.
  const claims = await Promise.all([
    call('one', 'a@example.com', 'claim', { id: 'a', token: 'worker1' }),
    call('one', 'a@example.com', 'claim', { id: 'a', token: 'worker2' }),
  ]);
  assert.equal(claims.filter(c => c.alert).length, 1);
  await call('one', 'a@example.com', 'append', add('new', 'BBB'));
  await call('one', 'a@example.com', 'finish', { id: 'a', token: 'wrong', outcome: 'sent' });
  assert.equal((await call('one', 'a@example.com', 'read')).alerts.length, 2);
  await call('one', 'a@example.com', 'finish', { id: 'a', token: 'worker1', outcome: 'sent' });
  assert.deepEqual((await call('one', 'a@example.com', 'read')).alerts.map(a => a.id), ['new']);
  // A stale worker cannot resurrect a deleted alert.
  await call('one', 'a@example.com', 'claim', { id: 'new', token: 'delete-race' });
  await call('one', 'a@example.com', 'remove', { id: 'new' });
  await call('one', 'a@example.com', 'finish', { id: 'new', token: 'delete-race', outcome: 'retry' });
  assert.deepEqual((await call('one', 'a@example.com', 'read')).alerts, []);
  assert.equal((await call('one', 'b@example.com', 'append', add('hijack'))).status, 403);
  // Distinct ticker limits are account-wide too.
  await call('one', 'a@example.com', 'append', add('d', 'BBB'));
  await call('two', 'a@example.com', 'append', add('e', 'CCC'));
  assert.equal((await call('four', 'a@example.com', 'append', add('f', 'DDD'))).status, 403);
  const permissions = await db.query(`select
    has_function_privilege('anon','public.psx_mutate_alerts(text,text,text,jsonb)','EXECUTE') as anon,
    has_function_privilege('authenticated','public.psx_mutate_alerts(text,text,text,jsonb)','EXECUTE') as authenticated,
    has_function_privilege('service_role','public.psx_mutate_alerts(text,text,text,jsonb)','EXECUTE') as service`);
  assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service: true });
  await db.exec('set role service_role');
  assert.deepEqual((await call('one', 'a@example.com', 'read')).alerts.map(a => a.id), ['d']);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.alert_store'), /permission denied/);
  await db.exec('reset role');
  console.log('PASS: migration execution, ownership, legacy quarantine, cross-device quotas, claim races, removal races, RPC permissions.');
} finally { await db.close(); }
