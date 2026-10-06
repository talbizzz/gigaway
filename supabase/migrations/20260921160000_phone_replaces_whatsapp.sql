-- One personal phone number replaces WhatsApp.
--
-- Most people no longer use WhatsApp; they use an ordinary phone number or some
-- other messaging app. So GigAway stops asking for a WhatsApp number and asks
-- for the member's personal phone number instead, with no assumption about how
-- the other person will use it (call, text, or any messenger tied to it).
--
-- contact_details already had a `phone` column that nothing ever filled in.
-- That becomes the one number; `whatsapp` goes.
--
--   * A member's WhatsApp number (the one the profile gate made them give) is
--     moved into `phone`, so nobody who is already complete has to do anything.
--   * `phone` takes over the E.164 rule (+countrycode, digits only). The reason
--     it is kept is unchanged: a number without its country code is a wrong
--     number to anyone calling from another country.
--   * 'whatsapp' stops being a preferred channel. Nothing in the app sets one,
--     so existing values simply become 'phone'.
--   * The things that read the old column are rebuilt without it: the admin
--     user detail, the identity hold and its moderator read.
--
-- Written to be re-runnable.

-- ── move the numbers ──────────────────────────────────────────────────────
-- The WhatsApp number wins where both exist: it is the one members were made
-- to supply, so it is the one that was checked.
update public.contact_details
   set phone = whatsapp
 where whatsapp is not null
   and phone is distinct from whatsapp;

update public.deletion_holds
   set phone = coalesce(whatsapp, phone)
 where whatsapp is not null
   and phone is distinct from whatsapp;

-- Anything in `phone` that is not dialable internationally was never usable
-- (there was no way to enter one, so this is only test data): tidy it, then
-- clear whatever is left, so the constraint below cannot fail on it.
update public.contact_details
   set phone = regexp_replace(regexp_replace(phone, '^00', '+'), '[^0-9+]', '', 'g')
 where phone is not null;
update public.contact_details
   set phone = null
 where phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$';

update public.contact_details set preferred_channel = 'phone' where preferred_channel = 'whatsapp';

-- ── constraints ───────────────────────────────────────────────────────────
alter table public.contact_details drop constraint if exists whatsapp_is_e164;
alter table public.contact_details drop constraint if exists phone_is_e164;
alter table public.contact_details
  add constraint phone_is_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.contact_details drop constraint if exists preferred_channel_known;
alter table public.contact_details
  add constraint preferred_channel_known check (
    preferred_channel is null or preferred_channel in ('phone', 'email')
  );

comment on column public.contact_details.phone is
  'The member''s personal phone number in E.164 (+countrycode, digits only). '
  'Required of every member by the profile-completeness gate, not by NOT NULL, '
  'because the row is created at sign-up before the number can be asked for.';

-- ── rebuild what read the old column ──────────────────────────────────────
-- Dropped and recreated, not replaced: removing a column from a function's
-- result changes its return type, which CREATE OR REPLACE refuses.
drop function if exists public.admin_get_user_detail(uuid);
create or replace function public.admin_get_user_detail(p_profile_id uuid)
returns table (
  profile_id           uuid,
  display_name         text,
  status               public.profile_status,
  discipline           text,
  home_city            text,
  joined_at            timestamptz,
  email                text,
  phone                text,
  trips                bigint,
  availability         bigint,
  stays_hosted         bigint,
  stays_as_guest       bigint,
  reviews_written      bigint,
  reviews_received     bigint,
  would_again_pct      integer,
  reports_filed        bigint,
  reports_received     bigint,
  distinct_reporters   bigint,
  blocks_made          bigint,
  blocks_received      bigint,
  verification_status  public.verification_status,
  verification_decision_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.profile_id, v.display_name, v.status, v.discipline, v.home_city, v.joined_at,
    cd.email, cd.phone,
    v.trips, v.availability, v.stays_hosted, v.stays_as_guest,
    v.reviews_written, v.reviews_received, v.would_again_pct,
    v.reports_filed, v.reports_received, v.distinct_reporters,
    v.blocks_made, v.blocks_received,
    va.status, va.decision_reason
  from public.v_user_summary v
  left join public.contact_details cd on cd.profile_id = v.profile_id
  left join public.verification_applications va on va.profile_id = v.profile_id
  where public.is_admin() and v.profile_id = p_profile_id;
$$;
revoke all on function public.admin_get_user_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;

drop function if exists public.admin_get_deletion_hold(uuid);
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
         h.full_legal_name, h.phone, h.links, h.selfie_path, h.cv_path,
         h.created_at
  from public.deletion_holds h
  where public.is_admin() and h.profile_id = p_profile_id;
$$;
revoke all on function public.admin_get_deletion_hold(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_deletion_hold(uuid) to authenticated;

-- delete_account keeps its signature and return type, so it is a plain replace.
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
     phone, links, selfie_path, cv_path)
  select p.id,
         case when v_reported then 'reported' else 'standard' end,
         now() + make_interval(days => v_days),
         v_email, p.first_name, p.last_name, a.full_legal_name,
         cd.phone, a.links, a.selfie_path, a.cv_path
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

-- ── and finally the column itself ─────────────────────────────────────────
alter table public.deletion_holds drop column if exists whatsapp;
alter table public.contact_details drop column if exists whatsapp;
