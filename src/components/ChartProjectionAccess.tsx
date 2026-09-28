import { createContext, useContext } from 'react';
import type { AccessStatus } from '../services/auth';

/** Default-deny for public previews, signed-out users and accounts awaiting verification. */
export const ChartProjectionAccess = createContext(false);
export const useChartProjectionAccess = () => useContext(ChartProjectionAccess);

export function canUseChartProjection(status: AccessStatus | null | undefined, email: string | null | undefined) {
  const account = email?.trim().toLowerCase();
  return !!account && status?.active === true && status.accountEmail === account
    && status.features?.chartProjection === true;
}
