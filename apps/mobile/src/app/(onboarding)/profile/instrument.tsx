import { disciplineExample, disciplineLabel } from '@gigaway/shared'
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
      title="Your field of work"
      hint={`You chose the category "${disciplineLabel(profile?.discipline)}". Do you want to specify your profession?`}
      canContinue
      onContinue={() => {
        setProfile({ instrument })
        router.push('/(onboarding)/profile/about')
      }}
      onSkip={() => {
        setProfile({ instrument: '' })
        router.push('/(onboarding)/profile/about')
      }}
    >
      <TextField
        label="Your profession (optional)"
        value={instrument}
        onChangeText={setInstrument}
        placeholder={disciplineExample(profile?.discipline)}
      />
    </WizardStep>
  )
}
