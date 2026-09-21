/**
 * Charts explorer selection rules: never auto-load a default ticker (e.g. OGDC).
 * Only URL ?symbol= (or an explicit preview default) starts with a chart loaded.
 */

/** Official index symbols available as charts (not in market-watch stock list). */
export const CHART_INDEX_SYMBOLS = ['KSE100', 'KMI30'] as const;

export function isChartIndexSymbol(symbol: string): boolean {
  return (CHART_INDEX_SYMBOLS as readonly string[]).includes(symbol.trim().toUpperCase());
}

export function resolveInitialChartSymbol(opts: {
  previewMode: boolean;
  defaultSymbol?: string;
  urlSymbol?: string | null;
  /** Ignored for auto-load — kept in the signature so callers do not reintroduce storage defaults. */
  storedSymbol?: string | null;
}): string {
  if (opts.previewMode) {
    return (opts.defaultSymbol || '').trim().toUpperCase();
  }
  const fromUrl = opts.urlSymbol?.trim();
  if (fromUrl) return fromUrl.toUpperCase();
  return '';
}

/** After market watch loads: keep a valid selection, otherwise clear — never auto-pick list[0]. */
export function resolveSelectedAfterMarketLoad(selected: string, symbols: string[]): string {
  if (!selected) return '';
  if (isChartIndexSymbol(selected)) return selected;
  return symbols.includes(selected) ? selected : '';
}
