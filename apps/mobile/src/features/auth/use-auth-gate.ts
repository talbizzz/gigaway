import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { useSessionStore } from "@/features/auth/session-store";
import {
  isContactComplete,
  useMyContactDetails,
} from "@/features/contacts/use-contacts";
import {
  isProfileComplete,
  useMyProfile,
} from "@/features/profile/use-profile";

/**
 * Decides which part of the app a user may be in, based on session and
 * verification state:
 *
 *   no session                    → (auth)
 *   session, status ≠ approved    → (onboarding)/verify
 *   approved, profile incomplete  → (onboarding)/profile
 *   approved, profile complete    → (app)
 *
 * "Complete" spans two tables: the profile row, and the WhatsApp number in
 * contact_details. Both are what another member needs before they can decide
 * to host someone and then actually reach them, so both hold a member in
 * onboarding.
 *
 * Routing on `status` rather than on a client flag means the verification wall
 * cannot be walked around by manipulating local state — a profile that is not
 * `approved` can read no member content regardless of which screen is showing.
 */
export function useAuthGate(): { ready: boolean } {
  const router = useRouter();
  const segments = useSegments();

  const session = useSessionStore((state) => state.session);
  const initialised = useSessionStore((state) => state.initialised);
  const { data: profile, isPending: profilePending } = useMyProfile();
  const { data: contact, isPending: contactPending } = useMyContactDetails();

  // Wait for the persisted session to load, and for the profile of a signed-in
  // user, before redirecting. Navigating early causes a visible flash through
  // the sign-in screen on every cold start.
  const ready =
    initialised && (!session || (!profilePending && !contactPending));

  useEffect(() => {
    if (!ready) return;

    // Typed routes narrow `segments` to per-route tuples; the gate only cares
    // about the group and the leaf, so read it as plain strings. Read the leaf
    // from the end rather than by index: inside (app) the tab group adds a
    // segment, so the screen is not always at a fixed depth.
    const path = segments as readonly (string | undefined)[];
    const group = path[0];
    const screen = path[path.length - 1];
    const inAuth = group === "(auth)";
    const inOnboarding = group === "(onboarding)";
    const inApp = group === "(app)";

    if (!session) {
      if (!inAuth) router.replace("/sign-in");
      return;
    }

    // A signed-in user whose profile row has not arrived yet — leave them be
    // rather than bouncing them somewhere wrong.
    if (!profile) return;

    if (profile.status !== "approved") {
      if (!inOnboarding) router.replace("/verify");
      return;
    }

    if (!isProfileComplete(profile) || !isContactComplete(contact)) {
      // Addressed through the group, because /profile alone is ambiguous —
      // there is a profile screen in onboarding and another in the tab bar.
      if (screen !== "profile") router.replace("/(onboarding)/profile");
      return;
    }

    if (!inApp) router.replace("/");
  }, [ready, session, profile, contact, segments, router]);

  return { ready };
}
