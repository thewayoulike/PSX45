// Collect verified public publisher feeds once per hour.
// Publish headline links and publisher metadata only, never article bodies or images.
import fs from 'node:fs/promises';
import path from 'node:path';
import { mergeNewsItems, fetchBusinessRecorderNews, BUSINESS_RECORDER_FEEDS, NEWS_WINDOW_DAYS, PUBLISHER_FEEDS, fetchPublisherNews } from '../lib/marketNews.js';

const output = path.resolve(process.argv[2] || '.market-data');
const file = path.join(output, 'news.json');
await fs.mkdir(output, { recursive: true });
let old;
try { old = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const items = old?.items || [];
const jobs = [...BUSINESS_RECORDER_FEEDS.map(section => ({ id: `br-${section}`, load: () => fetchBusinessRecorderNews(section) })), ...PUBLISHER_FEEDS.map(feed => ({ id: feed.id, load: () => fetchPublisherNews(feed.id) }))];
const feeds = [], failedFeeds = [];
// Bounded concurrency; one request per section, with no article-page crawling.
let index = 0;
async function collect() {
  while (index < jobs.length) {
    const { id: section, load } = jobs[index++];
    try {
      const headlines = await load();
      items.push(...headlines);
      feeds.push({ section, count: headlines.length });
      console.log(`${section}: ${headlines.length} recent headlines`);
    } catch (error) {
      failedFeeds.push(section);
      console.error(`${section}: ${error.message}; keeping previously collected headlines`);
    }
  }
}
await Promise.all([collect(), collect(), collect()]);
if (!feeds.length) throw new Error('All publisher feeds unavailable; previous snapshot retained');
const now = Date.now(), merged = mergeNewsItems(items, now);
if (!merged.length) throw new Error('No recent publisher headlines; previous snapshot retained');
const updatedAt = new Date(now).toISOString();
const businessRecorder = {
  lastSuccessAt: failedFeeds.some(id => id.startsWith('br-')) ? old?.businessRecorder?.lastSuccessAt : updatedAt,
  unavailable: failedFeeds.some(id => id.startsWith('br-')), latestCount: merged.filter(item => item.sourceDomain === 'brecorder.com').length,
  feeds: feeds.filter(feed => feed.section.startsWith('br-')).sort((a, b) => a.section.localeCompare(b.section)), failedFeeds: failedFeeds.filter(id => id.startsWith('br-')),
};
const data = { updatedAt, provider: 'Publisher RSS', windowDays: NEWS_WINDOW_DAYS, partial: failedFeeds.length > 0, feeds, failedFeeds, businessRecorder, items: merged };
await fs.writeFile(file + '.tmp', JSON.stringify(data));
await fs.rename(file + '.tmp', file);
console.log(`Saved ${merged.length} unique headlines; ${feeds.length}/${jobs.length} feeds refreshed.`);
if (failedFeeds.length) process.exitCode = 1;
