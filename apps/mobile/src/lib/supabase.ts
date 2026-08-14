import 'react-native-url-polyfill/auto'

import type { Database } from '@gigaway/shared'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

import { env } from '@/lib/env'
import { secureStorage } from '@/lib/secure-storage'

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser redirect flow in a native app; leaving this on makes
    // Supabase parse window.location, which does not exist here.
    detectSessionInUrl: false,
  },
})

/**
 * Supabase's auto-refresh timer does not run while the app is backgrounded.
 * Without this, returning to the app after a long pause leaves an expired
 * token until the next manual refresh.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh()
  else void supabase.auth.stopAutoRefresh()
})
