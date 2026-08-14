import * as Sentry from '@sentry/react-native'

import { env } from '@/lib/env'

/**
 * Crash and error reporting.
 *
 * A solo developer with no QA will not otherwise hear about a crash on a
 * tester's phone. Configured conservatively: EU region, no PII, and scrubbing
 * of the request bodies most likely to carry someone's contact details.
 */
export function initialiseMonitoring(): void {
  if (!env.sentryDsn) return

  Sentry.init({
    dsn: env.sentryDsn,
    // Never attach IP addresses, usernames or emails to an event.
    sendDefaultPii: false,
    // Modest sampling: this app is opened a handful of times a year per user,
    // so full tracing costs little, but there is no reason to pay for it.
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Belt and braces — strip anything that could carry personal data even
      // if a future integration starts attaching it.
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
      }
      return event
    },
  })
}

/**
 * Records a handled error with context. Prefer this over swallowing failures
 * in a catch block — a silent failure in the invite or contact-reveal path is
 * exactly what will be impossible to debug from a beta tester's description.
 */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!env.sentryDsn) {
    console.error(error, context)
    return
  }
  Sentry.captureException(error, context ? { tags: context } : undefined)
}
