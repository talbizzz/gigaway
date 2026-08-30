import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { usePushLifecycle } from '@/features/notifications/use-push'
import { useTheme } from '@/theme/use-theme'

export default function AppLayout() {
  // Refreshes an existing push registration, keeps the token warm and routes
  // notification taps. It never prompts — that happens after the member's
  // first trip or availability, in the screens that post them.
  usePushLifecycle()

  const theme = useTheme()
  const insets = useSafeAreaInsets()

  // A header only where there is somewhere to go back to, and nothing in it but
  // the chevron: no title, and none of the previous screen's name that iOS puts
  // beside the arrow by default. Every screen titles itself in its own body.
  return (
    <Stack
      screenOptions={({ navigation }) => {
        const canGoBack = navigation.canGoBack()

        return {
          headerShown: canGoBack,
          headerTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          // The header is what clears the status bar. Without one — a deep link
          // opening straight onto a screen with no history — the scene has to
          // do it, or the content starts under the clock.
          contentStyle: {
            backgroundColor: theme.bg,
            paddingTop: canGoBack ? 0 : insets.top,
          },
        }
      }}
    >
      {/* The tabs are the root of this stack, so they are never in the "can go
          back" case above — stated outright rather than inferred, because
          canGoBack() also answers for the parent navigator, which has its own
          history. They draw their own header, which clears the status bar, so
          no inset here either. */}
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}
      />
    </Stack>
  )
}
