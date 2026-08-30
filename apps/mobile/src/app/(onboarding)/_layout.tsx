import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function OnboardingLayout() {
  const insets = useSafeAreaInsets()

  // No header anywhere in this flow: the one screen with anything behind it,
  // apply, already carries its own way back in the body. That leaves the status
  // bar for the scene itself to clear.
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top } }}
    />
  )
}
