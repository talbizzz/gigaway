/**
 * The error envelope every Edge Function returns.
 *
 * Established here in Milestone 1 as a project-wide convention: later milestones
 * must follow this shape rather than inventing their own.
 *
 *   success →  { ok: true,  ...payload }
 *   failure →  { ok: false, error: "<machine_code>", message: "<human text>" }
 *
 * `error` is a stable machine code the client switches on. `message` is for
 * humans and may change freely — never branch on it.
 */

export type ApiError = {
  ok: false
  error: string
  message: string
}

export type ApiSuccess<T> = { ok: true } & T

export type ApiResult<T> = ApiSuccess<T> | ApiError

/** Error codes shared across functions. Per-function codes live beside their schema. */
export const COMMON_ERRORS = {
  unauthenticated: 'unauthenticated',
  invalid_request: 'invalid_request',
  not_approved: 'not_approved',
  rate_limited: 'rate_limited',
  internal_error: 'internal_error',
} as const

export type CommonErrorCode = (typeof COMMON_ERRORS)[keyof typeof COMMON_ERRORS]

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return result.ok === false
}
