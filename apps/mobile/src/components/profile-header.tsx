import { disciplineLabel } from '@gigaway/shared'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '@/components/person'
import { ProfileStats, type StatSection } from '@/components/profile-stats'
import type { MemberStats } from '@/features/members/use-member-stats'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The top of a profile, the same on your own and on everyone else's: the
 * picture on the left, the three numbers beside it, and below them the name, what
 * they do and their username. `children` is for anything that goes under the
 * name, such as a connection's full name.
 */
export function ProfileHeader({
  person,
  stats,
  canOpen,
  onOpen,
  waitingConnections,
  children,
}: {
  person: {
    display_name: string
    photo_path: string | null
    discipline: string
    specialisation: string | null
    username: string | null
  }
  stats: MemberStats | null | undefined
  canOpen: boolean
  onOpen: (section: StatSection) => void
  waitingConnections?: number
  children?: ReactNode
}) {
  const theme = useTheme()
  const headline = person.specialisation ?? disciplineLabel(person.discipline)

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Avatar photoPath={person.photo_path} name={person.display_name} size={72} />
        <ProfileStats
          stats={stats}
          canOpen={canOpen}
          onOpen={onOpen}
          waitingConnections={waitingConnections}
        />
      </View>

      <View style={styles.identity}>
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{person.display_name}</Text>
        {headline ? (
          <Text style={[typography.caption, { color: theme.textMuted }]}>{headline}</Text>
        ) : null}
        {person.username ? (
          <Text style={[typography.body, { color: theme.textMuted }]}>@{person.username}</Text>
        ) : null}
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  identity: { gap: 2 },
})
