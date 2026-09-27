import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./psxData', () => ({ fetchOHLCV: vi.fn() }));
import { fetchOHLCV } from './psxData';
describe('technical scan candle reuse', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it('deduplicates concurrent reads and reuses successful candles', async () => {
    vi.mocked(fetchOHLCV).mockResolvedValue([{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    const { fetchTechnicalScanBars } = await import('./technicalScanData');
    await Promise.all([fetchTechnicalScanBars(' ogdc '), fetchTechnicalScanBars('OGDC')]);
    await fetchTechnicalScanBars('OGDC'); expect(fetchOHLCV).toHaveBeenCalledTimes(1);
  });
  it('retries empty histories instead of caching a failed request', async () => {
    vi.mocked(fetchOHLCV).mockResolvedValue([]);
    const { fetchTechnicalScanBars } = await import('./technicalScanData');
    await fetchTechnicalScanBars('FFC'); await fetchTechnicalScanBars('FFC');
    expect(fetchOHLCV).toHaveBeenCalledTimes(2);
  });
});
