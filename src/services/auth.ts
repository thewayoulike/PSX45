// src/services/auth.ts
// Email/password auth via Supabase Auth, with an owner-approval gate.
// Google Drive stays the data store — this only controls WHO can get in.

import { createClient, Session } from '@supabase/supabase-js';
import { beginStage } from '../utils/performance';
import { readApiJson } from './apiResponse';
import { getValidToken, getRememberedDriveConfig, installLinkedDriveSession, setDrivePasswordProviders, clearDriveSession, LinkedDriveSession } from './driveStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Publishable/anon key only — safe for the browser (RLS protects the data).
export const supabase = createClient(SUPABASE_URL || 'https://unconfigured.invalid', SUPABASE_ANON_KEY || 'unconfigured', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const isAuthConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export interface AppAuthUser {
  id: string;
  email: string;
  name?: string;
}

/** Create an account (approved = false) and alert the owner to approve it. */
export const signUp = async (name: string, email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) throw error;

  // Add them to the allowlist as pending and email the owner an approve link.
  // resend=true so retrying a signup always re-sends the owner email.
  try { await checkApproval(email, name, true, true); } catch { /* signup already succeeded */ }

  return data;
};

/**
 * Ask the server whether an email is approved (works for BOTH email/password and
 * Google users). If `notify` is true and the email is new, it's added as pending
 * and the owner is emailed an approve link.
 */
export const checkApproval = async (email: string, name?: string, notify = false, resend = false): Promise<boolean> => {
  const st = await getAccessStatus(email, name, notify, resend);
  return st.active;
};

export type AccessState = 'pending' | 'trial' | 'free' | 'paid' | 'lifetime' | 'unavailable';

export interface AccessStatus {
  approved: boolean;       // owner has let them in (trial or beyond)
  active: boolean;         // currently has access to the app (includes Free)
  status: AccessState;
  plan: AccessState;
  lifetime: boolean;
  accessUntil?: string | null;
  trialEnds?: string | null;
  daysLeft?: number | null;
  quotas?: Record<string, number> | null;
  isNew?: boolean;
}

/**
 * Full access picture for an email (trial / free / paid / lifetime). If
 * `notify` is true and the email is new, it's added as pending and the owner
 * is emailed an approve link (unchanged behaviour).
 */
const accessRequests = new Map<string, Promise<AccessStatus>>();
export const getAccessStatus = (email: string, name?: string, notify = false, resend = false): Promise<AccessStatus> => {
  const normalized = email.trim().toLowerCase();
  const key = `${normalized}:${notify}:${resend}`;
  let request = accessRequests.get(key);
  if (!request) {
    request = fetchAccessStatus(normalized, name, notify, resend).finally(() => accessRequests.delete(key));
    accessRequests.set(key, request);
  }
  return request;
};
const fetchAccessStatus = async (email: string, name?: string, notify = false, resend = false): Promise<AccessStatus> => {
  const endMeasure = beginStage('access_check');
  try {
    // Attach the user's session token if it's readily available, but never let
    // this block boot: getSession() can stall (auth-lock/refresh), so cap it.
    let token: string | undefined;
    try {
      token = await Promise.race([
        getSession().then(s => s?.user.email?.toLowerCase() === email ? s.access_token : undefined).catch(() => undefined),
        new Promise<undefined>(res => setTimeout(() => res(undefined), 1200)),
      ]);
    } catch { token = undefined; }
    // The Google identity being checked must not accidentally use another email session.
    let googleToken: string | null = null;
    if (!token) try { googleToken = await getValidToken(); } catch { /* The password session may still verify account access. */ }
    let googleEmail = '';
    try { googleEmail = JSON.parse(localStorage.getItem('psx_drive_user_profile') || '{}').email || ''; } catch { /* ignore */ }
    if (googleToken && googleEmail.toLowerCase() === email.toLowerCase()) token = googleToken;
    if (!token) throw new Error('No authenticated session');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(notify ? '/api/request-access' : '/api/check-access', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers,
      body: JSON.stringify({ email, name: name || '', notify, resend }),
    });
    if (!res.ok) throw new Error('Access check unavailable');
    const d = await res.json().catch(() => ({}));
    if (!['pending', 'trial', 'free', 'paid', 'lifetime', 'expired'].includes(d.status || d.accessStatus)) throw new Error('Invalid access response');
    // Legacy API returned "expired"; treat as free.
    const raw = (d.status || d.accessStatus || (d.approved ? 'trial' : 'pending')) as string;
    const status = (raw === 'expired' ? 'free' : raw) as AccessState;
    endMeasure();
    return {
      approved: !!d.approved,
      active: d.active != null ? !!d.active : (status !== 'pending'),
      status,
      plan: ((d.plan === 'expired' ? 'free' : d.plan) || status) as AccessState,
      lifetime: !!d.lifetime,
      accessUntil: d.accessUntil ?? null,
      trialEnds: d.trialEnds ?? null,
      daysLeft: d.daysLeft ?? null,
      quotas: d.quotas ?? null,
      isNew: !!d.new,
    };
  } catch {
    endMeasure('error');
    return {
      approved: false, active: false, status: 'unavailable', plan: 'unavailable',
      lifetime: false, accessUntil: null, trialEnds: null, daysLeft: null, quotas: null,
    };
  }
};

