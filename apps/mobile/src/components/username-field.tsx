import { USERNAME_MAX_LENGTH } from '@gigaway/shared'

import { TextField } from '@/components/text-field'
import type { UsernameStatus } from '@/features/profile/use-username-status'

/**
 * The username box, with what the check found underneath it. The status comes
 * from useUsernameStatus in the parent, which also needs it to decide whether
 * the form can be sent.
 */
export function UsernameField({
  value,
  onChangeText,
  status,
  hint,
  error,
}: {
  value: string
  onChangeText: (next: string) => void
  status: UsernameStatus
  /** Shown when there is nothing more specific to say. */
  hint?: string
  /** A message from outside, such as the form's own validation. */
  error?: string
}) {
  const problem =
    error ??
    (status.state === 'invalid'
      ? status.message
      : status.state === 'taken'
        ? 'That username is already taken.'
        : undefined)

  const note =
    status.state === 'checking'
      ? 'Checking…'
      : status.state === 'ok'
        ? '✓ Available'
        : hint

  return (
    <TextField
      label="Username"
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="username-new"
      textContentType="username"
      maxLength={USERNAME_MAX_LENGTH + 1}
      placeholder="aziz_t"
      hint={note}
      error={problem}
    />
  )
}
