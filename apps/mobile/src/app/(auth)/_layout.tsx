import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function AuthLayout() {
  const insets = useSafeAreaInsets()

  // No header anywhere in this flow — it navigates by replacing rather than
  // pushing, so there is never a back button to hang one on — which leaves the
  // status bar for the scene itself to clear.
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top } }}
    />
  )
}
