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
-- GigAway is invite-only. Signing up creates a profile with status 'pending',
-- and the two ways forward — an invite from a member, or document review — both
-- need somebody who is already in. On an empty database nobody is, so the first
-- account has to be let in by hand. After that you can invite from inside the
-- app.


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
    verified_at = now(),
    -- Generous on dev so you can invite testers without topping it up. The
    -- production default is 5, from app_config.default_invite_quota.
    invite_quota = 50
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
       c.name as home_city, p.invite_quota
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
