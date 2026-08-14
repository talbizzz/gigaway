import type { ExpoConfig } from 'expo/config'

/**
 * Bundle identifiers are claimed in Milestone 0 / 5 with the store accounts.
 * `scheme` backs the gigaway:// deep link; the https:// universal-link
 * association is configured in Milestone 5 once the domain is live.
 */
const config: ExpoConfig = {
  name: 'GigAway',
  slug: 'gigaway',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'gigaway',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.gigaway.mobile',
  },
  android: {
    package: 'app.gigaway.mobile',
    adaptiveIcon: {
      backgroundColor: '#101418',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#101418',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
}

export default config
