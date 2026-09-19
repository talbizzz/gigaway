-- Fixes push token registration failing with a 42501 whenever a device that
-- previously registered under one profile signs in as a different one — the
-- exact case of testing multiple accounts on one phone, or a shared/handed-
-- down device.
--
-- registerForPush() in apps/mobile/src/lib/push.ts upserts on `token`, not on
-- `profile_id`, because Expo push tokens are keyed by device: `onConflict:
-- 'token'`. When device D's token is already owned by profile A and profile B
-- signs in on the same device, that upsert becomes an UPDATE of A's existing
-- row — which push_tokens_update_own's USING clause rejected, because it
-- required the row to ALREADY belong to the caller before allowing the
-- update at all. That is backwards for a token: the token belongs to the
-- device, and the device's current owner is whoever is signed in on it now.
--
-- The fix drops the ownership requirement from USING and leaves it entirely
-- to WITH CHECK, which already requires the row to belong to the caller
-- AFTER the update. That still fully protects every other UPDATE in the
-- codebase: touchPushToken() updates last_seen_at only, without touching
-- profile_id, so on a row it does not own, profile_id stays somebody else's
-- and WITH CHECK correctly rejects it — USING(true) alone never lets an
-- unrelated update through. The only thing this newly permits is exactly the
-- reassignment registerForPush() needs: claiming a token row by setting
-- profile_id to the caller's own id, which is precisely what its upsert
-- payload already does.
drop policy push_tokens_update_own on public.push_tokens;

create policy push_tokens_update_own
  on public.push_tokens for update
  to authenticated
  using (true)
  with check (profile_id = (select auth.uid()));

comment on policy push_tokens_update_own on public.push_tokens is
  'USING is deliberately unrestricted — WITH CHECK is the real gate. A token '
  'row must end up owned by the caller, but may start out owned by anybody: '
  'that is what lets a device''s token transfer to whoever signs in on it '
  'next, which registerForPush''s upsert-on-token does routinely.';
