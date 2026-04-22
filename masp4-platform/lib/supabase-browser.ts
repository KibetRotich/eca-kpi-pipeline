/**
 * Browser-only Supabase client (anon key only — safe to use in client components).
 * Never import supabaseAdmin here.
 */

import { createClient } from '@supabase/supabase-js'

export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      detectSessionInUrl: false, // callback page handles PKCE exchange manually
    },
  }
)
