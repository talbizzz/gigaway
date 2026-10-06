import { isValidWhatsAppNumber } from '@gigaway/shared'
import { useRouter } from 'expo-router'
import { useState } from 'react'

import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { PROFILE_STEPS, useOnboardingDraft } from '@/features/onboarding/draft-store'

/**
 * WhatsApp is required because it is the whole point of the reveal: an accepted
 * offer hands the two of them each other's number, and a member with no number
 * to hand over can be accepted and still be unreachable.
 */
export default function ProfileWhatsAppStep() {
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.profile)
  const setProfile = useOnboardingDraft((state) => state.setProfile)
  const [whatsapp, setWhatsapp] = useState(draft.whatsapp)

  const valid = isValidWhatsAppNumber(whatsapp)

  return (
    <WizardStep
      step={2}
      total={PROFILE_STEPS}
      title="Your WhatsApp number"
      hint="Include the country code. An accepted offer is the only time anyone else sees it, together with your email."
      canContinue={valid}
      onContinue={() => {
        setProfile({ whatsapp })
        router.push('/(onboarding)/profile/neighbourhood')
      }}
    >
      <TextField
        label="WhatsApp number"
        value={whatsapp}
        onChangeText={setWhatsapp}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="+49 170 1234567"
        error={whatsapp.length > 0 && !valid ? 'Add the country code, like +49 170 1234567.' : undefined}
      />
    </WizardStep>
  )
}
