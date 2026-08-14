import * as SecureStore from 'expo-secure-store'

/**
 * A chunking SecureStore adapter for Supabase's auth session.
 *
 * SecureStore is backed by the iOS keychain and Android keystore, which warn
 * above ~2 KB per entry. A Supabase session (access token + refresh token +
 * user object) regularly exceeds that, so values are split across numbered
 * entries with a count marker.
 *
 * Layout for key `k`:
 *   k__count  ->  "3"
 *   k__0, k__1, k__2  ->  the value, in order
 *
 * SecureStore keys allow only alphanumerics, ".", "-" and "_".
 */

const CHUNK_SIZE = 1800

const countKey = (key: string) => `${key}__count`
const chunkKey = (key: string, index: number) => `${key}__${index}`

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key))
  if (raw === null) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = []
  for (let i = 0; i < count; i += 1) deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)))
  await Promise.all(deletions)
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key)
    if (count === 0) return null

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    )

    // A missing chunk means a partial write or partial wipe. Treat the whole
    // value as absent rather than handing Supabase a truncated session.
    if (parts.some((part) => part === null)) {
      await this.removeItem(key)
      return null
    }

    return parts.join('')
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await readCount(key)

    const chunks: string[] = []
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE))
    }

    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)),
    )
    await SecureStore.setItemAsync(countKey(key), String(chunks.length))

    // Drop any chunks left over from a longer previous value.
    if (previousCount > chunks.length) {
      const stale: Promise<void>[] = []
      for (let i = chunks.length; i < previousCount; i += 1) {
        stale.push(SecureStore.deleteItemAsync(chunkKey(key, i)))
      }
      await Promise.all(stale)
    }
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key)
    await clearChunks(key, count)
    await SecureStore.deleteItemAsync(countKey(key))
  },
}
