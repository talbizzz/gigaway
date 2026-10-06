import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { WizardStep } from '@/components/wizard-step'
import { useOnboardingDraft, VERIFICATION_STEPS } from '@/features/onboarding/draft-store'
import { captureSelfie } from '@/features/verification/use-verification'
import { radius, spacing } from '@/theme/tokens'

/**
 * The selfie is taken against the prompt chosen for this application, so the
 * instruction on screen is the one the photo answers. Nothing is uploaded here.
 * The file is only sent with the application, on the last screen.
 */
export default function VerifySelfieStep() {
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.verification)
  const setVerification = useOnboardingDraft((state) => state.setVerification)
  const [selfieUri, setSelfieUri] = useState<string | null>(draft.selfieUri)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const takeSelfie = async () => {
    setCaptureError(null)
    try {
      const uri = await captureSelfie()
      if (uri) setSelfieUri(uri)
    } catch (caught) {
      setCaptureError(caught instanceof Error ? caught.message : 'Could not open the camera.')
    }
  }

  return (
    <WizardStep
      step={2}
      total={VERIFICATION_STEPS}
      title="Selfie with your ID"
      canContinue={Boolean(selfieUri)}
      onContinue={() => {
        setVerification({ selfieUri })
        router.push('/(onboarding)/verify/proof')
      }}
      error={captureError}
    >
      <Callout>{draft.selfiePrompt}</Callout>

      {selfieUri ? (
        <View style={styles.preview}>
          <Image source={{ uri: selfieUri }} style={styles.image} contentFit="cover" />
          <TextLink label="Retake" onPress={takeSelfie} />
        </View>
      ) : (
        <Button label="Take selfie" variant="secondary" onPress={takeSelfie} />
      )}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  preview: { gap: spacing.sm, alignItems: 'flex-start' },
  image: { width: 160, height: 160, borderRadius: radius.md },
})
