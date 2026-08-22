import { formatDateRange, nightCount } from '@gigaway/shared'
import { Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import { Callout } from '@/components/callout'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { useContact, useStayWith } from '@/features/contacts/use-contacts'
import { useMemberProfile } from '@/features/profile/use-profile'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The payoff moment.
 *
 * THE CLIENT PERFORMS NO VISIBILITY CHECK. This screen asks for the row and
 * shows whatever comes back; RLS returns it once a contact grant exists and
 * returns nothing before that. There is deliberately no `if (accepted)` here —
 * a screen that decides for itself whether to reveal a phone number is a
 * screen that can be wrong, and this is the one place in the product where
 * being wrong matters most.
 *
 * The exact address is neither shown nor stored anywhere. The two of them
 * exchange it themselves, off-platform, which is also where the conversation
 * continues — there is no chat in this app and this screen says so plainly.
 */
export default function ContactScreen() {
  const theme = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const profile = useMemberProfile(id)
  const contact = useContact(id)
  const { stay } = useStayWith(id)

  if (contact.isPending || profile.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  const details = contact.data
  const firstName = profile.data?.display_name?.split(' ')[0] ?? 'They'

  // No row means no grant. Nothing has gone wrong — the reveal has simply not
  // happened yet.
  if (!details) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Contact' }} />
        <Callout title="Not shared yet">
          Contact details appear here once an offer is accepted. Neither of you can see the
          other's number before that.
        </Callout>
      </Screen>
    )
  }

  // Preferred channel first: it is what this person said they actually read.
  const channels = orderChannels(details)
  const nights = stay ? nightCount({ start: stay.start_date, end: stay.end_date }) : 0

  return (
    <Screen>
      <Stack.Screen options={{ title: profile.data?.display_name ?? 'Contact' }} />

      <PersonRow person={profile.data ?? undefined} size={56} />

      {/* What was agreed, so nobody has to remember it or scroll back. */}
      {stay ? (
        <View style={[styles.agreed, { backgroundColor: theme.accentSubtle }]}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            {nights} night{nights === 1 ? '' : 's'} in {stay.cities?.name}
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            {formatDateRange(stay.start_date, stay.end_date)}
          </Text>
        </View>
      ) : (
        <View style={[styles.agreed, { backgroundColor: theme.accentSubtle }]}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            You are splitting a place
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            Sort out the booking between you.
          </Text>
        </View>
      )}

      <View style={styles.section}>
        {channels.map((channel) => (
          <ChannelRow key={channel.kind} channel={channel} />
        ))}
      </View>

      <Callout title={`Carry on with ${firstName} directly`}>
        GigAway has no chat. Message or call them on whichever of the above suits — that is
        where you agree the address, the keys and what time you arrive.
      </Callout>

      <Text style={[typography.caption, { color: theme.textMuted }]}>
        GigAway never stores anyone's exact address. Ask {firstName} for it directly.
      </Text>
    </Screen>
  )
}

type Channel = {
  kind: 'whatsapp' | 'phone' | 'email'
  label: string
  value: string
  action: string
  url: string
  preferred: boolean
}

/**
 * Preferred channel first, then the rest.
 *
 * Someone who says "WhatsApp" and gets a phone call at 8am has been let down
 * by the interface, not by the caller.
 */
function orderChannels(details: {
  whatsapp: string | null
  phone: string | null
  email: string | null
  preferred_channel: string | null
}): Channel[] {
  const channels: Channel[] = []

  if (details.whatsapp) {
    channels.push({
      kind: 'whatsapp',
      label: 'WhatsApp',
      value: details.whatsapp,
      action: 'Open WhatsApp',
      // wa.me wants digits only — no plus, no spaces, no dashes.
      url: `https://wa.me/${details.whatsapp.replace(/[^\d]/g, '')}`,
      preferred: details.preferred_channel === 'whatsapp',
    })
  }

  if (details.phone) {
    channels.push({
      kind: 'phone',
      label: 'Phone',
      value: details.phone,
      action: 'Call',
      url: `tel:${details.phone.replace(/\s/g, '')}`,
      preferred: details.preferred_channel === 'phone',
    })
  }

  if (details.email) {
    channels.push({
      kind: 'email',
      label: 'Email',
      value: details.email,
      action: 'Write',
      url: `mailto:${details.email}`,
      preferred: details.preferred_channel === 'email',
    })
  }

  return channels.sort((a, b) => Number(b.preferred) - Number(a.preferred))
}

function ChannelRow({ channel }: { channel: Channel }) {
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${channel.action} — ${channel.value}`}
      onPress={() => Linking.openURL(channel.url)}
      style={({ pressed }) => [
        styles.channel,
        {
          backgroundColor: theme.bgSubtle,
          borderColor: channel.preferred ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.channelText}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          {channel.label.toUpperCase()}
          {channel.preferred ? ' · PREFERRED' : ''}
        </Text>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{channel.value}</Text>
      </View>
      <Text style={[typography.body, { color: theme.accent }]}>{channel.action}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  agreed: { padding: spacing.lg, borderRadius: radius.md, gap: 2 },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  channelText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
})
