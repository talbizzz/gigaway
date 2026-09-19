import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { pickSelfiePrompt } from '@/features/verification/selfie-prompts'
import {
  captureSelfie,
  pickCv,
  useMyApplication,
  useSubmitVerification,
  type PickedCv,
} from '@/features/verification/use-verification'
import { ApiCallError } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/** Prefixes a bare domain with https:// — a member typing "instagram.com/…"
 *  should not have to know a URL needs a protocol to validate as one. Leaves
 *  an already-protocoled value alone, http:// included, rather than assuming
 *  everyone means https. */
function withProtocol(value: string): string {
  if (!value || /^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

/**
 * The verification wall — the only way in now that invites are gone.
 *
 * Everyone lands here as `pending` and stays there until a human decides,
 * from a selfie holding ID (against a pose that changes every attempt, so an
 * old photo can't be reused), an optional CV, and links to the applicant's
 * work. None of it is stored here or anywhere in Supabase: submitting emails
 * the whole application to verify@gigaway.app and this screen only ever
 * learns the outcome back through `status`.
 */
export default function VerifyScreen() {
  const theme = useTheme()
  const { data: application } = useMyApplication()
  const submit = useSubmitVerification()

  // Chosen once when the screen mounts, not on every render — it has to stay
  // the same instruction from the moment it's shown through to the photo
  // actually taken against it.
  const [prompt] = useState(pickSelfiePrompt)

  const [fullLegalName, setFullLegalName] = useState('')
  const [selfieUri, setSelfieUri] = useState<string | null>(null)
  const [cv, setCv] = useState<PickedCv | null>(null)
  const [linkDraft, setLinkDraft] = useState('')
  const [links, setLinks] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [captureError, setCaptureError] = useState<string | null>(null)

  if (application?.status === 'pending') {
    return (
      <Screen footer={<TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />}>
        <Text style={[typography.display, { color: theme.text }]}>With us for review</Text>
        <Callout tone="warning" title="Usually a day or two">
          A human reads every application — it's the reason a colleague will trust you with
          their keys. We'll email you as soon as it's decided.
        </Callout>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Your selfie, ID and any documents were emailed once and never stored here — this app
          doesn't hold a copy.
        </Text>
      </Screen>
    )
  }

  const canSubmit =
    fullLegalName.trim().length >= 2 && Boolean(selfieUri) && (Boolean(cv) || links.length > 0)

  const addLink = () => {
    const value = withProtocol(linkDraft.trim())
    if (!value) return
    setLinks((current) => [...current, value])
    setLinkDraft('')
  }

  const onSubmit = () => {
    if (!selfieUri) return
    submit.mutate({
      fullLegalName: fullLegalName.trim(),
      selfiePrompt: prompt,
      selfieUri,
      cv,
      links,
      note,
    })
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label="Submit application"
            onPress={onSubmit}
            loading={submit.isPending}
            disabled={!canSubmit}
          />
          <TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Verify who you are</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          GigAway has no invite system — every member is checked by hand instead. That's why a
          stranger will trust you with their keys.
        </Text>
      </View>

      {application?.status === 'rejected' ? (
        <Callout tone="warning" title="Your last application wasn't approved">
          {application.decision_reason ??
            "We weren't able to confirm your professional background from what was submitted."}
          {' '}You can apply again below.
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

      <View style={styles.section}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          SELFIE WITH ID
        </Text>
        <Callout>{prompt}</Callout>

        {selfieUri ? (
          <View style={styles.selfiePreview}>
            <Image source={{ uri: selfieUri }} style={styles.selfieImage} contentFit="cover" />
            <TextLink
              label="Retake"
              onPress={async () => {
                setCaptureError(null)
                try {
                  const uri = await captureSelfie()
                  if (uri) setSelfieUri(uri)
                } catch (caught) {
                  setCaptureError(caught instanceof Error ? caught.message : 'Could not open the camera.')
                }
              }}
            />
          </View>
        ) : (
          <Button
            label="Take selfie"
            variant="secondary"
            onPress={async () => {
              setCaptureError(null)
              try {
                const uri = await captureSelfie()
                if (uri) setSelfieUri(uri)
              } catch (caught) {
                setCaptureError(caught instanceof Error ? caught.message : 'Could not open the camera.')
              }
            }}
          />
        )}
        {captureError ? <Callout tone="danger">{captureError}</Callout> : null}
      </View>

      <View style={styles.section}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          PROOF YOU'RE A PERFORMING ARTIST
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          A CV, or links to your portfolio, projects, social profiles or videos — at least one.
        </Text>

        {cv ? (
          <View
            style={[styles.chip, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
          >
            <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
              {cv.name}
            </Text>
            <TextLink label="Remove" onPress={() => setCv(null)} />
          </View>
        ) : (
          <Button
            label="Attach CV (optional)"
            variant="secondary"
            onPress={async () => {
              try {
                const picked = await pickCv()
                if (picked) setCv(picked)
              } catch (caught) {
                setCaptureError(caught instanceof Error ? caught.message : 'Could not attach that file.')
              }
            }}
          />
        )}

        {links.map((link) => (
          <View
            key={link}
            style={[styles.chip, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
          >
            <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
              {link}
            </Text>
            <TextLink
              label="Remove"
              onPress={() => setLinks((current) => current.filter((l) => l !== link))}
            />
          </View>
        ))}

        <View style={styles.linkRow}>
          <TextField
            label="Add a link"
            value={linkDraft}
            onChangeText={(next) => {
              // Only the empty→non-empty transition gets a protocol
              // injected, so pasting a full URL (which arrives already
              // protocoled) or deliberately typing http:// is never
              // double-prefixed, and backspacing mid-edit doesn't fight the
              // member trying to clear the field.
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
      </View>

      <TextField
        label="Anything else (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Where you studied, who you've worked with…"
        multiline
        numberOfLines={3}
        maxLength={1000}
        style={styles.note}
      />

      {submit.isError ? (
        <Callout tone="danger">
          {submit.error instanceof ApiCallError
            ? submit.error.message
            : 'Something went wrong. Please try again.'}
        </Callout>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  section: { gap: spacing.sm, marginTop: spacing.md },
  selfiePreview: { gap: spacing.sm, alignItems: 'flex-start' },
  selfieImage: { width: 120, height: 120, borderRadius: radius.md },
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
  note: { minHeight: 90, textAlignVertical: 'top' },
})
