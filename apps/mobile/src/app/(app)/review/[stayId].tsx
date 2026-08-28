import { formatDateRange, nightCount } from '@gigaway/shared'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useMemberProfile } from '@/features/profile/use-profile'
import { useReviewableStays, useSubmitReview } from '@/features/reviews/use-reviews'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Writing a review.
 *
 * The would-again binary is required and the words are optional, which is the
 * right way round: free text skews positive in a small professional community
 * where everybody expects to meet again, and "would you do this again" is much
 * harder to soften out of politeness.
 *
 * The screen states the double-blind plainly before anything is typed. Someone
 * who believes their host will read this tomorrow writes a different review
 * from someone who knows neither is visible until both are in.
 */
export default function WriteReviewScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { stayId } = useLocalSearchParams<{ stayId: string }>()

  const stays = useReviewableStays()
  const submit = useSubmitReview()

  const stay = (stays.data ?? []).find((row) => row.id === stayId)
  const counterpart = useMemberProfile(stay?.counterpartId)

  const [wouldAgain, setWouldAgain] = useState<boolean | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (stays.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  // Already written, window closed, or never theirs to review.
  if (!stay) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Review' }} />
        <Callout title="Nothing to write here">
          Either you have already reviewed this stay, or the two-week window has closed.
        </Callout>
      </Screen>
    )
  }

  const nights = nightCount({ start: stay.start_date, end: stay.end_date })
  const name = counterpart.data?.display_name ?? 'your colleague'
  const firstName = name.split(' ')[0]

  return (
    <Screen
      footer={
        <Button
          label="Submit review"
          onPress={() => {
            if (wouldAgain === null) {
              setError('Answer the question above first.')
              return
            }
            setError(null)
            submit.mutate(
              { stayId: stay.id, subjectId: stay.counterpartId, wouldAgain, body },
              {
                onSuccess: () => router.back(),
                onError: (cause) =>
                  setError(cause instanceof Error ? cause.message : 'That could not be saved.'),
              },
            )
          }}
          disabled={wouldAgain === null}
          loading={submit.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Review' }} />

      <PersonRow person={counterpart.data ?? undefined} size={56} />

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {stay.cities?.name} · {formatDateRange(stay.start_date, stay.end_date)} · {nights}{' '}
        night{nights === 1 ? '' : 's'}
      </Text>

      <Callout tone="neutral" title="Neither of you sees the other's review yet">
        Both reviews appear at once, when you have both written one — or after two weeks,
        whichever comes first. {firstName} cannot read this in the meantime, and cannot tell
        that you have written it.
      </Callout>

      {/* The binary that carries the signal. Required, and asked first. */}
      <View style={styles.section}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          WOULD YOU DO IT AGAIN?
        </Text>
        <View style={styles.choices}>
          <Choice
            label="Yes"
            selected={wouldAgain === true}
            onPress={() => setWouldAgain(true)}
          />
          <Choice
            label="No"
            selected={wouldAgain === false}
            onPress={() => setWouldAgain(false)}
          />
        </View>
      </View>

      <TextField
        label="Anything to add (optional)"
        value={body}
        onChangeText={setBody}
        placeholder={`What should another colleague know before staying with ${firstName}?`}
        multiline
        numberOfLines={5}
        maxLength={1000}
        style={styles.body}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        Reviews are attributed — {firstName} will see your name on this. They cannot be
        edited once published.
      </Text>
    </Screen>
  )
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.accentSubtle : theme.bgSubtle,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: theme.text }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  choices: { flexDirection: 'row', gap: spacing.md },
  choice: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  body: { minHeight: 130, textAlignVertical: 'top', paddingTop: spacing.md },
})
