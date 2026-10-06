import { useRouter } from 'expo-router'
import { useState } from 'react'

import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { useOnboardingDraft, VERIFICATION_STEPS } from '@/features/onboarding/draft-store'

export default function VerifyNoteStep() {
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.verification)
  const setVerification = useOnboardingDraft((state) => state.setVerification)
  const [note, setNote] = useState(draft.note)

  return (
    <WizardStep
      step={4}
      total={VERIFICATION_STEPS}
      title="Anything else?"
      hint="Optional. Where you studied, who you've worked with, anything that helps a reviewer place you."
      canContinue
      onContinue={() => {
        setVerification({ note: note.trim() })
        router.push('/(onboarding)/verify/review')
      }}
    >
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Where you studied, who you've worked with…"
        multiline
        numberOfLines={3}
        maxLength={1000}
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
    </WizardStep>
  )
}
