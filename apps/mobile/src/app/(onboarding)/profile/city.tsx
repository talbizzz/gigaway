import { useRouter } from 'expo-router'
import { useState } from 'react'

import { CityPicker, type City } from '@/components/city-picker'
import { WizardStep } from '@/components/wizard-step'
import { PROFILE_STEPS, useOnboardingDraft } from '@/features/onboarding/draft-store'

export default function ProfileCityStep() {
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.profile)
  const setProfile = useOnboardingDraft((state) => state.setProfile)
  const [city, setCity] = useState<City | null>(draft.city)

  return (
    <WizardStep
      step={1}
      total={PROFILE_STEPS}
      title="Where are you based?"
      hint="Your home city is what colleagues see when you offer a couch or ask for one."
      canContinue={Boolean(city)}
      onContinue={() => {
        setProfile({ city })
        router.push('/(onboarding)/profile/whatsapp')
      }}
    >
      <CityPicker label="Home city" value={city} onChange={setCity} />
    </WizardStep>
  )
}
