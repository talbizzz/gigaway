import type { ReactNode } from 'react'
import { Text } from 'react-native'

import { useMemberAccess } from '@/features/verification/use-member-access'
import { typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Renders its children only for a verified member. A member whose verification
 * is still in review sees a short explanation in their place, rather than a
 * button that would be refused.
 */
export function VerifiedOnly({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const access = useMemberAccess()

  if (access === 'verified') return <>{children}</>

  return (
    <Text style={[typography.caption, { color: theme.textMuted }]}>
      Available once your verification is approved.
    </Text>
  )
}
