export function volumeSpikeFlags(volumes: number[], lookback = 20, mult = 2): boolean[] {
  const flags = Array(volumes.length).fill(false);
  if (lookback <= 0 || mult <= 0) return flags;

  for (let i = lookback; i < volumes.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - lookback; j < i; j += 1) {
      const volume = volumes[j];
      if (Number.isFinite(volume) && volume > 0) {
        sum += volume;
        count += 1;
      }
    }

    const current = volumes[i];
    if (count === lookback && Number.isFinite(current) && current >= (sum / lookback) * mult) {
      flags[i] = true;
    }
  }

  return flags;
}
