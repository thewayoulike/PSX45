// Local synthetic estimate only. Does not connect to Supabase or Google Drive.
import { PGlite } from '../.audit-tools/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table allowlist(email text primary key, approved boolean, approved_at timestamptz);`);
  await db.exec(await readFile(new URL('../migrations/20260917_public_rollout.sql', import.meta.url), 'utf8'));
  const results = [];
  for (const idLength of [44, 200]) {
    // DISTINCT synthetic hashes avoid an unrealistically compressible fixture.
    await db.exec(`truncate cloud_heads;
      insert into cloud_heads(email,revision,file_id,history)
      select 'sample-' || i || '@example.invalid',20,refs[1],refs
      from generate_series(1,1000) i cross join lateral (
        select array_agg(substr(
          md5(i::text||':'||j::text||':a') || md5(i::text||':'||j::text||':b') ||
          md5(i::text||':'||j::text||':c') || md5(i::text||':'||j::text||':d') ||
          md5(i::text||':'||j::text||':e') || md5(i::text||':'||j::text||':f') ||
          md5(i::text||':'||j::text||':g'), 1, ${idLength}) order by j) refs
        from generate_series(1,20) j
      ) ids;
      analyze cloud_heads;`);
    const { rows } = await db.query(`select count(*)::int accounts,
      round(avg(pg_column_size(cloud_heads)))::int as average_row_bytes,
      pg_total_relation_size('cloud_heads')::int as table_and_indexes_bytes
      from cloud_heads;`);
    results.push({file_id_characters:idLength,backup_ids_per_account:20,...rows[0]});
  }
  console.log(JSON.stringify({
    method:'Fresh local PostgreSQL table with 1,000 synthetic accounts; includes indexes/TOAST, excludes other app/auth data and production update bloat.',
    supabase_file_storage_bytes:0,
    results
  },null,2));
} finally { await db.close(); }
