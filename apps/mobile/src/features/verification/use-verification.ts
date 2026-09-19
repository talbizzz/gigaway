import type { SubmitVerificationResponse } from '@gigaway/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { callFunction } from '@/lib/functions'
import { reportError } from '@/lib/monitoring'
import { supabase } from '@/lib/supabase'

export const verificationKeys = {
  mine: ['verification', 'mine'] as const,
}

export type VerificationApplication = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'docs_expired'
  full_legal_name: string
  note: string | null
  links: string[]
  submitted_at: string
  decision_reason: string | null
}

export function useMyApplication() {
  const session = useSessionStore((state) => state.session)

  return useQuery({
    queryKey: verificationKeys.mine,
    enabled: Boolean(session),
    queryFn: async (): Promise<VerificationApplication | null> => {
      const { data, error } = await supabase
        .from('verification_applications')
        .select('id, status, full_legal_name, note, links, submitted_at, decision_reason')
        .maybeSingle()
      if (error) throw error
      return data as VerificationApplication | null
    },
  })
}

export const MAX_CV_BYTES = 5 * 1024 * 1024

export type PickedCv = { uri: string; name: string }

/** Picks a single PDF. Refused above MAX_CV_BYTES rather than truncated. */
export async function pickCv(): Promise<PickedCv | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  })

  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  if ((asset.size ?? 0) > MAX_CV_BYTES) {
    throw new Error('That CV is too large — 5 MB maximum.')
  }

  return { uri: asset.uri, name: asset.name }
}

/**
 * Opens the front camera for the ID selfie. No editing step — the framing
 * (ID and both hands visible) has to survive exactly as taken, and a crop
 * tool invites cropping out the part a moderator needs to see.
 */
export async function captureSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) {
    throw new Error('GigAway needs camera access to take the verification selfie.')
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.front,
    quality: 0.6,
  })

  if (result.canceled || !result.assets[0]) return null
  return result.assets[0].uri
}

export type SubmitVerificationInput = {
  fullLegalName: string
  selfiePrompt: string
  selfieUri: string
  cv: PickedCv | null
  links: string[]
  note?: string
}

/**
 * Uploads the selfie (and CV, if any) straight to the verification-docs
 * Storage bucket, in the caller's own folder, then tells submit-verification
 * where to find them. The Edge Function itself never sees file bytes —
 * only the paths this upload produces.
 *
 * Reads each file through expo-file-system rather than
 * `fetch(uri).then(r => r.blob())`, same reason avatar upload does: React
 * Native's networking bridge cannot always resolve a real MIME type for a
 * content:// URI, and the upload declares its content type explicitly
 * instead of depending on that guess.
 */
export function useSubmitVerification() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: SubmitVerificationInput): Promise<SubmitVerificationResponse> => {
      const userId = session!.user.id
      const stamp = Date.now()

      const selfiePath = `${userId}/selfie-${stamp}.jpg`
      const selfieBody = await new File(input.selfieUri).arrayBuffer()
      const { error: selfieError } = await supabase.storage
        .from('verification-docs')
        .upload(selfiePath, selfieBody, { contentType: 'image/jpeg' })
      if (selfieError) throw selfieError

      let cvPath: string | undefined
      if (input.cv) {
        cvPath = `${userId}/cv-${stamp}.pdf`
        const cvBody = await new File(input.cv.uri).arrayBuffer()
        const { error: cvError } = await supabase.storage
          .from('verification-docs')
          .upload(cvPath, cvBody, { contentType: 'application/pdf' })
        if (cvError) throw cvError
      }

      return callFunction<SubmitVerificationResponse>('submit-verification', {
        fullLegalName: input.fullLegalName,
        selfiePrompt: input.selfiePrompt,
        selfiePath,
        cvPath,
        links: input.links,
        note: input.note,
      })
    },
    onSuccess: async () => {
      track('verification_submitted')
      await queryClient.invalidateQueries({ queryKey: verificationKeys.mine })
    },
    onError: (error, input) => {
      reportError(error, { feature: 'verification_submission', hasCv: String(Boolean(input.cv)) })
    },
  })
}
