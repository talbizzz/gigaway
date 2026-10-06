import { useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useSessionStore } from "@/features/auth/session-store";
import { supabase } from "@/lib/supabase";
import {
  isContactComplete,
  useMyContactDetails,
} from "@/features/contacts/use-contacts";
import {
  isProfileComplete,
  useMyProfile,
} from "@/features/profile/use-profile";
import { memberAccessOf } from "@/features/verification/use-member-access";
import { useMyApplication } from "@/features/verification/use-verification";

/**
 * Decides which part of the app a user may be in, based on session and
 * verification state:
 *
 *   recovering (see below)        → (auth)/set-new-password
 *   no session                    → (auth)/welcome
 *   no application yet, or rejected → (onboarding)/verify
 *   verification in review, or approved:
 *     profile incomplete          → (onboarding)/profile
 *     profile complete            → (app)
 *
 * A member whose verification is in review gets the app too, with less in it:
 * see use-member-access.ts for exactly what, and the database for the real
 * enforcement. Rejection sends them back to the verify screens, where they can
 * apply again.
 *
 * "Recovering" is its own state, checked first, because a password-recovery
 * deep link produces a real session — without this the branches below would
 * read it as an ordinary sign-in and carry the user straight into the app
 * before they have set a new password. See session-store.ts.
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
  const isRecovering = useSessionStore((state) => state.isRecovering);
  const { data: profile, isPending: profilePending } = useMyProfile();
  const { data: contact, isPending: contactPending } = useMyContactDetails();
  const { data: application, isPending: applicationPending } =
    useMyApplication();
  const queryClient = useQueryClient();

  // Wait for the persisted session to load, and for the profile of a signed-in
  // user, before redirecting. Navigating early causes a visible flash through
  // the sign-in screen on every cold start.
  const ready =
    initialised &&
    (!session || (!profilePending && !contactPending && !applicationPending));

  // Approval arrives while the member is inside the app. Everything the
  // database held back from them while they were in review — matches, the feed,
  // other members' trips — is cached as empty, so refetch it all the moment the
  // status flips rather than leaving them looking at stale nothing.
  const previousStatus = useRef(profile?.status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = profile?.status;
    if (was && was !== "approved" && profile?.status === "approved") {
      void queryClient.invalidateQueries();
    }
  }, [profile?.status, queryClient]);

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

    // Checked before everything else — a recovery session is still a
    // session, and none of the branches below know to treat it differently.
    if (isRecovering) {
      if (screen !== "set-new-password") router.replace("/set-new-password");
      return;
    }

    if (!session) {
      if (!inAuth) router.replace("/welcome");
      return;
    }

    // A signed-in user whose profile row has not arrived yet — leave them be
    // rather than bouncing them somewhere wrong.
    if (!profile) return;

    // The account was removed, by the member or by an admin. The tombstone keeps
    // the profile row, so the token still works and the branches below would
    // send them to the verification wall. End the session here instead. Local
    // scope, so this does not depend on the network or on a server that has
    // already deleted the auth user.
    if (profile.status === "deleted") {
      useSessionStore.getState().markAccountRemoved();
      void supabase.auth.signOut({ scope: "local" });
      return;
    }

    const access = memberAccessOf(profile, application);

    if (access === "gated") {
      // Inside the verify screens, specifically: a member rejected while they
      // were in the profile setup must not be left there.
      const inVerify = inOnboarding && path[1] === "verify";
      if (!inVerify) router.replace("/verify");
      return;
    }

    if (!isProfileComplete(profile) || !isContactComplete(contact)) {
      // The profile setup is a folder of screens, so "inside it" is checked by
      // the folder segment. Checking the leaf screen name would send each step
      // back to the first one.
      const inProfileSetup = inOnboarding && path[1] === "profile";
      if (!inProfileSetup) router.replace("/(onboarding)/profile");
      return;
    }

    if (!inApp) router.replace("/");
  }, [ready, isRecovering, session, profile, contact, application, segments, router]);

  return { ready };
}
