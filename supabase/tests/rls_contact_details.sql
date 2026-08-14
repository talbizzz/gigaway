-- RLS: contact details are invisible until a contact grant exists.
--
-- This is the reveal-on-acceptance rule from Project-Raw.md. It is enforced
-- here rather than in client code precisely so that no screen, query or future
-- feature can leak a phone number by forgetting to filter.

begin;
select plan(12);

-- ── fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.test',
   '{"display_name":"Anna Weber","discipline":"voice"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.test',
   '{"display_name":"Bruno Kraus","discipline":"strings"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'clara@example.test',
   '{"display_name":"Clara Ortiz","discipline":"dance"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'dieter@example.test',
   '{"display_name":"Dieter Hahn","discipline":"brass"}'::jsonb);

update public.profiles set status = 'approved'
  where id <> '44444444-4444-4444-4444-444444444444';
-- Dieter (4444) stays pending.

update public.contact_details
  set phone = '+49 170 1234567', preferred_channel = 'whatsapp'
  where profile_id = '22222222-2222-2222-2222-222222222222';

-- ── before any grant ───────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details),
  1,
  'with no grant, a member sees only their own contact details'
);

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'another approved member''s phone number is invisible without a grant'
);

select is(
  (select public.has_contact_grant('22222222-2222-2222-2222-222222222222')),
  false,
  'has_contact_grant() is false before an offer is accepted'
);

-- ── grant created (as accept-offer would) ──────────────────────────────────
set local role postgres;
insert into public.contact_grants (profile_a, profile_b, source, source_id)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'offer', gen_random_uuid());

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select phone from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  '+49 170 1234567',
  'after acceptance the host''s phone number becomes readable'
);

select is(
  (select public.has_contact_grant('22222222-2222-2222-2222-222222222222')),
  true,
  'has_contact_grant() is true once the grant row exists'
);

select is(
  (select count(*)::int from public.contact_grants),
  1,
  'a party to the grant can see the grant row'
);

-- ── the reveal is symmetric ────────────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the reveal is symmetric — the host also sees the traveller''s details'
);

-- ── a third party sees nothing ─────────────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id in ('11111111-1111-1111-1111-111111111111',
                         '22222222-2222-2222-2222-222222222222')),
  0,
  'an uninvolved approved member cannot read either party''s contact details'
);

select is(
  (select count(*)::int from public.contact_grants),
  0,
  'an uninvolved member cannot even see that a grant exists'
);

-- ── a pending applicant sees nothing ───────────────────────────────────────
set local role postgres;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id <> '44444444-4444-4444-4444-444444444444'),
  0,
  'a pending applicant cannot read anyone else''s contact details'
);

-- ── suspension revokes the reveal ──────────────────────────────────────────
-- Anna keeps her grant with Bruno, but suspension must cut access immediately.
set local role postgres;
update public.profiles set status = 'suspended'
  where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'suspension revokes contact access on the next query, grant notwithstanding'
);

select is(
  (select count(*)::int from public.contact_details
    where profile_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'a suspended member can still see their own contact details'
);

select * from finish();
rollback;
