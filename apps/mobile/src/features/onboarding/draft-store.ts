import { create } from 'zustand'

import type { City } from '@/components/city-picker'
import { pickSelfiePrompt } from '@/features/verification/selfie-prompts'
import type { PickedCv } from '@/features/verification/use-verification'

/**
 * Answers collected across the onboarding screens, held in memory until the
 * last screen of each flow saves them.
 *
 * Deliberately not persisted. A selfie's file URI, a CV and a city object are
 * not worth storing, and nothing typed here should outlive the session that
 * typed it. Cleared on sign-out (see session-store.ts), so the next person on a
 * shared phone starts from nothing.
 */

/** Screens in each flow, counted for the "Step n of N" line. */
export const PROFILE_STEPS = 5
export const VERIFICATION_STEPS = 5

export type ProfileDraft = {
  city: City | null
  whatsapp: string
  neighbourhood: string
  instrument: string
  about: string
}

export type VerificationDraft = {
  fullLegalName: string
  selfieUri: string | null
  /** Chosen once per application, so the instruction shown is the one the photo answers. */
  selfiePrompt: string
  cv: PickedCv | null
  links: string[]
  note: string
}

type DraftState = {
  profile: ProfileDraft
  verification: VerificationDraft
  setProfile: (patch: Partial<ProfileDraft>) => void
  setVerification: (patch: Partial<VerificationDraft>) => void
  resetProfile: () => void
  resetVerification: () => void
}

const emptyProfile = (): ProfileDraft => ({
  city: null,
  whatsapp: '',
  neighbourhood: '',
  instrument: '',
  about: '',
})

const emptyVerification = (): VerificationDraft => ({
  fullLegalName: '',
  selfieUri: null,
  selfiePrompt: pickSelfiePrompt(),
  cv: null,
  links: [],
  note: '',
})

export const useOnboardingDraft = create<DraftState>((set) => ({
  profile: emptyProfile(),
  verification: emptyVerification(),
  setProfile: (patch) => set((state) => ({ profile: { ...state.profile, ...patch } })),
  setVerification: (patch) => set((state) => ({ verification: { ...state.verification, ...patch } })),
  resetProfile: () => set({ profile: emptyProfile() }),
  resetVerification: () => set({ verification: emptyVerification() }),
}))
