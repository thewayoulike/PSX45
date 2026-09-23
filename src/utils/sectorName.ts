import { SECTOR_CODE_MAP } from '../services/sectors';

const official = Object.values(SECTOR_CODE_MAP);
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Collapse a live PSX sector and the shorter static label onto one official name. */
export function canonicalSector(name: string): string {
  const trimmed = String(name || '').trim();
  const key = norm(trimmed);
  if (!key) return trimmed;
  const exact = official.find(item => norm(item) === key);
  if (exact) return exact;
  const prefixed = official.filter(item => {
    const itemKey = norm(item);
    return itemKey.startsWith(key) || key.startsWith(itemKey);
  });
  if (prefixed.length === 1) return prefixed[0];
  let best = '';
  let bestLen = 0;
  for (const item of official) {
    const itemKey = norm(item);
    let i = 0;
    while (i < key.length && i < itemKey.length && key[i] === itemKey[i]) i++;
    if (i > bestLen) { bestLen = i; best = item; }
  }
  return bestLen >= 8 ? best : trimmed;
}
