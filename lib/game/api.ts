"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser auth + authed fetch. Players get a guest account on first visit
 * (server-created, kept in localStorage) so progress persists on this device.
 */
let sb: SupabaseClient | null = null;
export function supabase() {
  sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "sfs-auth" },
  });
  return sb;
}

const GUEST_KEY = "sfs-guest";
let sessionPromise: Promise<string> | null = null;

async function signInGuest(): Promise<string> {
  const client = supabase();
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.access_token;

  let creds: { email: string; password: string } | null = null;
  try {
    creds = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
  } catch {}
  if (creds) {
    const r = await client.auth.signInWithPassword(creds);
    if (r.data.session) return r.data.session.access_token;
  }
  const res = await fetch("/api/guest", { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "couldn't create a guest account");
  creds = await res.json();
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(creds));
  } catch {}
  const r = await client.auth.signInWithPassword(creds!);
  if (!r.data.session) throw new Error(r.error?.message ?? "sign-in failed");
  return r.data.session.access_token;
}

/** Access token for the current player (creates a guest on first call). */
export async function accessToken(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return data.session.access_token;
  sessionPromise ??= signInGuest().finally(() => (sessionPromise = null));
  return sessionPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}
