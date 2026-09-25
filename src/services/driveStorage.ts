import { beginStage } from '../utils/performance';
import { buildSheetSyncRequests } from '../utils/sheetSync';
import { createSerialQueue } from '../utils/serialQueue';
import { saveRecoveryCopies } from '../utils/recoveryStorage';
import { readApiJson } from './apiResponse';
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

/** Cap browser-stored Drive access tokens (Google often returns ~3600s). */
export const DRIVE_TOKEN_MAX_TTL_SEC = 30 * 60;

const cappedExpiresIn = (expiresIn: number) =>
  Math.min(Math.max(60, Number(expiresIn) || 0), DRIVE_TOKEN_MAX_TTL_SEC);

// drive.file also permits Sheets API operations on the spreadsheet this app creates.
// Broad spreadsheets access is sensitive and causes an unverified-app warning.
// Gmail is requested separately, only when the user opens Gmail import.
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';
const DB_FILE_NAME = 'psx_tracker_data.json';
const SHEET_FILE_NAME = 'PSX_Portfolio_Transactions'; // Name of the Google Sheet

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiryTime: number = 0;

export type LinkedDriveSession = { connected: true; accessToken: string; expiresIn: number; user: DriveUser };
let driveSessionListener: ((user: DriveUser) => void | Promise<void>) | null = null;
let passwordSessionProvider: (() => Promise<{ email: string; token: string } | null>) | null = null;
let linkedTokenProvider: ((email: string) => Promise<LinkedDriveSession | null>) | null = null;
let linkedRefresh: { email: string; attempt: number; promise: Promise<string | null> } | null = null;
let rememberedDriveConfig: { enabled: boolean; clientId?: string; error?: string } | null = null;
let rememberedConfigRequest: Promise<{ enabled: boolean; clientId?: string; error?: string }> | null = null;
let driveLoginAttempt = 0;
let pendingSetupEmail: string | null = null;
let driveSetupListener: ((email: string | null) => void) | null = null;
export function setDriveSetupRequiredHandler(listener: typeof driveSetupListener) {
    driveSetupListener = listener;
}
export function cancelDriveSetup() {
    driveLoginAttempt++;
    pendingSetupEmail = null;
    driveSetupListener?.(null);
}
export function completeDriveSetup() {
    if (pendingSetupEmail) requestRememberedDriveConnection(pendingSetupEmail, false);
}
export function setDrivePasswordProviders(session: typeof passwordSessionProvider, token: typeof linkedTokenProvider) {
    passwordSessionProvider = session; linkedTokenProvider = token;
}
export function getRememberedDriveConfig() {
    if (!rememberedConfigRequest) rememberedConfigRequest = fetch('/api/cloud-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'drive-config' }), signal: AbortSignal.timeout(10000),
    }).then(async response => {
        if (!response.ok) throw new Error('Drive connection check unavailable.');
        const config = await readApiJson(response, 'Drive connection check unavailable.');
        rememberedDriveConfig = { enabled: config.enabled === true, clientId: config.clientId, error: config.error };
        if (!rememberedDriveConfig.enabled) rememberedConfigRequest = null;
        return rememberedDriveConfig;
    }).catch(error => { rememberedConfigRequest = null; throw error; });
    return rememberedConfigRequest;
}
export function installLinkedDriveSession(session: LinkedDriveSession, expectedEmail: string, notify = true) {
    const email = String(session.user?.email || '').trim().toLowerCase();
    if (email !== expectedEmail.trim().toLowerCase() || !session.accessToken || !(session.expiresIn > 60)) throw new Error('Drive connection does not match this account.');
    const user = { ...session.user, email };
    const expiry = Date.now() + cappedExpiresIn(session.expiresIn) * 1000;
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    localStorage.setItem(STORAGE_TOKEN_KEY, session.accessToken);
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(expiry));
    accessToken = session.accessToken; tokenExpiryTime = expiry; expiredNotified = false;
    if (notify) return driveSessionListener?.(user);
}
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

