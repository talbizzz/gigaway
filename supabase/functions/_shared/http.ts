import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ZodSchema } from 'zod'

/**
 * Shared plumbing for Edge Functions: CORS, the error envelope, JWT
 * verification, and a service_role client.
 *
 * The response shape is fixed project-wide — see
 * packages/shared/src/schemas/errors.ts. Clients switch on `error`, never on
 * `message`.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: string, message: string, status: number): Response {
  return jsonResponse({ ok: false, error, message }, status)
}

export function preflight(request: Request): Response | null {
  return request.method === 'OPTIONS' ? new Response('ok', { headers: CORS_HEADERS }) : null
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * Verifies the caller's JWT and returns their user id.
 *
 * Uses a request-scoped client with the caller's own token rather than
 * decoding the JWT locally, so a revoked or expired session is rejected by
 * Supabase itself.
 */
export async function requireUser(request: Request): Promise<
  { userId: string } | { response: Response }
> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return {
      response: errorResponse('unauthenticated', 'Sign in and try again.', 401),
    }
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  )

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    return {
      response: errorResponse('unauthenticated', 'Your session has expired.', 401),
    }
  }

  return { userId: data.user.id }
}

/**
 * Guards system-only functions — those invoked by pg_cron rather than by a
 * user. Compares the bearer token against the service role key directly rather
 * than inspecting JWT claims, so a user token can never satisfy it however it
 * is shaped.
 */
export function requireServiceRole(request: Request): Response | null {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!token || !serviceKey || token !== serviceKey) {
    return errorResponse('unauthenticated', 'This endpoint is not publicly callable.', 401)
  }

  return null
}

export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { response: Response }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { response: errorResponse('invalid_request', 'Expected a JSON body.', 400) }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      response: errorResponse(
        'invalid_request',
        parsed.error.issues[0]?.message ?? 'That request was not valid.',
        400,
      ),
    }
  }

  return { data: parsed.data }
}
