import { Alert, StyleSheet, Text, View } from 'react-native'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { VerifiedOnly } from '@/components/verified-only'
import {
  useAcceptConnectionRequest,
  useRemoveConnection,
  useSendConnectionRequest,
  type Relationship,
} from '@/features/connections/use-connections'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * What a member can do about their connection with one person, whichever state
 * it is in: ask, wait, answer a request, or leave. Used on a member's page and
 * on each search result, so both behave identically.
 *
 * Asking is for verified members only; everything else (answering a request,
 * cancelling, removing a connection) is open to anyone who is in the relationship.
 */
export function ConnectionActions({
  profileId,
  firstName,
  relationship,
  connectionId,
  compact = false,
}: {
  profileId: string
  firstName: string
  relationship: Relationship
  connectionId: string | null
  /** Smaller buttons, for a row in a list. */
  compact?: boolean
}) {
  const theme = useTheme()
  const send = useSendConnectionRequest()
  const accept = useAcceptConnectionRequest()
  const remove = useRemoveConnection()

  const busy = send.isPending || accept.isPending || remove.isPending
  const error = (send.error ?? accept.error ?? remove.error) as Error | null

  const confirmRemove = () => {
    if (!connectionId) return
    Alert.alert(
      `Remove ${firstName} from your connections?`,
      'You will stop seeing what each of you shares with connections. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(connectionId) },
      ],
    )
  }

  return (
    <View style={styles.container}>
      {relationship === 'none' ? (
        <VerifiedOnly>
          <Button
            label="Connect"
            variant={compact ? 'secondary' : 'primary'}
            onPress={() => send.mutate(profileId)}
            loading={send.isPending}
            disabled={busy}
          />
        </VerifiedOnly>
      ) : null}

      {relationship === 'requested' ? (
        <View style={styles.row}>
          <Badge label="Requested" tone="accent" />
          {connectionId ? (
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => remove.mutate(connectionId)}
              loading={remove.isPending}
              disabled={busy}
            />
          ) : null}
        </View>
      ) : null}

      {relationship === 'incoming' && connectionId ? (
        <View style={styles.row}>
          <Button
            label="Accept"
            onPress={() => accept.mutate(connectionId)}
            loading={accept.isPending}
            disabled={busy}
          />
          <Button
            label="Decline"
            variant="secondary"
            onPress={() => remove.mutate(connectionId)}
            loading={remove.isPending}
            disabled={busy}
          />
        </View>
      ) : null}

      {relationship === 'connected' ? (
        <View style={styles.row}>
          <Badge label="Connected" tone="success" />
          {connectionId ? (
            <Button label="Remove" variant="ghost" onPress={confirmRemove} disabled={busy} />
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text style={[typography.caption, { color: theme.danger }]}>{error.message}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
