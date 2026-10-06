import { Callout } from '@/components/callout'
import { useMemberAccess } from '@/features/verification/use-member-access'

/**
 * Shown to a member whose verification is under review, wherever they land.
 * Says what they can do as well as what they cannot, because the second half
 * alone reads as a closed door.
 */
export function ReviewBanner() {
  const access = useMemberAccess()
  if (access !== 'in_review') return null

  return (
    <Callout tone="warning" title="Your verification is in review">
      Look around and post your trips and availability. Asking someone for a stay, or offering
      one, opens up once you're approved, and nobody else sees your profile or trips until then.
    </Callout>
  )
}