function createDriveTokenClient(expectedEmail: string | null, attempt: number) {
    return window.google.accounts.oauth2.initTokenClient({
        client_id: rememberedDriveConfig?.clientId || CLIENT_ID,
        scope: SCOPES,
        include_granted_scopes: false,
        error_callback: () => {
            if (attempt === driveLoginAttempt) alert('Google sign-in was not completed. Your portfolio is unchanged.');
        },
        callback: async (tokenResponse: any) => {
            try {
                if (attempt !== driveLoginAttempt) return;
                if (!tokenResponse?.access_token) throw new Error('Google Drive access was not granted. You can try signing in again.');
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                    signal: AbortSignal.timeout(10000),
                });
                if (!response.ok) throw new Error('Could not verify the Google account. Please try again.');
                const user = await response.json();
                const email = String(user.email || '').trim().toLowerCase();
                if (!email || user.email_verified !== true) throw new Error('Choose a verified Google account to connect Drive.');
                if (expectedEmail && email !== expectedEmail) throw new Error(`You are signed in as ${expectedEmail}. Choose that same Google account to open its portfolio.`);
                if (attempt !== driveLoginAttempt) return;
                if (rememberedDriveConfig?.enabled) {
                    const check = await fetch('/api/cloud-sync', {
                        method: 'POST', signal: AbortSignal.timeout(15000),
                        headers: { Authorization: `Bearer ${tokenResponse.access_token}`, 'Content-Type': 'application/json', 'X-Requested-With': 'PSXTracker' },
                        body: JSON.stringify({ action: 'drive-status' }),
                    });
                    const status = await readApiJson(check, 'Could not check your saved Drive connection.');
                    if (!check.ok) throw new Error(status.error || 'Could not check your saved Drive connection. Please retry.');
                    if (attempt !== driveLoginAttempt) return;
                    if (status.connected !== true) {
                        pendingSetupEmail = email;
                        driveSetupListener?.(email);
                        return;
                    }
                }
                if (attempt !== driveLoginAttempt) return;
                await installLinkedDriveSession({ connected: true, accessToken: tokenResponse.access_token,
                    expiresIn: Number(tokenResponse.expires_in || 3599),
                    user: { name: user.name || email, email, picture: user.picture || '' },
                }, email);
            } catch (error) {
                if (attempt === driveLoginAttempt) alert(error instanceof Error ? error.message : 'Google sign-in could not be completed. Please try again.');
            }
        },
    });
}

function requestRememberedDriveConnection(expectedEmail: string | null, bindPassword: boolean) {
    if (rememberedDriveConfig?.enabled && window.google?.accounts?.oauth2) {
        const attempt = ++driveLoginAttempt;
        const codeClient = window.google.accounts.oauth2.initCodeClient({
            client_id: rememberedDriveConfig.clientId || CLIENT_ID, scope: SCOPES,
            include_granted_scopes: false, ux_mode: 'popup',
            ...(expectedEmail ? { login_hint: expectedEmail } : {}),
            error_callback: () => {
                if (attempt === driveLoginAttempt) alert('Google authorization was not completed. Your portfolio is unchanged.');
            },
            callback: async (result: any) => {
                try {
                    if (attempt !== driveLoginAttempt) return;
                    if (!result.code) throw new Error('Google authorization was not completed. Please try again.');
                    const password = bindPassword ? await passwordSessionProvider?.() : null;
                    if (expectedEmail && password && password.email.toLowerCase() !== expectedEmail) throw new Error('Account changed. Please sign in again.');
                    const response = await fetch('/api/cloud-sync', {
                        method: 'POST', signal: AbortSignal.timeout(30000),
                        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'PSXTracker',
                            ...(expectedEmail && password ? { Authorization: `Bearer ${password.token}` } : {}) },
                        body: JSON.stringify({ action: 'drive-connect', code: result.code, expectedEmail }),
                    });
                    const data = await readApiJson(response, 'Could not remember the Drive connection.');
                    if (attempt !== driveLoginAttempt) return;
                    if (!response.ok) throw new Error(data.error || 'Could not remember the Drive connection.');
                    pendingSetupEmail = null;
                    driveSetupListener?.(null);
                    await installLinkedDriveSession(data, expectedEmail || data.user?.email);
                } catch (error) {
                    if (attempt === driveLoginAttempt) alert(error instanceof Error ? error.message : 'Could not connect Google Drive.');
                }
            },
        });
        codeClient.requestCode();
        return;
    }
    alert('Google sign-in is still preparing. Please try again in a moment.');
}

