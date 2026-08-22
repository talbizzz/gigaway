import PostHog from 'posthog-react-native'

import { env } from '@/lib/env'

/**
 * Product analytics, off by default.
 *
 * The success criteria in Project-Raw.md are funnel questions — how many
 * invites become verified members, how many trips become accepted offers — so
 * events are instrumented from the start. But nothing is sent until
 * EXPO_PUBLIC_ANALYTICS_ENABLED is exactly "true", which happens only once the
 * published privacy policy names PostHog (Milestone 5).
 *
 * Rules, enforced by the typed event list below:
 *   - EU cloud only
 *   - autocapture off; every event is named deliberately
 *   - properties carry IDs and counts, NEVER names, emails, free text,
 *     locations or anything a person wrote
 */

export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'invite_redeemed'
  | 'invite_created'
  | 'verification_submitted'
  | 'profile_completed'
  | 'trip_created'
  | 'availability_created'
  | 'matches_viewed'
  | 'request_sent'
  | 'offer_sent'
  | 'offer_accepted'
  | 'contact_revealed'
  | 'push_permission_granted'
  | 'push_permission_denied'

type AnalyticsProperties = Record<string, string | number | boolean>

let client: PostHog | null = null

export function initialiseAnalytics(): void {
  if (!env.analyticsEnabled || !env.posthogKey || client) return

  client = new PostHog(env.posthogKey, {
    host: env.posthogHost,
    // Every event in this app is named explicitly; autocapture would sweep up
    // screen contents we have no lawful basis to collect.
    enableSessionReplay: false,
  })
}

export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!client) return
  client.capture(event, properties)
}

/**
 * Associates events with a profile. The profile UUID is the only identifier
 * ever sent — no email, no display name.
 */
export function identify(profileId: string): void {
  if (!client) return
  client.identify(profileId)
}

export function resetAnalytics(): void {
  if (!client) return
  client.reset()
}
