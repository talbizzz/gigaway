-- Milestone 4 — data export and account deletion.
--
-- ─── A SCHEMA CORRECTION THIS MILESTONE FORCES ─────────────────────────────
--
-- profiles.id was `references auth.users(id) on delete cascade`, and roughly a
-- dozen tables cascade from profiles in turn. Deleting the auth user therefore
-- deleted the profile, which deleted the STAYS, the INVITE CHAIN and the
-- BLOCKS other people had created — all of which the milestone's retention
-- table explicitly says to keep.
--
-- Those two requirements cannot both hold while that constraint exists, so the
-- constraint goes. A profile row now outlives its auth user as an anonymised
-- tombstone: display_name 'Deleted member', status 'deleted', every free-text
-- field nulled. That is what makes "the counterparty's review history stays
-- intact" and "the user can never sign in again" true at the same time, and it
-- is strictly better for erasure than soft-deleting the auth user would be,
-- because the email and password hash genuinely go.
--
-- handle_new_user() still creates a profile for every new auth user; nothing
-- else depended on the constraint.
alter table public.profiles drop constraint profiles_id_fkey;

comment on table public.profiles is
  'A profile may outlive its auth.users row. delete-account erases the auth '
  'user outright and leaves this row as an anonymised tombstone, so that the '
  'stays, reviews, invites and blocks belonging to OTHER people survive.';

-- ───────────────────────────────────────────────────────────────────────────
-- Export rate limiting
--
-- Assembling the document is cheap, but it is still a whole-account read and
-- there is no reason anyone needs it twice in a day.
-- ───────────────────────────────────────────────────────────────────────────
create table public.data_exports (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index data_exports_profile on public.data_exports (profile_id, created_at desc);

alter table public.data_exports enable row level security;
revoke all on public.data_exports from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- export_user_data — GDPR Art. 20
--
-- One document, assembled server-side as service_role.
--
-- EXCLUDES REPORTS ENTIRELY, in both directions. Returning the reports someone
-- filed would expose which of their counterparties they raised concerns about
-- and when; returning reports about them would expose their reporters. Either
-- one destroys the private channel. The privacy policy must say this.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.export_user_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) - 'photo_path'
        || jsonb_build_object('homeCity', c.name)
      from public.profiles p
      left join public.cities c on c.id = p.home_city_id
      where p.id = p_user
    ),
    'contactDetails', (
      select to_jsonb(cd) from public.contact_details cd where cd.profile_id = p_user
    ),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('city', c.name) order by t.start_date)
      from public.trips t join public.cities c on c.id = t.city_id
      where t.profile_id = p_user
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('city', c.name) order by a.start_date)
      from public.availability a join public.cities c on c.id = a.city_id
      where a.profile_id = p_user
    ), '[]'::jsonb),
    'requestsSent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.from_profile = p_user
    ), '[]'::jsonb),
    'requestsReceived', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.requests r where r.to_profile = p_user
    ), '[]'::jsonb),
    'offersSent', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at)
      from public.offers o where o.from_profile = p_user
    ), '[]'::jsonb),
    'offersReceived', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at)
      from public.offers o where o.to_profile = p_user
    ), '[]'::jsonb),
    'stays', coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'city', c.name,
          'role', case when s.host_id = p_user then 'host' else 'guest' end
        ) order by s.start_date)
      from public.stays s join public.cities c on c.id = s.city_id
      where s.host_id = p_user or s.guest_id = p_user
    ), '[]'::jsonb),
    -- Published only. An unpublished review about this person is still inside
    -- the double-blind window, and an export must not be a way around it.
    'reviewsWritten', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.submitted_at)
      from public.reviews r where r.author_id = p_user
    ), '[]'::jsonb),
    'reviewsReceived', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.submitted_at)
      from public.reviews r
      where r.subject_id = p_user and r.published_at is not null
    ), '[]'::jsonb),
    'blocksCreated', coalesce((
      select jsonb_agg(jsonb_build_object('blockedId', b.blocked_id, 'createdAt', b.created_at))
      from public.blocks b where b.blocker_id = p_user
    ), '[]'::jsonb),
    'invitesCreated', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.invites i where i.created_by = p_user
    ), '[]'::jsonb),
    'inviteRedemption', (
      select to_jsonb(ir) from public.invite_redemptions ir where ir.redeemed_by = p_user
    ),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type', n.type, 'payload', n.payload,
          'createdAt', n.created_at, 'readAt', n.read_at
        ) order by n.created_at desc)
      from public.notifications n where n.profile_id = p_user
    ), '[]'::jsonb)
  ) into v_data;

  insert into public.data_exports (profile_id) values (p_user);

  return v_data;
end;
$$;

revoke all on function public.export_user_data(uuid) from public, anon, authenticated;

create or replace function public.recent_export_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.data_exports
  where profile_id = p_user and created_at > now() - interval '24 hours';
$$;

revoke all on function public.recent_export_count(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- delete_account
--
-- Hard delete where possible, irreversible anonymisation only where somebody
-- ELSE's history depends on the row surviving.
--
-- The tension this resolves: if deleting an account erased the reviews that
-- person wrote about others, deleting and rejoining would launder reputation.
-- Retaining them against an anonymised tombstone is the deliberate compromise,
-- and the privacy policy has to say so.
--
-- The auth.users row and the avatar object are removed by the Edge Function
-- afterwards — neither is reachable from SQL.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_path text;
begin
  select photo_path into v_photo_path from public.profiles where id = p_user;

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

  -- stays, published reviews they wrote, reports in both directions, and the
  -- invite chain are all retained deliberately and now point at the tombstone.

  return jsonb_build_object('ok', true, 'photoPath', v_photo_path);
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;

comment on function public.delete_account is
  'Irreversible. Called only by the delete-account Edge Function, which erases '
  'the auth.users row and the avatar object afterwards. Retaining reports and '
  'the invite chain is a legitimate-interest decision that MUST be stated in '
  'the privacy policy before this ships.';
