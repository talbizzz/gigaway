import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'

import { useSessionStore } from '@/features/auth/session-store'
import { profileKeys } from '@/features/profile/use-profile'
import { supabase } from '@/lib/supabase'

export type ProfileLink = { label: string; url: string }

export type ProfileUpdate = {
  display_name?: string
  discipline?: string
  specialisation?: string | null
  home_city_id?: string
  home_district?: string | null
  bio?: string | null
  links?: ProfileLink[]
  photo_path?: string | null
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (update: ProfileUpdate) => {
      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', session!.user.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKeys.mine(session?.user.id) })
    },
  })
}

/** Public URL for a stored avatar, or null when there is no photo yet. */
export function avatarUrl(photoPath: string | null | undefined): string | null {
  if (!photoPath) return null
  return supabase.storage.from('avatars').getPublicUrl(photoPath).data.publicUrl
}

/**
 * Picks an image and uploads it to the caller's own folder in the public
 * avatars bucket. Storage policy restricts writes to `{userId}/…`, so a
 * malformed path is rejected by the database rather than trusted from here.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        throw new Error('GigAway needs access to your photos to set a profile picture.')
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (picked.canceled || !picked.assets[0]) return null

      const asset = picked.assets[0]
      const userId = session!.user.id
      // A stable path per user, upserted, so old avatars are replaced rather
      // than accumulating in the bucket.
      const path = `${userId}/avatar.jpg`
      const body = await fetch(asset.uri).then((response) => response.blob())

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, body, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_path: path })
        .eq('id', userId)
      if (updateError) throw updateError

      return path
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKeys.mine(session?.user.id) })
    },
  })
}
