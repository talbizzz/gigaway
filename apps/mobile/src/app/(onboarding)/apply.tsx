import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  MAX_DOCUMENTS,
  pickDocuments,
  useMyApplication,
  useSubmitApplication,
  type PickedDocument,
} from '@/features/verification/use-verification'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Document verification — the path in for someone with no invite.
 *
 * The copy deliberately asks for professional evidence and explicitly declines
 * ID documents. We cannot detect a passport in an upload, but we can avoid
 * requesting one, which is the cheapest available reduction in how damaging a
 * breach of this bucket would be.
 */
export default function ApplyScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { data: application } = useMyApplication()
  const submit = useSubmitApplication()

  const [documents, setDocuments] = useState<PickedDocument[]>([])
  const [note, setNote] = useState('')
  const [link, setLink] = useState('')

  if (application?.status === 'pending') {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
        <Stack.Screen options={{ title: 'Application' }} />
        <Text style={[typography.display, { color: theme.text }]}>With us for review</Text>
        <Callout tone="warning" title="Usually a day or two">
          A human reads every application — it's the reason members trust each other. We'll
          email you as soon as it's looked at.
        </Callout>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Your documents are deleted the moment your application is decided. We keep the
          outcome, never the evidence.
        </Text>
      </Screen>
    )
  }

  const expired = application?.status === 'docs_expired'

  return (
    <Screen
      footer={
        <>
          <Button
            label={expired ? 'Re-upload and resubmit' : 'Submit application'}
            onPress={() =>
              submit.mutate({
                documents,
                note,
                links: link.trim() ? [link.trim()] : [],
              })
            }
            loading={submit.isPending}
            disabled={documents.length === 0}
          />
          <TextLink label="I have an invite code" onPress={() => router.back()} />
        </>
      }
    >
      <Stack.Screen options={{ title: 'Apply' }} />

      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>
          {expired ? 'Documents needed again' : 'Show us your work'}
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          {expired
            ? "Your application is still in the queue, but we deleted the documents for privacy. Upload them once more and you'll keep your place."
            : 'Anything that shows you work in this field — a CV, conservatory enrolment, a diploma, a programme, or your agency page.'}
        </Text>
      </View>

      <Callout tone="warning" title="Please don't upload a passport or ID card">
        We're only checking that you're a working performer. Identity documents tell us
        nothing about that, and we'd rather not hold them.
      </Callout>

      <View style={styles.documents}>
        {documents.map((document) => (
          <View
            key={document.uri}
            style={[styles.document, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
          >
            <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
              {document.name}
            </Text>
            <TextLink
              label="Remove"
              onPress={() => setDocuments((current) => current.filter((d) => d.uri !== document.uri))}
            />
          </View>
        ))}

        <Button
          label={documents.length ? 'Add another' : 'Choose files'}
          variant="secondary"
          disabled={documents.length >= MAX_DOCUMENTS}
          onPress={async () => {
            const picked = await pickDocuments(documents.length)
            setDocuments((current) => [...current, ...picked])
          }}
        />
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Up to {MAX_DOCUMENTS} files, 5 MB each. PDF, JPG or PNG.
        </Text>
      </View>

      <TextField
        label="A link (optional)"
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://your-website.com"
      />

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
        <Callout tone="danger">{(submit.error as Error).message}</Callout>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  documents: { gap: spacing.sm },
  document: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: { minHeight: 90, textAlignVertical: 'top' },
})
