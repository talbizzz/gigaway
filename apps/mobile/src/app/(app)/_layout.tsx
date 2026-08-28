import { Stack } from 'expo-router'

import { usePushLifecycle } from '@/features/notifications/use-push'

export default function AppLayout() {
  // Refreshes an existing push registration, keeps the token warm and routes
  // notification taps. It never prompts — that happens after the member's
  // first trip or availability, in the screens that post them.
  usePushLifecycle()

  // The tab bar draws its own headers, so the stack must not draw a second one
  // above it. Everything else here is a detail screen pushed over the tabs.
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}
