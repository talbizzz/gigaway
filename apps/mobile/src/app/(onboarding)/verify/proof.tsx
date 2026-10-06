import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { TextField } from '@/components/text-field'
import { WizardStep } from '@/components/wizard-step'
import { useOnboardingDraft, VERIFICATION_STEPS } from '@/features/onboarding/draft-store'
import { pickCv, type PickedCv } from '@/features/verification/use-verification'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/** Prefixes a bare domain with https://. Leaves an already-protocoled value alone. */
function withProtocol(value: string): string {
  if (!value || /^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

/**
 * Proof of being a performing artist: a CV, or links to work, or both. At least
 * one is required. This is a single question with several parts, so it is one
 * screen rather than one per field.
 */
export default function VerifyProofStep() {
  const theme = useTheme()
  const router = useRouter()
  const draft = useOnboardingDraft((state) => state.verification)
  const setVerification = useOnboardingDraft((state) => state.setVerification)

  const [cv, setCv] = useState<PickedCv | null>(draft.cv)
  const [links, setLinks] = useState<string[]>(draft.links)
  const [linkDraft, setLinkDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // A link typed but not yet added counts, so the button and the saved value agree.
  const pendingLinks = linkDraft.trim() ? [...links, withProtocol(linkDraft.trim())] : links
  const canContinue = Boolean(cv) || pendingLinks.length > 0

  const addLink = () => {
    const value = withProtocol(linkDraft.trim())
    if (!value) return
    setLinks((current) => [...current, value])
    setLinkDraft('')
  }

  const attachCv = async () => {
    setError(null)
    try {
      const picked = await pickCv()
      if (picked) setCv(picked)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not attach that file.')
    }
  }

  return (
    <WizardStep
      step={3}
      total={VERIFICATION_STEPS}
      title="Proof you're a performing artist"
      hint="A CV, or links to your portfolio, projects, social profiles or videos. At least one."
      canContinue={canContinue}
      onContinue={() => {
        // A link typed but not yet added is kept, rather than silently dropped.
        setVerification({ cv, links: pendingLinks })
        router.push('/(onboarding)/verify/note')
      }}
      error={error}
    >
      {cv ? (
        <View style={[styles.chip, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
          <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
            {cv.name}
          </Text>
          <TextLink label="Remove" onPress={() => setCv(null)} />
        </View>
      ) : (
        <Button label="Attach CV (PDF, optional)" variant="secondary" onPress={attachCv} />
      )}

      {links.map((link) => (
        <View key={link} style={[styles.chip, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
          <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
            {link}
          </Text>
          <TextLink label="Remove" onPress={() => setLinks((current) => current.filter((l) => l !== link))} />
        </View>
      ))}

      <View style={styles.linkRow}>
        <TextField
          label="Add a link"
          value={linkDraft}
          onChangeText={(next) => {
            // Only the empty→non-empty transition gets a protocol injected, so
            // pasting a full URL is never double-prefixed and backspacing
            // doesn't fight the member trying to clear the field.
            setLinkDraft(linkDraft === '' && next !== '' ? withProtocol(next) : next)
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          style={styles.linkInput}
        />
        <Button label="Add" variant="secondary" onPress={addLink} />
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  linkInput: { flex: 1 },
})
