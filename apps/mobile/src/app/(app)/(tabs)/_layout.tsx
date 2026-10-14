import { Tabs } from "expo-router";

import { AppHeader } from "@/components/app-header";
import { FloatingTabBar, useBarClearance } from "@/components/floating-tab-bar";
import {
  ConnectionsIcon,
  HomeIcon,
  ProfileIcon,
  ServicesIcon,
  TripsIcon,
} from "@/components/tab-icon";
import { useTheme } from "@/theme/use-theme";

/**
 * The places a member lives in. Everything else — trips, requests, reviews,
 * whoever they are looking at — is pushed onto the stack above these, so the
 * bar stays out of the way once you are deep in a flow.
 *
 * The bar is its own island, lifted off the bottom edge and rounded, rather than
 * a strip glued to it. Being absolutely positioned it no longer takes space from
 * the screens, so each scene is padded by the room it covers.
 *
 * The titles below are what AppHeader puts in the middle of the bar, which is
 * why they live here rather than in each screen: under a tab navigator a
 * screen's own <Stack.Screen> is addressing the wrong navigator.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { scenePadding } = useBarClearance();

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          // The one place in the app with a header, and it is ours rather than
          // the navigator's: a title flanked by the bell and settings.
          header: ({ options }) => <AppHeader title={options.title} />,
          sceneStyle: { backgroundColor: theme.bg, paddingBottom: scenePadding },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "GigAway",
            tabBarLabel: "Home",
            tabBarIcon: ({ color, focused }) => (
              <HomeIcon color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            title: "Your trips",
            tabBarLabel: "Trips",
            tabBarIcon: ({ color, focused }) => (
              <TripsIcon color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="services"
          options={{
            title: "Your services",
            tabBarLabel: "Services",
            tabBarIcon: ({ color, focused }) => (
              <ServicesIcon color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: "Connections",
            tabBarLabel: "Connections",
            tabBarIcon: ({ color, focused }) => (
              <ConnectionsIcon color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Your profile",
            tabBarLabel: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <ProfileIcon color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
