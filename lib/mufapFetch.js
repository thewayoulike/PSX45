import { isMufapBlockedPage, parseMufapNavHtml } from './mufapParse.js';
import { catalogNavDate } from './mufapSyncGuards.js';

export function sourceError(status, html, source) {
  const challenge = /just a moment|enable javascript and cookies/i.test(html || '');
  if (status === 403 || status === 429 || challenge) {
    const error = new Error(`${source}: ${status ? `HTTP ${status}; ` : ''}${challenge ? 'security challenge instead of NAV data' : 'access blocked or rate limited'}`);
    error.code = 'SOURCE_BLOCKED';
    return error;
  }
  if (status && status >= 400) return new Error(`${source}: HTTP ${status}`);
  return null;
}

export function packNavReport(html, requestedDate, source) {
  const error = sourceError(0, html, source);
  if (error) throw error;
  if (isMufapBlockedPage(html)) throw new Error(`${source}: empty/unusable report for ${requestedDate || 'latest'}`);
  const funds = parseMufapNavHtml(html);
  if (funds.length < 50) throw new Error(`${source}: only ${funds.length} funds for ${requestedDate || 'latest'}`);
  const catalog = Object.fromEntries(funds.map(f => [f.id, f]));
  const reportDate = catalogNavDate({ catalog });
  if (!reportDate) throw new Error(`${source}: report has no verifiable NAV dates`);
  return { funds: Object.values(catalog), reportDate, dateYmd: reportDate, requestedDate, source };
}

/** A source-wide security block does not improve when we request older dates. */
export async function fetchNavWithFallback(primary, fallback) {
  try { return await primary(); } catch (first) {
    try { return await fallback(); } catch (second) {
      const error = new Error(`${first.message}; ${second.message}`);
      if (first.code === 'SOURCE_BLOCKED' && second.code === 'SOURCE_BLOCKED') error.code = 'SOURCE_BLOCKED';
      throw error;
    }
  }
}
