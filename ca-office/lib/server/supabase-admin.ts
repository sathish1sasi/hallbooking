import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service-role client: bypasses RLS. Only ever used in server code. */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server.');
  return createClient(url, key, { auth: { persistSession: false } });
}
