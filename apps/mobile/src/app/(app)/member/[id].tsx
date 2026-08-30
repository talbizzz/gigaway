import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { useBlockMember, useHasBlocked, useUnblockMember } from '@/features/blocks/use-blocks'
import { useMemberProfile } from '@/features/profile/use-profile'
import {
  useRequestsForTrip,
  useSendRequest,
} from '@/features/requests/use-requests'
import type { ProfileLink } from '@/features/profile/use-update-profile'
import {
  useReviewSummary,
  useReviewsFor,
  wouldAgainLabel,
  type Review,
} from '@/features/reviews/use-reviews'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Another member's profile: who they are, what colleagues say about them, and
 * the two safety actions.
 *
 * A blocked member's profile returns nothing from RLS, so this screen shows a
 * "not available" state rather than a name — the same state a suspended or
 * deleted account produces. It deliberately does not distinguish between them:
 * telling someone WHY a profile vanished is itself information.
 *
 * Opened from a match card it also carries the trip that sent you here, so the
 * decision you came to make can be made without going back for it. Opened from
 * anywhere else it is just a profile.
 */
export default function MemberProfileScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { id, tripId, action } = useLocalSearchParams<{
    id: string
    tripId?: string
    action?: MatchAction
  }>()

  const profile = useMemberProfile(id)
  const reviews = useReviewsFor(id)
  const summary = useReviewSummary(id)
  const hasBlocked = useHasBlocked(id)
  const block = useBlockMember()
  const unblock = useUnblockMember()

  if (profile.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  // Blocked, suspended or deleted all look the same from here, on purpose.
  if (!profile.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Member' }} />
        <Callout title="Not available">
          {hasBlocked
            ? 'You blocked this member. Unblock them below if you want to see their profile again.'
            : 'This profile is no longer available.'}
        </Callout>
        {hasBlocked ? (
          <Button
            label="Unblock"
            variant="secondary"
            onPress={() => unblock.mutate(id)}
            loading={unblock.isPending}
          />
        ) : null}
      </Screen>
    )
  }

  const person = profile.data
  const ratio = wouldAgainLabel(summary.data)
  const published = reviews.data ?? []
  const links = (person.links ?? []) as ProfileLink[]

  const confirmBlock = () => {
    Alert.alert(
      `Block ${person.display_name.split(' ')[0]}?`,
      'You will not see each other anywhere in GigAway, and anything still open between you is withdrawn. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => block.mutate(id, { onSuccess: () => router.back() }),
        },
      ],
    )
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: person.display_name }} />

      <PersonRow person={person} size={64} />

      {person.bio ? (
        <Text style={[typography.body, { color: theme.text }]}>{person.bio}</Text>
      ) : null}

      {links.map((link) => (
        <TextLink
          key={link.url}
          label={link.label || link.url}
          onPress={() => Linking.openURL(link.url)}
        />
      ))}

      {/* ── Reputation ──────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>What colleagues say</Text>

        {ratio ? (
          <View style={[styles.ratio, { backgroundColor: theme.accentSubtle }]}>
            <Text style={[typography.bodyStrong, { color: theme.text }]}>{ratio}</Text>
          </View>
        ) : (
          <Callout>
            No reviews yet. Reviews appear after a stay, and only once both people have
            written one or a fortnight has passed.
          </Callout>
        )}

        {published.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </View>

      {/* ── The decision you came here to make ──────────────────────────── */}
      {tripId && action ? (
        <MatchActionSection profileId={id} tripId={tripId} action={action} />
      ) : null}

      {/* ── Safety ──────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        {hasBlocked ? (
          <Button
            label="Unblock"
            variant="secondary"
            onPress={() => unblock.mutate(id)}
            loading={unblock.isPending}
          />
        ) : (
          <Button
            label="Block"
            variant="secondary"
            onPress={confirmBlock}
            loading={block.isPending}
          />
        )}
        <TextLink
          label="Report a concern"
          onPress={() => router.push(`/report/${id}`)}
        />
      </View>
    </Screen>
  )
}

type MatchAction = 'ask_host' | 'ask_co' | 'offer'

/**
 * The action this profile was opened to decide on.
 *
 * Placed below the reviews on purpose: you read who somebody is, then act,
 * rather than being asked to commit at the top of the screen.
 *
 * Whether you have already asked is re-derived here from the same query the
 * match screen uses, not passed in as a parameter. A stale "Ask" button that
 * taps into a unique-constraint violation is worse than a slightly slower one.
 */
function MatchActionSection({
  profileId,
  tripId,
  action,
}: {
  profileId: string
  tripId: string
  action: MatchAction
}) {
  const theme = useTheme()
  const router = useRouter()
  const sendRequest = useSendRequest()
  const sent = useRequestsForTrip(tripId)

  // The host's side: there is nothing to ask, they are the one giving nights.
  if (action === 'offer') {
    return (
      <View style={styles.section}>
        <Button
          label="Offer nights"
          onPress={() => router.push({ pathname: '/offer/new', params: { tripId } })}
        />
      </View>
    )
  }

  const asked = (sent.data ?? []).some(
    (request) => request.to_profile === profileId && request.status !== 'withdrawn',
  )

  if (asked) {
    return (
      <View style={styles.section}>
        <View style={styles.asked}>
          <Badge label="Asked" tone="accent" />
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            They will see it next time they open the app.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <Button
        label={action === 'ask_co' ? 'Ask about splitting a place' : 'Ask about these nights'}
        variant={action === 'ask_co' ? 'secondary' : 'primary'}
        onPress={() =>
          sendRequest.mutate({
            kind: action === 'ask_co' ? 'co_accommodation' : 'host_stay',
            tripId,
            toProfile: profileId,
          })
        }
        loading={sendRequest.isPending}
      />
    </View>
  )
}

/**
 * One published review.
 *
 * The would-again binary leads, because it is the part that carries signal —
 * free text skews positive in a small professional community where everyone
 * expects to meet again.
 */
function ReviewCard({ review }: { review: Review }) {
  const theme = useTheme()

  return (
    <View style={[styles.card, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        {/* author_id is nulled when an account is deleted, so the reviews that
            person wrote about OTHERS survive without naming them. */}
        <PersonRow
          person={review.author ?? { display_name: 'Deleted member', discipline: '—' }}
          size={36}
        />
        <Badge
          label={review.would_again ? 'Would again' : 'Would not'}
          tone={review.would_again ? 'success' : 'muted'}
        />
      </View>

      {review.body ? (
        <Text style={[typography.body, { color: theme.text }]}>{review.body}</Text>
      ) : null}

      <Text style={[typography.caption, { color: theme.textFaint }]}>
        {review.published_at
          ? new Date(review.published_at).toLocaleDateString('en-GB', {
              month: 'long',
              year: 'numeric',
            })
          : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.md },
  ratio: { padding: spacing.lg, borderRadius: radius.md },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  asked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
