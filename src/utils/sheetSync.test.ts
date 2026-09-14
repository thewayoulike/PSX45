import { describe, expect, it } from 'vitest';
import { buildSheetSyncRequests } from './sheetSync';
describe('stable, atomic Sheets exports', () => {
  it('separates colliding names and preserves legacy tabs', () => {
    const meta = { sheets: [{ properties: { sheetId: 0, title: 'A_B' } }] };
    const requests = buildSheetSyncRequests(meta, [], [{ id: 'one', name: 'A/B' }, { id: 'two', name: 'A:B' }]);
    const adds = requests.filter(r => r.addSheet).map(r => r.addSheet.properties);
    expect(new Set(adds.map(p => p.title)).size).toBe(2);
    expect(adds.map(p => p.sheetId)).not.toContain(0);
    expect(requests.filter(r => r.createDeveloperMetadata)).toHaveLength(2);
  });
  it('keeps the mapped sheet across rename and uses numeric grid coordinates', () => {
    const meta = { sheets: [{ properties: { sheetId: 7, title: 'Old', gridProperties: { rowCount: 1000 } },
      developerMetadata: [{ metadataKey: 'psx_portfolio_id', metadataValue: 'one' }] }] };
    const requests = buildSheetSyncRequests(meta, [], [{ id: 'one', name: "Owner's " + 'x'.repeat(150) }]);
    expect(requests.some(r => r.addSheet)).toBe(false);
    expect(requests[0].updateSheetProperties.properties.title.length).toBeLessThanOrEqual(100);
    const update = requests.find(r => r.updateCells).updateCells;
    expect(update.range.sheetId).toBe(7);
    expect(update.range.endRowIndex).toBeUndefined();
    expect(update.rows).toHaveLength(1); // Header only clears previous transaction rows atomically.
  });
  it('writes formula-like notes as literal text', () => {
    const requests = buildSheetSyncRequests({}, [{ portfolioId: 'one', type: 'DEPOSIT', price: 10, notes: '=1+1' }], [{ id: 'one', name: 'One' }]);
    expect(requests.find(r => r.updateCells).updateCells.rows[1].values[12].userEnteredValue).toEqual({ stringValue: '=1+1' });
  });
});
