/**
 * Statement columns sometimes arrive as "FY", "FY-1", "FY-2" when the data source
 * could not tell which year each column is. Replace those with real period names:
 * first from the PSX company page's own column headers (same order, latest first),
 * then by counting back from the nearest real year, then plain words.
 */
const PLACEHOLDER = /^FY(?:-(\d+))?$/i;

export const isPlaceholderPeriod = (label: string) => PLACEHOLDER.test((label || '').trim());

const plainName = (i: number) => (i === 0 ? 'Latest year' : `${i} year${i === 1 ? '' : 's'} earlier`);

export function realPeriodNames(labels: string[], pageLabels: string[] = [], annual = true): string[] {
  const usable = (s: string | undefined) => !!s && !isPlaceholderPeriod(s);
  const out = labels.map((label, i) => (usable(label) ? label : usable(pageLabels[i]) ? pageLabels[i] : label));
  if (!annual) return out.map((l, i) => (isPlaceholderPeriod(l) ? (i === 0 ? 'Latest quarter' : `${i} quarter${i === 1 ? '' : 's'} earlier`) : l));
  return out.map((label, i) => {
    if (!isPlaceholderPeriod(label)) return label;
    // Count back from the closest earlier column that has a real year.
    for (let j = i - 1; j >= 0; j--) {
      const year = /^(\d{4})$/.exec(out[j].trim());
      if (year) return String(Number(year[1]) - (i - j));
    }
    for (let j = i + 1; j < out.length; j++) {
      const year = /^(\d{4})$/.exec(out[j].trim());
      if (year) return String(Number(year[1]) + (j - i));
    }
    return plainName(i);
  });
}

/** Relabels rows ({ year }) in place-safe fashion. */
export function withRealPeriods<T extends { year: string }>(rows: T[] | undefined, pageRows: { year: string }[] | undefined, annual = true): T[] {
  if (!rows?.length) return rows || [];
  if (!rows.some((r) => isPlaceholderPeriod(r.year))) return rows;
  const names = realPeriodNames(rows.map((r) => r.year), (pageRows || []).map((r) => r.year), annual);
  return rows.map((r, i) => ({ ...r, year: names[i] }));
}
