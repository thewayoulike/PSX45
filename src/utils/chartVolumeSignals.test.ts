import { describe, expect, it } from 'vitest';
import { volumeSpikeFlags } from './chartVolumeSignals';

describe('chartVolumeSignals', () => {
  it('flags bars where volume >= 2x SMA20', () => {
    const vols = Array(25).fill(100);
    vols[24] = 250;

    const flags = volumeSpikeFlags(vols, 20, 2);

    expect(flags[24]).toBe(true);
    expect(flags[23]).toBe(false);
  });
});
