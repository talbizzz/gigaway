import { supabase } from '@/lib/supabase'

/**
 * Mirrors apps/mobile/src/lib/functions.ts exactly — same Edge Function
 * error envelope project-wide, same reason to unwrap it: supabase-js
 * surfaces a non-2xx as a generic FunctionsHttpError with the body unread.
 */
export class ApiCallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiCallError'
    this.code = code
  }
}

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    const context: unknown = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const payload = (await context.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      if (payload?.error) {
        throw new ApiCallError(payload.error, payload.message ?? error.message)
      }
    }
    throw new ApiCallError('internal_error', error.message)
  }

  return data as T
}
