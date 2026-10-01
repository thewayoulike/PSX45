// lib/mufapSyncGuards.js
// Safety checks for the MUFAP NAV sync: never publish a partial catalog, never label stale NAVs
// as yesterday's, and never commit (and deploy) when the fund data did not change.

const DAY_MS = 86400000;
const daysBetween = (fromYmd, toYmd) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);

/** Throws when a fetch returned far fewer funds than the catalog it would replace. */
export function assertCatalogNotShrunk(newCount, existingCount, { minRatio = 0.85, allow = false } = {}) {
  if (allow || !(existingCount >= 100)) return;
  if (newCount < Math.ceil(existingCount * minRatio)) {
    throw new Error(`Only ${newCount} funds parsed, against ${existingCount} in the current catalog. Keeping the current catalog. Set MUFAP_ALLOW_SHRINK=1 if the drop is real.`);
  }
}

/**
 * Previous-day NAVs when the prior-day fetch failed. The last published catalog holds the most
 * recent earlier day's NAVs; the separate previous-NAV file is a second choice. Anything older than
 * `maxAgeDays` before today is not "yesterday", so it is not used.
 */
export function pickFallbackPrevious(existing, previousFile, todayYmd, maxAgeDays = 5) {
  const usable = ymd => typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    && daysBetween(ymd, todayYmd) >= 1 && daysBetween(ymd, todayYmd) <= maxAgeDays;
  // A later run on the same day (the 21:00 retry) keeps what the earlier run already found.
  const earlier = existing?.previousNavs;
  if (existing?.today === todayYmd && usable(existing?.yesterday) && earlier && Object.keys(earlier).length >= 50) {
    return { previousNavs: earlier, dateYmd: existing.yesterday, reportDate: existing.previousReportDate || null, from: 'earlier-run' };
  }
  const funds = existing?.catalog ? Object.values(existing.catalog) : [];
  if (usable(existing?.today) && funds.length >= 50) {
    return { funds, dateYmd: existing.today, reportDate: existing.reportDate || null, from: 'catalog' };
  }
  const map = previousFile?.previousNavs;
  if (usable(previousFile?.date) && map && Object.keys(map).length >= 50) {
    return { previousNavs: map, dateYmd: previousFile.date, reportDate: previousFile.reportDate || null, from: 'previous-file' };
  }
  return null;
}

/** True when two catalog payloads differ only in their write time or which relay fetched them. */
export function sameFundData(a, b) {
  if (!a || !b) return false;
  const strip = ({ updatedAt, source, ...rest }) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
