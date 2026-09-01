import { isFundTicker } from './fundId';

const SPECIAL_TICKER_LABELS: Record<string, string> = {
  CASH: 'Cash',
  'PREV-PNL': 'Past Realized P&L',
  CGT: 'Capital Gains Tax',
  'ANNUAL FEE': 'Annual Fee',
  'DIV REINVEST': 'Dividend Reinvest',
};

/** Primary label for any asset row — fund name, not MF: slug. */
export const formatAssetLabel = formatTransactionLabel;

/** Human-readable label for a transaction ticker (fund name, not MF: slug). */
export function formatTransactionLabel(
  ticker: string,
  displayNames: Record<string, string> = {},
  notes?: string
): string {
  if (SPECIAL_TICKER_LABELS[ticker]) return SPECIAL_TICKER_LABELS[ticker];
  if (isFundTicker(ticker)) {
    if (displayNames[ticker]) return displayNames[ticker];
    if (notes) {
      const dash = notes.match(/^[A-Z0-9-]+\s*[—–-]\s*(.+)$/i);
      if (dash?.[1]) return dash[1].trim();
      if (/opening balance|starting balance|investment value/i.test(notes)) return 'Opening Balance';
    }
    const slug = ticker.replace(/^MF:/, '');
    return slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .replace(/\bLimited\b/g, 'Limited')
      .slice(0, 64);
  }
  return ticker;
}

/** Short label for dashboard cards / insight lines (avoids MF: slug overflow). */
export function formatFundShortLabel(
  ticker: string,
  displayNames: Record<string, string> = {},
  maxLen = 36
): string {
  const name = formatTransactionLabel(ticker, displayNames);
  if (name.length <= maxLen) return name;
  return `${name.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** Subtext under fund name — fund code or notes for cash/history rows. */
export function formatTransactionSubtext(
  ticker: string,
  notes?: string,
  displayNames: Record<string, string> = {}
): string | null {
  if (notes && (ticker === 'CASH' || ticker === 'PREV-PNL')) {
    return notes.length > 48 ? `${notes.slice(0, 48)}…` : notes;
  }
  if (isFundTicker(ticker) && notes) {
    const code = notes.match(/^([A-Z0-9-]+)/)?.[1];
    if (code && displayNames[ticker]) return code;
  }
  if (isFundTicker(ticker) && !displayNames[ticker] && notes) {
    return notes.length > 40 ? `${notes.slice(0, 40)}…` : notes;
  }
  return null;
}

/** Subtext under a convert leg showing the counterparty fund. */
export function formatConversionSubtext(
  leg: 'out' | 'in',
  otherTicker: string,
  displayNames: Record<string, string> = {}
): string {
  const name = formatFundShortLabel(otherTicker, displayNames, 48);
  return leg === 'out' ? `→ ${name}` : `← ${name}`;
}
