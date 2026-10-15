-- Keeps who a member was for a limited time after they delete their account.
--
-- THE PROBLEM. delete_account() erased everything that said who a member was:
-- login and email, contact details, legal name, the selfie and ID photo. The
-- reports, stays and reviews it deliberately kept pointed at an anonymous
-- "Deleted member", so someone reported for an infraction could delete their
-- account and sign up again with a fresh email, and nothing tied the two.
--
-- WHAT THIS DOES.
--   1. deletion_holds. Just before delete_account erases a member, a snapshot
--      of their identity (email, names, legal name, phone, links, and the paths
--      of the selfie and CV, which stay in Storage) is copied here. It is kept
--      for deletion_hold_days (30), or deletion_hold_reported_days (365) if
--      anyone has an open, reviewing or actioned report against them. A report
--      made against a held account extends it to the long period.
--   2. purge-deletion-holds. A daily job erases expired holds, files included.
--      Storage objects are not reachable from SQL, so it is an Edge Function.
--   3. conduct_bans. If a report against the member was ACTIONED, only
--      one-way fingerprints of their email and legal name are kept, with no
--      expiry. An application matching one is flagged to a human moderator in
--      the verification queue. Nothing is blocked automatically: the policy is
--      that no decision about a person is made by a machine.
--
-- WHO CAN SEE IT. Nobody through the API. deletion_holds and conduct_bans have
-- RLS on and no policies, and every grant is revoked; moderators read a hold
-- through admin_get_deletion_hold(), which checks is_admin().
--
-- The retention is a legitimate-interest decision (safety of members and legal
-- claims) and MUST be in the privacy policy before this ships.

insert into public.app_config (key, value) values
  ('deletion_hold_days',          '30'::jsonb),
  ('deletion_hold_reported_days', '365'::jsonb)
on conflict (key) do nothing;

create table if not exists public.deletion_holds (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  tier            text not null check (tier in ('standard', 'reported')),
  held_until      timestamptz not null,
  email           text,
  first_name      text,
  last_name       text,
  full_legal_name text,
  phone           text,
  whatsapp        text,
  links           jsonb,
  selfie_path     text,
  cv_path         text,
  created_at      timestamptz not null default now()
);

create index if not exists deletion_holds_expiry on public.deletion_holds (held_until);

comment on table public.deletion_holds is
  'Identity of a deleted member, kept until held_until and then erased by '
  'purge-deletion-holds. Not readable through the API; see admin_get_deletion_hold().';

create table if not exists public.conduct_bans (
  id                uuid primary key default gen_random_uuid(),
  email_hash        text,
  name_hash         text,
  source_profile_id uuid,
  created_at        timestamptz not null default now(),
  constraint conduct_bans_has_a_hash check (email_hash is not null or name_hash is not null)
);

comment on table public.conduct_bans is
  'One-way fingerprints of the email and legal name of a member removed after an '
  'actioned report. Matched against new applications to flag them to a moderator.';

alter table public.deletion_holds enable row level security;
alter table public.conduct_bans enable row level security;
revoke all on public.deletion_holds from anon, authenticated;
revoke all on public.conduct_bans from anon, authenticated;

-- ── fingerprints ──────────────────────────────────────────────────────────
-- Case and spacing do not matter ("Anna  Weber" = "anna weber"). One-way, but
-- not secret: a fingerprint of a guessable email can be checked by guessing it.
-- It exists so the readable details need not be kept, not to be unbreakable.
create or replace function public.fingerprint(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(p_value), '') is null then null
    else encode(sha256(convert_to(lower(regexp_replace(btrim(p_value), '\s+', ' ', 'g')), 'UTF8')), 'hex')
  end
$$;

create or replace function public.matches_conduct_ban(p_email text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conduct_bans b
    where (b.email_hash is not null and b.email_hash = public.fingerprint(p_email))
       or (b.name_hash  is not null and b.name_hash  = public.fingerprint(p_name))
  )
$$;

revoke all on function public.matches_conduct_ban(text, text) from public, anon, authenticated;
comment on function public.matches_conduct_ban is
  'A name can match by coincidence, so a match is a prompt for a human to look, never a decision.';

-- ── delete_account now takes the snapshot ─────────────────────────────────
create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
  v_email      text;
  v_legal_name text;
  v_reported   boolean;
  v_actioned   boolean;
  v_days       integer;
