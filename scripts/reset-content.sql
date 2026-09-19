-- Reset the database to an empty base, keeping real accounts.
--
-- IRREVERSIBLE. The project is on the free tier, which has no backups.
-- Run PART 1 first, read the counts, and only then run PART 2.
--
-- WHAT IS KEPT
--   * profiles that have a matching auth.users row — real, signable-into accounts
--   * contact_details for those profiles
--   * push_tokens for those profiles
--   * cities and app_config (reference data)
--
-- WHAT GOES
--   * every trip, availability window, request, offer, stay and review
--   * contact grants, notifications, blocks, reports, data-export records
--   * verification applications
--   * the six seeded demo profiles (5eed… ids, no auth.users row behind them)
--
-- Invites are OPTIONAL and off by default — see PART 3. If you have already
-- created the multi-use beta code, deleting it would break tester sign-up.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — DRY RUN. Deletes nothing. Read this before going further.
-- ═══════════════════════════════════════════════════════════════════════════

select 'reviews'                  as table_name, count(*) as rows_to_delete from public.reviews
union all select 'stays',                  count(*) from public.stays
union all select 'offers',                 count(*) from public.offers
union all select 'requests',               count(*) from public.requests
union all select 'trips',                  count(*) from public.trips
union all select 'availability',           count(*) from public.availability
union all select 'contact_grants',         count(*) from public.contact_grants
union all select 'notifications',          count(*) from public.notifications
union all select 'blocks',                 count(*) from public.blocks
union all select 'reports',                count(*) from public.reports
union all select 'data_exports',           count(*) from public.data_exports
union all select 'verification_applications', count(*) from public.verification_applications
order by 1;

-- Which profiles survive, and which do not.
select
  case when u.id is null then 'DELETE — no auth user' else 'KEEP — real account' end as verdict,
  p.display_name,
  p.status,
  u.email
from public.profiles p
left join auth.users u on u.id = p.id
order by verdict, p.display_name;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — THE DELETE. Run only after reading PART 1.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Children before parents. Several of these would cascade anyway, but being
-- explicit means the row counts below are truthful rather than incidental.
delete from public.reviews;
delete from public.stays;
delete from public.offers;
delete from public.requests;
delete from public.trips;
delete from public.availability;
delete from public.contact_grants;
delete from public.notifications;
delete from public.blocks;
delete from public.reports;
delete from public.data_exports;
delete from public.verification_applications;

-- The seeded demo profiles. contact_details, push_tokens and anything else
-- hanging off them cascades. Real accounts are untouched because they have an
-- auth.users row.
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- Confirm the shape of what is left before committing.
select 'profiles remaining' as check, count(*)::text as value from public.profiles
union all select 'with auth user',   count(*)::text from public.profiles p
                                     join auth.users u on u.id = p.id
union all select 'trips',            count(*)::text from public.trips
union all select 'availability',     count(*)::text from public.availability
union all select 'stays',            count(*)::text from public.stays
union all select 'reviews',          count(*)::text from public.reviews;

-- If the counts above look right:
commit;
-- If they do not, run this instead and nothing changes:
-- rollback;


-- ═══════════════════════════════════════════════════════════════════════════
-- AFTER RUNNING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Check the demo account is still approved — store reviewers need it:
--
--   select p.display_name, p.status, p.verified_at, u.email
--   from public.profiles p join auth.users u on u.id = p.id
--   where u.email = 'play-review@gigaway.app';
--
-- status must read 'approved'. If it does not, the reviewer sees the pending
-- screen and the submission is rejected.
