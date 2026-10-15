import type { Tabs } from "expo-router";
import { useEffect, useState, type ComponentProps } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** expo-router does not re-export react-navigation's prop type, so derive it. */
type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

export const BAR_HEIGHT = 64;
const BAR_SIDE_MARGIN = spacing.lg;

/** Gap between the sliding pill and the bar's edge, all the way round. */
const PILL_INSET = 6;

/** How far the bar sits off the bottom edge, which the scenes must clear. */
export function useBarClearance() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.md);
  return { bottom, scenePadding: BAR_HEIGHT + bottom + spacing.sm };
}

/**
 * The tab bar as its own island.
 *
 * The current tab is marked by one glass pill that slides to whichever tab is
 * pressed. It sits a few points inside the bar, with the same rounding, so at
 * either end it stays concentric with the bar's own curve instead of poking
 * out — which a per-tab background colour cannot do, because each tab is a
 * rectangle.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const theme = useTheme();
  const dark = useColorScheme() === "dark";
  const { bottom } = useBarClearance();

  const count = state.routes.length;
  const [width, setWidth] = useState(0);
  const itemWidth = width / count;

  const [slide] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: state.index,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide, state.index]);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.bar,
        {
          bottom,
          backgroundColor: theme.bgSubtle,
          borderColor: theme.border,
        },
      ]}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: itemWidth - PILL_INSET * 2,
              // Frosted glass: a translucent wash with a bright rim. There is
              // no blur behind it — that needs a native module — so the rim and
              // the wash do the work.
              backgroundColor: dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.75)',
              borderColor: dark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.95)',
              transform: [{ translateX: Animated.add(Animated.multiply(slide, itemWidth), PILL_INSET) }],
            },
          ]}
        />
      ) : null}

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const focused = state.index === index;
        const color = focused ? theme.text : theme.textMuted;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented)
            navigation.navigate(route.name, route.params);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              options.tabBarAccessibilityLabel ?? options.title
            }
            onPress={onPress}
            style={styles.item}
          >
            {options.tabBarIcon?.({ focused, color, size: 24 })}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: BAR_SIDE_MARGIN,
    right: BAR_SIDE_MARGIN,
    height: BAR_HEIGHT,
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    // Clips the sliding pill to the bar's rounded ends. Costs the shadow on
    // Android, which is drawn by elevation outside the clip anyway.
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  indicator: {
    position: "absolute",
    top: PILL_INSET,
    bottom: PILL_INSET,
    left: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
});
