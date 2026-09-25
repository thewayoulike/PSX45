import type { EditableTrade, EmailImportSource, Transaction } from '../types';

export type EmailAttachmentIdentity = Pick<EmailImportSource, 'attachmentKey' | 'filename'>;
export interface EmailImportStatus {
  state: 'complete' | 'partial';
  added: number;
  total: number;
}

export function emailAttachmentKey(messageId: string, attachment: { id: string; partId?: string }): string {
  // Gmail's MIME part id stays stable even if an attachment download id changes.
  // Message id separates the broker's identically named daily confirmations.
  return JSON.stringify([messageId, attachment.partId ? `part:${attachment.partId}` : `id:${attachment.id}`]);
}

export function attachEmailImportSource(
  trades: EditableTrade[], attachment: EmailAttachmentIdentity | null, batchId = crypto.randomUUID(),
): EditableTrade[] {
  if (!attachment) return trades;
  return trades.map((trade, rowIndex) => ({
    ...trade,
    importSource: { kind: 'gmail', ...attachment, batchId, rowIndex, rowCount: trades.length },
  }));
}

function validSource(source: EmailImportSource | undefined): source is EmailImportSource {
  return source?.kind === 'gmail' && typeof source.attachmentKey === 'string' && !!source.attachmentKey
    && typeof source.batchId === 'string' && !!source.batchId
    && Number.isInteger(source.rowCount) && source.rowCount > 0
    && Number.isInteger(source.rowIndex) && source.rowIndex >= 0 && source.rowIndex < source.rowCount;
}

/** Derive status only from rows actually saved in this portfolio, including after Drive restore/deletion. */
export function emailImportHistory(transactions: Transaction[], portfolioId?: string): Map<string, EmailImportStatus> {
  const batches = new Map<string, Map<string, { rows: Set<number>; total: number }>>();
  for (const tx of transactions) {
    if ((portfolioId && tx.portfolioId !== portfolioId) || tx.autoCash || !validSource(tx.importSource)) continue;
    const source = tx.importSource;
    let file = batches.get(source.attachmentKey);
    if (!file) { file = new Map(); batches.set(source.attachmentKey, file); }
    let batch = file.get(source.batchId);
    if (!batch) { batch = { rows: new Set(), total: source.rowCount }; file.set(source.batchId, batch); }
    batch.rows.add(source.rowIndex);
    batch.total = Math.max(batch.total, source.rowCount);
  }
  const statuses = new Map<string, EmailImportStatus>();
  for (const [key, file] of batches) {
    for (const batch of file.values()) {
      const added = batch.rows.size;
      const status: EmailImportStatus = { state: added === batch.total ? 'complete' : 'partial', added, total: batch.total };
      const previous = statuses.get(key);
      // Never combine separate AI scans: their row counts/order may differ.
      if (!previous || added / batch.total > previous.added / previous.total) statuses.set(key, status);
    }
  }
  return statuses;
}

export function isEmailRowSaved(trade: EditableTrade, transactions: Transaction[], portfolioId?: string): boolean {
  const source = trade.importSource;
  if (!validSource(source)) return false;
  return transactions.some(tx => (!portfolioId || tx.portfolioId === portfolioId) && !tx.autoCash
    && validSource(tx.importSource) && tx.importSource.attachmentKey === source.attachmentKey
    && tx.importSource.batchId === source.batchId && tx.importSource.rowIndex === source.rowIndex);
}
