import { expect, it, vi } from 'vitest';
import { installAbortSignalTimeout } from './abortSignalTimeout';

it('adds a working AbortSignal.timeout where the browser lacks one, and leaves native ones alone', () => {
  vi.useFakeTimers();
  const Legacy: any = function () {};
  installAbortSignalTimeout(Legacy);
  const signal: AbortSignal = Legacy.timeout(1000);
  expect(signal.aborted).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(signal.aborted).toBe(true);
  expect((signal.reason as Error).name).toBe('TimeoutError');
  const native = { timeout: () => 'native' } as any;
  installAbortSignalTimeout(native);
  expect(native.timeout()).toBe('native');
  vi.useRealTimers();
});
