import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/theme/use-theme'

export default function OnboardingLayout() {
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  // No header anywhere in this flow: verify, the one screen with anything
  // behind it, already carries its own way back in the body. That leaves the
  // status bar for the scene itself to clear.
  //
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
    />
  )
}
