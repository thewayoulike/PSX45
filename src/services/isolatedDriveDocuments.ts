import { cloudSession } from './driveStorage';
import { createSerialQueue } from '../utils/serialQueue';

export type DocumentKind = 'trading-lab-v1' | 'practice-backup-v1';
type Request = (url: string, init?: RequestInit) => Promise<Response>;
type DriveFile = { id: string; createdTime: string };
export type DriveDocument<T> = { fileId: string; savedAt: string; value: T };
const base = 'https://www.googleapis.com/drive/v3/files';
const names: Record<DocumentKind, string> = {
  'trading-lab-v1': 'PSX Tracker - Trading Lab.json',
  'practice-backup-v1': 'PSX Tracker - Practice Trading Backup.json',
};
const queues = new Map<string, ReturnType<typeof createSerialQueue>>();
export function isolatedDriveQueue<T>(email: string, kind: DocumentKind, job: () => Promise<T>) {
  const key = email.trim().toLowerCase() + ':' + kind;
  if (!queues.has(key)) queues.set(key, createSerialQueue());
  return queues.get(key)!(job);
}
export const driveDocumentLink = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

/** Immutable uploads prevent two devices from overwriting one another. Only
 * observed inputs incorporated into a verified replacement may be retired. */
export async function openDriveDocuments<T>(email: string, kind: DocumentKind, parse: (value: unknown) => T,
  open: (email: string) => Promise<Request> = cloudSession) {
  const owner = email.trim().toLowerCase();
  const request = await open(owner);
  const validate = (raw: any): T => {
    if (raw?.version !== 1 || raw.kind !== kind || raw.owner !== owner) throw new Error('The Drive file belongs to a different account or format. It has been kept unchanged.');
    return parse(raw.data);
  };
  const read = async (): Promise<DriveDocument<T>[]> => {
    const files: DriveFile[] = [];
    let page = '';
    do {
      const q = `trashed = false and appProperties has { key='psxWorkspace' and value='${kind}' }`;
      const url = `${base}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,createdTime)&pageSize=100&orderBy=createdTime%20desc${page ? '&pageToken=' + encodeURIComponent(page) : ''}`;
      const result = await (await request(url)).json();
      if (!Array.isArray(result.files)) throw new Error('Google Drive did not return a complete file list. Please retry.');
      files.push(...result.files); page = result.nextPageToken || '';
      if (files.length > 1000) throw new Error('Too many recovery files to sync safely. Export your journal and contact support.');
    } while (page);
    const documents: DriveDocument<T>[] = [];
    for (const file of files) {
      if (!/^[\w-]+$/.test(file.id)) throw new Error('Invalid Drive file reference.');
      const raw = await (await request(`${base}/${file.id}?alt=media`, { cache: 'no-store' })).json();
      documents.push({ fileId: file.id, savedAt: file.createdTime, value: validate(raw) });
    }
    return documents;
  };
  const save = async (value: T, observed: DriveDocument<T>[], retain = 0): Promise<DriveDocument<T>> => {
    const data = parse(value);
    const contents = JSON.stringify({ version: 1, kind, owner, data });
    if (new Blob([contents]).size > 8 * 1024 * 1024) throw new Error('This backup is too large to save safely. Export a local copy.');
    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify({ name: names[kind], mimeType: 'application/json', appProperties: { psxWorkspace: kind } })], { type: 'application/json' }));
    body.append('file', new Blob([contents], { type: 'application/json' }));
    const result = await (await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime', { method: 'POST', body })).json();
    if (!/^[\w-]+$/.test(result.id || '')) throw new Error('Google Drive did not confirm the new file. Retry to check your backup.');
    const verified = validate(await (await request(`${base}/${result.id}?alt=media`, { cache: 'no-store' })).json());
    if (JSON.stringify(verified) !== JSON.stringify(data)) throw new Error('The Drive copy could not be verified. The previous copy has been kept.');
    // Never list again for cleanup: a concurrent device may just have saved new plans.
    for (const old of observed.slice(retain)) {
      if (old.fileId === result.id) continue;
      try { await request(`${base}/${old.fileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); }
      catch { /* A redundant recovery copy is safer than failing a verified save. */ }
    }
    return { fileId: result.id, savedAt: result.createdTime || new Date().toISOString(), value: data };
  };
  return { read, save };
}
