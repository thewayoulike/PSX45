import { trackerGuidePages } from './trackerGuidePages.js';
import { learnGuidePages } from './learnGuidePages.js';
export { guideHub, guideHubClusters, guideHubStartHere, guideHubToc } from './guideHub.js';

/** @typedef {[string, ...(string|string[]|GuideBlock)[]]} GuideSection */
/** @typedef {{ h3: string } | { table: { headers: string[], rows: string[][] } } | { links: { href: string, label: string, note?: string, external?: boolean }[] } | { faqs: [string, string][] }} GuideBlock */
/** @typedef {{ title: string, description: string, intro: string, blurb: string, sections: GuideSection[], related?: string[], faqs?: [string, string][] }} GuidePage */

/** @type {Record<string, GuidePage>} */
export const guidePages = {
  ...trackerGuidePages,
  ...learnGuidePages,
};
