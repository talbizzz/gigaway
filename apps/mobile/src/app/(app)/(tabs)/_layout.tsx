import { Tabs } from 'expo-router'

import { HomeIcon, ProfileIcon, SettingsIcon } from '@/components/tab-icon'
import { typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The three places a member lives in. Everything else — trips, availability,
 * requests, reviews — is pushed onto the stack above these tabs, so the bar
 * stays out of the way once you are deep in a flow.
 *
 * Titles live here rather than in each screen: under a tab navigator a screen's
 * own <Stack.Screen> is addressing the wrong navigator.
 */
export default function TabsLayout() {
  const theme = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        sceneStyle: { backgroundColor: theme.bg },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.bg,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: typography.captionStrong,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'GigAway',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => <HomeIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Your profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => <ProfileIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, focused }) => <SettingsIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
  )
}
