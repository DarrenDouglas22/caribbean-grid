import { createClient } from '@supabase/supabase-js';

// The anon key is public by design (KTD2). The client only ever reaches the
// safe surface: the RPCs and the autocomplete view. RLS denies everything else.
const url = import.meta.env?.VITE_SUPABASE_URL;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export function assertClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}
