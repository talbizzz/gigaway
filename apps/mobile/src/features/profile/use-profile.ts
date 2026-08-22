import type { Database } from '@gigaway/shared'
import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth/session-store'
import { supabase } from '@/lib/supabase'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileStatus = Database['public']['Enums']['profile_status']

export const profileKeys = {
  mine: (userId: string | undefined) => ['profile', 'me', userId] as const,
}

/**
 * The signed-in user's own profile. Drives routing: which onboarding step is
 * owed, or whether the app proper is reachable.
 */
export function useMyProfile() {
  const session = useSession()
  const userId = session?.user.id

  return useQuery({
    queryKey: profileKeys.mine(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

/**
 * A profile is "complete" once it carries the things other members need to
 * decide whether to host someone: a real name, a discipline, and a home city.
 * Bio, photo and links are encouraged but never blocking.
 */
export function isProfileComplete(profile: Profile | undefined): boolean {
  return Boolean(profile?.display_name && profile.discipline && profile.home_city_id)
}

export const DISCIPLINES = [
  { value: 'voice', label: 'Voice' },
  { value: 'strings', label: 'Strings' },
  { value: 'keyboard', label: 'Keyboard' },
  { value: 'winds', label: 'Winds' },
  { value: 'brass', label: 'Brass' },
  { value: 'percussion', label: 'Percussion' },
  { value: 'dance', label: 'Dance' },
  { value: 'conducting', label: 'Conducting' },
  { value: 'composition', label: 'Composition' },
  { value: 'other', label: 'Other' },
] as const

export type DisciplineValue = (typeof DISCIPLINES)[number]['value']

/**
 * Another member's profile.
 *
 * RLS decides what comes back: an approved member sees other approved members,
 * a pending applicant sees nobody, and a blocked pair (Milestone 4) sees
 * nothing of each other. A null result is a legitimate answer, not an error.
 */
export function useMemberProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: ['profile', profileId ?? ''],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
