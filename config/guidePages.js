import { trackerGuidePages } from './trackerGuidePages.js';
import { learnGuidePages } from './learnGuidePages.js';

/** @typedef {[string, ...(string|string[])[]]} GuideSection */
/** @typedef {{ title: string, description: string, intro: string, blurb: string, sections: GuideSection[], related?: string[] }} GuidePage */

/** @type {Record<string, GuidePage>} */
export const guidePages = {
  ...trackerGuidePages,
  ...learnGuidePages,
};

export const guideHub = {
  title: 'PSX Tracker guides',
  eyebrow: 'Learn the investing workflow',
  description: 'In-depth guides on leaving Excel for a PSX tracker, starting on PSX, brokers, returns, Shariah basics, valuation, sector checklists, FIFO, CGT, dividends, funds, charts and portfolio sync.',
  intro: 'Long-form, practical explainers for Pakistan Stock Exchange investors who use PSX Tracker. Educational only — not investment, tax or religious advice. Start free when you are ready to track your own portfolio.',
};
