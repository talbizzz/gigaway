import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Community guidelines.
 *
 * Apple's Guideline 1.2 requires social apps to publish the standard they hold
 * people to, alongside block and report. This screen is that standard, and it
 * is linked from the report flow so somebody deciding whether to report can
 * read what the rules actually are.
 *
 * DRAFT COPY. The wording below is a working draft written to make the screen
 * real and reviewable; the final text is a Milestone 0 deliverable and has to
 * match the published guidelines and the terms of service word for word before
 * launch. Do not ship this to the store without that pass.
 */

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'This is a professional network, not a marketplace',
    body:
      'No money changes hands on GigAway — not for a couch, not for a room, not as a ' +
      '"contribution". If somebody asks you to pay, report it. Offering hospitality is ' +
      'a favour between colleagues, and it stops working the moment it has a price.',
  },
  {
    title: 'Be who you say you are',
    body:
      'Every member is verified as a working or training performing artist, and every ' +
      'member is traceable to whoever vouched for them. Use your real name and a real ' +
      'photograph. Do not pass your account to anyone else, and do not bring a guest ' +
      'your host has not agreed to.',
  },
  {
    title: 'Say what you mean about dates',
    body:
      'Offer only the nights you can genuinely host, and cancel as early as you can if ' +
      'something changes. A colleague who has turned down a hotel is relying on you. ' +
      'Half a stay offered honestly is worth far more than a whole one withdrawn late.',
  },
  {
    title: "Respect the house you're in",
    body:
      'Read the constraints a host has posted and take them seriously — women only, no ' +
      'pets, no smoking, quiet household. Ask before you use anything. Leave the place ' +
      'as you found it. You are a guest in somebody\'s home, not a customer in a hotel.',
  },
  {
    title: 'Nobody owes you anything beyond what was agreed',
    body:
      'A couch is a couch. It is not an introduction, an audition, a lift to the airport ' +
      'or a professional favour. Do not use hospitality as leverage, and do not use ' +
      'GigAway to solicit work, students or clients.',
  },
  {
    title: 'Harassment ends membership',
    body:
      'Unwanted advances, pressure of any kind, slurs, and threats have no place here. ' +
      'This applies to conversations that begin on GigAway and continue somewhere else. ' +
      'Report it — we act on reports, and we would rather lose a member than keep one ' +
      'who makes people unsafe.',
  },
  {
    title: 'Reviews are honest, attributed and about the stay',
    body:
      'Write what actually happened, in a way that would help the next colleague decide. ' +
      'Neither review is published until you have both written one or two weeks have ' +
      'passed, so you can be candid without worrying about retaliation. Reviews are not ' +
      'the place to settle something unrelated.',
  },
  {
    title: 'Keep private things private',
    body:
      'Contact details are shared with you for one purpose: arranging a stay. Addresses ' +
      'are never stored by GigAway and should not be shared onwards. Do not photograph ' +
      "somebody's home or post about where they live.",
  },
]

export default function GuidelinesScreen() {
  const theme = useTheme()

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Community guidelines' }} />

      <Text style={[typography.title, { color: theme.text }]}>
        How this works between colleagues
      </Text>

      <Text style={[typography.body, { color: theme.textMuted }]}>
        GigAway only functions because the people in it behave like professionals who
        expect to meet again. These are the standards we hold members to, and the basis on
        which we suspend and remove accounts.
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>{section.title}</Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>{section.body}</Text>
        </View>
      ))}

      <Callout title="Reporting something">
        Open the member's profile and choose "Report a concern". Only a moderator sees it,
        and the person you report is never told. If you are in immediate danger, contact
        your local emergency services first.
      </Callout>
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
})
