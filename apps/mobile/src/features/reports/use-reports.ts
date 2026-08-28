import type { ReportCategory } from '@gigaway/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { track } from '@/lib/analytics'
import { callFunction } from '@/lib/functions'

/**
 * Files a report.
 *
 * There is deliberately no query hook alongside this one. The reports table
 * has no client read path at all — not even for the person filing — so the
 * only feedback is the confirmation notification the function enqueues.
 */
export function useSubmitReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      subjectId: string
      category: ReportCategory
      body: string
      relatedType?: 'stay' | 'request' | 'offer'
      relatedId?: string
      alsoBlock?: boolean
    }) => callFunction<{ ok: true; reportId: string }>('submit-report', { ...input }),
    onSuccess: async (_result, variables) => {
      // Category only — never the body. Report text must not reach analytics.
      track('report_submitted', { category: variables.category })
      if (variables.alsoBlock) await queryClient.invalidateQueries()
    },
  })
}
