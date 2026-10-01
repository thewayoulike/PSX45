import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryableModule } from './retryableModule';

afterEach(() => { vi.useRealTimers(); });
describe('retryable tool downloads', () => {
  it('shares preparation and opening, then keeps a successful download', async () => {
    const module = { form: true };
    const importer = vi.fn().mockResolvedValue(module);
    const load = retryableModule(importer);
    const prepared = load();
    expect(load()).toBe(prepared);
    await expect(prepared).resolves.toBe(module);
    await expect(load()).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(1);
  });
  it('allows another attempt after a failed download', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue('form');
    const load = retryableModule(importer);
    await expect(load()).rejects.toThrow('network');
    await expect(load()).resolves.toBe('form');
    expect(importer).toHaveBeenCalledTimes(2);
  });
  it('bounds a stalled download and ignores its late result after retry', async () => {
    vi.useFakeTimers();
    let complete!: (value: string) => void;
    const importer = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve; })).mockResolvedValue('new form');
    const load = retryableModule(importer, 1000);
    const stalled = expect(load()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await stalled;
    await expect(load()).resolves.toBe('new form');
    complete('late form');
    await expect(load()).resolves.toBe('new form');
    expect(vi.getTimerCount()).toBe(0);
  });
});
