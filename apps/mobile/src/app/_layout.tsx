import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { initialiseSessionListener } from '@/features/auth/session-store'
import { useAuthGate } from '@/features/auth/use-auth-gate'
import { initialiseAnalytics } from '@/lib/analytics'
import { initialiseMonitoring } from '@/lib/monitoring'
import { queryClient } from '@/lib/query'
import { darkTheme, lightTheme } from '@/theme/tokens'

// Both are no-ops without their respective configuration: Sentry without a DSN,
// PostHog unless EXPO_PUBLIC_ANALYTICS_ENABLED is exactly "true". Called at
// module scope so monitoring is live before the first render can crash.
initialiseMonitoring()
initialiseAnalytics()

function RootNavigator() {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? darkTheme : lightTheme
  const { ready } = useAuthGate()

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg,
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  )
}

export default function RootLayout() {
  const scheme = useColorScheme()

  useEffect(() => initialiseSessionListener(), [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
