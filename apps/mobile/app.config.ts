import type { ExpoConfig } from 'expo/config'

/**
 * Two variants, so a development build and the TestFlight/Play build can sit on
 * the same phone at once.
 *
 * iOS refuses to install a development-signed app over an App Store-signed one
 * with the same bundle identifier — it fails with ApplicationVerificationFailed,
 * which says nothing about the actual cause. Different identifiers avoid the
 * collision entirely, and mean you can compare the two side by side.
 *
 * Driven by APP_VARIANT, which scripts/with-env.sh exports from the chosen env
 * file. `.env.dev` sets it; `.env` does not, so production is the default and a
 * forgotten variable can never turn a store build into a dev one.
 *
 * `slug`, `owner` and the EAS project id stay fixed across variants — they
 * identify the project to EAS, not the artifact to the device.
 */
const isDev = process.env.APP_VARIANT === 'development'

const bundleId = isDev ? 'app.gigaway.mobile.dev' : 'app.gigaway.mobile'

/** Ink for production, brass for development — legible at icon size. */
const splashBackground = isDev ? '#D4A548' : '#101418'

const config: ExpoConfig = {
  name: isDev ? 'GigAway Dev' : 'GigAway',
  slug: 'gigaway',
  owner: 'talbiz',
  version: '0.1.0',
  orientation: 'portrait',
  icon: isDev ? './assets/images/icon-dev.png' : './assets/images/icon.png',
  // Separate scheme too: with one shared scheme, iOS gives gigaway:// links to
  // whichever app it feels like, and invite links start opening the wrong one.
  scheme: isDev ? 'gigaway-dev' : 'gigaway',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: bundleId,
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
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: splashBackground,
      foregroundImage: isDev
        ? './assets/images/android-icon-foreground-dev.png'
        : './assets/images/android-icon-foreground.png',
      backgroundImage: isDev
        ? './assets/images/android-icon-background-dev.png'
        : './assets/images/android-icon-background.png',
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
    // Restores DEVELOPMENT_TEAM after prebuild regenerates ios/. Reads
    // APPLE_TEAM_ID from the environment and no-ops without it.
    './plugins/with-development-team',
    [
      'expo-splash-screen',
      {
        backgroundColor: splashBackground,
        image: isDev ? './assets/images/splash-icon-dev.png' : './assets/images/splash-icon.png',
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
