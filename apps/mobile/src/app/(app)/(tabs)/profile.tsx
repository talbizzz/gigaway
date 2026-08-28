import { useRouter } from 'expo-router'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { useCity } from '@/features/cities/use-city'
import { useMyContactDetails } from '@/features/contacts/use-contacts'
import { useMyProfile } from '@/features/profile/use-profile'
import type { ProfileLink } from '@/features/profile/use-update-profile'
import { useReviewSummary, wouldAgainLabel } from '@/features/reviews/use-reviews'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Your own profile, as a read view.
 *
 * Deliberately laid out like another member's profile rather than like a form,
 * because the question this screen answers is "what do people see before they
 * decide whether to host me?" — and reviews are part of that answer even
 * though you cannot edit them. Editing is one tap away, on its own screen.
 */
export default function ProfileScreen() {
  const theme = useTheme()
  const router = useRouter()

  const { data: profile } = useMyProfile()
  const contact = useMyContactDetails()
  const city = useCity(profile?.home_city_id)
  const summary = useReviewSummary(profile?.id)

  if (!profile) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const links = (profile.links ?? []) as ProfileLink[]
  const ratio = wouldAgainLabel(summary.data)
  const home = [city.data?.name, profile.home_district].filter(Boolean).join(' · ')

  return (
    <Screen>
      <PersonRow person={profile} size={64} />

      <Button label="Edit profile" variant="secondary" onPress={() => router.push('/profile/edit')} />

      {/* ── Where you are ───────────────────────────────────────────────── */}
      {home ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>Home</Text>
          <Text style={[typography.body, { color: theme.text }]}>{home}</Text>
        </View>
      ) : null}

      {/* ── About ───────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>About you</Text>
        {profile.bio ? (
          <Text style={[typography.body, { color: theme.text }]}>{profile.bio}</Text>
        ) : (
          <Callout>
            No bio yet. A couple of lines about what you play and how you travel is what
            most hosts read before saying yes.
          </Callout>
        )}

        {links.map((link) => (
          <TextLink
            key={link.url}
            label={link.label || link.url}
            onPress={() => Linking.openURL(link.url)}
          />
        ))}
      </View>

      {/* ── Contact ─────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>How people reach you</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Both of these are handed over only when an offer is accepted, and only to that
          one person. Nobody browsing the app can see them.
        </Text>

        <View style={[styles.contact, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}>
          <ContactLine label="WhatsApp" value={contact.data?.whatsapp} />
          <ContactLine label="Email" value={contact.data?.email} />
        </View>
      </View>

      {/* ── Reputation ──────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>What colleagues say</Text>
        {ratio ? (
          <View style={[styles.ratio, { backgroundColor: theme.accentSubtle }]}>
            <Text style={[typography.bodyStrong, { color: theme.text }]}>{ratio}</Text>
          </View>
        ) : (
          <Callout>
            No reviews yet. They appear after a stay, once both people have written one or
            a fortnight has passed.
          </Callout>
        )}
      </View>
    </Screen>
  )
}

/** One revealed-on-acceptance channel. */
function ContactLine({ label, value }: { label: string; value?: string | null }) {
  const theme = useTheme()

  return (
    <View style={styles.contactLine}>
      <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[typography.body, { color: value ? theme.text : theme.textFaint }]}>
        {value ?? 'Not set'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.md },
  ratio: { padding: spacing.lg, borderRadius: radius.md },
  contact: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  contactLine: { gap: 2 },
})
