import { Redirect } from 'expo-router'

/** The profile flow starts at its first question. The gate sends members here. */
export default function ProfileSetupIndex() {
  return <Redirect href="/(onboarding)/profile/city" />
}
