import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, TextLink } from "@/components/button";
import { Callout } from "@/components/callout";
import { Screen } from "@/components/screen";
import { supabase } from "@/lib/supabase";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const NEEDED = [
  "Your full legal name, as printed on your ID",
  "A selfie of you holding that ID. We tell you how to hold it.",
  "A CV, or links to your work",
  "Optionally, a short note for the person reading it",
] as const;

/**
 * Where a new member lands after registering, before any question is asked.
 *
 * Verification is the part of GigAway people are least expecting and most
 * wary of, so it gets one screen to say what it is, why it exists, what it
 * needs and what happens to it, before the first field. The facts here are the
 * ones in the privacy policy (section 3.3); if they change there, change them
 * here.
 */
export default function VerifyIntro() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen
      footer={
        <>
          <Button
            label="Start verification"
            onPress={() => router.push("/(onboarding)/verify/name")}
          />
          <TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />
        </>
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>
          Let's verify you
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          GigAway is a closed network of working performers. Members open their
          homes to each other, so a real person checks every account before it
          can see anyone else's.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>
          Why we do this
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          A colleague who offers you a couch is trusting you with their keys.
          Knowing that everyone in the network has been checked is what makes
          that a reasonable thing to do.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>
          What you'll need
        </Text>
        <View style={styles.list}>
          {NEEDED.map((item, index) => (
            <View key={item} style={styles.row}>
              <View
                style={[styles.number, { backgroundColor: theme.accentSubtle }]}
              >
                <Text
                  style={[typography.captionStrong, { color: theme.accent }]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[typography.body, styles.rowText, { color: theme.text }]}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          It takes about five minutes. Have your ID with you.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[typography.heading, { color: theme.text }]}>
          What happens next
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Someone on our team reads your application, usually within a day or
          two, and we email you the decision. While you wait you can already
          look around and post your trips. Asking for a stay opens up once
          you're approved.
        </Text>
      </View>

      <Callout title="Your documents stay private">
        Only our verification team can see your selfie, ID and CV. Nobody else
        in the network can, and nothing is matched automatically: a person looks
        at the photo. They are deleted after you delete your account.
      </Callout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  section: { gap: spacing.sm },
  list: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
});
