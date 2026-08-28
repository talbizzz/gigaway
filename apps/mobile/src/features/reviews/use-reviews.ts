import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSessionStore } from '@/features/auth/session-store'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

export const reviewKeys = {
  forProfile: (profileId: string) => ['reviews', 'profile', profileId] as const,
  summary: (profileId: string) => ['reviews', 'summary', profileId] as const,
  mine: ['reviews', 'mine'] as const,
  pending: ['reviews', 'pending'] as const,
}

export type ReviewAuthor = {
  id: string
  display_name: string
  discipline: string
  photo_path: string | null
}

export type Review = {
  id: string
  stay_id: string
  author_id: string | null
  subject_id: string
  would_again: boolean
  body: string | null
  submitted_at: string
  published_at: string | null
  author: ReviewAuthor | null
}

const REVIEW_SELECT = `
  id, stay_id, author_id, subject_id, would_again, body, submitted_at, published_at,
  author:profiles!reviews_author_id_fkey(id, display_name, discipline, photo_path)
`

/**
 * Published reviews about someone.
 *
 * RLS returns only published rows to anyone but their author, so this needs no
 * filter of its own — an unpublished review is invisible here by construction,
 * which is what makes the double-blind hold.
 */
export function useReviewsFor(profileId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.forProfile(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .eq('subject_id', profileId!)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
      if (error) throw error
      return data as unknown as Review[]
    },
  })
}

export type ReviewSummary = { total: number; wouldAgain: number }

/**
 * The would-again ratio, computed in SQL.
 *
 * Deliberately not derived from the list above: the summary must agree with
 * the database's own view of what is published, and a client-side count over a
 * paginated list would eventually disagree.
 */
export function useReviewSummary(profileId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.summary(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ReviewSummary> => {
      const { data, error } = await supabase.rpc('review_summary', {
        p_profile_id: profileId!,
      })
      if (error) throw error
      const row = (data ?? [])[0] as { total: number; would_again: number } | undefined
      return { total: row?.total ?? 0, wouldAgain: row?.would_again ?? 0 }
    },
  })
}

export type ReviewableStay = {
  id: string
  host_id: string
  guest_id: string
  start_date: string
  end_date: string
  review_closes_at: string
  cities: { name: string } | null
  /** The other person — whoever this member was not. */
  counterpartId: string
  /** The review this member has already written, if any. */
  myReview: Review | null
}

/**
 * Stays this member still owes a review on.
 *
 * Drives the persistent card in the app, which is the recoverable path when a
 * push prompt is missed. Co-accommodation never appears here, because it
 * produces no stay at all — nobody hosted anybody.
 */
export function useReviewableStays() {
  const session = useSessionStore((state) => state.session)
  const userId = session?.user.id

  return useQuery({
    queryKey: reviewKeys.pending,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ReviewableStay[]> => {
      const today = new Date().toISOString().slice(0, 10)

      const { data: stays, error } = await supabase
        .from('stays')
        .select('id, host_id, guest_id, start_date, end_date, review_closes_at, cities(name)')
        .lt('end_date', today)
        .gte('review_closes_at', today)
        .order('end_date', { ascending: false })
      if (error) throw error

      const { data: mine, error: reviewError } = await supabase
        .from('reviews')
        .select(REVIEW_SELECT)
        .eq('author_id', userId!)
      if (reviewError) throw reviewError

      const byStay = new Map(
        (mine as unknown as Review[]).map((review) => [review.stay_id, review]),
      )

      return (stays as unknown as ReviewableStay[])
        .map((stay) => ({
          ...stay,
          counterpartId: stay.host_id === userId ? stay.guest_id : stay.host_id,
          myReview: byStay.get(stay.id) ?? null,
        }))
        .filter((stay) => stay.myReview === null)
    },
  })
}

/**
 * Writes a review.
 *
 * Publication is not this function's business: a database trigger publishes
 * both reviews the instant the second one lands, and a cron job releases a
 * lone review once the window closes. The client never sets published_at — a
 * column guard refuses it outright.
 */
export function useSubmitReview() {
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)

  return useMutation({
    mutationFn: async (input: {
      stayId: string
      subjectId: string
      wouldAgain: boolean
      body?: string
    }) => {
      const { error } = await supabase.from('reviews').insert({
        stay_id: input.stayId,
        author_id: session!.user.id,
        subject_id: input.subjectId,
        would_again: input.wouldAgain,
        body: input.body?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async (_data, variables) => {
      track('review_submitted', { wouldAgain: variables.wouldAgain })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ])
    },
  })
}

/** "8 of 9 would host again" — the sentence the ratio is for. */
export function wouldAgainLabel(summary: ReviewSummary | undefined): string | null {
  if (!summary || summary.total === 0) return null
  if (summary.total === summary.wouldAgain) {
    return summary.total === 1
      ? 'One colleague would do it again'
      : `All ${summary.total} would do it again`
  }
  return `${summary.wouldAgain} of ${summary.total} would do it again`
}
