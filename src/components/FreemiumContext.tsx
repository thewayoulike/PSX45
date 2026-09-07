import React, { createContext, useContext, useMemo } from 'react';

export type FreemiumQuotas = Record<string, number>;

export interface FreemiumContextValue {
  isFree: boolean;
  quotas: FreemiumQuotas;
  entitledTickers: string[] | null;
  requestUpgrade: () => void;
  canSeePositions: (ticker: string) => boolean;
}

/** Free plan caps (finite). */
const FREE_QUOTAS: FreemiumQuotas = {
  stockTickers: 3,
  fundTickers: 3,
  portfolios: 1,
  stockProfiles: 7,
  chartViewsPerDay: 5,
  signalsPerDay: 1,
  signalsVisible: 5,
  dailyScanPerDay: 1,
  dailyScanVisible: 5,
  alertsTickers: 3,
  alertsTp: 2,
  alertsSl: 2,
  aiMessagesPerDay: 10,
  fairValuePerDay: 4,
  exportPerDay: 1,
};

/**
 * Paid / trial / lifetime defaults.
 * Note: JSON turns Infinity into null over the wire — normalizeQuotas maps null → Infinity.
 * Alert caps stay finite (15 × 4 TP + 4 SL).
 */
const PAID_QUOTAS: FreemiumQuotas = {
  ...FREE_QUOTAS,
  stockTickers: Number.POSITIVE_INFINITY,
  fundTickers: Number.POSITIVE_INFINITY,
  portfolios: Number.POSITIVE_INFINITY,
  stockProfiles: Number.POSITIVE_INFINITY,
  chartViewsPerDay: Number.POSITIVE_INFINITY,
  signalsPerDay: Number.POSITIVE_INFINITY,
  signalsVisible: Number.POSITIVE_INFINITY,
  dailyScanPerDay: Number.POSITIVE_INFINITY,
  dailyScanVisible: Number.POSITIVE_INFINITY,
  alertsTickers: 15,
  alertsTp: 4,
  alertsSl: 4,
  aiMessagesPerDay: Number.POSITIVE_INFINITY,
  fairValuePerDay: Number.POSITIVE_INFINITY,
  exportPerDay: Number.POSITIVE_INFINITY,
};

/** Merge API quotas; null/NaN mean unlimited when not Free (JSON dropped Infinity). */
export function normalizeQuotas(
  isFree: boolean,
  quotas?: FreemiumQuotas | null,
): FreemiumQuotas {
  const base = isFree ? FREE_QUOTAS : PAID_QUOTAS;
  const merged: FreemiumQuotas = { ...base };
  if (!quotas) return merged;
  for (const [key, raw] of Object.entries(quotas)) {
    if (raw == null || Number.isNaN(Number(raw))) {
      merged[key] = isFree ? (FREE_QUOTAS[key] ?? 0) : Number.POSITIVE_INFINITY;
      continue;
    }
    const n = Number(raw);
    merged[key] = n;
  }
  return merged;
}

const FreemiumContext = createContext<FreemiumContextValue>({
  isFree: false,
  quotas: PAID_QUOTAS,
  entitledTickers: null,
  requestUpgrade: () => {},
  canSeePositions: () => true,
});

export const FreemiumProvider: React.FC<{
  isFree: boolean;
  quotas?: FreemiumQuotas | null;
  entitledTickers: string[] | null;
  requestUpgrade: () => void;
  children: React.ReactNode;
}> = ({ isFree, quotas, entitledTickers, requestUpgrade, children }) => {
  const value = useMemo<FreemiumContextValue>(() => {
    const q = normalizeQuotas(isFree, quotas);
    const entitled = entitledTickers;
    return {
      isFree,
      quotas: q,
      entitledTickers: entitled,
      requestUpgrade,
      canSeePositions: (ticker: string) => {
        if (!isFree) return true;
        if (!entitled) return true;
        return entitled.includes((ticker || '').trim().toUpperCase());
      },
    };
  }, [isFree, quotas, entitledTickers, requestUpgrade]);

  return <FreemiumContext.Provider value={value}>{children}</FreemiumContext.Provider>;
};

export function useFreemium(): FreemiumContextValue {
  return useContext(FreemiumContext);
}