begin
  select photo_path into v_photo_path from public.profiles where id = p_user;

  -- ── the hold: keep who this was, for a limited time ─────────────────────
  -- Everything below erases the member, which also erases the only link
  -- between a retained report or stay and a real person. So first copy the
  -- identity into deletion_holds, where it waits out a short window (or a long
  -- one if anyone reported them) before purge-deletion-holds erases it, files
  -- included. Taken before anything is deleted, in this same transaction.
  select email into v_email from auth.users where id = p_user;

  select exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status in ('open', 'reviewing', 'actioned')),
         exists (
           select 1 from public.reports r
            where r.subject_id = p_user and r.status = 'actioned')
    into v_reported, v_actioned;

  v_days := case when v_reported
                 then public.config_int('deletion_hold_reported_days')
                 else public.config_int('deletion_hold_days') end;

  insert into public.deletion_holds
    (profile_id, tier, held_until, email, first_name, last_name, full_legal_name,
     phone, whatsapp, links, selfie_path, cv_path)
  select p.id,
         case when v_reported then 'reported' else 'standard' end,
         now() + make_interval(days => v_days),
         v_email, p.first_name, p.last_name, a.full_legal_name,
         cd.phone, cd.whatsapp, a.links, a.selfie_path, a.cv_path
    from public.profiles p
    left join public.contact_details cd on cd.profile_id = p.id
    left join public.verification_applications a on a.profile_id = p.id
   where p.id = p_user and p.status <> 'deleted'
  on conflict (profile_id) do nothing;

  -- Someone whose reports were acted on leaves a one-way fingerprint behind,
  -- so signing up again as the same person is flagged to a moderator. Only
  -- the fingerprints are kept, and only for this case.
  if v_actioned then
    select full_legal_name into v_legal_name
      from public.verification_applications where profile_id = p_user;
    insert into public.conduct_bans (email_hash, name_hash, source_profile_id)
    values (public.fingerprint(v_email), public.fingerprint(v_legal_name), p_user);
  end if;

  -- ── things nobody else needs ────────────────────────────────────────────
  delete from public.contact_details where profile_id = p_user;
  delete from public.push_tokens where profile_id = p_user;
  delete from public.notifications where profile_id = p_user;
  delete from public.verification_applications where profile_id = p_user;
  delete from public.data_exports where profile_id = p_user;

  -- The grant is meaningless once contact_details are gone, and leaving it
  -- would show the counterparty a contact with nothing behind it.
  delete from public.contact_grants
    where profile_a = p_user or profile_b = p_user;

  -- Blocks THEY created go. Blocks created AGAINST them stay, so that somebody
  -- who blocked this person for a reason is not quietly re-exposed to them if
  -- the account is ever recreated.
  delete from public.blocks where blocker_id = p_user;

  -- Reviews about them serve no purpose once they are gone. Reviews they WROTE
  -- about other people stay if published — see the note above — and the author
  -- now points at the tombstone, which renders as "Deleted member".
  delete from public.reviews where subject_id = p_user;
  delete from public.reviews where author_id = p_user and published_at is null;

  -- ── anything not underpinning a stay ────────────────────────────────────
  -- Order matters: requests and offers cascade from trips, and stays cascade
  -- from offers, so a naive "delete their trips" would take somebody else's
  -- stay with it.
  delete from public.requests
    where (from_profile = p_user or to_profile = p_user)
      and status <> 'accepted';

  delete from public.offers o
    where (o.from_profile = p_user or o.to_profile = p_user)
      and not exists (select 1 from public.stays s where s.offer_id = o.id);

  delete from public.availability where profile_id = p_user;

  delete from public.trips t
    where t.profile_id = p_user
      and not exists (
        select 1 from public.offers o
        join public.stays s on s.offer_id = o.id
        where o.trip_id = t.id
      );

  -- A trip that produced a stay survives, stripped of its free text. The dates
  -- and city are the counterparty's record of where they hosted somebody.
  update public.trips set note = null where profile_id = p_user;

  -- ── the tombstone ───────────────────────────────────────────────────────
  update public.profiles
    set display_name   = 'Deleted member',
        specialisation = null,
        bio            = null,
        home_district  = null,
        home_city_id   = null,
        photo_path     = null,
        links          = '[]'::jsonb,
        status         = 'deleted'
    where id = p_user;

  -- stays, published reviews they wrote, and reports in both directions are
  -- all retained deliberately and now point at the tombstone.

  -- The selfie and CV are deliberately NOT returned: the Edge Function that
  -- calls this used to delete them straight away, and now must not. They stay
  -- in Storage until the hold expires.
  return jsonb_build_object('ok', true, 'photoPath', v_photo_path);
end;
$$;

