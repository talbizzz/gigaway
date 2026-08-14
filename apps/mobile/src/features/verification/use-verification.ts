import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'

import { useSessionStore } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export const verificationKeys = {
  mine: ['verification', 'mine'] as const,
}

export type VerificationApplication = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'docs_expired'
  note: string | null
  doc_paths: string[]
  submitted_at: string
  decision_reason: string | null
}

export const MAX_DOCUMENTS = 3
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

export function useMyApplication() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: verificationKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<VerificationApplication | null> => {
      const { data, error } = await supabase
        .from('verification_applications')
        .select('id, status, note, doc_paths, submitted_at, decision_reason')
        .maybeSingle()
      if (error) throw error
      return data as VerificationApplication | null
    },
  })
}

export type PickedDocument = { uri: string; name: string; mimeType: string; size: number }

/**
 * Picks up to `MAX_DOCUMENTS` files. ID documents are refused by the copy on
 * the screen rather than by inspection — we cannot detect a passport, but we
 * can decline to ask for one, which is what keeps the sensitivity of this
 * bucket low.
 */
export async function pickDocuments(existingCount: number): Promise<PickedDocument[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    multiple: true,
    copyToCacheDirectory: true,
  })

  if (result.canceled) return []

  return result.assets
    .slice(0, Math.max(0, MAX_DOCUMENTS - existingCount))
    .filter((asset) => (asset.size ?? 0) <= MAX_DOCUMENT_BYTES)
    .map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
    }))
}

/**
 * Uploads evidence and opens (or reopens) the application.
 *
 * Files land under `{userId}/` in the private verification-docs bucket, which
 * has no select policy at all — not even for the uploader. Only the moderator,
 * acting through the dashboard as a privileged role, can read them.
 */
export function useSubmitApplication() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async ({
      documents,
      note,
      links,
    }: {
      documents: PickedDocument[]
      note: string
      links: string[]
    }) => {
      const userId = session!.user.id
      const paths: string[] = []

      for (const document of documents) {
        const path = `${userId}/${Date.now()}-${document.name}`
        const body = await fetch(document.uri).then((response) => response.blob())

        const { error: uploadError } = await supabase.storage
          .from('verification-docs')
          .upload(path, body, { contentType: document.mimeType, upsert: false })

        if (uploadError) throw uploadError
        paths.push(path)
      }

      const existing = await supabase
        .from('verification_applications')
        .select('id, status')
        .maybeSingle()

      if (existing.data) {
        // Re-upload after the 90-day purge returns the application to the queue
        // without losing its place or its history.
        const { error } = await supabase
          .from('verification_applications')
          .update({
            doc_paths: paths,
            note: note.trim() || null,
            links,
            status: existing.data.status === 'docs_expired' ? 'pending' : undefined,
          })
          .eq('id', existing.data.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('verification_applications').insert({
          profile_id: userId,
          doc_paths: paths,
          note: note.trim() || null,
          links,
        })
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: verificationKeys.mine })
    },
  })
}
