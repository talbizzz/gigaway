import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

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

export function Avatar({
  photoPath,
  size = 44,
}: {
  photoPath?: string | null
  size?: number
}) {
  const theme = useTheme()
  const uri = avatarUrl(photoPath)

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, backgroundColor: theme.bgRaised },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImage} contentFit="cover" />
      ) : null}
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
}: {
  person: PersonSummary | null | undefined
  trailing?: string
  size?: number
}) {
  const theme = useTheme()
  if (!person) return null

  const subtitle = [person.specialisation ?? person.discipline, person.home_district]
    .filter(Boolean)
    .join(' · ')

  return (
    <View style={styles.row}>
      <Avatar photoPath={person.photo_path} size={size} />
      <View style={styles.rowText}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>
          {person.display_name}
        </Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          {subtitle}
          {trailing ? ` · ${trailing}` : ''}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: { borderRadius: radius.pill, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
})
