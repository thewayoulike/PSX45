// lib/mufapSyncGuards.js
// Safety checks for the MUFAP NAV sync: never publish a partial catalog, never label stale NAVs
// as yesterday's, and never commit (and deploy) when the fund data did not change.

const DAY_MS = 86400000;
const daysBetween = (fromYmd, toYmd) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS);

/** MUFAP dates describe the NAV, not the day on which a URL was requested. */
export function navDateYmd(value) {
  const text = String(value || '').trim();
  if (!/^(\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9} \d{1,2}, \d{4})$/.test(text)) return null;
  const time = Date.parse(/^\d{4}-/.test(text) ? `${text}T00:00:00Z` : `${text} UTC`);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

export function catalogNavDate(payload) {
  const counts = new Map();
  for (const fund of Object.values(payload?.catalog || {})) {
    const date = navDateYmd(fund.validityDate);
    if (date) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0]
    || navDateYmd(payload?.reportDate);
}

export function newestCatalog(...catalogs) {
  return catalogs.filter(p => p?.catalog && catalogNavDate(p)).sort((a, b) =>
    catalogNavDate(b).localeCompare(catalogNavDate(a))
    || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

export function assertCatalogNotOlder(candidate, existing) {
  const nextDate = catalogNavDate(candidate);
  const currentDate = catalogNavDate(existing);
  if (!nextDate) throw new Error('MUFAP report has no verifiable NAV date. Keeping the current catalog.');
  if (currentDate && nextDate < currentDate) {
    const error = new Error(`MUFAP returned older NAVs (${nextDate}); current catalog is ${currentDate}. Keeping the current catalog.`);
    error.code = 'STALE_NAV';
    throw error;
  }
}

/** Late AMC publications must not delete known funds or roll their individual NAVs back. */
export function preserveNewerFunds(candidate, existing) {
  const catalog = { ...candidate.catalog };
  const previousNavs = { ...(candidate.previousNavs || {}) };
  for (const [id, fund] of Object.entries(existing?.catalog || {})) {
    const oldDate = navDateYmd(fund.validityDate);
    const newDate = navDateYmd(catalog[id]?.validityDate);
    if (!catalog[id] || (oldDate && (!newDate || oldDate > newDate))) {
      catalog[id] = fund;
      if (existing.previousNavs?.[id]) previousNavs[id] = existing.previousNavs[id];
      else delete previousNavs[id];
    }
  }
  return { ...candidate, catalog, previousNavs, count: Object.keys(catalog).length };
}

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
  const existingDate = catalogNavDate(existing) || existing?.today;
  const previousDate = navDateYmd(existing?.previousReportDate) || existing?.yesterday;
  if (existingDate === todayYmd && usable(previousDate) && earlier && Object.keys(earlier).length >= 50) {
    return { previousNavs: earlier, dateYmd: previousDate, reportDate: existing.previousReportDate || null, from: 'earlier-run' };
  }
  const funds = existing?.catalog ? Object.values(existing.catalog) : [];
  if (usable(existingDate) && funds.length >= 50) {
    return { funds, dateYmd: existingDate, reportDate: existing.reportDate || null, from: 'catalog' };
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