-- ── a held account can still be reported ──────────────────────────────────
create or replace function public.submit_report(
  p_reporter     uuid,
  p_subject      uuid,
  p_category     text,
  p_body         text,
  p_related_type text default null,
  p_related_id   uuid default null,
  p_also_block   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_subject
      and (p.status <> 'deleted'
           -- A deleted member can still be reported while their identity is
           -- being held; that is what the hold is for.
           or exists (select 1 from public.deletion_holds h
                       where h.profile_id = p.id and h.held_until > now()))
  ) or p_subject = p_reporter then
    return jsonb_build_object('ok', false, 'error', 'subject_not_found');
  end if;

  if p_category not in ('safety', 'harassment', 'no_show', 'misrepresentation', 'spam', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;

  if public.recent_report_count(p_reporter) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.reports
    (reporter_id, subject_id, category, body, related_type, related_id)
  values
    (p_reporter, p_subject, p_category, p_body, p_related_type, p_related_id)
  returning id into v_id;

  -- A report against a held account keeps its identity for the long period.
  update public.deletion_holds
     set tier = 'reported',
         held_until = greatest(held_until,
                               now() + make_interval(days => public.config_int('deletion_hold_reported_days')))
   where profile_id = p_subject and held_until > now();

  -- Offered, never forced. Someone reporting a safety concern usually wants
  -- the person gone from their app immediately; someone reporting a no-show
  -- often does not.
  if p_also_block then
    insert into public.blocks (blocker_id, blocked_id)
    values (p_reporter, p_subject)
    on conflict do nothing;
  end if;

  -- The reporter's receipt. Carries no report content — this notification
  -- travels through Apple and Google like every other.
  --
  -- Enqueued WITHOUT a counterparty id in the payload, deliberately: the block
  -- above would otherwise suppress the reporter's own confirmation, and they
  -- would be left wondering whether the report went through.
  perform public.enqueue_notification(
    p_reporter,
    'report_received',
    jsonb_build_object('reportId', v_id)
  );

  return jsonb_build_object('ok', true, 'reportId', v_id);
end;
$$;

-- ── the verification queue flags a match ──────────────────────────────────
-- Appended as the last column, so this is a plain CREATE OR REPLACE; the admin
-- wrapper returns setof this view and follows it.
create or replace view public.v_pending_verifications as
select
  a.id                                                as application_id,
  a.profile_id,
  p.display_name,
  p.discipline,
  p.specialisation,
  u.email,
  a.full_legal_name,
  a.selfie_prompt,
  a.selfie_path,
  a.cv_path,
  a.note,
  a.links,
  a.submitted_at,
  extract(day from now() - a.submitted_at)::integer   as days_waiting,
  public.matches_conduct_ban(u.email, a.full_legal_name) as matches_removed_member
from public.verification_applications a
join public.profiles p on p.id = a.profile_id
join auth.users u on u.id = a.profile_id
where a.status = 'pending'
order by a.submitted_at asc;

-- ── moderator access ──────────────────────────────────────────────────────
create or replace function public.admin_get_deletion_hold(p_profile_id uuid)
returns table (
  profile_id      uuid,
  tier            text,
  held_until      timestamptz,
  email           text,
  first_name      text,
  last_name       text,
  full_legal_name text,
  phone           text,
  whatsapp        text,
  links           jsonb,
  selfie_path     text,
  cv_path         text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select h.profile_id, h.tier, h.held_until, h.email, h.first_name, h.last_name,
         h.full_legal_name, h.phone, h.whatsapp, h.links, h.selfie_path, h.cv_path,
         h.created_at
  from public.deletion_holds h
  where public.is_admin() and h.profile_id = p_profile_id;
$$;

revoke all on function public.admin_get_deletion_hold(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_deletion_hold(uuid) to authenticated;

-- A moderator who learns of an infraction after the member left can extend the
-- hold. Recorded in the audit log like every other admin action.
create or replace function public.admin_extend_deletion_hold(p_profile_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  update public.deletion_holds
     set tier = 'reported',
         held_until = greatest(held_until,
                               now() + make_interval(days => public.config_int('deletion_hold_reported_days')))
   where profile_id = p_profile_id and held_until > now()
  returning held_until into v_until;

  if v_until is null then
    raise exception 'no active hold for that profile' using errcode = 'P0002';
  end if;

  insert into public.audit_log (admin_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'extend_deletion_hold', 'deletion_holds', p_profile_id,
          jsonb_build_object('heldUntil', v_until));

  return v_until;
end;
$$;

revoke all on function public.admin_extend_deletion_hold(uuid) from public, anon, authenticated;
grant execute on function public.admin_extend_deletion_hold(uuid) to authenticated;

-- ── the purge, used only by the purge-deletion-holds Edge Function ────────
create or replace function public.claim_expired_deletion_holds(p_limit integer default 50)
returns table (profile_id uuid, selfie_path text, cv_path text)
language sql
stable
security definer
set search_path = public
as $$
  select h.profile_id, h.selfie_path, h.cv_path
  from public.deletion_holds h
  where h.held_until <= now()
  order by h.held_until
  limit p_limit
$$;

create or replace function public.finish_deletion_hold(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.deletion_holds where profile_id = p_profile_id and held_until <= now()
$$;

revoke all on function public.claim_expired_deletion_holds(integer) from public, anon, authenticated;
revoke all on function public.finish_deletion_hold(uuid) from public, anon, authenticated;

-- Daily, 03:30 UTC. Retried every day until the files are actually gone.
select cron.schedule(
  'purge-deletion-holds',
  '30 3 * * *',
  $$ select public.call_edge_function('purge-deletion-holds'); $$
);
