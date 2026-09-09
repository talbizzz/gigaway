import { Lora_600SemiBold } from '@expo-google-fonts/lora/600SemiBold'
import { Lora_700Bold } from '@expo-google-fonts/lora/700Bold'
import { Ubuntu_400Regular } from '@expo-google-fonts/ubuntu/400Regular'
import { Ubuntu_500Medium } from '@expo-google-fonts/ubuntu/500Medium'
import { Ubuntu_700Bold } from '@expo-google-fonts/ubuntu/700Bold'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
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
  const { ready: gateReady } = useAuthGate()

  // Imported by subpath: the packages' root index re-exports a ./useFonts
  // module that does not exist, and subpaths are tree-shakeable anyway.
  const [fontsLoaded] = useFonts({
    Lora_700Bold,
    Lora_600SemiBold,
    Ubuntu_400Regular,
    Ubuntu_500Medium,
    Ubuntu_700Bold,
  })

  // Rendering before the faces are registered shows one frame in the system
  // font and then reflows — every label shifts as the metrics change.
  const ready = gateReady && fontsLoaded

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
      {/* Supplies the keyboard metrics that Screen's aware scroll view and
          sticky footer read. Without it they render but never move. */}
      <KeyboardProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <RootNavigator />
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
