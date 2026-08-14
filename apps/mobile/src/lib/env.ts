/**
 * Environment access.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time, but ONLY when
 * referenced statically. Never build these names dynamically — the value will
 * be undefined in a release build while working fine in development.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/mobile/.env.example to .env and fill it in ` +
        '(run `pnpm db:start` to print the local Supabase values).',
    )
  }
  return value
}

export const env = {
  supabaseUrl: required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',

  /**
   * Analytics stays off until the published privacy policy names PostHog.
   * Deliberately an exact string comparison: anything other than "true" is off,
   * so a typo fails closed rather than silently tracking users.
   */
  analyticsEnabled: process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === 'true',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',

  webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://gigaway.app',
} as const
