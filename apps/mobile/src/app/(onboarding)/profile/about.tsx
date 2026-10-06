import { normalisePhoneNumber, isValidWhatsAppNumber } from '@gigaway/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { useSessionStore } from '@/features/auth/session-store'
import { contactKeys, useUpdateContactDetails } from '@/features/contacts/use-contacts'
import { PROFILE_STEPS, useOnboardingDraft } from '@/features/onboarding/draft-store'
import { profileKeys, useMyProfile } from '@/features/profile/use-profile'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

/**
 * The last profile screen, and the one that saves. Everything before it has only
 * been held in memory, so the whole profile is written here in one go.
 *
 * The WhatsApp number is written first. It is the newly required half, and
 * writing it last would let a failure leave a profile the gate reads as complete.
 */
export default function ProfileAboutStep() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)
  const { data: profile } = useMyProfile()
  const draft = useOnboardingDraft((state) => state.profile)
  const resetProfile = useOnboardingDraft((state) => state.resetProfile)
  const updateContact = useUpdateContactDetails()

  const [about, setAbout] = useState(draft.about || profile?.bio || '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const city = draft.city
    if (!city || !isValidWhatsAppNumber(draft.whatsapp)) {
      setError('Your home city and WhatsApp number are missing. Go back and add them.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await updateContact.mutateAsync({ whatsapp: normalisePhoneNumber(draft.whatsapp) })
    } catch (caught) {
      setSaving(false)
      setError((caught as Error).message)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        home_city_id: city.id,
        home_district: draft.neighbourhood.trim() || null,
        specialisation: draft.instrument.trim() || null,
        bio: about.trim() || null,
      })
      .eq('id', session!.user.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    track('profile_completed')
    resetProfile()
    // The auth gate moves the member into the app once both halves are complete.
    await queryClient.invalidateQueries({ queryKey: profileKeys.mine(session?.user.id) })
    await queryClient.invalidateQueries({ queryKey: contactKeys.mine(session?.user.id) })
  }

  return (
    <WizardStep
      step={5}
      total={PROFILE_STEPS}
      title={`You're in${profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}`}
      hint="A line or two about you. Optional, but it's the first thing colleagues read."
      canContinue
      continueLabel="Finish"
      onContinue={save}
      loading={saving}
      error={error}
    >
      <TextField
        label="About you (optional)"
        value={about}
        onChangeText={setAbout}
        placeholder="Where you studied, what you're working on."
        multiline
        numberOfLines={4}
        maxLength={600}
        style={{ minHeight: 110, textAlignVertical: 'top' }}
      />
    </WizardStep>
  )
}
