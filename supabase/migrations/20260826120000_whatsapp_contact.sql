-- WhatsApp becomes a required contact channel.
--
-- Until now the only contact detail anyone had was the email address copied
-- from auth at sign-up: there has never been a screen for entering a phone
-- number, so the WhatsApp and phone rows on the reveal screen could never show
-- anything. This migration makes WhatsApp the channel members actually supply,
-- alongside that email, and both are revealed together once an offer is
-- accepted.
--
-- WHY THIS IS NOT `not null`. The row is created by handle_new_user() at
-- sign-up, which knows the email and nothing else — a NOT NULL column would
-- make account creation itself impossible. The requirement is therefore
-- enforced where the number can actually be asked for: the profile-completeness
-- gate, which already holds a member in onboarding until their profile carries
-- what other members need. This constraint enforces the SHAPE of a number that
-- is present, which is the part the database can meaningfully guarantee.

-- ───────────────────────────────────────────────────────────────────────────
-- Normalise anything already stored
--
-- Dev and test databases predate the format rule. Strip the punctuation people
-- type and rewrite a 00 international prefix to +, so the constraint below
-- cannot fail on rows that are merely untidy rather than wrong.
-- ───────────────────────────────────────────────────────────────────────────
-- Keep digits and a leading +, drop everything else. Deliberately blunter than
-- the client's normalisePhoneNumber: anything this mangles was not a dialable
-- number to begin with, and the statement below nulls whatever is left over.
update public.contact_details
set whatsapp = regexp_replace(
  regexp_replace(whatsapp, '^00', '+'),
  '[^0-9+]', '', 'g'
)
where whatsapp is not null;

-- Anything that still is not dialable internationally was never usable: a
-- national number in a column read by people in other countries is a wrong
-- number, not a partial one.
update public.contact_details
set whatsapp = null
where whatsapp is not null
  and whatsapp !~ '^\+[1-9][0-9]{7,14}$';

-- ───────────────────────────────────────────────────────────────────────────
-- Format constraint
--
-- E.164: a leading +, country code, then the national number. This duplicates
-- WhatsAppNumberSchema in packages/shared/src/domain/phone.ts, deliberately —
-- the client validates so it can explain the problem in a sentence, and the
-- database validates so no other writer can get it wrong. Change one, change
-- the other; phone.test.ts states the shared rule.
--
-- wa.me takes digits only and has no idea what country the reader is in, so a
-- number stored without its country code produces a link that dials somebody
-- else entirely. That is the failure this prevents.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contact_details
  add constraint whatsapp_is_e164 check (
    whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'
  );

comment on column public.contact_details.whatsapp is
  'WhatsApp number in E.164 (+countrycode, digits only). Required of every '
  'member by the profile-completeness gate, not by a NOT NULL constraint, '
  'because the row is created at sign-up before the number can be asked for.';
