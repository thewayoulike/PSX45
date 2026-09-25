import { describe, expect, it } from 'vitest';
import type { EditableTrade, Transaction } from '../types';
import { attachEmailImportSource, emailAttachmentKey, emailImportHistory, isEmailRowSaved } from './emailImportHistory';

const attachment = { attachmentKey: emailAttachmentKey('email-1', { id: 'download-1', partId: '1' }), filename: 'CONTRACT_Y0170.PDF' };
const trade: EditableTrade = { ticker: 'FFC', type: 'BUY', quantity: 10, price: 500, date: '2026-09-25' };
const scanned = (count = 3, batch = 'scan-1') => attachEmailImportSource(Array.from({ length: count }, () => ({ ...trade })), attachment, batch);
const saved = (rows: EditableTrade[], portfolioId = 'portfolio-1'): Transaction[] => rows.map((row, i) => ({
  commission: 0, tax: 0, cdcCharges: 0, otherFees: 0, ...row, date: row.date!, id: `tx-${i}`, portfolioId,
}));

describe('email attachment import history', () => {
  it('distinguishes daily emails and parts, regardless of repeated filenames or changed download IDs', () => {
    expect(emailAttachmentKey('email-1', { id: 'download-2', partId: '1' })).toBe(attachment.attachmentKey);
    expect(emailAttachmentKey('email-2', { id: 'download-1', partId: '1' })).not.toBe(attachment.attachmentKey);
    expect(emailAttachmentKey('email-1', { id: 'download-1', partId: '2' })).not.toBe(attachment.attachmentKey);
    expect(emailAttachmentKey('email-1', { id: 'fallback-a' })).not.toBe(emailAttachmentKey('email-1', { id: 'fallback-b' }));
  });
  it('does not mark downloaded/scanned-only attachments or legacy transactions as added', () => {
    const preview = scanned();
    expect(preview).toHaveLength(3);
    expect(emailImportHistory(saved([trade]), 'portfolio-1').has(attachment.attachmentKey)).toBe(false);
    expect(attachEmailImportSource([trade], null)[0].importSource).toBeUndefined();
  });
  it('shows partial until every scanned row has actually been saved in the selected portfolio', () => {
    const rows = scanned();
    expect(emailImportHistory(saved(rows.slice(0, 1)), 'portfolio-1').get(attachment.attachmentKey)).toEqual({ state: 'partial', added: 1, total: 3 });
    expect(emailImportHistory(saved(rows), 'portfolio-1').get(attachment.attachmentKey)).toEqual({ state: 'complete', added: 3, total: 3 });
    expect(emailImportHistory(saved(rows), 'portfolio-2').size).toBe(0);
    expect(emailImportHistory([...saved(rows.slice(0, 1)), ...saved(rows.slice(1), 'portfolio-2')], 'portfolio-1').get(attachment.attachmentKey)?.state).toBe('partial');
  });
  it('survives backup serialization and updates when saved rows are deleted', () => {
    const restored: Transaction[] = JSON.parse(JSON.stringify(saved(scanned())));
    expect(emailImportHistory(restored, 'portfolio-1').get(attachment.attachmentKey)?.state).toBe('complete');
    restored.splice(1, 1);
    expect(emailImportHistory(restored, 'portfolio-1').get(attachment.attachmentKey)).toEqual({ state: 'partial', added: 2, total: 3 });
    expect(emailImportHistory([], 'portfolio-1').size).toBe(0);
  });
  it('never counts duplicate rows or automatically paired cash as separate imported rows', () => {
    const txs = saved(scanned().slice(0, 1));
    const extra = saved(scanned().slice(1)).map(tx => ({ ...tx, autoCash: true }));
    expect(emailImportHistory([...txs, ...txs, ...extra], 'portfolio-1').get(attachment.attachmentKey)).toEqual({ state: 'partial', added: 1, total: 3 });
  });
  it('does not falsely combine partial results from different AI scans into a completed import', () => {
    const first = saved(scanned(2, 'scan-1').slice(0, 1));
    const second = saved(scanned(2, 'scan-2').slice(1));
    expect(emailImportHistory([...first, ...second], 'portfolio-1').get(attachment.attachmentKey)?.state).toBe('partial');
    expect(emailImportHistory([...first, ...saved(scanned(2, 'scan-2'))], 'portfolio-1').get(attachment.attachmentKey)?.state).toBe('complete');
  });
  it('identifies already saved preview rows after a restore without rejecting other portfolio imports', () => {
    const rows = scanned();
    const txs = saved(rows.slice(0, 1));
    expect(isEmailRowSaved(rows[0], txs, 'portfolio-1')).toBe(true);
    expect(isEmailRowSaved(rows[1], txs, 'portfolio-1')).toBe(false);
    expect(isEmailRowSaved(rows[0], txs, 'portfolio-2')).toBe(false);
    expect(isEmailRowSaved(trade, txs, 'portfolio-1')).toBe(false);
  });
  it('ignores invalid restored metadata and conservatively handles inconsistent row totals', () => {
    const txs = saved(scanned(2));
    const bad = { ...txs[0], importSource: { ...txs[0].importSource!, rowCount: 0 } };
    expect(emailImportHistory([bad], 'portfolio-1').size).toBe(0);
    txs[1].importSource!.rowCount = 3;
    expect(emailImportHistory(txs, 'portfolio-1').get(attachment.attachmentKey)).toEqual({ state: 'partial', added: 2, total: 3 });
  });
});
