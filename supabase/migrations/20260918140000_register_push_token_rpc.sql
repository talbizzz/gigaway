-- Corrects 20260918120000_fix_push_token_reassignment.sql, which did not
-- actually fix the bug it targeted.
--
-- WHAT WAS WRONG WITH THE EARLIER FIX
--
-- That migration loosened push_tokens_update_own's USING clause to `true`,
-- reasoning that WITH CHECK alone was enough to gate the result. Confirmed
-- directly against the live database (not just by re-reading the SQL) that
-- this was insufficient: for UPDATE, Postgres requires the PRE-EXISTING row
-- to pass a SELECT-type policy's USING clause before the UPDATE policy's own
-- USING/WITH CHECK are even considered. push_tokens_select_own still reads
-- `profile_id = auth.uid()`, so a row already owned by a different profile
-- stays invisible for the update regardless of what the UPDATE policy says —
-- confirmed by testing: adding a permissive SELECT policy made the exact
-- same UPDATE succeed; the USING(true) change on its own did not.
--
-- THE ACTUAL FIX
--
-- Loosening the SELECT policy itself would fix it, but that makes every
-- member's token string and platform readable by every other authenticated
-- user via a plain `select * from push_tokens` — a real regression, not a
-- narrow one. RLS cannot express "visible only via this one specific write
-- path" — so, matching how every other cross-cutting write in this schema
-- works (redeem_invite, accept_offer, submit_report, ...), the reassignment
-- moves into a SECURITY DEFINER function that bypasses RLS internally under
-- its own, narrower logic: register_push_token() always claims the row for
-- auth.uid(), and does the ownership check by construction rather than by
-- policy.
--
-- registerForPush() in apps/mobile/src/lib/push.ts now calls this RPC
-- instead of upserting the table directly. touchPushToken() and
-- unregisterPush() keep using plain client updates — both only ever touch a
-- row the caller already owns, which push_tokens_update_own (reverted to its
-- original, correctly-scoped form below) already allows.

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_tokens (profile_id, token, platform, last_seen_at, invalidated_at)
  values ((select auth.uid()), p_token, p_platform, now(), null)
  on conflict (token) do update set
    profile_id     = excluded.profile_id,
    platform       = excluded.platform,
    last_seen_at   = excluded.last_seen_at,
    invalidated_at = excluded.invalidated_at;
end;
$$;

comment on function public.register_push_token is
  'The only way a device''s token is created or reassigned. SECURITY DEFINER '
  'specifically so it can claim a row currently owned by a different profile '
  '— the case a device''s token needs to handle every time a different '
  'account signs in on it — which plain RLS on push_tokens cannot express '
  'without making other members'' tokens broadly readable. Always claims for '
  'auth.uid(); there is no parameter for whose profile it is.';

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Revert: USING(true) here did not fix the reassignment case (see above), and
-- was never needed for anything else — touchPushToken() and unregisterPush()
-- only ever touch a row the caller already owns.
drop policy if exists push_tokens_update_own on public.push_tokens;

create policy push_tokens_update_own
  on public.push_tokens for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Creation and reassignment both go through register_push_token() now;
-- direct client inserts are no longer part of the design.
drop policy if exists push_tokens_insert_own on public.push_tokens;
revoke insert on public.push_tokens from authenticated;