export async function requestPasswordReset(email: string) {
  if (!isAuthConfigured()) throw new Error('Sign-in is temporarily unavailable.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
  if (error) throw new Error('The reset request could not be completed. Please retry shortly.');
}
export async function requestPasswordSetup(email: string) {
  if (!isAuthConfigured()) throw new Error('Sign-in is temporarily unavailable.');
  // Google Drive's OAuth session is separate from Supabase. Email verification
  // establishes the matching password account without trusting a browser email.
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: {
    shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/reset-password`,
  } });
  if (error) throw new Error('The setup email could not be sent. Please retry shortly.');
}
export function validatePassword(password: string) {
  if (password.length < 10) throw new Error('Use at least 10 characters.');
  if (new TextEncoder().encode(password).length > 72) throw new Error('Use a password no longer than 72 bytes.');
}
export async function changeAccountPassword(email: string, currentPassword: string, newPassword: string) {
  validatePassword(newPassword);
  // Reauthenticate in an isolated client; a wrong password cannot replace the
  // main session or accidentally update a different signed-in account.
  const verification = createClient(SUPABASE_URL || 'https://unconfigured.invalid', SUPABASE_ANON_KEY || 'unconfigured', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'psx-password-verification' },
  });
  try {
    const { data, error } = await verification.auth.signInWithPassword({ email: email.trim(), password: currentPassword });
    if (error || !data.user || data.user.email?.toLowerCase() !== email.trim().toLowerCase()) throw new Error('The current password could not be verified. Try again or use Forgot password.');
    const { error: updateError } = await verification.auth.updateUser({ password: newPassword });
    if (updateError) throw new Error('Password could not be changed. Use the email reset link and try again.');
  } finally { await verification.auth.signOut({ scope: 'local' }).catch(() => {}); }
}
export async function completePasswordReset(password: string) {
  validatePassword(password);
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('This link expired. Request a new password reset.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error('Password could not be updated. Request a fresh link and try again.');
  // A fresh email recovery/setup session proves ownership before linking remembered Drive access.
  let driveLinkFailed = false;
  try { await passwordDriveRequest('drive-bind'); } catch { driveLinkFailed = true; }
  await supabase.auth.signOut();
  return { driveLinkFailed };
}

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  try {
    const driveEmail = JSON.parse(localStorage.getItem('psx_drive_user_profile') || '{}').email;
    if (driveEmail && driveEmail.toLowerCase() !== email.trim().toLowerCase()) clearDriveSession();
  } catch { /* No existing Drive identity. */ }
  return data;
};

export const signOutAuth = async () => {
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
};

let sessionRequest: Promise<Session | null> | null = null;
export const getSession = (): Promise<Session | null> => {
  if (!sessionRequest) sessionRequest = supabase.auth.getSession().then(({ data }) => data.session).finally(() => { sessionRequest = null; });
  return sessionRequest;
};

async function passwordDriveRequest(action: string, expectedEmail?: string) {
  const session = await getSession();
  if (!session?.access_token || !session.user?.email || (expectedEmail && session.user.email.toLowerCase() !== expectedEmail.toLowerCase())) return null;
  const config = await getRememberedDriveConfig();
  if (!config.enabled) throw new Error(config.error || 'Remembered Drive access is not enabled yet. Please contact support before reconnecting.');
  const response = await fetch('/api/cloud-sync', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'X-Requested-With': 'PSXTracker' },
    body: JSON.stringify({ action }),
  });
  const data = await readApiJson(response, 'Could not open the saved Drive connection. Please retry.');
  if (!response.ok) throw new Error(data.error || 'Your saved Drive connection is temporarily unavailable.');
  return data;
}
const driveRestores = new Map<string, Promise<boolean>>();
export function restorePasswordDriveSession(email: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  let request = driveRestores.get(key);
  if (!request) { request = restoreDrive(key).finally(() => driveRestores.delete(key)); driveRestores.set(key, request); }
  return request;
}
async function restoreDrive(email: string): Promise<boolean> {
  const data = await passwordDriveRequest('drive-token', email);
  if (!data?.connected) return false;
  const session = await getSession();
  if (session?.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error('Account changed. Drive restore cancelled.');
  await installLinkedDriveSession(data, email);
  return true;
}
setDrivePasswordProviders(async () => {
  const session = await getSession();
  return session?.user?.email && session.access_token ? { email: session.user.email, token: session.access_token } : null;
}, async email => {
  const data = await passwordDriveRequest('drive-token', email);
  return data?.connected ? data as LinkedDriveSession : null;
});

export async function disconnectRememberedDrive() {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/cloud-sync', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { ...headers, 'X-Requested-With': 'PSXTracker' }, body: JSON.stringify({ action: 'drive-disconnect' }),
  });
  if (!response.ok) throw new Error('Could not disconnect the saved Drive connection. Please retry.');
  clearDriveSession();
}

/** Checks the existing backup pointer using the password identity, without reading portfolio contents. */
export async function getPasswordAccountBackupStatus(email: string): Promise<'saved' | 'unknown'> {
  const session = await getSession();
  if (!session?.access_token || session.user.email?.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('Sign in to this account again to check its backup.');
  }
  const res = await fetch('/api/cloud-sync', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'head' }),
  });
  if (!res.ok) throw new Error('The backup check is temporarily unavailable. You can still connect Google Drive to load it.');
  const head = await readApiJson(res, 'Could not check the saved Drive backup. Please retry.');
  if (!Number.isSafeInteger(head.revision) || head.revision < 0 || (head.fileId !== null && typeof head.fileId !== 'string')) {
    throw new Error('The backup check could not be completed. Connect Google Drive to load your portfolio.');
  }
  // No versioned pointer may simply mean a legacy Drive backup, so never report "no portfolio".
  return head.fileId ? 'saved' : 'unknown';
}

export const getAuthUser = async (): Promise<AppAuthUser | null> => {
  // Identity is a startup hint only. getAccessStatus verifies its token server-side
  // before the app grants access; avoid a second identity network request here.
  const u = (await getSession())?.user;
  if (!u) return null;
  return { id: u.id, email: u.email || '', name: (u.user_metadata as any)?.full_name };
};

/** Subscribe to auth changes (login/logout/token refresh). Returns an unsubscribe fn. */
export const onAuthChange = (cb: (session: Session | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
};

/** Headers for APIs that require a signed-in user. */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Drive is the active identity when connected; do not send an older email
  // session's token for another account's alerts or settings.
  try {
    const token = await getValidToken();
    if (token) { headers.Authorization = `Bearer ${token}`; return headers; }
  } catch { /* fall back to email sign-in */ }
  try {
    const session = await getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
      return headers;
    }
  } catch { /* ignore */ }
  return headers;
};
