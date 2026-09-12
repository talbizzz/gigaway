import { DELETE_CONFIRMATION } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useDeleteAccount } from '@/features/account/use-account'
import { typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Account deletion, on its own page rather than the last section of a long
 * settings screen — it deserves the same undivided attention a form this
 * irreversible would get if it were the only thing on the screen, which it
 * now is.
 *
 * Two confirmations, and copy that says plainly what survives. Somebody who
 * deletes expecting their reviews of other people to vanish and finds they
 * have not would rightly feel misled — so the screen says it before, not
 * after.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme()
  const router = useRouter()
  const deleteAccount = useDeleteAccount()

  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')

  const ready = confirm === DELETE_CONFIRMATION && password.length > 0

  return (
    <Screen
      footer={
        <>
          <Button
            label="Permanently delete my account"
            variant="danger"
            disabled={!ready}
            loading={deleteAccount.isPending}
            onPress={() => deleteAccount.mutate(password)}
          />
          <TextLink label="Keep my account" onPress={() => router.back()} />
        </>
      }
    >
      <Stack.Screen options={{ title: 'Delete account' }} />

      <Text style={[typography.display, { color: theme.danger }]}>Delete your account</Text>

      <Callout tone="danger" title="This cannot be undone">
        Your profile, trips, availability, contact details and notifications are deleted
        outright, and you will never be able to sign in again.
        {'\n\n'}
        Two things deliberately survive, and you should know before you continue. Reviews
        you have written about other people stay published, with your name replaced by
        "Deleted member" — otherwise deleting and rejoining would be a way to erase a bad
        reputation. Stays you were part of stay in the other person's history. Any report
        you filed is also kept.
      </Callout>

      <TextField
        label={`Type ${DELETE_CONFIRMATION} to confirm`}
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={DELETE_CONFIRMATION}
      />

      <TextField
        label="Your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        placeholder="••••••••"
      />

      {deleteAccount.isError ? (
        <Callout tone="danger">{(deleteAccount.error as Error).message}</Callout>
      ) : null}
    </Screen>
  )
}
