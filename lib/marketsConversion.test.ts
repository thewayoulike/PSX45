import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { GOOGLE_ADS_ID, GOOGLE_ADS_MARKETS_DESTINATION, GOOGLE_ADS_SIGNUP_DESTINATION } from '../config/site.js';
import { analyticsScriptTags } from './seoJsonLd.js';

function page(hostname: string, pathname: string, adsId = GOOGLE_ADS_ID) {
  const context = createContext({ location: { hostname, pathname } });
  context.window = context;
  const code = analyticsScriptTags(undefined, adsId).match(/<script>([\s\S]*?)<\/script>/)![1];
  const run = () => runInContext(code, context);
  const conversions = () => (context.dataLayer as IArguments[])
    .map(args => Array.from(args)).filter(args => args[0] === 'event' && args[1] === 'conversion');
  return { run, conversions };
}

describe('Markets page visit conversion', () => {
  it.each(['/markets', '/markets/', '/markets/stocks', '/markets/funds/meezan-islamic-fund'])
  ('queues the exact existing action once on %s before the remote tag loads', pathname => {
    const testPage = page('www.psx-tracker.com', pathname);
    testPage.run();
    testPage.run();
    expect(testPage.conversions()).toEqual([['event', 'conversion', { send_to: GOOGLE_ADS_MARKETS_DESTINATION }]]);
    expect(JSON.stringify(testPage.conversions())).not.toContain(GOOGLE_ADS_SIGNUP_DESTINATION);
  });

  it.each(['/', '/login', '/holdings', '/trading-lab', '/market-overview', '/markets-other'])
  ('does not count unrelated page %s', pathname => {
    const testPage = page('www.psx-tracker.com', pathname);
    testPage.run();
    expect(testPage.conversions()).toEqual([]);
  });

  it.each(['localhost', '127.0.0.1', 'psx-preview.vercel.app', 'www.psx-tracker.com.example.com'])
  ('does not send conversions from %s', hostname => {
    const testPage = page(hostname, '/markets');
    testPage.run();
    expect(testPage.conversions()).toEqual([]);
  });

  it('allows the apex production host but respects a disabled or different Ads destination', () => {
    const apex = page('psx-tracker.com', '/markets');
    apex.run();
    expect(apex.conversions()).toHaveLength(1);
    for (const adsId of ['', 'AW-123']) {
      const otherDestination = page('www.psx-tracker.com', '/markets', adsId);
      otherDestination.run();
      expect(otherDestination.conversions()).toEqual([]);
    }
  });
});
