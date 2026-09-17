import { buildSheetSyncRequests } from '../utils/sheetSync';
import { createSerialQueue } from '../utils/serialQueue';
// src/services/driveStorage.ts
// Google Drive Storage Service
// Stores application state in a single JSON file in Google Drive.
// Includes Session Persistence, Auto-Refresh handling, Google Sheets Sync, and Gmail Integration.

const HARDCODED_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';
const CLIENT_ID_KEY = 'VITE_GOOGLE_CLIENT_ID';

// LocalStorage Keys for Session Persistence
const STORAGE_TOKEN_KEY = 'psx_drive_access_token';
const STORAGE_USER_KEY = 'psx_drive_user_profile';
const STORAGE_EXPIRY_KEY = 'psx_drive_token_expiry';

// Gmail is requested separately, only when the user opens Gmail import.
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets openid';
const DB_FILE_NAME = 'psx_tracker_data.json';
const SHEET_FILE_NAME = 'PSX_Portfolio_Transactions'; // Name of the Google Sheet

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiryTime: number = 0;

let refreshTokenResolver: ((token: string) => void) | null = null;
let onSessionExpired: (() => void) | null = null;
let expiredNotified = false;
// App registers this so an expired Drive token logs the user out to the login
// screen instead of auto-popping the Google account chooser.
export const setDriveSessionExpiredHandler = (fn: (() => void) | null) => { onSessionExpired = fn; };

export interface DriveUser {
  name: string;
  email: string;
  picture: string;
}

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) { /* ignore */ }
  return undefined;
};

// Prioritize the User's Env Variable over the Hardcoded one
const RAW_ID = getEnv(CLIENT_ID_KEY) || HARDCODED_CLIENT_ID;
const CLIENT_ID = (RAW_ID && RAW_ID.includes('.apps.googleusercontent.com')) ? RAW_ID : undefined;

const loadGoogleScript = () => {
    if (document.getElementById('google-gsi-script')) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-gsi-script';
    document.body.appendChild(script);
};

export const initDriveAuth = (onUserLoggedIn: (user: DriveUser) => void) => {
    loadGoogleScript();

    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedUserStr = localStorage.getItem(STORAGE_USER_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

        if (storedToken && storedUserStr && storedExpiry) {
            const expiry = parseInt(storedExpiry);
            const now = Date.now();
            
            if (!isNaN(expiry) && now < expiry - 60000) {
                accessToken = storedToken;
                tokenExpiryTime = expiry;
                const user = JSON.parse(storedUserStr);
                onUserLoggedIn(user);
            } else {
                localStorage.removeItem(STORAGE_TOKEN_KEY);
                localStorage.removeItem(STORAGE_USER_KEY);
                localStorage.removeItem(STORAGE_EXPIRY_KEY);
            }
        }
    } catch (e) {
        console.error("Error restoring session", e);
    }

    const checkInterval = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            clearInterval(checkInterval);
            if (!CLIENT_ID) return;

            try {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: async (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                            const expiresIn = (tokenResponse.expires_in || 3599) * 1000;
                            tokenExpiryTime = Date.now() + expiresIn;
                            expiredNotified = false;

                            localStorage.setItem(STORAGE_TOKEN_KEY, accessToken!);
                            localStorage.setItem(STORAGE_EXPIRY_KEY, tokenExpiryTime.toString());

                            if (refreshTokenResolver) {
                                refreshTokenResolver(accessToken!);
                                refreshTokenResolver = null;
                            }

                            const storedUser = localStorage.getItem(STORAGE_USER_KEY);
                            if (!storedUser || !refreshTokenResolver) {
                                try {
                                    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                        headers: { Authorization: `Bearer ${accessToken}` }
                                    });
                                    if (response.ok) {
                                        const user = await response.json();
                                        const userData = {
                                            name: user.name,
                                            email: user.email,
                                            picture: user.picture
                                        };
                                        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
                                        onUserLoggedIn(userData);
                                    }
                                } catch (e) {
                                    console.error("Failed to fetch user info", e);
                                }
                            }
                        }
                    },
                });
            } catch (e) {
                console.error("Error initializing Google Token Client", e);
            }
        }
    }, 500);
    return () => clearInterval(checkInterval);
};

export const signInWithDrive = () => {
    if (!tokenClient) {
        alert("Google Service initializing... please wait 2 seconds and try again.");
        return;
    }
    tokenClient.requestAccessToken({ prompt: '' });
};

export const clearDriveSession = () => {
    gmailToken = null;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    accessToken = null;
    tokenExpiryTime = 0;
};

