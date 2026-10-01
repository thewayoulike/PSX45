import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { visibleInterval } from './visibleInterval';

let state = 'visible'; const listeners: Function[] = [];
beforeEach(() => {
  vi.useFakeTimers(); state = 'visible'; listeners.length = 0;
  vi.stubGlobal('document', { get visibilityState() { return state; }, addEventListener: (_: string, f: Function) => listeners.push(f), removeEventListener() {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('does not poll while hidden and catches up once, staggered, on return', () => {
  const fn = vi.fn();
  const stop = visibleInterval(fn, 60000, { jitterMs: 2000 });
  vi.advanceTimersByTime(60000); expect(fn).toHaveBeenCalledTimes(1);
  state = 'hidden'; vi.advanceTimersByTime(5 * 60000); expect(fn).toHaveBeenCalledTimes(1);
  state = 'visible'; listeners.forEach(f => f()); listeners.forEach(f => f());
  expect(fn).toHaveBeenCalledTimes(1); // staggered, not immediate
  vi.advanceTimersByTime(2000); expect(fn).toHaveBeenCalledTimes(2); // exactly one catch-up
  stop(); vi.advanceTimersByTime(10 * 60000); expect(fn).toHaveBeenCalledTimes(2);
});
it('skips the catch-up when a tick ran recently', () => {
  const fn = vi.fn(); visibleInterval(fn, 60000);
  vi.advanceTimersByTime(30000); listeners.forEach(f => f()); vi.advanceTimersByTime(3000);
  expect(fn).not.toHaveBeenCalled();
});
