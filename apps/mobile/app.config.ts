import type { ExpoConfig } from 'expo/config'

/**
 * Bundle identifiers are claimed in Milestone 0 / 5 with the store accounts.
 * `scheme` backs the gigaway:// deep link; the https:// universal-link
 * association is configured in Milestone 5 once the domain is live.
 */
const config: ExpoConfig = {
  name: 'GigAway',
  slug: 'gigaway',
  owner: 'talbiz',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'gigaway',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.gigaway.mobile',
    infoPlist: {
      /**
       * The app implements no cryptography of its own. All encryption is
       * Apple's, reached through Apple's APIs: HTTPS for transport, and the
       * Keychain via expo-secure-store for the stored auth session. That is
       * the exemption this key declares.
       *
       * Without it, App Store Connect blocks every build behind the export
       * compliance dialog and asks the same question again each time.
       */
      ITSAppUsesNonExemptEncryption: false,
    },
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
  /**
   * Written by hand because `eas init` cannot edit a TypeScript config.
   * Links the local project to the EAS project of the same name.
   */
  extra: {
    eas: {
      projectId: 'dec78d7e-9b70-4869-9a9e-63d61cae7879',
    },
  },
}

export default config
