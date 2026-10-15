import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, TextLink } from "@/components/button";
import { TextField } from "@/components/text-field";
import { WizardStep } from "@/components/wizard-step";
import {
  useOnboardingDraft,
  VERIFICATION_STEPS,
} from "@/features/onboarding/draft-store";
import {
  pickCv,
  type PickedCv,
} from "@/features/verification/use-verification";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/** Prefixes a bare domain with https://. Leaves an already-protocoled value alone. */
function withProtocol(value: string): string {
  if (!value || /^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/**
 * An attached CV or an added link, with a way to take it back out.
 *
 * The label sits in its own flexible box and Remove in one that cannot shrink.
 * Putting flex on the Text alone is not enough: a long URL is measured at the
 * full width of the row, so it ellipsises there and Remove is pushed past the
 * edge. The label's box is what gives the text a width that already leaves room
 * for Remove.
 */
function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
      ]}
    >
      <View style={styles.chipLabel}>
        <Text
          style={[typography.body, { color: theme.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {text}
        </Text>
      </View>
      <View style={styles.chipAction}>
        <TextLink label="Remove" onPress={onRemove} />
      </View>
    </View>
  );
}

/**
 * Proof of being a performing artist: a CV, or links to work, or both. At least
 * one is required. This is a single question with several parts, so it is one
 * screen rather than one per field.
 */
export default function VerifyProofStep() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useOnboardingDraft((state) => state.verification);
  const setVerification = useOnboardingDraft((state) => state.setVerification);

  const [cv, setCv] = useState<PickedCv | null>(draft.cv);
  const [links, setLinks] = useState<string[]>(draft.links);
  const [linkDraft, setLinkDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only what has actually been added counts: a CV, or a link the member has
  // tapped Add on. Text still sitting in the box is not proof yet.
  const canContinue = Boolean(cv) || links.length > 0;

  const addLink = () => {
    const value = withProtocol(linkDraft.trim());
    if (!value) return;
    setLinks((current) => [...current, value]);
    setLinkDraft("");
  };

  const attachCv = async () => {
    setError(null);
    try {
      const picked = await pickCv();
      if (picked) setCv(picked);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not attach that file.",
      );
    }
  };

  return (
    <WizardStep
      step={3}
      total={VERIFICATION_STEPS}
      title="Proof you're an artist"
      hint="A CV, or links to your portfolio, projects, social profiles or videos. At least one."
      canContinue={canContinue}
      onContinue={() => {
        setVerification({ cv, links });
        router.push("/(onboarding)/verify/note");
      }}
      error={error}
    >
      {cv ? (
        <Chip text={cv.name} onRemove={() => setCv(null)} />
      ) : (
        <Button label="Attach a PDF" variant="secondary" onPress={attachCv} />
      )}

      {links.map((link) => (
        <Chip
          key={link}
          text={link}
          onRemove={() =>
            setLinks((current) => current.filter((l) => l !== link))
          }
        />
      ))}

      <View style={styles.linkRow}>
        {/* The field's own container has no width, so on its own it is as wide as
            its text and keeps growing as the member types. This wrapper takes
            whatever the Add button leaves, and minWidth 0 stops long text from
            pushing it wider than that. */}
        <View style={styles.linkField}>
          <TextField
            label="Add a link"
            value={linkDraft}
            onChangeText={(next) => {
              // Only the empty→non-empty transition gets a protocol injected, so
              // pasting a full URL is never double-prefixed and backspacing
              // doesn't fight the member trying to clear the field.
              setLinkDraft(
                linkDraft === "" && next !== "" ? withProtocol(next) : next,
              );
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://…"
          />
        </View>
        <Button label="Add" variant="secondary" onPress={addLink} />
      </View>

      {linkDraft.trim() ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          Tap Add to keep this link.
        </Text>
      ) : null}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  chipLabel: { flex: 1, minWidth: 0 },
  chipAction: { flexShrink: 0 },
  linkRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  linkField: { flex: 1, minWidth: 0 },
});
