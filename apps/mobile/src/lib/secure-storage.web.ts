/**
 * Web fallback for the Supabase session adapter.
 *
 * `expo-secure-store` is iOS and Android only — it is backed by the iOS keychain
 * and the Android keystore, neither of which has a browser equivalent. Every
 * call throws `UnavailabilityError` on web, which here means the app dies inside
 * session restore before the first screen ever renders.
 *
 * Metro resolves this file in place of `secure-storage.ts` when the platform is
 * web, so the native path is untouched and `expo-secure-store` is never pulled
 * into a browser bundle. No chunking is needed: the ~2 KB keychain warning that
 * shapes the native adapter has no analogue in `localStorage`.
 *
 * **`localStorage` is not secure storage** — any script on the origin can read
 * the session out of it. Expo web exists in this project as a development
 * convenience: the shipping clients are the two native builds, and the public
 * website is the separate Next.js app in `apps/web`. Revisit this adapter before
 * ever treating Expo web as a distribution target.
 *
 * `web.output` is `static`, so these methods also run under Node during route
 * prerendering, where there is no DOM. That is not an error — a prerender has no
 * session by definition — so storage is treated as empty rather than throwing.
 * Throwing here takes down the whole dev server, because `lib/supabase.ts`
 * constructs the client at module scope and Supabase reads the session
 * immediately.
 */

function store(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return store()?.getItem(key) ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    store()?.setItem(key, value)
  },

  async removeItem(key: string): Promise<void> {
    store()?.removeItem(key)
  },
}
