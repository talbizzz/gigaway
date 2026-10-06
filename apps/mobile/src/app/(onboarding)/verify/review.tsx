import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TextLink } from '@/components/button'
import { WizardStep } from '@/components/wizard-step'
import { useOnboardingDraft, VERIFICATION_STEPS } from '@/features/onboarding/draft-store'
import { useSubmitVerification } from '@/features/verification/use-verification'
import { ApiCallError } from '@/lib/functions'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The last screen: everything the applicant entered, each with an Edit link back
 * to its question, and the only place the application is sent.
 */
export default function VerifyReviewStep() {
  const theme = useTheme()
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.verification)
  const resetVerification = useOnboardingDraft((state) => state.resetVerification)
  const submit = useSubmitVerification()

  const canSubmit =
    draft.fullLegalName.trim().length >= 2 &&
    Boolean(draft.selfieUri) &&
    (Boolean(draft.cv) || draft.links.length > 0)

  const onSubmit = () => {
    if (!draft.selfieUri || !canSubmit) return
    submit.mutate(
      {
        fullLegalName: draft.fullLegalName.trim(),
        selfiePrompt: draft.selfiePrompt,
        selfieUri: draft.selfieUri,
        cv: draft.cv,
        links: draft.links,
        note: draft.note,
      },
      {
        // Runs after the application has been refetched, so the index shows the
        // waiting screen rather than the first question again.
        onSuccess: () => {
          resetVerification()
          router.replace('/(onboarding)/verify')
        },
      },
    )
  }

  const error = submit.isError
    ? submit.error instanceof ApiCallError
      ? submit.error.message
      : 'Something went wrong. Please try again.'
    : null

  return (
    <WizardStep
      step={5}
      total={VERIFICATION_STEPS}
      title="Check and send"
      hint="A human reads this. Nothing is sent until you press the button below."
      canContinue={canSubmit}
      continueLabel="Submit application"
      onContinue={onSubmit}
      loading={submit.isPending}
      error={error}
    >
      <Row label="Full legal name" onEdit={() => router.push('/(onboarding)/verify/name')}>
        <Text style={[typography.body, { color: theme.text }]}>{draft.fullLegalName || '—'}</Text>
      </Row>

      <Row label="Selfie with ID" onEdit={() => router.push('/(onboarding)/verify/selfie')}>
        {draft.selfieUri ? (
          <Image source={{ uri: draft.selfieUri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <Text style={[typography.body, { color: theme.text }]}>—</Text>
        )}
      </Row>

      <Row label="Proof" onEdit={() => router.push('/(onboarding)/verify/proof')}>
        {draft.cv ? (
          <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
            CV: {draft.cv.name}
          </Text>
        ) : null}
        {draft.links.map((link) => (
          <Text key={link} style={[typography.body, { color: theme.text }]} numberOfLines={1}>
            {link}
          </Text>
        ))}
        {!draft.cv && draft.links.length === 0 ? (
          <Text style={[typography.body, { color: theme.text }]}>—</Text>
        ) : null}
      </Row>

      <Row label="Note" onEdit={() => router.push('/(onboarding)/verify/note')}>
        <Text style={[typography.body, { color: theme.text }]}>{draft.note || 'None'}</Text>
      </Row>
    </WizardStep>
  )
}

function Row({
  label,
  onEdit,
  children,
}: {
  label: string
  onEdit: () => void
  children: ReactNode
}) {
  const theme = useTheme()

  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={styles.rowHeader}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
        <TextLink label="Edit" onPress={onEdit} />
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thumb: { width: 96, height: 96, borderRadius: radius.md },
})
