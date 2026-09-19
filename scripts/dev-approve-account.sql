-- Approve an account on the DEVELOPMENT project.
--
-- Run in the dev SQL editor:
--   https://supabase.com/dashboard/project/shhgzekofcetdenwpivm/sql
--
-- Check the project ref in the URL first. This is a sandbox convenience and has
-- no business running against production, where approval is a human decision
-- about a real person.
--
-- WHY THIS IS NEEDED
-- Every signup creates a profile with status 'pending', and the only way
-- forward is a human deciding the verification application sent to
-- verify@gigaway.app. That is true for every account, including your first —
-- there is no invite fast path any more — so use this to skip the wait while
-- developing rather than actually running the selfie-and-CV flow every time.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Who is waiting?
-- ═══════════════════════════════════════════════════════════════════════════

select u.email, p.display_name, p.discipline, p.status, p.created_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Approve one — change the email on both statements
-- ═══════════════════════════════════════════════════════════════════════════
-- A wrong address here updates nothing rather than something wrong, so this is
-- safe to run and re-run.

update public.profiles p
set status      = 'approved',
    verified_at = now()
from auth.users u
where u.id = p.id
  and u.email = 'you@example.com';   -- ← your email

-- The home city drives the feed. Without one, "In your city" and "Coming to
-- your city" are both empty and the app looks broken rather than new.
update public.profiles p
set home_city_id  = (select id from public.cities
                     where name in ('Munich', 'München')
                     order by population desc limit 1),
    home_district = 'Neuhausen'
from auth.users u
where u.id = p.id
  and u.email = 'you@example.com';   -- ← your email


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Confirm
-- ═══════════════════════════════════════════════════════════════════════════
-- status must read 'approved'. Anything else and the app still shows the
-- pending screen.

select u.email, p.display_name, p.status, p.verified_at,
       c.name as home_city
from public.profiles p
join auth.users u on u.id = p.id
left join public.cities c on c.id = p.home_city_id
where u.email = 'you@example.com';   -- ← your email


-- ═══════════════════════════════════════════════════════════════════════════
-- NEXT
-- ═══════════════════════════════════════════════════════════════════════════
-- Restart the app. You should land on the home feed rather than the waiting
-- screen — the session caches your profile, so a reload is needed.
--
-- The WhatsApp number is collected in the app and is required before contact
-- details can be revealed. Fill it in under Profile → Edit.
--
-- For a populated feed, run scripts/seed-demo-data.sql now. It hangs its trips
-- off your account, so it wants this to exist first.
