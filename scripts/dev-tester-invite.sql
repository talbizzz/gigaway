-- A permanent, effectively unlimited invite code for the DEVELOPMENT project.
--
-- Run in the dev SQL editor:
--   https://supabase.com/dashboard/project/shhgzekofcetdenwpivm/sql
--
-- CHECK THE PROJECT REF IN THE URL. On production this would hand anyone who
-- guessed the string a permanent way through the invite wall, which is the one
-- thing the wall exists to prevent.
--
--
-- WHY THIS IS DATA AND NOT CODE
--
-- The obvious implementation is a special case in redeem_invite — "if the code
-- is TESTER, let them in". That is a back door compiled into the product, kept
-- harmless only by an environment check that someone will eventually get wrong,
-- and it would sit in the same function that guards a network whose entire
-- value is that not everyone is in it.
--
-- A row in `invites` needs no special case. It goes through exactly the same
-- redemption path as a real invite — expiry, revocation and use counting all
-- still apply — and it exists only in this database. Nothing about production
-- changes, and there is no flag that could be flipped the wrong way.
--
--
-- WHY NOT LITERALLY 'TESTER'
--
-- Codes are 8 characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0 or
-- 1, so a code read aloud cannot be transcribed wrongly). InviteCodeSchema
-- enforces that in the app, so a 6-character code is rejected before the
-- request is ever sent. TESTER99 fits the alphabet and the length.


-- ═══════════════════════════════════════════════════════════════════════════
-- Create it
-- ═══════════════════════════════════════════════════════════════════════════
-- Owned by whichever approved profile is oldest — invites.created_by is NOT
-- NULL, so it needs a real owner, and the first bootstrapped account is the
-- natural one. Run scripts/dev-approve-account.sql first if nobody is approved
-- yet; this will report zero rows otherwise.

insert into public.invites (code, created_by, max_uses, expires_at)
select
  'TESTER99',
  p.id,
  100000,
  timestamptz '2099-12-31 23:59:59+00'
from public.profiles p
where p.status = 'approved'
order by p.created_at
limit 1
on conflict (code) do update
  set max_uses   = excluded.max_uses,
      expires_at = excluded.expires_at,
      revoked_at = null
returning code, max_uses, expires_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- Confirm
-- ═══════════════════════════════════════════════════════════════════════════

select i.code,
       i.uses,
       i.max_uses,
       i.expires_at,
       i.revoked_at,
       p.display_name as owned_by
from public.invites i
join public.profiles p on p.id = i.created_by
where i.code = 'TESTER99';


-- ═══════════════════════════════════════════════════════════════════════════
-- USING IT
-- ═══════════════════════════════════════════════════════════════════════════
-- Sign up in GigAway Dev, then enter TESTER99 when asked for an invite.
--
-- One limit that is not worth removing: invite_redemptions.redeemed_by is
-- UNIQUE, so a given account can redeem once, ever. Re-testing the invite flow
-- needs a fresh signup, not a re-redemption. That constraint is what stops
-- somebody laundering their way back in after deletion, so it stays.
--
-- To take the code out of circulation without deleting the audit trail:
--
--   update public.invites set revoked_at = now() where code = 'TESTER99';
