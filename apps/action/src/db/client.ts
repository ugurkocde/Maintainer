import { createServerClient, type Client } from '@maintainer/supabase';
import { log } from '../util/log.js';

let cached: Client | null | undefined;

/**
 * Returns a service-role Supabase client when the Action has been configured
 * with supabase-url and supabase-secret-key. Returns null when not configured;
 * callers must treat null as "skip this DB write".
 *
 * Wrapped in a try/catch so a misconfiguration never aborts the run.
 */
export function db(): Client | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    cached = null;
    return null;
  }
  try {
    cached = createServerClient({ url, secretKey: secret });
    return cached;
  } catch (err) {
    log.warn(`Supabase client init failed: ${(err as Error).message}`);
    cached = null;
    return null;
  }
}
