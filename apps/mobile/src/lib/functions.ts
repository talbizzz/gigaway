import { supabase } from '@/lib/supabase'

/**
 * Error carrying the machine code from an Edge Function's error envelope.
 * Callers branch on `code`; `message` is already human-facing copy supplied by
 * the function, so it can be shown directly.
 */
export class ApiCallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiCallError'
    this.code = code
  }
}

/**
 * Calls an Edge Function and unwraps the project's error envelope.
 *
 * supabase-js surfaces a non-2xx as a generic FunctionsHttpError with the body
 * unread, so the useful part — our `error` code and `message` — has to be
 * pulled off the attached Response.
 */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
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
