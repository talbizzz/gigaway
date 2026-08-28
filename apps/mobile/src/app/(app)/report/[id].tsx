import { REPORT_CATEGORIES, REPORT_CATEGORY_LABELS, type ReportCategory } from '@gigaway/shared'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useMemberProfile } from '@/features/profile/use-profile'
import { useSubmitReport } from '@/features/reports/use-reports'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Reporting a concern to the moderator.
 *
 * The copy has two jobs, and the second one matters more than it looks. It has
 * to say that this is private and that the reported person is never told —
 * because someone deciding whether to report a person whose couch they are
 * currently sleeping on needs to know that before they type anything.
 */
export default function ReportScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const profile = useMemberProfile(id)
  const submit = useSubmitReport()

  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [body, setBody] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const name = profile.data?.display_name ?? 'this member'

  if (sent) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Reported' }} />
        <Callout tone="success" title="Thank you — this has gone to a moderator">
          A human reads every report. You will not hear back automatically, and {name} is
          not told that you reported them.
        </Callout>
        <Button label="Done" onPress={() => router.dismissAll()} />
      </Screen>
    )
  }

  return (
    <Screen
      footer={
        <Button
          label="Send to a moderator"
          onPress={() => {
            if (!category) {
              setError('Choose a reason first.')
              return
            }
            if (body.trim().length === 0) {
              setError('Tell us briefly what happened.')
              return
            }
            setError(null)
            submit.mutate(
              { subjectId: id, category, body, alsoBlock },
              {
                onSuccess: () => setSent(true),
                onError: (cause) =>
                  setError(
                    cause instanceof Error ? cause.message : 'That could not be sent.',
                  ),
              },
            )
          }}
          disabled={!category || body.trim().length === 0}
          loading={submit.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Report' }} />

      <PersonRow person={profile.data ?? undefined} />

      <Callout tone="neutral" title="This is private">
        Only a moderator sees this. {name} is never told that a report exists, and never
        sees what you wrote.
      </Callout>

      <View style={styles.section}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          WHAT HAPPENED?
        </Text>
        {REPORT_CATEGORIES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: category === value }}
            onPress={() => setCategory(value)}
            style={[
              styles.option,
              {
                backgroundColor: category === value ? theme.accentSubtle : theme.bgSubtle,
                borderColor: category === value ? theme.accent : theme.border,
              },
            ]}
          >
            <Text style={[typography.body, { color: theme.text }]}>
              {REPORT_CATEGORY_LABELS[value]}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextField
        label="In your own words"
        value={body}
        onChangeText={setBody}
        placeholder="What happened, and when. Dates and specifics help a moderator act."
        multiline
        numberOfLines={6}
        maxLength={2000}
        style={styles.body}
      />

      {/* Offered, never forced. Someone reporting a safety concern usually
          wants the person gone immediately; someone reporting a no-show often
          does not. */}
      <View style={[styles.blockRow, { borderColor: theme.border }]}>
        <View style={styles.blockText}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            Also block {name.split(' ')[0]}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            You will not see each other anywhere. They are not told.
          </Text>
        </View>
        <Switch
          value={alsoBlock}
          onValueChange={setAlsoBlock}
          trackColor={{ true: theme.accent, false: theme.borderStrong }}
        />
      </View>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        If you are in immediate danger, contact your local emergency services first.
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  option: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  body: { minHeight: 150, textAlignVertical: 'top', paddingTop: spacing.md },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  blockText: { flex: 1, gap: 2 },
})
