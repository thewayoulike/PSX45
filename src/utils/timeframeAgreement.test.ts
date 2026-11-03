import { describe, expect, it } from 'vitest';
import { frameTrend, summarizeAgreement, timeframeAgreement, toWeeklyBars, type FrameTrend } from './timeframeAgreement';

const DAY = 86400000;
// Monday 5 Jan 2026, 00:00 Pakistan time.
const MONDAY = Date.UTC(2026, 0, 4, 19);
const bar = (time: number, close: number) => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 10 });
/** Weekday daily candles following the given closes. */
const weekdays = (closes: number[]) => {
  const out = [];
  let t = MONDAY;
  for (const c of closes) {
    while (((Math.floor((t + 5 * 3600000) / DAY) + 3) % 7) > 4) t += DAY;
    out.push(bar(t, c));
    t += DAY;
  }
  return out;
};
const rising = (n: number, from = 100) => Array.from({ length: n }, (_, i) => from + i);
const falling = (n: number, from = 400) => Array.from({ length: n }, (_, i) => from - i);

describe('frame trend', () => {
  it('needs 50 candles', () => {
    expect(frameTrend('1D', weekdays(rising(49))).trend).toBeNull();
    expect(frameTrend('1D', weekdays(rising(50))).trend).toBe('up');
  });
  it('reads up, down and sideways', () => {
    expect(frameTrend('1D', weekdays(rising(80))).trend).toBe('up');
    expect(frameTrend('1D', weekdays(falling(80))).trend).toBe('down');
    // A long rise then a sharp drop below the 20 EMA, while the 20 EMA is still above the 50.
    expect(frameTrend('1D', weekdays([...rising(80), 120])).trend).toBe('sideways');
  });
});

describe('weekly candles', () => {
  it('groups Monday to Friday on the Pakistan calendar', () => {
    const daily = weekdays([1, 2, 3, 4, 5, 6, 7, 8]);
    const weekly = toWeeklyBars(daily);
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toMatchObject({ open: 1, close: 5, high: 6, low: 0, volume: 50, time: daily[4].time });
    expect(weekly[1]).toMatchObject({ open: 6, close: 8 });
  });
});

describe('agreement', () => {
  const f = (timeframe: FrameTrend['timeframe'], trend: FrameTrend['trend']): FrameTrend =>
    ({ timeframe, trend, close: 1, emaFast: 1, emaSlow: 1, bars: 60, asOf: 0 });
  it('says "3 of 3 up" when every timeframe agrees', () => {
    const a = summarizeAgreement([f('1H', 'up'), f('1D', 'up'), f('1W', 'up')]);
    expect(a).toMatchObject({ label: '3 of 3 up', aligned: 'up', judged: 3 });
  });
  it('warns when the weekly trend is down', () => {
    const a = summarizeAgreement([f('1H', 'up'), f('1D', 'up'), f('1W', 'down')]);
    expect(a.label).toBe('2 of 3 up');
    expect(a.aligned).toBeNull();
    expect(a.note).toMatch(/weekly trend is down.*against the bigger trend/);
  });
  it('calls a tie mixed and no up or down frames sideways', () => {
    expect(summarizeAgreement([f('1D', 'up'), f('1W', 'down')]).label).toBe('Mixed');
    expect(summarizeAgreement([f('1D', 'sideways'), f('1W', 'sideways')]).label).toBe('Sideways');
  });
  it('leaves out frames without enough candles and says so', () => {
    const a = summarizeAgreement([f('1H', null), f('1D', 'down'), f('1W', 'down')]);
    expect(a).toMatchObject({ label: '2 of 2 down', aligned: 'down', judged: 2 });
    expect(a.note).toMatch(/Not enough hourly candles/);
  });
  it('uses daily and weekly only unless hourly candles are given', () => {
    const daily = weekdays(rising(400));
    expect(timeframeAgreement(daily).frames.map((x) => x.timeframe)).toEqual(['1D', '1W']);
    expect(timeframeAgreement(daily, []).frames.map((x) => x.timeframe)).toEqual(['1H', '1D', '1W']);
    expect(timeframeAgreement(daily).label).toBe('2 of 2 up');
  });
});
