import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import type { ColorValue } from 'react-native'

/**
 * Tab bar and header glyphs, from Ionicons.
 *
 * Each one has a filled and an outlined form: filled when its tab is focused,
 * outlined when it is not, so the current tab reads without a label. They take
 * the tab bar's already-resolved active/inactive colour.
 */

type IconName = ComponentProps<typeof Ionicons>['name']

type IconProps = {
  /** Supplied by the tab navigator, already resolved to active/inactive. */
  color: ColorValue
  /** Filled when the tab is focused, outlined when it is not. */
  focused?: boolean
}

const SIZE = 24

function icon(filled: IconName, outline: IconName) {
  return function TabIcon({ color, focused = false }: IconProps) {
    return <Ionicons name={focused ? filled : outline} size={SIZE} color={color as string} />
  }
}

export const HomeIcon = icon('home', 'home-outline')
export const TripsIcon = icon('briefcase', 'briefcase-outline')
/** Services: a wrapped gift, which is what offering a couch or a coffee is. */
export const ServicesIcon = icon('gift', 'gift-outline')
export const ConnectionsIcon = icon('people', 'people-outline')
export const ProfileIcon = icon('person', 'person-outline')
export const SettingsIcon = icon('settings', 'settings-outline')
export const BellIcon = icon('notifications', 'notifications-outline')
