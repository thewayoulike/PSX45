const HEADERS = ['Date', 'Type', 'Category', 'Ticker', 'Broker', 'Quantity', 'Price', 'Commission', 'Tax', 'CDC Charges', 'Other Fees', 'Total Amount', 'Notes', 'ID'];
const META_KEY = 'psx_portfolio_id';

export function buildSheetSyncRequests(meta: any, transactions: any[], portfolios: any[]): any[] {
  const sheets: any[] = meta.sheets || [];
  const usedIds = new Set<number>(sheets.map(s => s.properties.sheetId));
  const usedTitles = new Set<string>(sheets.map(s => s.properties.title));
  const seen = new Set<string>();
  const requests: any[] = [];
  for (const p of portfolios) {
    const id = String(p.id || '');
    if (!id || seen.has(id)) throw new Error('Portfolio IDs must be unique.');
    seen.add(id);
    const matches = sheets.filter(s => (s.developerMetadata || []).some((m: any) =>
      m.metadataKey === META_KEY && m.metadataValue === id));
    if (matches.length > 1) throw new Error('Duplicate portfolio sheet mapping. Resolve before syncing.');
    const existing = matches[0];
    let sheetId = existing?.properties.sheetId;
    if (sheetId == null) {
      sheetId = 1;
      while (usedIds.has(sheetId)) sheetId++;
      usedIds.add(sheetId);
    }
    if (existing) usedTitles.delete(existing.properties.title);
    const base = String(p.name || 'Portfolio').replace(/[*?:/\\\[\]]/g, '_').slice(0, 70);
    let title = `${base} [${sheetId}]`;
    let suffix = 1;
    while (usedTitles.has(title)) title = `${base} [${sheetId}-${suffix++}]`;
    usedTitles.add(title);
    const tx = transactions.filter(t => t.portfolioId === p.id)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const values = [HEADERS, ...tx.map(t => {
      const gross = t.quantity * t.price;
      const fees = (t.commission || 0) + (t.tax || 0) + (t.cdcCharges || 0) + (t.otherFees || 0);
      let total = 0;
      if (t.type === 'BUY') total = gross + fees;
      else if (t.type === 'SELL') total = gross - fees;
      else if (t.type === 'DIVIDEND') total = gross - (t.tax || 0);
      else if (['TAX', 'WITHDRAWAL', 'ANNUAL_FEE'].includes(t.type)) total = -Math.abs(t.price);
      else if (t.type === 'OTHER') total = t.category === 'OTHER_TAX' ? -Math.abs(t.price) : t.price;
      else if (['DEPOSIT', 'HISTORY'].includes(t.type)) total = t.price;
      return [t.date, t.type, t.category || '', t.ticker || '', t.broker || '', t.quantity, t.price,
        t.commission || 0, t.tax || 0, t.cdcCharges || 0, t.otherFees || 0, total, t.notes || '', t.id];
    })];
    const rowCount = Math.max(1000, values.length, existing?.properties.gridProperties?.rowCount || 0);
    if (!existing) {
      requests.push({ addSheet: { properties: { sheetId, title, gridProperties: { rowCount, columnCount: 26 } } } });
      requests.push({ createDeveloperMetadata: { developerMetadata: {
        metadataKey: META_KEY, metadataValue: id, location: { sheetId }, visibility: 'DOCUMENT',
      } } });
    } else {
      requests.push({ updateSheetProperties: { properties: { sheetId, title,
        gridProperties: { rowCount, columnCount: Math.max(14, existing.properties.gridProperties?.columnCount || 26) } },
        fields: 'title,gridProperties.rowCount,gridProperties.columnCount' } });
    }
    // Range + rows clears trailing old values in the same atomic request. Text is
    // explicitly stringValue, so notes starting with '=' are never formulas.
    requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 14 },
      fields: 'userEnteredValue', rows: values.map(row => ({ values: row.map(v => ({
        userEnteredValue: typeof v === 'number' && Number.isFinite(v) ? { numberValue: v } : { stringValue: String(v ?? '') },
      })) })) } });
  }
  return requests;
}
