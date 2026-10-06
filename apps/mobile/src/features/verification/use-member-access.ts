import { useMyProfile, type Profile } from '@/features/profile/use-profile'
import { useMyApplication, type VerificationApplication } from '@/features/verification/use-verification'

/**
 * What the signed-in member may do, as the app sees it.
 *
 *   verified   approved: everything
 *   in_review  submitted a verification and waiting: browse and post their own
 *              trips and availability, but not ask for or offer a stay
 *   gated      not submitted yet, or rejected: the verification screens only
 *
 * This mirrors the database's is_approved() / is_in_review() — the same rule,
 * read from the same two rows. The database is the real gate (a request from an
 * in-review member is refused by RLS whatever this says); this only decides what
 * to show, so a button is never offered that would fail.
 */
export type MemberAccess = 'verified' | 'in_review' | 'gated'

export function memberAccessOf(
  profile: Pick<Profile, 'status'> | null | undefined,
  application: Pick<VerificationApplication, 'status'> | null | undefined,
): MemberAccess {
  if (profile?.status === 'approved') return 'verified'
  if (profile?.status === 'pending' && application?.status === 'pending') return 'in_review'
  return 'gated'
}

export function useMemberAccess(): MemberAccess {
  const { data: profile } = useMyProfile()
  const { data: application } = useMyApplication()
  return memberAccessOf(profile, application)
}
