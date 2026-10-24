import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertCatalogNotOlder, assertCatalogNotShrunk, catalogNavDate, newestCatalog, preserveNewerFunds, sameFundData } from '../lib/mufapSyncGuards.js';

const FILES = ['data/fund-nav-catalog.json', 'data/fund-nav-previous.json', 'public/data/fund-nav-catalog.json'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Publish only generated NAV files, refreshing main before each non-forced push. */
export async function publishCatalog({ cwd = ROOT, branch = 'main', attempts = 3, beforePush = async () => {} } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const read = file => { try { return JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8')); } catch { return null; } };
  const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), JSON.stringify(data, null, 2)); };
  if (git('branch', '--show-current') !== branch) throw new Error(`Publish must run on ${branch}.`);
  if (git('diff', '--cached', '--name-only')) throw new Error('Refusing to publish with pre-existing staged changes.');
  const changed = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  if (changed.some(file => !FILES.includes(file))) throw new Error('Refusing to publish: files outside the generated NAV catalog were modified.');
  const candidate = newestCatalog(read(FILES[0]), read(FILES[2]));
  assertCatalogNotOlder(candidate, null);
  const originalHead = git('rev-parse', 'HEAD');
  // These exact generated files are held in memory; no source files or untracked files are reset.
  git('restore', '--source=HEAD', '--worktree', '--', ...FILES);
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    git('fetch', 'origin', branch);
    git('merge', '--ff-only', `origin/${branch}`);
    const existing = newestCatalog(read(FILES[0]), read(FILES[2]));
    if (existing && (catalogNavDate(candidate) < catalogNavDate(existing)
      || (catalogNavDate(candidate) === catalogNavDate(existing) && candidate.updatedAt < existing.updatedAt))) {
      console.log('[publish-mufap] A newer catalog is already published; keeping it.');
      return { status: 'superseded' };
    }
    assertCatalogNotOlder(candidate, existing);
    assertCatalogNotShrunk(candidate.count, existing?.count || 0);
    const payload = preserveNewerFunds(candidate, existing);
    if (sameFundData(existing, payload) && sameFundData(read(FILES[0]), read(FILES[2]))) {
      console.log('[publish-mufap] Fund data unchanged.');
      return { status: 'unchanged' };
    }
    write(FILES[0], payload);
    write(FILES[2], payload);
    write(FILES[1], { updatedAt: payload.updatedAt, date: payload.yesterday, reportDate: payload.previousReportDate,
      count: Object.keys(payload.previousNavs || {}).length, previousNavs: payload.previousNavs || {} });
    git('add', '--', ...FILES);
    if (!git('diff', '--cached', '--name-only')) return { status: 'unchanged' };
    const parent = git('rev-parse', 'HEAD');
    git('commit', '-m', 'chore: sync MUFAP fund NAV catalog');
    const ownCommit = git('rev-parse', 'HEAD');
    await beforePush(attempt);
    try {
      git('push', 'origin', `HEAD:${branch}`);
      console.log(`[publish-mufap] Published ${payload.count} funds dated ${payload.reportDate}.`);
      return { status: 'published', commit: ownCommit, originalHead };
    } catch (error) {
      git('fetch', 'origin', branch);
      // Retry only a moving remote branch, not authentication or branch protection failures.
      if (attempt === attempts || git('rev-parse', `origin/${branch}`) === parent) throw error;
      if (git('rev-parse', 'HEAD') !== ownCommit) throw new Error('Checkout changed unexpectedly; stopping publication.');
      // Undo only this function's unpublished commit, then regenerate against the new remote.
      git('reset', '--soft', parent);
      git('restore', '--source=HEAD', '--staged', '--worktree', '--', ...FILES);
      console.warn(`[publish-mufap] Main changed during publication; retrying (${attempt}/${attempts}).`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishCatalog().catch(error => { console.error('[publish-mufap] FAILED:', error.message); process.exitCode = 1; });
}