let googleInitTimer: ReturnType<typeof setInterval> | undefined;
export const initDriveAuth = (onUserLoggedIn: (user: DriveUser) => void | Promise<void>) => {
    driveSessionListener = onUserLoggedIn;
    loadGoogleScript();
    if (typeof window.location?.origin === 'string') void getRememberedDriveConfig().catch(() => {});

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

    if (googleInitTimer) clearInterval(googleInitTimer);
    const checkInterval = googleInitTimer = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            clearInterval(checkInterval);
            if (!CLIENT_ID) return;

            try {
                tokenClient = createDriveTokenClient(null, driveLoginAttempt);
            } catch (e) {
                console.error("Error initializing Google Token Client", e);
            }
        }
    }, 500);
    return () => { clearInterval(checkInterval); if (driveSessionListener === onUserLoggedIn) driveSessionListener = null; };
};

export const signInWithDrive = (email?: string) => {
    const expectedEmail = typeof email === 'string' ? email.trim().toLowerCase() || null : null;
    // Do not accidentally use a non-remembered grant while the server check is still loading.
    if (!rememberedDriveConfig) {
        void getRememberedDriveConfig().catch(() => {});
        alert('Google sign-in is still preparing. Please try again in a moment.');
        return;
    }
    if (expectedEmail && !rememberedDriveConfig.enabled) {
        alert(rememberedDriveConfig.error || 'Remembered Drive access is unavailable. Please contact support before reconnecting.');
        return;
    }
    if (expectedEmail && rememberedDriveConfig.enabled) {
        requestRememberedDriveConnection(expectedEmail, true);
        return;
    }
    if (window.google?.accounts?.oauth2) {
        tokenClient = createDriveTokenClient(expectedEmail, ++driveLoginAttempt);
    }
    if (!tokenClient) {
        alert("Google Service initializing... please wait 2 seconds and try again.");
        return;
    }
    tokenClient.requestAccessToken({ prompt: '', ...(expectedEmail ? { login_hint: expectedEmail } : {}) });
};

