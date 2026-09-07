import React, { createContext, useContext, useMemo } from 'react';

export type FreemiumQuotas = Record<string, number>;

export interface FreemiumContextValue {
  isFree: boolean;
  quotas: FreemiumQuotas;
  entitledTickers: string[] | null;
  requestUpgrade: () => void;
  canSeePositions: (ticker: string) => boolean;
}

const defaultQuotas: FreemiumQuotas = {
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

const FreemiumContext = createContext<FreemiumContextValue>({
  isFree: false,
  quotas: defaultQuotas,
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
    const q = { ...defaultQuotas, ...(quotas || {}) };
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
