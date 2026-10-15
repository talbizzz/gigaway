import { isValidPhoneNumber } from "@gigaway/shared";
import { useRouter } from "expo-router";
import { useState } from "react";

import { PhoneField } from "@/components/phone-field";
import { WizardStep } from "@/components/wizard-step";
import {
  PROFILE_STEPS,
  useOnboardingDraft,
} from "@/features/onboarding/draft-store";

/**
 * A phone number is required because it is the whole point of the reveal: an
 * accepted offer hands the two of them each other's number, and a member with
 * no number to hand over can be accepted and still be unreachable. It is simply
 * their personal number; how the other person uses it (a call, a text, any
 * messaging app tied to it) is up to them.
 */
export default function ProfilePhoneStep() {
  const router = useRouter();
  const draft = useOnboardingDraft((state) => state.profile);
  const setProfile = useOnboardingDraft((state) => state.setProfile);
  const [phone, setPhone] = useState(draft.phone);

  const valid = isValidPhoneNumber(phone);

  return (
    <WizardStep
      step={2}
      total={PROFILE_STEPS}
      title="Your phone number"
      hint="Your personal number. An accepted offer is the only time anyone else sees it, together with your email."
      canContinue={valid}
      onContinue={() => {
        setProfile({ phone });
        router.push("/(onboarding)/profile/neighbourhood");
      }}
    >
      <PhoneField
        label="Number"
        value={phone}
        onChange={setPhone}
        error={
          phone.length > 0 && !valid
            ? "That number doesn’t look right."
            : undefined
        }
      />
    </WizardStep>
  );
}
