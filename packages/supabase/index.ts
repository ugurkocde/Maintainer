import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

export type Client = SupabaseClient<Database>;
export type { Database } from './types.js';
export type { Tables, TablesInsert, TablesUpdate } from './types.js';

const FALLBACK_URL_KEYS = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;
const FALLBACK_PUBLISHABLE_KEYS = [
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;
const FALLBACK_SECRET_KEYS = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function readEnv(keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length > 0) return v;
  }
  return undefined;
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(
      `Missing ${label}. Set one of the standard env vars (see .env.example) before instantiating the Supabase client.`,
    );
  }
  return value;
}

/**
 * Server-side client. Uses the secret service-role key, bypasses RLS,
 * and is what the orchestrator and the GitHub Action should use.
 *
 * Never instantiate this in the browser.
 */
export function createServerClient(opts?: { url?: string; secretKey?: string }): Client {
  const url = requireValue(opts?.url ?? readEnv(FALLBACK_URL_KEYS), 'SUPABASE_URL');
  const secretKey = requireValue(
    opts?.secretKey ?? readEnv(FALLBACK_SECRET_KEYS),
    'SUPABASE_SECRET_KEY',
  );
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Browser-safe client. Uses the publishable (anon) key and respects RLS.
 * Used by the dashboard once authenticated users sign in with GitHub.
 */
export function createBrowserClient(opts?: { url?: string; publishableKey?: string }): Client {
  const url = requireValue(opts?.url ?? readEnv(FALLBACK_URL_KEYS), 'SUPABASE_URL');
  const publishableKey = requireValue(
    opts?.publishableKey ?? readEnv(FALLBACK_PUBLISHABLE_KEYS),
    'SUPABASE_PUBLISHABLE_KEY',
  );
  return createClient<Database>(url, publishableKey);
}
