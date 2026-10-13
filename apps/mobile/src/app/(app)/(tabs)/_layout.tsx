import { Tabs, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { AppHeader } from '@/components/app-header'
import { ComposeSheet } from '@/components/compose-sheet'
import { HomeIcon, PlusIcon, ProfileIcon, ServicesIcon, SettingsIcon } from '@/components/tab-icon'
import { radius, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The places a member lives in. Everything else — trips, requests, reviews,
 * whoever they are looking at — is pushed onto the stack above these, so the
 * bar stays out of the way once you are deep in a flow.
 *
 * The centre slot is not a tab. Adding a trip and offering a service are the
 * two things a member creates, and both used to be buttons partway down the
 * home screen; here they are one press from anywhere.
 *
 * The titles below are what AppHeader puts in the middle of the bar, which is
 * why they live here rather than in each screen: under a tab navigator a
 * screen's own <Stack.Screen> is addressing the wrong navigator.
 */
export default function TabsLayout() {
  const theme = useTheme()
  const router = useRouter()
  const [composing, setComposing] = useState(false)

  return (
    <>
      <Tabs
        screenOptions={{
          // The one place in the app with a header, and it is ours rather than
          // the navigator's: a title flanked by the two things that can be
          // waiting on you.
          header: ({ options }) => <AppHeader title={options.title} />,
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
          name="services"
          options={{
            title: 'Your services',
            tabBarLabel: 'Services',
            tabBarIcon: ({ color, focused }) => <ServicesIcon color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="compose"
          options={{
            title: 'Post',
            tabBarLabel: () => null,
            // Replaces the whole slot, so none of the usual label and icon
            // treatment applies — this is the one control in the bar that does
            // not represent a screen.
            tabBarButton: (props) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a trip or offer a service"
                testID={props.testID}
                onPress={() => setComposing(true)}
                style={({ pressed }) => [styles.compose, pressed && styles.pressed]}
              >
                <View style={[styles.composeDisc, { backgroundColor: theme.accent }]}>
                  <PlusIcon color={theme.accentText} />
                </View>
              </Pressable>
            ),
          }}
          listeners={{
            // Belt and braces: the button above never navigates, but a deep
            // link or an accessibility action could still try to.
            tabPress: (event) => event.preventDefault(),
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

      <ComposeSheet
        visible={composing}
        onClose={() => setComposing(false)}
        choices={[
          {
            label: 'Add a trip',
            detail: 'Somewhere you are going, and who is there',
            onPress: () => {
              setComposing(false)
              router.push('/trip/new')
            },
          },
          {
            label: 'Offer a service',
            detail: 'A couch, a spare room, a coffee or local tips',
            onPress: () => {
              setComposing(false)
              router.push('/availability/choose')
            },
          },
        ]}
      />
    </>
  )
}

const styles = StyleSheet.create({
  compose: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Kept inside the bar rather than lifted above it: a raised disc is clipped
  // on Android, where the bar's overflow is hidden.
  composeDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
})
