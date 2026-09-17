export interface RecoveryCopy { key: string; raw: string }
const DB_NAME = 'psx-local-recovery';
const STORE = 'copies';
const prefix = (email: string) => `psx_cloud_recovery:${encodeURIComponent(email.trim().toLowerCase())}:`;
const storageError = () => new Error('This device could not save a recovery copy. Free some device storage and try again. Your current data has not been replaced.');

function legacyCopies(email: string): RecoveryCopy[] {
  const copies: RecoveryCopy[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix(email))) {
      const raw = localStorage.getItem(key);
      if (raw !== null) copies.push({ key, raw });
    }
  }
  return copies;
}

function openRecovery(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('email', 'email');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(storageError()); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

/** Keep every copy before freeing the small localStorage area. No cloud writes. */
export async function saveRecoveryCopies(email: string, copies: RecoveryCopy[]): Promise<void> {
  const account = email.trim().toLowerCase();
  if (!account || copies.some(copy => !copy.key.startsWith(prefix(account)))) throw new Error('Recovery account does not match.');
  try {
    if (typeof indexedDB === 'undefined') {
      // Older/limited browsers retain the previous safe behavior: stop if full.
      for (const copy of copies) localStorage.setItem(copy.key, copy.raw);
      return;
    }
    const previous = legacyCopies(account);
    const db = await openRecovery();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || storageError());
        transaction.onerror = () => { /* Abort is the final failure signal. */ };
        const store = transaction.objectStore(STORE);
        for (const copy of [...previous, ...copies]) store.put({ ...copy, email: account });
      });
    } finally { db.close(); }
    // Transaction completion, not individual put success, establishes durability.
    for (const copy of previous) {
      if (localStorage.getItem(copy.key) === copy.raw) localStorage.removeItem(copy.key);
    }
  } catch { throw storageError(); }
}

export async function readRecoveryCopies(email: string): Promise<RecoveryCopy[]> {
  const account = email.trim().toLowerCase();
  const copies = new Map(legacyCopies(account).map(copy => [copy.key, copy]));
  if (typeof indexedDB !== 'undefined') {
    const db = await openRecovery();
    try {
      const saved = await new Promise<RecoveryCopy[]>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readonly');
        const request = transaction.objectStore(STORE).index('email').getAll(account);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error || storageError());
      });
      for (const copy of saved) {
        const key = copies.has(copy.key) && copies.get(copy.key)!.raw !== copy.raw ? `${copy.key}:archived` : copy.key;
        copies.set(key, { key, raw: copy.raw });
      }
    } finally { db.close(); }
  }
  return [...copies.values()];
}

export async function downloadRecoveryCopies(email: string): Promise<void> {
  const copies = await readRecoveryCopies(email);
  if (!copies.length) throw new Error('No recovery copies are stored for this account on this device.');
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'psx-recovery-copies-v1', email, copies }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'psx-recovery-copies.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
