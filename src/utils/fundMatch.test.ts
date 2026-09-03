import { describe, it, expect } from 'vitest';
import type { MutualFundRecord } from '../services/mufapData';
import {
  matchCatalogByLabel,
  buildFundTickerCanonicalMap,
  canonicalFundTicker,
} from './fundMatch';

/** Build a catalog record — only id/fundName drive matching; the rest are filler. */
function rec(id: string, fundName: string): MutualFundRecord {
  return {
    id,
    fundName,
    sector: 'Income',
    amc: 'Al Meezan',
    category: 'Income',
    offer: 0,
    repurchase: 0,
    nav: 0,
    validityDate: '',
    frontEndLoad: 0,
    backEndLoad: 0,
  };
}

// The two funds that kept getting confused for each other, plus a couple of
// neighbours so disambiguation has something to get wrong.
const MDIP_ID = 'MF:meezan-daily-income-plan-mdip-i';
const MAHANA_ID = 'MF:meezan-daily-income-fund-mahana-munafa-plan';
const MIF_ID = 'MF:meezan-islamic-fund';
const MSF_ID = 'MF:meezan-sovereign-fund';

const catalog: Record<string, MutualFundRecord> = {
  [MDIP_ID]: rec(MDIP_ID, 'Meezan Daily Income Plan MDIP I'),
  [MAHANA_ID]: rec(MAHANA_ID, 'Meezan Daily Income Fund Mahana Munafa Plan'),
  [MIF_ID]: rec(MIF_ID, 'Meezan Islamic Fund'),
  [MSF_ID]: rec(MSF_ID, 'Meezan Sovereign Fund'),
};

describe('matchCatalogByLabel — MDIP vs Mahana disambiguation', () => {
  it('resolves an "MDIP I" label to the MDIP fund', () => {
    expect(matchCatalogByLabel('MDIP I', catalog)).toBe(MDIP_ID);
    expect(matchCatalogByLabel('Meezan Daily Income (MDIP I)', catalog)).toBe(MDIP_ID);
  });

  it('resolves a Mahana / Munafa label to the Mahana fund — NOT MDIP', () => {
    expect(matchCatalogByLabel('Mahana Munafa', catalog)).toBe(MAHANA_ID);
    expect(matchCatalogByLabel('Mahana Income', catalog)).toBe(MAHANA_ID);
    expect(matchCatalogByLabel('Munafa Plan', catalog)).toBe(MAHANA_ID);
    // The regression that started this whole thread: Mahana must never fall into MDIP.
    expect(matchCatalogByLabel('Mahana Munafa', catalog)).not.toBe(MDIP_ID);
  });

  it('matches an exact fund name', () => {
    expect(matchCatalogByLabel('Meezan Sovereign Fund', catalog)).toBe(MSF_ID);
    expect(matchCatalogByLabel('meezan   islamic   fund', catalog)).toBe(MIF_ID);
  });

  it('returns undefined for an unknown label', () => {
    expect(matchCatalogByLabel('Totally Unrelated Fund', catalog)).toBeUndefined();
    expect(matchCatalogByLabel('', catalog)).toBeUndefined();
  });
});

describe('buildFundTickerCanonicalMap + canonicalFundTicker', () => {
  const LEGACY_MAHANA = 'MF:legacy-mahana-import';
  const LEGACY_MDIP = 'MF:legacy-mdip-import';

  it('maps legacy import tickers to their catalog ids by display label', () => {
    const txs = [
      { ticker: LEGACY_MAHANA },
      { ticker: LEGACY_MDIP },
      { ticker: MIF_ID }, // already a catalog id
    ];
    const displayNames: Record<string, string> = {
      [LEGACY_MAHANA]: 'Mahana Munafa',
      [LEGACY_MDIP]: 'MDIP I',
    };

    const map = buildFundTickerCanonicalMap(txs, catalog, displayNames);

    expect(canonicalFundTicker(LEGACY_MAHANA, map)).toBe(MAHANA_ID);
    expect(canonicalFundTicker(LEGACY_MDIP, map)).toBe(MDIP_ID);
    // The two legacy slugs must NOT collapse onto the same fund.
    expect(canonicalFundTicker(LEGACY_MAHANA, map)).not.toBe(canonicalFundTicker(LEGACY_MDIP, map));
  });

  it('leaves catalog ids mapped to themselves', () => {
    const map = buildFundTickerCanonicalMap([{ ticker: MSF_ID }], catalog, {});
    expect(canonicalFundTicker(MSF_ID, map)).toBe(MSF_ID);
  });

  it('leaves an unmatchable legacy ticker as itself', () => {
    const orphan = 'MF:unknown-orphan';
    const map = buildFundTickerCanonicalMap([{ ticker: orphan }], catalog, { [orphan]: 'No Such Fund' });
    expect(canonicalFundTicker(orphan, map)).toBe(orphan);
  });

  it('passes non-fund tickers through unchanged', () => {
    const map = buildFundTickerCanonicalMap([], catalog, {});
    expect(canonicalFundTicker('OGDC', map)).toBe('OGDC');
  });
});
