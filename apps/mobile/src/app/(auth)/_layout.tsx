import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/use-theme'

// Welcome is the entry point, not sign-in: the gate sends unauthenticated
// users here, and both forms are pushed on top of it.
export const unstable_settings = { initialRouteName: 'welcome' }

export default function AuthLayout() {
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  // Screens pushed from welcome get a header, purely to carry its back button —
  // no title, since each screen already opens with its own heading.
  //
  // Their contentStyle drops paddingTop: the header has already cleared the
  // status bar, and keeping the inset would indent them a second time.
  const pushed = {
    headerShown: true,
    headerTitle: '',
    headerShadowVisible: false,
    // Transparent and floating, so the artwork runs behind it. An opaque header
    // would paint a solid band across the top of the illustration — the same
    // problem the navigator's paddingTop caused on welcome.
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' },
    headerTintColor: theme.text,
    contentStyle: { backgroundColor: theme.bg },
  } as const

  // backgroundColor is not optional here. `contentStyle` REPLACES the value set
  // in the root layout rather than merging with it, so omitting it leaves the
  // padded strip painted in React Navigation's default white — a light band
  // above a dark screen.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg, paddingTop: insets.top },
      }}
    >
      {/* Full-bleed: no paddingTop here, or the navigator paints a solid band
          across the status bar above the artwork. Screen applies the inset to
          its own content instead. */}
      <Stack.Screen
        name="welcome"
        options={{ contentStyle: { backgroundColor: theme.bg } }}
      />
      <Stack.Screen name="sign-in" options={pushed} />
      <Stack.Screen name="sign-up" options={pushed} />
      {/* Terminal state, reached by replacing sign-up. It carries its own way
          onward in the body, so a back button would only offer a way back to a
          form that has already been submitted. */}
      <Stack.Screen name="check-email" />
      <Stack.Screen name="forgot-password" options={pushed} />
      {/* Reached only by the deep-link handler, never pushed from within the
          app — no back button, since there is nothing to go back to. */}
      <Stack.Screen name="set-new-password" />
    </Stack>
  )
}
