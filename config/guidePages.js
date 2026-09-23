import { trackerGuidePages } from './trackerGuidePages.js';
import { learnGuidePages } from './learnGuidePages.js';
import { guideDepth } from './guideDepth.js';
import { guideDepthMore } from './guideDepthMore.js';
export { guideHub, guideHubClusters, guideHubStartHere, guideHubToc } from './guideHub.js';

const extraSections = { ...guideDepth, ...guideDepthMore };

function withDepth(pages) {
  const out = {};
  for (const [slug, page] of Object.entries(pages)) {
    const extra = extraSections[slug] || [];
    out[slug] = extra.length ? { ...page, sections: [...page.sections, ...extra] } : page;
  }
  return out;
}

/** @typedef {[string, ...(string|string[]|GuideBlock)[]]} GuideSection */
/** @typedef {{ h3: string } | { table: { headers: string[], rows: string[][] } } | { links: { href: string, label: string, note?: string, external?: boolean }[] } | { faqs: [string, string][] }} GuideBlock */
/** @typedef {{ title: string, description: string, intro: string, blurb: string, sections: GuideSection[], related?: string[], faqs?: [string, string][] }} GuidePage */

/** @type {Record<string, GuidePage>} */
export const guidePages = withDepth({
  ...trackerGuidePages,
  ...learnGuidePages,
});
