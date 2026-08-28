import { StyleSheet, View, type ColorValue } from 'react-native'

import { useTheme } from '@/theme/use-theme'

/**
 * Tab bar glyphs.
 *
 * Drawn from primitives rather than pulled from an icon set, for the same
 * reason the rest of the kit is hand-built: three icons is not worth a font
 * dependency, and these inherit the tab bar's active/inactive colour without a
 * second source of truth. Each renders on a 24×24 box so the three line up.
 */

type IconProps = {
  /** Supplied by the tab navigator, already resolved to active/inactive. */
  color: ColorValue
  /** Filled when the tab is focused, outlined when it is not. */
  focused: boolean
}

const SIZE = 24

export function HomeIcon({ color, focused }: IconProps) {
  return (
    <View style={styles.box}>
      {/* Roof, as a bottom-anchored triangle via the border trick — there is no
          SVG runtime in this app. */}
      <View
        style={[
          styles.roof,
          { borderBottomColor: color },
        ]}
      />
      <View
        style={[
          styles.house,
          focused
            ? { backgroundColor: color, borderColor: color }
            : { borderColor: color },
        ]}
      />
    </View>
  )
}

export function ProfileIcon({ color, focused }: IconProps) {
  return (
    <View style={styles.box}>
      <View
        style={[
          styles.head,
          focused ? { backgroundColor: color, borderColor: color } : { borderColor: color },
        ]}
      />
      <View
        style={[
          styles.shoulders,
          focused ? { backgroundColor: color, borderColor: color } : { borderColor: color },
        ]}
      />
    </View>
  )
}

export function SettingsIcon({ color, focused }: IconProps) {
  // Two sliders. A gear reads better at this size but cannot be drawn without
  // paths; sliders survive the primitive treatment intact.
  return (
    <View style={styles.box}>
      <Slider color={color} focused={focused} knobOffset={5} top={6} />
      <Slider color={color} focused={focused} knobOffset={13} top={15} />
    </View>
  )
}

function Slider({
  color,
  focused,
  knobOffset,
  top,
}: IconProps & { knobOffset: number; top: number }) {
  const theme = useTheme()

  return (
    <View style={[styles.track, { top, backgroundColor: color }]}>
      {/* The knob is opaque either way, so the track does not show through it. */}
      <View
        style={[
          styles.knob,
          { left: knobOffset, borderColor: color },
          { backgroundColor: focused ? color : theme.bg },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE },

  roof: {
    position: 'absolute',
    top: 3,
    left: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  house: {
    position: 'absolute',
    top: 11,
    left: 4,
    width: 16,
    height: 10,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },

  head: {
    position: 'absolute',
    top: 3,
    left: 7,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  shoulders: {
    position: 'absolute',
    top: 15,
    left: 3,
    width: 18,
    height: 12,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2,
    borderBottomWidth: 0,
  },

  track: {
    position: 'absolute',
    left: 2,
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  knob: {
    position: 'absolute',
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
})
