import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * The first thing an unauthenticated visitor sees.
 *
 * Landing straight on a sign-in form asks people to fill in a password before
 * they have been told what the app is, and quietly hides the sign-up path
 * behind a link under the button. This separates the choice from the form.
 *
 * The invite-only line is here on purpose. Someone without an invite will be
 * stopped at verification either way; saying so before they fill in a form is
 * kinder than saying it after.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      scroll={false}
      background={require("@/assets/images/auth-singers.webp")}
      footer={
        <>
          <Button
            label="Create an account"
            onPress={() => router.push("/sign-up")}
          />
          <Button
            label="Sign in"
            variant="secondary"
            onPress={() => router.push("/sign-in")}
          />
        </>
      }
    >
      {/* Pushes the wordmark off the top edge and lets the buttons sit low,
          rather than crowding everything against the status bar. */}
      <View style={styles.spacer} />

      <View style={styles.header}>
        <Text
          style={[
            typography.display,
            { color: theme.text, fontSize: 50, lineHeight: 50 },
          ]}
        >
          GigAway
        </Text>
        <Text style={[typography.title, { color: theme.accent }]}>
          A couch, a colleague, a city you don't know yet.
        </Text>
      </View>

      <Text
        style={[
          typography.body,
          { color: theme.textMuted, marginTop: spacing.lg },
        ]}
      >
        Post a trip, and find verified colleagues in that city with a spare
        couch, local knowledge, or company. No money changes hands.
      </Text>

      <Text
        style={[
          typography.caption,
          { color: theme.textFaint, marginTop: spacing.md },
        ]}
      >
        GigAway is invite-only. You will need an invite from a member, or an
        approved application, to take part.
      </Text>

      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  header: { gap: spacing.sm },
});
