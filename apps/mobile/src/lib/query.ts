import { focusManager, QueryClient } from '@tanstack/react-query'
import { AppState, Platform } from 'react-native'

/**
 * Server state lives here rather than in a global store.
 *
 * Defaults are tuned for an app opened a handful of times a year on unreliable
 * mobile networks: refetch when the user comes back, retry transient failures,
 * and treat data as fresh briefly so navigating back and forth is instant.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

// "Focus" is a browser concept. On a phone, the equivalent is the app coming
// back to the foreground, and nothing tells React Query that unless it is wired
// up here. Without this, refetchOnWindowFocus above never fires on device.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => {
    focusManager.setFocused(status === 'active')
  })
}
