import { useRouter } from 'expo-router'
import { useState } from 'react'

import { TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { useOnboardingDraft, VERIFICATION_STEPS } from '@/features/onboarding/draft-store'
import { useMyApplication } from '@/features/verification/use-verification'
import { supabase } from '@/lib/supabase'

/**
 * The first question of the application. The intro lives here because this is
 * the first thing an applicant reads: GigAway has no invites, so every member is
 * checked by hand, and that is the reason a stranger will trust them.
 */
export default function VerifyNameStep() {
  const router = useRouter()
  const { data: application } = useMyApplication()
  const draft = useOnboardingDraft((state) => state.verification)
  const setVerification = useOnboardingDraft((state) => state.setVerification)
  const [fullLegalName, setFullLegalName] = useState(draft.fullLegalName)

  const valid = fullLegalName.trim().length >= 2

  return (
    <WizardStep
      step={1}
      total={VERIFICATION_STEPS}
      title="Verify who you are"
      hint="GigAway has no invite system. Every member is checked by hand, which is why a stranger will trust you with their keys."
      canContinue={valid}
      onContinue={() => {
        setVerification({ fullLegalName: fullLegalName.trim() })
        router.push('/(onboarding)/verify/selfie')
      }}
      footerExtra={<TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />}
    >
      {application?.status === 'rejected' ? (
        <Callout tone="warning" title="Your last application wasn't approved">
          {application.decision_reason ??
            "We weren't able to confirm your professional background from what was submitted."}{' '}
          You can apply again below.
        </Callout>
      ) : null}

      <TextField
        label="Full legal name"
        value={fullLegalName}
        onChangeText={setFullLegalName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="As printed on your ID"
        hint="Exactly as it appears on the ID in your selfie."
      />
    </WizardStep>
  )
}
