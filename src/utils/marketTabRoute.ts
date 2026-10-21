export const MARKET_TABS = ['overview', 'stocks', 'funds', 'crypto', 'forex', 'commodities', 'news'] as const;
export type MarketTab = typeof MARKET_TABS[number];

const isTab = (value: string): value is MarketTab => (MARKET_TABS as readonly string[]).includes(value);

/** `/markets/<tab>` wins; an old `#tab` link still works; anything else is the overview. */
export function marketTabFromLocation(pathname: string, hash: string): MarketTab {
  const fromPath = pathname.match(/^\/markets\/([a-z]+)\/?$/)?.[1];
  if (fromPath && isTab(fromPath)) return fromPath;
  const fromHash = hash.replace(/^#/, '');
  return isTab(fromHash) ? fromHash : 'overview';
}

export function marketTabPath(tab: MarketTab): string {
  return tab === 'overview' ? '/markets' : `/markets/${tab}`;
}
