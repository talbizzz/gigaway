import { DELETE_CONFIRMATION } from '@gigaway/shared'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useMutation } from '@tanstack/react-query'

import { track } from '@/lib/analytics'
import { callFunction } from '@/lib/functions'
import { unregisterPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'

/**
 * Exports everything the account holds about this member — GDPR Art. 20.
 *
 * Written to a real file and handed to the share sheet rather than shown on
 * screen: portability means the data has to be able to LEAVE, and a wall of
 * JSON somebody has to select by hand is not portable in any useful sense.
 */
export function useExportData() {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const result = await callFunction<{
        ok: true
        generatedAt: string
        data: Record<string, unknown>
      }>('export-data', {})

      const stamp = result.generatedAt.slice(0, 10)

      // The cache directory, not documents: this is a copy on its way out to
      // the share sheet, and the system may reclaim it freely afterwards.
      const file = new File(Paths.cache, `gigaway-export-${stamp}.json`)
      file.create({ overwrite: true })
      file.write(JSON.stringify(result, null, 2))

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Your GigAway data',
          UTI: 'public.json',
        })
      }

      track('data_exported')
      return file.uri
    },
  })
}

/**
 * Deletes the account. Irreversible.
 *
 * The push token is released first: once the auth user is gone the session is
 * dead, and a token left registered would keep this device on the receiving
 * end of nothing in particular.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (password: string) => {
      await unregisterPush()
      await callFunction<{ ok: true }>('delete-account', {
        confirm: DELETE_CONFIRMATION,
        password,
      })
      track('account_deleted')
      // Local sign-out only — the server-side user no longer exists, so this
      // just clears the stored session and drops the app back to sign-in.
      await supabase.auth.signOut()
    },
  })
}