export const signOutDrive = () => {
    clearDriveSession();

    if (window.google && accessToken) {
        window.google.accounts.oauth2.revoke(accessToken, () => {
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
};

/**
 * EXPORTED: Retrieves a valid access token, refreshing it if necessary.
 * Required for external services like Google Sheets data fetching.
 */
export const getValidToken = async (): Promise<string | null> => {
    const now = Date.now();
    if (accessToken && tokenExpiryTime > now + 60000) {
        return accessToken;
    }

    if (!tokenClient) return null;

    // Token missing/expired. Do NOT auto-pop the Google sign-in prompt: with
    // multiple Google accounts a "silent" refresh still shows the account
    // chooser, and two concurrent syncs pop it twice. Instead clear the Drive
    // session and notify the app to show the login screen — the user signs in
    // again manually when they resume. Guests (no stored user) are skipped.
    const hasSignedIn = !!localStorage.getItem(STORAGE_USER_KEY);
    if (!hasSignedIn) return null;

    accessToken = null;
    tokenExpiryTime = 0;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    if (!expiredNotified) {
        expiredNotified = true;
        if (onSessionExpired) { try { onSessionExpired(); } catch { /* ignore */ } }
    }
    return null;
};

// --- Checked, serialized Drive and Sheets operations ---
const cloudQueue = createSerialQueue();
const cloudBases = new Map<string, number>();
const cloudConflicts = new Set<string>();
const conflictMessage = 'Another device saved a newer version. Download your changes, then load the cloud version to reconcile them.';
const currentEmail = () => {
    try { return String(JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || '{}').email || '').toLowerCase(); }
    catch { return ''; }
};
const pendingKey = (email: string) => 'psx_pending_cloud_v1:' + encodeURIComponent(email);
export type CloudSaveResult = { ok: true; savedAt: string; sheetId: string | null } | { ok: false; error: string };

async function cloudSession(email: string) {
    const token = await getValidToken();
    if (!email || !token || currentEmail() !== email) throw new Error('Sign in to the same Google account to finish saving.');
    return async (url: string, options: RequestInit = {}) => {
        if (currentEmail() !== email) throw new Error('Account changed. Save cancelled.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let response: Response;
        try {
            response = await fetch(url, { ...options, signal: controller.signal, headers: {
                ...options.headers, Authorization: `Bearer ${token}`,
            } });
        } finally { clearTimeout(timer); }
        if (currentEmail() !== email) throw new Error('Account changed. Cloud request cancelled.');
        if (!response.ok) {
            if (response.status === 401 && accessToken === token) {
                accessToken = null;
                tokenExpiryTime = 0;
                localStorage.removeItem(STORAGE_TOKEN_KEY);
                localStorage.removeItem(STORAGE_EXPIRY_KEY);
            }
            throw new Error(`Cloud request failed (HTTP ${response.status}). Your changes remain unsynced. Please retry or sign in again.`);
        }
        return response;
    };
}
type CloudRequest = Awaited<ReturnType<typeof cloudSession>>;

async function findFile(request: CloudRequest, name: string) {
    const query = `name = '${name}' and trashed = false`;
    const response = await request(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&orderBy=modifiedTime%20desc`);
    const data = await response.json();
    return data.files?.[0]?.id || null;
}
async function writeDrive(request: CloudRequest, data: any) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: `psx_tracker_backup_${crypto.randomUUID()}.json`, mimeType: 'application/json', appProperties: { psxSnapshot: 'v2' } })], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const response = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form });
    const { id } = await response.json();
    if (!id) throw new Error('Google did not return a backup ID.');
    return id as string;
}
type CloudHead = { revision: number; fileId: string | null; cleanupIds?: string[] };
async function cloudHead(email: string, body: Record<string, unknown>): Promise<CloudHead> {
    const token = await getValidToken();
    if (!token || currentEmail() !== email) throw new Error('Sign in to the same Google account to sync.');
    const res = await fetch('/api/cloud-sync', { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 409) { cloudConflicts.add(email); throw new Error(conflictMessage); }
    if (!res.ok) throw new Error('Cloud version check unavailable. Your changes remain on this device.');
    const head = await res.json();
    if (currentEmail() !== email) throw new Error('Account changed. Cloud version check cancelled.');
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 || (head.fileId !== null && typeof head.fileId !== 'string')) throw new Error('Invalid cloud version response.');
    return head;
}
async function writeSheets(request: CloudRequest, transactions: any[], portfolios: any[]) {
    let sheetId = await findFile(request, SHEET_FILE_NAME);
    if (!sheetId) {
        const created = await request('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: SHEET_FILE_NAME, mimeType: 'application/vnd.google-apps.spreadsheet' }),
        });
        sheetId = (await created.json()).id;
        if (!sheetId) throw new Error('Google did not return a spreadsheet ID.');
    }
    const meta = await (await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties,developerMetadata)`)).json();
    const requests = buildSheetSyncRequests(meta, transactions, portfolios);
    if (requests.length) await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
    });
    return sheetId as string;
}

