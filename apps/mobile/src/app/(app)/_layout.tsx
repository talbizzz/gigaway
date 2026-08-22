import { Stack } from 'expo-router'

import { usePushLifecycle } from '@/features/notifications/use-push'

export default function AppLayout() {
  // Refreshes an existing push registration, keeps the token warm and routes
  // notification taps. It never prompts — that happens after the member's
  // first trip or availability, in the screens that post them.
  usePushLifecycle()

  return <Stack />
}
