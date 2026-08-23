// src/services/auth.ts
// Email/password auth via Supabase Auth, with an owner-approval gate.
// Google Drive stays the data store — this only controls WHO can get in.

import { createClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Publishable/anon key only — safe for the browser (RLS protects the data).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

export type AccessState = 'pending' | 'trial' | 'paid' | 'lifetime' | 'expired';

export interface AccessStatus {
  approved: boolean;       // owner has let them in (trial or beyond)
  active: boolean;         // currently has access to the app
  status: AccessState;
  lifetime: boolean;
  accessUntil?: string | null;
  trialEnds?: string | null;
  daysLeft?: number | null;
  isNew?: boolean;
}

/**
 * Full access picture for an email (trial / paid / lifetime / expired). If
 * `notify` is true and the email is new, it's added as pending and the owner
 * is emailed an approve link (unchanged behaviour).
 */
export const getAccessStatus = async (email: string, name?: string, notify = false, resend = false): Promise<AccessStatus> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Send the user's session so the server only emails the owner for the
    // caller's OWN account (kills anonymous owner-spam / user enumeration).
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const res = await fetch('/api/check-access', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, name: name || '', notify, resend }),
    });
    const d = await res.json().catch(() => ({}));
    return {
      approved: !!d.approved,
      active: !!d.active,
      status: (d.accessStatus as AccessState) || (d.approved ? 'trial' : 'pending'),
      lifetime: !!d.lifetime,
      accessUntil: d.accessUntil ?? null,
      trialEnds: d.trialEnds ?? null,
      daysLeft: d.daysLeft ?? null,
      isNew: !!d.new,
    };
  } catch {
    return { approved: false, active: false, status: 'pending', lifetime: false, accessUntil: null, trialEnds: null, daysLeft: null };
  }
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOutAuth = async () => {
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
};

export const getSession = async (): Promise<Session | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};

export const getAuthUser = async (): Promise<AppAuthUser | null> => {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return { id: u.id, email: u.email || '', name: (u.user_metadata as any)?.full_name };
};

/** Subscribe to auth changes (login/logout/token refresh). Returns an unsubscribe fn. */
export const onAuthChange = (cb: (session: Session | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
};