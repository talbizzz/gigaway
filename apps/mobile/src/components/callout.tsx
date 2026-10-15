import { Children, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type Tone = "neutral" | "success" | "warning" | "danger";

/**
 * A block of explanatory or status text. Used heavily for the states this
 * product has a lot of — pending verification, expired documents, empty
 * results — where the wording is doing real work and must not read as an error.
 */
/**
 * True when the children are only text. JSX such as `in {city} that fits` is not
 * one string but several (the words, the value, the words), so checking for a
 * single string is not enough: those pieces would reach React Native outside a
 * <Text>, which refuses them ("Text strings must be rendered within a <Text>
 * component") and shows nothing, leaving an empty box.
 */
function isPlainText(children: ReactNode): boolean {
  return Children.toArray(children).every(
    (child) => typeof child === "string" || typeof child === "number",
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  const surface: Record<Tone, { backgroundColor: string; color: string }> = {
    neutral: { backgroundColor: theme.bgSubtle, color: theme.text },
    success: { backgroundColor: theme.successSubtle, color: theme.success },
    warning: { backgroundColor: theme.warningSubtle, color: theme.warning },
    danger: { backgroundColor: theme.dangerSubtle, color: theme.danger },
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: surface[tone].backgroundColor },
      ]}
    >
      {title ? (
        <Text style={[typography.bodyStrong, { color: surface[tone].color }]}>
          {title}
        </Text>
      ) : null}
      {isPlainText(children) ? (
        <Text style={[typography.body, { color: theme.textMuted }]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
});
