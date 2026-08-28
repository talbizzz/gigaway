import { looksLikeInviteCode, type RedeemInviteResponse } from '@gigaway/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button, TextLink } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useSessionStore } from '@/features/auth/session-store'
import { profileKeys, useMyProfile } from '@/features/profile/use-profile'
import { identify, track } from '@/lib/analytics'
import { ApiCallError, callFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The verification wall. Two ways through: an invite code from a colleague
 * (instant), or document review by the founder (a day or two).
 *
 * Until `status` is 'approved', RLS returns no member content whatsoever, so
 * this screen is a gate in the real sense rather than a UI courtesy.
 */
export default function VerifyScreen() {
  const theme = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)
  const { data: profile } = useMyProfile()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redeem = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const result = await callFunction<RedeemInviteResponse>('redeem-invite', { code })
      track('invite_redeemed')
      if (session) identify(session.user.id)
      await queryClient.invalidateQueries({ queryKey: profileKeys.mine(session?.user.id) })
      // The auth gate takes over once status flips to 'approved'. Addressed
      // through the group: /profile alone is ambiguous now that the tab bar
      // has one too.
      router.replace('/(onboarding)/profile')
      return result
    } catch (caught) {
      setError(
        caught instanceof ApiCallError
          ? caught.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (profile?.status === 'rejected') {
    return (
      <Screen footer={<Button label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />}>
        <Text style={[typography.display, { color: theme.text }]}>Application closed</Text>
        <Callout tone="warning">
          We weren't able to confirm your professional background from what was submitted.
          If you think that's a mistake, reply to the email we sent and we'll take another look.
        </Callout>
      </Screen>
    )
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label="Join with invite"
            onPress={redeem}
            loading={submitting}
            disabled={!looksLikeInviteCode(code)}
          />
          <TextLink
            label="I don't have an invite"
            onPress={() => router.push('/apply')}
          />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>One more step</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          GigAway is invite-only. That's the whole point — it's why a stranger will trust
          you with their keys.
        </Text>
      </View>

      <TextField
        label="Invite code"
        value={code}
        onChangeText={(next) => setCode(next.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        placeholder="K7M2XQ4P"
        hint="Eight characters, from the colleague who invited you."
        error={error ?? undefined}
        style={styles.code}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  code: { letterSpacing: 4, fontSize: 20 },
})
