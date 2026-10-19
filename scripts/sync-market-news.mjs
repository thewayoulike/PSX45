// Public GDELT Article List metadata: https://blog.gdeltproject.org/announcing-the-gdelt-article-list-rss-feed/
// Sample archived minute files rather than depending on the rate-limited search API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseMarketNews, mergeNewsItems } from '../lib/marketNews.js';

const output = path.resolve(process.argv[2] || '.market-data');
const hours = Number(process.env.NEWS_BACKFILL_HOURS || 3);
if (!Number.isInteger(hours) || hours < 1 || hours > 72) throw new Error('Invalid news collection window');
const now = Date.now(), file = path.join(output, 'news.json');
await fs.mkdir(output, { recursive: true });
let old;
try { old = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const items = [...(old?.items || [])], slots = [];
// GDELT publishes in batches after each quarter-hour. Two samples per batch
// keep downloads bounded; the UI explicitly describes coverage as partial.
const end = Math.floor((now - 10 * 60000) / 900000) * 900000;
for (let quarter = end; quarter >= now - hours * 3600000; quarter -= 900000) {
  for (const minute of [2, 7]) if (quarter + minute * 60000 < now - 5 * 60000) slots.push(quarter + minute * 60000);
}
let index = 0, checked = 0, missing = 0, failed = 0;
async function collect() {
  while (index < slots.length) {
    const time = slots[index++], stamp = new Date(time).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    try {
      const response = await fetch(`https://data.gdeltproject.org/gdeltv3/gal/${stamp}.gal.json.gz`, { signal: AbortSignal.timeout(25000) });
      if (response.status === 404) { missing++; continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw new Error('Oversized source file');
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) throw new Error('Oversized source file'); chunks.push(chunk); }
      const lines = gunzipSync(Buffer.concat(chunks), { maxOutputLength: 48 * 1024 * 1024 }).toString('utf8').split('\n');
      const articles = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const row = JSON.parse(line);
        if (row.lang !== 'ENGLISH' && row.lang !== 'English' && row.lang !== 'en') continue;
        articles.push({ url: row.url, title: row.title, language: 'English', seendate: stamp.slice(0, 8) + 'T' + stamp.slice(8) + 'Z' });
      }
      const accepted = parseMarketNews({ articles }, now); items.push(...accepted); checked++;
      if (accepted.length) console.log(`${stamp}: ${accepted.length} market headlines`);
    } catch (error) { failed++; console.error(`${stamp}: ${error.message}`); }
    if ((checked + missing + failed) % 20 === 0) console.log(`Checked ${checked + missing + failed}/${slots.length} source files`);
  }
}
await Promise.all([collect(), collect(), collect()]);
if (!checked) throw new Error('No valid source files; previous headlines retained');
const merged = mergeNewsItems(items, now);
if (!merged.length) throw new Error('No recent market headlines; previous headlines retained');
const data = { updatedAt: new Date(now).toISOString(), provider: 'GDELT', partial: true, checked, missing, failed, items: merged };
await fs.writeFile(file + '.tmp', JSON.stringify(data));
await fs.rename(file + '.tmp', file);
console.log(`Saved ${merged.length} headlines; ${checked} files read, ${missing} unpublished, ${failed} failed.`);
if (failed > slots.length / 2) process.exitCode = 1;
