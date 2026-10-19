// Collect Business Recorder's public section feeds once per hour.
// Publish headline links and publisher metadata only, never article bodies or images.
import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeNewsItems, fetchBusinessRecorderNews, BUSINESS_RECORDER_FEEDS, NEWS_WINDOW_DAYS } from '../lib/marketNews.js';

const output = path.resolve(process.argv[2] || '.market-data');
const file = path.join(output, 'news.json');
await fs.mkdir(output, { recursive: true });
let old;
try { old = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const items = (old?.items || []).filter(item => item.provider === 'Business Recorder RSS');
const feeds = [], failedFeeds = [];
// Bounded concurrency; one request per section, with no article-page crawling.
let index = 0;
async function collect() {
  while (index < BUSINESS_RECORDER_FEEDS.length) {
    const section = BUSINESS_RECORDER_FEEDS[index++];
    try {
      const headlines = await fetchBusinessRecorderNews(section);
      items.push(...headlines);
      feeds.push({ section, count: headlines.length });
      console.log(`Business Recorder ${section}: ${headlines.length} recent headlines`);
    } catch (error) {
      failedFeeds.push(section);
      console.error(`Business Recorder ${section}: ${error.message}; keeping previously collected headlines`);
    }
  }
}
await Promise.all([collect(), collect(), collect()]);
if (!feeds.length) throw new Error('All publisher feeds unavailable; previous snapshot retained');
const now = Date.now(), merged = mergeNewsItems(items, now);
if (!merged.length) throw new Error('No recent publisher headlines; previous snapshot retained');
const updatedAt = new Date(now).toISOString();
const businessRecorder = {
  lastSuccessAt: failedFeeds.length ? old?.businessRecorder?.lastSuccessAt : updatedAt,
  unavailable: failedFeeds.length > 0, latestCount: merged.length,
  feeds: feeds.sort((a, b) => a.section.localeCompare(b.section)), failedFeeds,
};
const data = { updatedAt, provider: 'Business Recorder RSS', windowDays: NEWS_WINDOW_DAYS, partial: true, businessRecorder, items: merged };
await fs.writeFile(file + '.tmp', JSON.stringify(data));
await fs.rename(file + '.tmp', file);
console.log(`Saved ${merged.length} unique Business Recorder headlines; ${feeds.length}/${BUSINESS_RECORDER_FEEDS.length} feeds refreshed.`);
if (failedFeeds.length) process.exitCode = 1;
