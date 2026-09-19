/** React state slices are immutable: unchanged references need no serialization. */
export function createSliceWriter(storage: Pick<Storage, 'setItem'>) {
  let owner = '';
  const previous = new Map<string, unknown>();
  return (account: string, values: Record<string, unknown>) => {
    if (owner !== account) { previous.clear(); owner = account; }
    for (const [key, value] of Object.entries(values)) {
      if (previous.has(key) && Object.is(previous.get(key), value)) continue;
      storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      previous.set(key, value); // A failed write stays dirty and can be retried.
    }
  };
}

export function mergeChanged<T>(previous: Record<string, T>, updates: Record<string, T>) {
  return Object.entries(updates).some(([key, value]) => previous[key] !== value) ? { ...previous, ...updates } : previous;
}
