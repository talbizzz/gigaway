import { useRouter } from 'expo-router'
import { useState } from 'react'

import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { PROFILE_STEPS, useOnboardingDraft } from '@/features/onboarding/draft-store'

export default function ProfileNeighbourhoodStep() {
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.profile)
  const setProfile = useOnboardingDraft((state) => state.setProfile)
  const [neighbourhood, setNeighbourhood] = useState(draft.neighbourhood)

  return (
    <WizardStep
      step={3}
      total={PROFILE_STEPS}
      title="Your neighbourhood"
      hint="Roughly where you live. Never your address. That stays between you and a guest you've accepted."
      canContinue
      onContinue={() => {
        setProfile({ neighbourhood })
        router.push('/(onboarding)/profile/instrument')
      }}
    >
      <TextField
        label="Neighbourhood (optional)"
        value={neighbourhood}
        onChangeText={setNeighbourhood}
        placeholder="Neuhausen"
      />
    </WizardStep>
  )
}
