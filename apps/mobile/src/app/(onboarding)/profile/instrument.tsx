import { useRouter } from 'expo-router'
import { useState } from 'react'

import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { PROFILE_STEPS, useOnboardingDraft } from '@/features/onboarding/draft-store'
import { useMyProfile } from '@/features/profile/use-profile'

export default function ProfileInstrumentStep() {
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const draft = useOnboardingDraft((state) => state.profile)
  const setProfile = useOnboardingDraft((state) => state.setProfile)
  const [instrument, setInstrument] = useState(draft.instrument || profile?.specialisation || '')

  return (
    <WizardStep
      step={4}
      total={PROFILE_STEPS}
      title="Your instrument or voice"
      hint="Optional. Leave it empty if it doesn't fit."
      canContinue
      onContinue={() => {
        setProfile({ instrument })
        router.push('/(onboarding)/profile/about')
      }}
    >
      <TextField
        label="Instrument or voice type (optional)"
        value={instrument}
        onChangeText={setInstrument}
        placeholder="Mezzo-soprano"
      />
    </WizardStep>
  )
}
