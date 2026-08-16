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
  try {
    const res = await fetch('/api/check-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: name || '', notify, resend }),
    });
    const data = await res.json().catch(() => ({ approved: false }));
    return !!data.approved;
  } catch {
    return false;
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
