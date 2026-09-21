/**
 * Environment access. Mirrors apps/mobile/src/lib/env.ts's shape — Vite
 * inlines `import.meta.env.VITE_*` at build time the same way Expo inlines
 * `process.env.EXPO_PUBLIC_*`, and only when referenced statically.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/admin/.env.example to .env and fill it in.`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL'),
  supabaseAnonKey: required(import.meta.env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY'),

  /**
   * Drives the persistent banner in the app shell so an admin always knows
   * which Supabase project they're acting against. Unset in prod.
   */
  envLabel: import.meta.env.VITE_ENV_LABEL ?? '',
} as const
