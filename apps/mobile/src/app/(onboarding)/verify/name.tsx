import { useRouter } from "expo-router";
import { useState } from "react";

import { TextLink } from "@/components/button";
import { Callout } from "@/components/callout";
import { TextField } from "@/components/text-field";
import { WizardStep } from "@/components/wizard-step";
import {
  useOnboardingDraft,
  VERIFICATION_STEPS,
} from "@/features/onboarding/draft-store";
import { useMyApplication } from "@/features/verification/use-verification";
import { supabase } from "@/lib/supabase";

/**
 * The first question of the application, reached from the introduction screen
 * (which explains what verification is and why), or straight from the gate for
 * a member whose last application was rejected.
 */
export default function VerifyNameStep() {
  const router = useRouter();
  const { data: application } = useMyApplication();
  const draft = useOnboardingDraft((state) => state.verification);
  const setVerification = useOnboardingDraft((state) => state.setVerification);
  const [fullLegalName, setFullLegalName] = useState(draft.fullLegalName);

  const valid = fullLegalName.trim().length >= 2;

  console.log(application);

  return (
    <WizardStep
      step={1}
      total={VERIFICATION_STEPS}
      title="Your full legal name"
      hint="So we can match it to the ID in your selfie."
      canContinue={valid}
      onContinue={() => {
        setVerification({ fullLegalName: fullLegalName.trim() });
        router.push("/(onboarding)/verify/selfie");
      }}
      footerExtra={
        <TextLink label="Sign out" onPress={() => supabase.auth.signOut()} />
      }
    >
      {application?.status === "rejected" ? (
        <>
          <Callout tone="warning" title="Your last application wasn't approved">
            You can apply again below
          </Callout>
          <Callout tone="warning" title="Reasons for rejection">
            {application.decision_reason ??
              "We weren't able to confirm your professional background from what was submitted."}
          </Callout>
        </>
      ) : null}

      <TextField
        label="Full legal name"
        value={fullLegalName}
        onChangeText={setFullLegalName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="As printed on your ID"
        hint="Exactly as it appears on the ID in your selfie."
      />
    </WizardStep>
  );
}
