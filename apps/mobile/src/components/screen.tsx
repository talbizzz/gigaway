import { Image, type ImageSource } from 'expo-image'
import { type ReactNode, useState } from 'react'
import { Platform, StyleSheet, useColorScheme, View, type ViewStyle } from 'react-native'
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

type ScreenProps = {
  children: ReactNode
  /** Scrollable by default; set false for screens that manage their own list. */
  scroll?: boolean
  /** Pins content to the bottom of the available space, e.g. a primary action. */
  footer?: ReactNode
  contentStyle?: ViewStyle
  /**
   * Full-bleed artwork behind the content.
   *
   * The assets are extended into a portrait canvas so `cover` crops about 13%
   * of the width rather than the ~65% a landscape source would lose on a tall
   * phone. Opacity is set per theme below rather than baked in, so one file
   * serves both.
   */
  background?: ImageSource
  /**
   * Set when the navigator draws a transparent header above this screen. The
   * header then floats over the content instead of taking layout space, so the
   * content has to clear it itself or the first heading sits under the back
   * button.
   */
  floatingHeader?: boolean
}

export function Screen({
  children,
  scroll = true,
  footer,
  contentStyle,
  background,
  floatingHeader = false,
}: ScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const scheme = useColorScheme()

  // Normally the top inset belongs to the navigator: a screen with a header
  // already sits below the status bar, one without it does not, and only the
  // layout knows which it drew.
  //
  // A full-bleed screen is the exception. The navigator's padding sits OUTSIDE
  // this component, so artwork rendered here can never reach into it — you get
  // a solid band across the status bar. So when there is a background, the
  // layout drops its padding and the inset is applied to the content instead,
  // leaving the image free to fill the whole screen.
  // Measured rather than assumed: the footer holds one button on some screens
  // and three on others, and the scroll view needs its real height to keep a
  // focused field clear of it.
  const [footerHeight, setFooterHeight] = useState(0)

  const insetTop = background ? insets.top : 0

  // expo-router vendors react-navigation privately, so useHeaderHeight cannot
  // be imported without reaching into build internals. These are the platform
  // defaults for a header with no large title, which is what this app draws.
  const headerOffset = floatingHeader ? (Platform.OS === 'ios' ? 44 : 56) : 0

  const body = scroll ? (
    <KeyboardAwareScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: spacing.xl + insetTop + headerOffset },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Clearance kept between the focused field and the keyboard. The footer
      // sticks above the keyboard, so it has to be counted too or the field is
      // revealed only to sit behind the button.
      bottomOffset={footerHeight + spacing.lg}
    >
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View
      style={[
        styles.content,
        styles.flex,
        { paddingTop: spacing.xl + insetTop + headerOffset },
        contentStyle,
      ]}
    >
      {children}
    </View>
  )

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      {background ? (
        <Image
          source={background}
          style={[
            StyleSheet.absoluteFill,
            // The illustrations are bright gold, and the accent text is brass —
            // so on the dark theme the artwork has to sit well back or the
            // tagline stops separating from its own background.
            { opacity: scheme === 'dark' ? 0.18 : 0.35 },
          ]}
          contentFit="cover"
          pointerEvents="none"
          accessible={false}
        />
      ) : null}
      {body}
      {footer ? (
        // Rides above the keyboard instead of being buried by it. `opened` is
        // added to a negative translation, so a positive value moves the footer
        // back down — cancelling the safe-area padding, which is redundant once
        // the keyboard occupies that strip.
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            style={[
              styles.footer,
              {
                // Transparent over artwork, so the illustration runs to the
                // bottom edge instead of stopping at a hard line. The primary
                // button is solid and the secondary one is outlined, so both
                // still read against it.
                backgroundColor: background ? 'transparent' : theme.bg,
                borderTopColor: background ? 'transparent' : theme.border,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
})
