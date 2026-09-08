-- One-time setup for the gigaway-dev Supabase project.
--
-- Run in the DEV dashboard's SQL editor:
--   https://supabase.com/dashboard/project/shhgzekofcetdenwpivm/sql
--
-- Check the project ref in the URL before running anything. These statements
-- are harmless on dev and pointless on production, but the habit of checking
-- is the one that stops a bad afternoon.
--
-- Migrations (27) and Edge Functions (9) are already deployed. This covers the
-- two things migrations cannot carry.


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. pgTAP
-- ═══════════════════════════════════════════════════════════════════════════
-- No migration creates this — it is a per-project step, which is why it is
-- also an explicit step in the CI workflow.

create extension if not exists pgtap with schema extensions;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Vault secrets
-- ═══════════════════════════════════════════════════════════════════════════
-- scheduled_jobs.sql seeds local defaults (http://kong:8000 and the well-known
-- demo key). Left alone, every cron job on this project fires into nothing and
-- says nothing about it — call_edge_function only warns when a secret is
-- MISSING, never when it is merely wrong.
--
-- Note the URL is dev's own, not production's. Pointing dev at production's
-- functions would have dev's cron jobs acting on live data.

select vault.update_secret(id, 'https://shhgzekofcetdenwpivm.supabase.co/functions/v1')
from vault.secrets where name = 'edge_function_base_url';

-- Get the key first, in a terminal:
--   npx supabase projects api-keys --project-ref shhgzekofcetdenwpivm --reveal
--
-- Use the sb_secret_… key if the project has one. If the only secret-side key
-- is the legacy service_role JWT (starts eyJhbGci…), use that. requireServiceRole
-- compares the bearer token byte-for-byte against what the runtime injects as
-- SUPABASE_SERVICE_ROLE_KEY, so the wrong form gives a silent 401 rather than
-- an error you would notice.

-- COMMENTED OUT ON PURPOSE. Running this with the placeholder still in it
-- writes the literal string as the secret, which then fails as a silent 401.
-- Uncomment, substitute the real key, and run only that statement.
--
-- select vault.update_secret(id, '<dev sb_secret_ key>')
-- from vault.secrets where name = 'edge_function_service_key';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Verify — do not skip this
-- ═══════════════════════════════════════════════════════════════════════════

select name, left(decrypted_secret, 42) as starts_with
from vault.decrypted_secrets
where name in ('edge_function_base_url', 'edge_function_service_key');

-- Then prove it end to end, the same way production was verified:
--
--   select public.call_edge_function('dispatch-notifications', '{}'::jsonb);
--
-- wait ~5 seconds, then:
--
--   select status_code, left(content::text, 200) as body, error_msg, created
--   from net._http_response order by created desc limit 3;
--
-- 200 = correct. 401 = wrong key form. error_msg with no status = wrong URL.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Optional — demo data
-- ═══════════════════════════════════════════════════════════════════════════
-- scripts/seed-demo-data.sql gives six profiles, trips, availability, a past
-- stay with published reviews and a pending request. Useful for working on the
-- feed or the offer flow without inventing fixtures each time.
--
-- It expects a real account to hang the demo user's own trips off, so sign up
-- in the app against dev first (delete apps/mobile/.env.local to go back to
-- production afterwards).
