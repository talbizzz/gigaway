import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Callout } from '@/components/callout'
import { ConnectionActions } from '@/components/connection-actions'
import { PersonRow } from '@/components/person'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  useSearchMembers,
  useSplitConnections,
  type ConnectionProfile,
} from '@/features/connections/use-connections'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Connections: find a colleague by username or name, answer the requests waiting
 * on you, and see who you are connected with.
 *
 * Connections see a little more of each other: a bio, links and full name on their
 * profile, and the trips marked for connections. A request is only ever an
 * invitation; nothing is shared until it is accepted.
 */
export default function FriendsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [term, setTerm] = useState('')

  const search = useSearchMembers(term)
  const { split, isPending } = useSplitConnections()
  const searching = term.trim().replace(/^@/, '').length >= 2

  const open = (id: string) => router.push(`/member/${id}`)

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Connections' }} />

      <Text style={[typography.display, { color: theme.text }]}>Connections</Text>

      <TextField
        label="Find a colleague"
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Username or name"
        hint={searching ? undefined : 'Type at least two letters.'}
      />

      {searching ? (
        <View style={styles.section}>
          {search.isFetching ? <ActivityIndicator color={theme.accent} style={styles.spinner} /> : null}

          {search.data?.map((result) => (
            <View key={result.profile_id} style={styles.item}>
              <PersonRow
                person={{
                  display_name: result.display_name,
                  discipline: result.discipline,
                  specialisation: result.specialisation,
                  photo_path: result.photo_path,
                }}
                trailing={[result.username ? `@${result.username}` : null, result.home_city]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => open(result.profile_id)}
              />
              <ConnectionActions
                profileId={result.profile_id}
                firstName={result.display_name.split(' ')[0] ?? 'them'}
                relationship={result.relationship}
                connectionId={
                  [...split.connected, ...split.incoming, ...split.outgoing].find(
                    (entry) => entry.profile.id === result.profile_id,
                  )?.connectionId ?? null
                }
                compact
              />
            </View>
          ))}

          {search.data && search.data.length === 0 && !search.isFetching ? (
            <Text style={[typography.body, { color: theme.textMuted }]}>
              Nobody found. Try their username, or the way they spell their name.
            </Text>
          ) : null}

          {search.isError ? (
            <Callout tone="danger">{(search.error as Error).message}</Callout>
          ) : null}
        </View>
      ) : isPending ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : (
        <>
          {split.incoming.length > 0 ? (
            <Section title={`Requests (${split.incoming.length})`}>
              {split.incoming.map(({ connectionId, profile }) => (
                <Entry
                  key={connectionId}
                  profile={profile}
                  relationship="incoming"
                  connectionId={connectionId}
                  onOpen={open}
                />
              ))}
            </Section>
          ) : null}

          <Section title={`Your connections${split.connected.length ? ` (${split.connected.length})` : ''}`}>
            {split.connected.length === 0 ? (
              <Callout title="No connections yet">
                Search for a colleague above. Once they accept, you see more of each other and the
                trips shared with connections.
              </Callout>
            ) : (
              split.connected.map(({ connectionId, profile }) => (
                <Entry
                  key={connectionId}
                  profile={profile}
                  relationship="connected"
                  connectionId={connectionId}
                  onOpen={open}
                />
              ))
            )}
          </Section>

          {split.outgoing.length > 0 ? (
            <Section title="Waiting for an answer">
              {split.outgoing.map(({ connectionId, profile }) => (
                <Entry
                  key={connectionId}
                  profile={profile}
                  relationship="requested"
                  connectionId={connectionId}
                  onOpen={open}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <Text style={[typography.heading, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  )
}

function Entry({
  profile,
  relationship,
  connectionId,
  onOpen,
}: {
  profile: ConnectionProfile
  relationship: 'connected' | 'requested' | 'incoming'
  connectionId: string
  onOpen: (id: string) => void
}) {
  return (
    <View style={styles.item}>
      <PersonRow
        person={profile}
        trailing={profile.username ? `@${profile.username}` : undefined}
        onPress={() => onOpen(profile.id)}
      />
      <ConnectionActions
        profileId={profile.id}
        firstName={profile.display_name.split(' ')[0] ?? 'them'}
        relationship={relationship}
        connectionId={connectionId}
        compact
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  item: { gap: spacing.sm },
  spinner: { alignSelf: 'flex-start' },
})
