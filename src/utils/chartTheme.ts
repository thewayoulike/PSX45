// TradingView-inspired chart palette (light + dark), shared by all chart panels.
import { useEffect, useState } from 'react';

export interface ChartTheme {
  isDark: boolean;
  /** Plot background */
  bg: string;
  /** Solid gridlines — TradingView draws both horizontal and vertical */
  grid: string;
  /** Border between panes and around the price/time axis */
  border: string;
  /** Primary axis tick text */
  axisText: string;
  /** Secondary / legend text */
  mutedText: string;
  /** Candles */
  up: string;
  down: string;
  upFill: string;
  downFill: string;
  /** Volume bars (same hues, lower alpha) */
  volUp: string;
  volDown: string;
  /** Crosshair line + its price/time badge */
  crosshair: string;
  badgeBg: string;
  badgeText: string;
  /** Oscillator accents */
  rsiLine: string;
  rsiBand: string;
  stochBand: string;
  overbought: string;
  oversold: string;
  macdLine: string;
  macdSignal: string;
  macdHistUp: string;
  macdHistDown: string;
}

const LIGHT: ChartTheme = {
  isDark: false,
  bg: '#ffffff',
  grid: '#e0e3eb',
  border: '#e0e3eb',
  axisText: '#131722',
  mutedText: '#787b86',
  up: '#26a69a',
  down: '#ef5350',
  upFill: '#26a69a',
  downFill: '#ef5350',
  volUp: 'rgba(38, 166, 154, 0.5)',
  volDown: 'rgba(239, 83, 80, 0.5)',
  crosshair: '#9598a1',
  badgeBg: '#131722',
  badgeText: '#ffffff',
  rsiLine: '#7e57c2',
  rsiBand: 'rgba(126, 87, 194, 0.08)',
  stochBand: 'rgba(33, 150, 243, 0.08)',
  overbought: '#ef5350',
  oversold: '#26a69a',
  macdLine: '#2962ff',
  macdSignal: '#ff6d00',
  macdHistUp: 'rgba(38, 166, 154, 0.65)',
  macdHistDown: 'rgba(239, 83, 80, 0.65)',
};

const DARK: ChartTheme = {
  ...LIGHT,
  isDark: true,
  bg: '#131722',
  grid: '#2a2e39',
  border: '#2a2e39',
  axisText: '#d1d4dc',
  mutedText: '#787b86',
  volUp: 'rgba(38, 166, 154, 0.45)',
  volDown: 'rgba(239, 83, 80, 0.45)',
  crosshair: '#9598a1',
  badgeBg: '#2a2e39',
  badgeText: '#d1d4dc',
  rsiBand: 'rgba(126, 87, 194, 0.14)',
  stochBand: 'rgba(33, 150, 243, 0.14)',
};

export const chartTheme = (isDark: boolean): ChartTheme => (isDark ? DARK : LIGHT);

/** Tracks the `dark` class Tailwind puts on <html>, so SVG colors follow the app theme. */
export const useChartTheme = (): ChartTheme => {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return chartTheme(isDark);
};
