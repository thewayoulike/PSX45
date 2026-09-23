/** The health Performance pillar uses the same ROI the rest of the dashboard shows. */
export function healthReturnPct(stats: { roi: number; unrealizedPL?: number; netRealizedPL?: number; netPrincipal?: number }): number {
  return Number.isFinite(stats.roi) ? stats.roi : 0;
}
