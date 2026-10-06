import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * One screen of a multi-step form: a progress line, one question, and the way
 * forward. Each section of a form gets one of these, so a member only ever has
 * one thing to answer at a time.
 *
 * Back is an arrow in the top-left corner, and only appears when there is
 * somewhere to go back to, so a screen reached directly (by the auth gate, say)
 * does not offer a dead button.
 *
 * `onSkip` is for a step whose answer is optional. It shows a Skip button, so a
 * member can see they are allowed to leave it empty rather than having to work
 * that out from "(optional)" in a label. Skipping moves on WITHOUT keeping
 * anything typed; Continue is what keeps it.
 */
type WizardStepProps = {
  step: number
  total: number
  title: string
  hint?: string
  children: ReactNode
  canContinue: boolean
  onContinue: () => void
  /** Present only on optional steps. */
  onSkip?: () => void
  continueLabel?: string
  loading?: boolean
  error?: string | null
  /** Extra footer links, such as sign out on the first screen of a flow. */
  footerExtra?: ReactNode
}

export function WizardStep({
  step,
  total,
  title,
  hint,
  children,
  canContinue,
  onContinue,
  onSkip,
  continueLabel = 'Continue',
  loading = false,
  error,
  footerExtra,
}: WizardStepProps) {
  const theme = useTheme()
  const router = useRouter()

  return (
    <Screen
      onBack={router.canGoBack() ? () => router.back() : undefined}
      footer={
        <>
          <Button
            label={continueLabel}
            onPress={onContinue}
            disabled={!canContinue}
            loading={loading}
          />
          {onSkip ? (
            <Button label="Skip" variant="secondary" onPress={onSkip} disabled={loading} />
          ) : null}
          {footerExtra}
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          STEP {step} OF {total}
        </Text>
        <Text style={[typography.display, { color: theme.text }]}>{title}</Text>
        {hint ? <Text style={[typography.body, { color: theme.textMuted }]}>{hint}</Text> : null}
      </View>

      {children}

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
})
