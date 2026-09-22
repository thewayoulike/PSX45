import { describe, expect, it } from 'vitest';
import { listMufapExcelToDelete } from './mufapExcelPrune.js';

describe('listMufapExcelToDelete', () => {
  it('keeps the newest keep files and lists older dated Excels for deletion', () => {
    const names = [
      'fund-nav-catalog.json',
      'mufap-nav-2026-09-18.xlsx',
      'mufap-nav-2026-09-19.xlsx',
      'mufap-nav-2026-09-22.xlsx',
      'mufap-nav-2026-09-21.xlsx',
      'readme.txt',
    ];
    expect(listMufapExcelToDelete(names, 2)).toEqual([
      'mufap-nav-2026-09-19.xlsx',
      'mufap-nav-2026-09-18.xlsx',
    ]);
  });

  it('deletes nothing when at or under the keep limit', () => {
    expect(listMufapExcelToDelete(['mufap-nav-2026-09-21.xlsx', 'mufap-nav-2026-09-22.xlsx'], 2)).toEqual([]);
  });
});