/** Persists the pending snapshot before scheduling any network writes. */
export function saveToDrive(data: any, includeSheets = false): Promise<CloudSaveResult> {
    const email = currentEmail();
    const revision = crypto.randomUUID();
    const snapshot = JSON.parse(JSON.stringify({ ...data, lastModified: new Date().toISOString() }));
    try {
        if (!email) throw new Error('Sign in to Google before saving.');
        localStorage.setItem(pendingKey(email), JSON.stringify({
            revision,
            queuedAt: new Date().toISOString(),
            baseVersion: cloudBases.get(email) ?? null,
            data: snapshot,
        }));
    } catch (error: any) {
        return Promise.resolve({ ok: false, error: error.message || 'Unable to preserve pending changes locally.' });
    }
    return cloudQueue(async () => {
        try {
            const request = await cloudSession(email);
            const base = cloudBases.get(email);
            if (base === undefined) throw new Error('Load your cloud backup before saving changes.');
            if (cloudConflicts.has(email)) throw new Error(conflictMessage);
            const head = await cloudHead(email, { action: 'head' });
            if (head.revision !== base) { cloudConflicts.add(email); throw new Error(conflictMessage); }
            const fileId = await writeDrive(request, snapshot);
            const updatePending = (extra: Record<string, unknown>) => {
                const pending = JSON.parse(localStorage.getItem(pendingKey(email)) || '{}');
                if (pending.revision === revision) localStorage.setItem(pendingKey(email), JSON.stringify({ ...pending, ...extra }));
            };
            updatePending({ fileId, baseVersion: base });
            const committed = await cloudHead(email, { action: 'commit', revision: base, fileId });
            cloudBases.set(email, committed.revision);
            updatePending({ baseVersion: committed.revision });
            // Sheets is a derived export. The authoritative backup is the immutable, committed file.
            const latest = await cloudHead(email, { action: 'head' });
            const sheetId = includeSheets && latest.revision === committed.revision ? await writeSheets(request, snapshot.transactions || [], snapshot.portfolios || []) : null;
            // Retain 20 committed versions. Only trash files carrying our snapshot marker.
            for (const obsolete of committed.cleanupIds || []) {
                try {
                    const meta = await (await request(`https://www.googleapis.com/drive/v3/files/${obsolete}?fields=appProperties`)).json();
                    if (meta.appProperties?.psxSnapshot === 'v2') await request(`https://www.googleapis.com/drive/v3/files/${obsolete}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
                    });
                } catch { /* Cleanup must never turn a durable save into a failure. */ }
            }
            if (currentEmail() !== email) throw new Error('Account changed during save.');
            const pending = JSON.parse(localStorage.getItem(pendingKey(email)) || '{}');
            if (pending.revision === revision) localStorage.removeItem(pendingKey(email));
            return { ok: true, savedAt: new Date().toISOString(), sheetId } as CloudSaveResult;
        } catch (error: any) {
            return { ok: false, error: error.message || 'Cloud save failed. Please retry.' } as CloudSaveResult;
        }
    });
}

export async function loadFromDrive() {
    const email = currentEmail();
    const request = await cloudSession(email);
    const head = await cloudHead(email, { action: 'head' });
    const pending = JSON.parse(localStorage.getItem(pendingKey(email)) || 'null');
    if (pending?.data && pending.baseVersion !== head.revision && !(head.fileId && pending.fileId === head.fileId)) {
        cloudConflicts.add(email);
        throw new Error(conflictMessage);
    }
    cloudBases.set(email, head.revision);
    cloudConflicts.delete(email);
    if (pending?.data) return pending.data;
    const fileId = head.fileId || await findFile(request, DB_FILE_NAME);
    if (!fileId) return null; // Only a successful empty lookup means no backup exists.
    return (await request(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).json();
}
export type PendingCloud = { revision: string; queuedAt: string | null; data: any; baseVersion?: number | null; fileId?: string | null };
export function getPendingCloud(): PendingCloud | null {
    const email = currentEmail();
    if (!email) return null;
    try {
        const raw = localStorage.getItem(pendingKey(email));
        if (!raw) return null;
        const pending = JSON.parse(raw);
        if (!pending?.revision || !pending?.data) return null;
        return {
            revision: String(pending.revision),
            queuedAt: pending.queuedAt || pending.data?.lastModified || null,
            data: pending.data,
            baseVersion: pending.baseVersion ?? null,
            fileId: pending.fileId ?? null,
        };
    } catch {
        return null;
    }
}
export function clearPendingCloud() {
    const email = currentEmail(), raw = localStorage.getItem(pendingKey(email));
    if (email && raw) {
        localStorage.setItem(`psx_cloud_recovery:${encodeURIComponent(email)}:${Date.now()}`, raw);
        localStorage.removeItem(pendingKey(email));
    }
}
export function downloadPendingCloudBackup() {
    const raw = localStorage.getItem(pendingKey(currentEmail()));
    if (!raw) return;
    const data = JSON.parse(raw).data;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'psx-unsynced-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function preservePendingAndReloadCloud() {
    try {
        // Verify that the remote copy is readable before releasing a pending edit.
        const email = currentEmail(), request = await cloudSession(email);
        const head = await cloudHead(email, { action: 'head' });
        const id = head.fileId || await findFile(request, DB_FILE_NAME);
        if (!id) throw new Error('No cloud backup was found. Your pending changes have been kept.');
        await (await request(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json();
        clearPendingCloud();
        window.location.reload();
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not load cloud backup. Your changes were kept.'); }
}
export async function getGoogleSheetId(): Promise<string | null> {
    return findFile(await cloudSession(currentEmail()), SHEET_FILE_NAME);
}
export function syncTransactionsToSheet(transactions: any[], portfolios: any[]) {
    const email = currentEmail();
    const snapshot = JSON.parse(JSON.stringify({ transactions, portfolios }));
    return cloudQueue(async () => writeSheets(await cloudSession(email), snapshot.transactions, snapshot.portfolios));
}

// --- GMAIL INTEGRATION FUNCTIONS ---
let gmailToken: { token: string; email: string; expires: number } | null = null;
async function requestGmailAccess(): Promise<string> {
    const email = currentEmail();
    if (!email) throw new Error('Connect Google Drive before importing Gmail attachments.');
    if (gmailToken?.email === email && gmailToken.expires > Date.now() + 60000) return gmailToken.token;
    if (!window.google?.accounts?.oauth2 || !CLIENT_ID) throw new Error('Google sign-in is still loading. Please retry.');
    return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid',
            hint: email,
            error_callback: () => reject(new Error('Gmail access was not granted. You can still import a file.')),
            callback: async (response: any) => {
                try {
                    if (!response.access_token) throw new Error('Gmail access was not granted.');
                    const identity = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { Authorization: `Bearer ${response.access_token}` }, signal: AbortSignal.timeout(10000),
                    });
                    if (!identity.ok) throw new Error('Could not verify the Gmail account.');
                    const user = await identity.json();
                    if (user.email_verified !== true || user.email?.toLowerCase() !== email || currentEmail() !== email) throw new Error('Choose the same Google account used for this portfolio.');
                    gmailToken = { token: response.access_token, email, expires: Date.now() + Number(response.expires_in || 3500) * 1000 };
                    resolve(response.access_token);
                } catch (error) { reject(error); }
            },
        });
        client.requestAccessToken({ prompt: '' });
    });
}

export const searchGmailMessages = async (query: string) => {
    const token = await requestGmailAccess();
    if (!token) return [];

    try {
        const q = `${query} has:attachment`;
        const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`;
        const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (listResp.status === 403) throw new Error("Permission denied. Please re-authenticate.");
        const listData = await listResp.json();
        if (!listData.messages) return [];

        const messages = await Promise.all(listData.messages.map(async (msg: any) => {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
            const detailResp = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
            const detailData = await detailResp.json();
            const subject = detailData.payload.headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
            const from = detailData.payload.headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
            const date = detailData.internalDate;
            const attachments: any[] = [];
            
            const traverseParts = (partList: any[]) => {
                partList.forEach((part: any) => {
                    if (part.body && part.body.attachmentId) {
                        attachments.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType, messageId: msg.id, size: part.body.size });
                    }
                    if (part.parts) traverseParts(part.parts);
                });
            };
            if (detailData.payload.parts) traverseParts(detailData.payload.parts);
            return { id: msg.id, snippet: detailData.snippet, subject, from, date: parseInt(date), attachments };
        }));
        return messages;
    } catch (e: any) {
        throw new Error(e.message || "Failed to access Gmail.");
    }
};

const getMimeType = (filename: string, originalMime: string) => {
    if (originalMime && originalMime !== 'application/octet-stream') return originalMime;
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'csv': return 'text/csv';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'xls': return 'application/vnd.ms-excel';
        default: return originalMime || 'application/octet-stream';
    }
};

export const downloadGmailAttachment = async (messageId: string, attachmentId: string, filename: string, mimeType: string): Promise<File | null> => {
    const token = await requestGmailAccess();
    if (!token) return null;

    try {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.data) {
            const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const finalMimeType = getMimeType(filename, mimeType);
            return new File([byteArray], filename, { type: finalMimeType });
        }
    } catch (e) {
        console.error("Attachment Download Failed", e);
    }
    return null;
};

export const hasValidSession = (): boolean => {
    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
        if (storedToken && storedExpiry) {
            const now = Date.now();
            return now < parseInt(storedExpiry) - 60000;
        }
    } catch (e) { return false; }
    return false;
};
