export type StructureLabel = 'HH' | 'HL' | 'LH' | 'LL';

export function labelSwingStructure(
  pivots: { i: number; price: number }[],
  kind: 'high' | 'low'
): { i: number; price: number; label: StructureLabel }[] {
  const out: { i: number; price: number; label: StructureLabel }[] = [];
  for (let idx = 1; idx < pivots.length; idx += 1) {
    const prev = pivots[idx - 1];
    const cur = pivots[idx];
    const label: StructureLabel =
      kind === 'high'
        ? cur.price > prev.price
          ? 'HH'
          : 'LH'
        : cur.price > prev.price
          ? 'HL'
          : 'LL';
    out.push({ ...cur, label });
  }
  return out;
}