export const clearDriveSession = () => {
    if (sheetTimer) clearTimeout(sheetTimer);
    cancelDriveSetup();
    gmailToken = null;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    accessToken = null;
    tokenExpiryTime = 0;
    setSheetState('idle');
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

    const email = currentEmail();
    if (email && linkedTokenProvider) {
        const requestingAttempt = driveLoginAttempt;
        if (!linkedRefresh || linkedRefresh.email !== email || linkedRefresh.attempt !== requestingAttempt) {
            const attempt = driveLoginAttempt;
            const promise = linkedTokenProvider(email).then(session => {
                if (!session || currentEmail() !== email || attempt !== driveLoginAttempt) return null;
                installLinkedDriveSession(session, email, false);
                return session.accessToken;
            }).finally(() => { if (linkedRefresh?.promise === promise) linkedRefresh = null; });
            linkedRefresh = { email, attempt, promise };
        }
        const refreshed = await linkedRefresh.promise;
        if (requestingAttempt !== driveLoginAttempt || currentEmail() !== email) return null;
        if (refreshed) return refreshed;
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
const cloudRestores = new Set<string>();
const conflictMessage = 'Another device saved a newer version. Choose Load latest to read it. A recovery copy of this device’s changes will be kept.';
const currentEmail = () => {
    try { return String(JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || '{}').email || '').toLowerCase(); }
    catch { return ''; }
};
const pendingKey = (email: string) => 'psx_pending_cloud_v1:' + encodeURIComponent(email);
const sheetIds = new Map<string, string>();
export const getCachedGoogleSheetId = () => sheetIds.get(currentEmail()) || null;
const sheetQueue = createSerialQueue();
let sheetTimer: ReturnType<typeof setTimeout> | undefined;
let sheetState: 'idle' | 'pending' | 'syncing' | 'error' = 'idle';
const sheetJobKey = (email: string) => 'psx_sheet_export_v1:' + encodeURIComponent(email);
export const getSheetExportState = () => sheetState;
const setSheetState = (state: typeof sheetState) => {
    sheetState = state;
    if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('psx-sheet-export'));
};
const sheetContentKey = async (data: any) => {
    const bytes = new TextEncoder().encode(JSON.stringify([data.transactions || [], data.portfolios || []]));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
};
async function queueSheetExport(email: string, head: CloudHead, data: any) {
    const contentKey = await sheetContentKey(data);
    if (currentEmail() !== email) return;
    const completed = localStorage.getItem(sheetJobKey(email) + ':completed');
    if (completed === contentKey && !localStorage.getItem(sheetJobKey(email))) return;
    // Only a pointer/hash is retained. The committed portfolio stays in Drive.
    localStorage.setItem(sheetJobKey(email), JSON.stringify({ revision: head.revision, fileId: head.fileId, contentKey }));
    retrySheetExport();
}
export function retrySheetExport() {
    if (sheetTimer) clearTimeout(sheetTimer);
    const email = currentEmail();
    if (!email || !localStorage.getItem(sheetJobKey(email))) return;
    setSheetState('pending');
    sheetTimer = setTimeout(() => void sheetQueue(async () => {
        if (currentEmail() !== email || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        setSheetState('syncing');
        const job = localStorage.getItem(sheetJobKey(email));
        try {
            if (!job) { setSheetState('idle'); return; }
            const request = await cloudSession(email);
            const head = await cloudHead(email, { action: 'head' });
            if (!head.fileId) throw new Error('No committed backup');
            const data = await (await request(`https://www.googleapis.com/drive/v3/files/${head.fileId}?alt=media`)).json();
            if (!Array.isArray(data.transactions) || !Array.isArray(data.portfolios)) throw new Error('Invalid export source');
            const contentKey = await sheetContentKey(data);
            if (localStorage.getItem(sheetJobKey(email) + ':completed') !== contentKey) {
                await writeSheets(request, data.transactions, data.portfolios, email);
            }
            const latest = await cloudHead(email, { action: 'head' });
            if (latest.revision !== head.revision) { retrySheetExport(); return; }
            localStorage.setItem(sheetJobKey(email) + ':completed', contentKey);
            if (localStorage.getItem(sheetJobKey(email)) === job) localStorage.removeItem(sheetJobKey(email));
            setSheetState(localStorage.getItem(sheetJobKey(email)) ? 'pending' : 'idle');
        } catch { if (currentEmail() === email) setSheetState('error'); }
    }), 5000);
}
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
    const endMeasure = beginStage(body.action === 'commit' ? 'drive_commit' : 'drive_head');
    try {
    const token = await getValidToken();
    if (!token || currentEmail() !== email) throw new Error('Sign in to the same Google account to sync.');
    const res = await fetch('/api/cloud-sync', { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 409) { cloudConflicts.add(email); throw new Error(conflictMessage); }
    const head = await readApiJson(res, 'Cloud version check unavailable. Your changes remain on this device.');
    if (currentEmail() !== email) throw new Error('Account changed. Cloud version check cancelled.');
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 || (head.fileId !== null && typeof head.fileId !== 'string')) throw new Error('Invalid cloud version response.');
    endMeasure();
    return head;
    } catch (error) { endMeasure('error'); throw error; }
}
async function writeSheets(request: CloudRequest, transactions: any[], portfolios: any[], email = currentEmail()) {
    let sheetId = sheetIds.get(email) || await findFile(request, SHEET_FILE_NAME);
    if (!sheetId) {
        const created = await request('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: SHEET_FILE_NAME, mimeType: 'application/vnd.google-apps.spreadsheet' }),
        });
        sheetId = (await created.json()).id;
        if (!sheetId) throw new Error('Google did not return a spreadsheet ID.');
    }
    let metadata: Response;
    try { metadata = await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties,developerMetadata)`); }
    catch (error) {
        // A deleted cached file may be replaced without poisoning future exports.
        if (sheetIds.has(email) && /HTTP 404/.test(String(error))) { sheetIds.delete(email); return writeSheets(request, transactions, portfolios, email); }
        throw error;
    }
    const meta = await metadata.json();
    sheetIds.set(email, sheetId);
    const requests = buildSheetSyncRequests(meta, transactions, portfolios);
    if (requests.length) await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
    });
    return sheetId as string;
}

/** Persists the pending snapshot before scheduling any network writes. */
export function saveToDrive(data: any, includeSheets = false): Promise<CloudSaveResult> {
    const email = currentEmail();
    if (cloudRestores.has(email)) return Promise.resolve({ ok: false, error: 'Loading the latest cloud backup. Saving is paused.' });
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
            if (includeSheets) {
                try { await queueSheetExport(email, { ...committed, fileId }, snapshot); }
                catch { setSheetState('error'); /* A derived export must not fail a committed backup. */ }
            }
            const sheetId = sheetIds.get(email) || null;
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
    let data = pending?.data;
    if (!data) {
        const fileId = head.fileId || await findFile(request, DB_FILE_NAME);
        // Only a successful empty lookup means no backup exists.
        data = fileId ? await (await request(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).json() : null;
    }
    if (currentEmail() !== email) throw new Error('Account changed. Cloud load cancelled.');
    cloudBases.set(email, head.revision);
    cloudConflicts.delete(email);
    return data;
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
export async function clearPendingCloud() {
    const email = currentEmail(), raw = localStorage.getItem(pendingKey(email));
    if (email && raw) {
        await saveRecoveryCopies(email, [{ key: `psx_cloud_recovery:${encodeURIComponent(email)}:${crypto.randomUUID()}`, raw }]);
        if (currentEmail() !== email || localStorage.getItem(pendingKey(email)) !== raw) throw new Error('Account or pending changes changed. Please retry.');
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
export async function readLatestFromDrive(getLocalSnapshot?: () => any, onlyIfNewer = false): Promise<any | undefined> {
    const email = currentEmail();
    if (cloudRestores.has(email)) return undefined;
    cloudRestores.add(email);
    const endMeasure = beginStage('drive_read');
    try {
        return await cloudQueue(async () => {
            // Wait for any existing save, and read a usable remote copy before clearing pending data.
            const request = await cloudSession(email);
            const head = await cloudHead(email, { action: 'head' });
            if (onlyIfNewer && cloudBases.get(email) === head.revision) return undefined;
            const id = head.fileId || await findFile(request, DB_FILE_NAME);
            if (!id) { cloudBases.set(email, head.revision); return null; }
            const data = await (await request(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json();
            if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.portfolios)) {
                throw new Error('The cloud backup is incomplete. Your local changes have been kept.');
            }
            if (currentEmail() !== email) throw new Error('Account changed. Cloud load cancelled.');
            // Cloud has not moved since this edit was queued. Keep the pending copy and show it.
            const pendingRaw = localStorage.getItem(pendingKey(email));
            let pendingParsed: { data?: any; baseVersion?: number } | null = null;
            try { pendingParsed = pendingRaw ? JSON.parse(pendingRaw) : null; } catch { pendingParsed = null; }
            if (pendingParsed?.data && pendingParsed.baseVersion === head.revision) {
                cloudBases.set(email, head.revision);
                cloudConflicts.delete(email);
                return pendingParsed.data;
            }
            // Include edits made after a failed startup load or while the download was in progress.
            // Use the larger browser database; existing recovery copies migrate only after commit.
            const currentRaw = getLocalSnapshot ? JSON.stringify(getLocalSnapshot()) : null;
            const recoveryKey = `psx_cloud_recovery:${encodeURIComponent(email)}:${crypto.randomUUID()}`;
            const copies = [];
            if (currentRaw !== null) copies.push({ key: `${recoveryKey}:current`, raw: JSON.stringify({
                revision: crypto.randomUUID(), queuedAt: new Date().toISOString(), data: JSON.parse(currentRaw),
            }) });
            if (pendingRaw) copies.push({ key: `${recoveryKey}:pending`, raw: pendingRaw });
            await saveRecoveryCopies(email, copies);
            if (currentEmail() !== email) throw new Error('Account changed. Cloud load cancelled.');
            if (localStorage.getItem(pendingKey(email)) !== pendingRaw || (getLocalSnapshot && JSON.stringify(getLocalSnapshot()) !== currentRaw)) {
                throw new Error('Local edits changed while keeping the recovery copy. Tap Load latest again after finishing your edits.');
            }
            if (pendingRaw) localStorage.removeItem(pendingKey(email));
            cloudBases.set(email, head.revision);
            cloudConflicts.delete(email);
            return data;
        });
    } catch (error) { endMeasure('error'); throw error; }
    finally { endMeasure(); cloudRestores.delete(email); }
}

// Compatibility for older callers; the app now applies the downloaded data without reloading.
export async function preservePendingAndReloadCloud(getLocalSnapshot?: () => any): Promise<boolean> {
    try {
        const data = await readLatestFromDrive(getLocalSnapshot);
        if (data === undefined) return false;
        if (data === null) throw new Error('No cloud backup was found. Your pending changes have been kept.');
        window.location.reload();
        return true;
    } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not load cloud backup. Your changes were kept.');
        return false;
    }
}
export async function getGoogleSheetId(): Promise<string | null> {
    const email = currentEmail();
    if (sheetIds.has(email)) return sheetIds.get(email)!;
    const id = await findFile(await cloudSession(email), SHEET_FILE_NAME);
    if (id && currentEmail() === email) sheetIds.set(email, id);
    return id;
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
            include_granted_scopes: false,
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
                        attachments.push({ id: part.body.attachmentId, partId: part.partId, filename: part.filename, mimeType: part.mimeType, messageId: msg.id, size: part.body.size });
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
