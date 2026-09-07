/**
 * Charts explorer selection rules: never auto-load a default ticker (e.g. OGDC).
 * Only URL ?symbol= (or an explicit preview default) starts with a chart loaded.
 */

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
  return symbols.includes(selected) ? selected : '';
}
