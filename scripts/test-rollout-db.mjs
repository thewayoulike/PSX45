// Real local PostgreSQL semantics. Never connects to production.
import { PGlite } from '../.audit-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table allowlist(email text primary key, approved boolean, approved_at timestamptz);`);
  await db.exec(await readFile(new URL('../migrations/20260917_public_rollout.sql', import.meta.url), 'utf8'));
  const call = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
  const rate = () => call('select psx_rate_limit($1,2,60) as result', ['a'.repeat(64)]);
  assert.deepEqual(await Promise.all([rate(),rate(),rate()]), [true,true,false]);
  await db.exec(`insert into allowlist values ('a@example.invalid',false,null);
    insert into approval_tokens values ('one','a@example.invalid',now()+interval '1 hour',null),
    ('expired','a@example.invalid',now()-interval '1 hour',null);`);
  assert.equal(await call("select psx_consume_approval('expired') as result"), null);
  assert.equal(await call("select psx_consume_approval('one') as result"), 'a@example.invalid');
  assert.equal(await call("select psx_consume_approval('one') as result"), null);
  assert.equal((await db.query("select approved from allowlist")).rows[0].approved, true);
  const head = (email, version = null, file = null) => call('select psx_cloud_head($1,$2,$3) as result', [email,version,file]);
  assert.equal((await head('a')).revision, 0);
  const races = await Promise.all([head('a',0,'fileAAAAAAAAAA'),head('a',0,'fileBBBBBBBBBB')]);
  assert.equal(races.filter(r => r.conflict).length, 1);
  const winner = races.find(r => !r.conflict);
  assert.equal((await head('a',0,winner.fileId)).revision, 1);
  assert.equal((await head('b')).revision, 0);
  for (let i = 1; i < 22; i++) await head('a', i, `file0000000000${i}`);
  assert.equal((await db.query("select cardinality(history) as n from cloud_heads where email='a'")).rows[0].n, 20);
  for (const role of ['anon','authenticated']) {
    const permissions = await db.query(`select has_function_privilege($1,'psx_cloud_head(text,bigint,text)','EXECUTE') as rpc, has_table_privilege($1,'allowlist','SELECT') as account`, [role]);
    assert.deepEqual(permissions.rows[0], { rpc: false, account: false });
  }
  console.log('PASS: single-use/expired approvals, shared rate limits, concurrent cloud CAS, idempotent commits, account isolation, retention, denied client permissions.');
} finally { await db.close(); }
