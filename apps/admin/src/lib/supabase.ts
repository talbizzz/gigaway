import type { Database } from '@gigaway/shared'
import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})
