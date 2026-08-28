import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { avatarUrl } from '@/features/profile/use-update-profile'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type PersonSummary = {
  display_name: string
  discipline: string
  specialisation?: string | null
  photo_path?: string | null
  home_district?: string | null
}

/**
 * Initials, for a member who has not added a photo.
 *
 * First and last word, so "Anna Weber" reads AW and a stage name of one word
 * reads A. Falls back to a dash rather than an empty circle: a blank disc looks
 * like an image that failed to load, and most of this app's screens are lists
 * where that reads as something being broken.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '–'

  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

export function Avatar({
  photoPath,
  name,
  size = 44,
}: {
  photoPath?: string | null
  /** Drives the initials placeholder when there is no photo. */
  name?: string | null
  size?: number
}) {
  const theme = useTheme()
  const uri = avatarUrl(photoPath)

  // The placeholder is brass rather than a grey: bgRaised is white in the light
  // theme, which makes an empty circle invisible on the screens that sit on
  // `bg`. accentSubtle is distinct from every surface in both themes.
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          backgroundColor: uri ? theme.bgRaised : theme.accentSubtle,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImage} contentFit="cover" />
      ) : (
        <Text
          // Scaled off the diameter so one component covers the 36–64px range
          // the app asks for.
          style={[
            styles.initials,
            { color: theme.accent, fontSize: Math.round(size * 0.38) },
          ]}
          // The name is already read out by the row around it.
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  )
}

/**
 * Name, discipline and — where it is known — the coarse district a host lives
 * in. Never an address: the exact one is exchanged off-platform, and this
 * component is used on screens both before and after a reveal.
 */
export function PersonRow({
  person,
  trailing,
  size = 44,
  onPress,
}: {
  person: PersonSummary | null | undefined
  trailing?: string
  size?: number
  /** Makes the row a link to that member's profile, where blocking and
   *  reporting live. Omitted where there is no profile to open. */
  onPress?: () => void
}) {
  const theme = useTheme()
  if (!person) return null

  const subtitle = [person.specialisation ?? person.discipline, person.home_district]
    .filter(Boolean)
    .join(' · ')

  const content = (
    <>
      <Avatar photoPath={person.photo_path} name={person.display_name} size={size} />
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: onPress ? theme.accent : theme.text }]}>
          {person.display_name}
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {subtitle}
          {trailing ? ` · ${trailing}` : ''}
        </Text>
      </View>
    </>
  )

  if (!onPress) return <View style={styles.row}>{content}</View>

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${person.display_name} — open profile`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontWeight: '600', includeFontPadding: false },
  avatarImage: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
})
