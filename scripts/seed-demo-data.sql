-- ═══════════════════════════════════════════════════════════════════════════
-- Demo data for store screenshots and store review.
--
-- Paste into the Supabase SQL Editor and run. Safe to re-run — every row it
-- creates has a fixed id beginning 5eed…, and the script deletes those first.
--
-- NOT a migration. Never add this to supabase/migrations/. It is deliberately
-- outside supabase/ so `supabase db reset` cannot pick it up.
--
-- Seeded profiles have no auth.users row, so nobody can sign in as them. That
-- became possible in Milestone 4, which dropped profiles.id → auth.users.
--
-- ⚠️  This writes to your live database. To remove it afterwards, run the
--     TEARDOWN block at the bottom of this file.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  -- ── SET THIS to the account you will take screenshots from ───────────────
  v_email text := 'play-review@gigaway.app';

  v_me      uuid;
  v_munich  uuid;
  v_berlin  uuid;
  v_vienna  uuid;

  -- Fixed ids so the script is idempotent.
  v_lena    uuid := '5eed0000-0000-4000-8000-000000000001';
  v_tomas   uuid := '5eed0000-0000-4000-8000-000000000002';
  v_chiara  uuid := '5eed0000-0000-4000-8000-000000000003';
  v_marek   uuid := '5eed0000-0000-4000-8000-000000000004';
  v_anneke  uuid := '5eed0000-0000-4000-8000-000000000005';
  v_jonas   uuid := '5eed0000-0000-4000-8000-000000000006';

  v_trip_berlin  uuid := '5eed1000-0000-4000-8000-000000000001';
  v_trip_vienna  uuid := '5eed1000-0000-4000-8000-000000000002';
  v_trip_anneke  uuid := '5eed1000-0000-4000-8000-000000000003';
  v_trip_jonas   uuid := '5eed1000-0000-4000-8000-000000000004';
  v_trip_jvienna uuid := '5eed1000-0000-4000-8000-000000000005';

  v_offer_berlin uuid := '5eed3000-0000-4000-8000-000000000001';
  v_offer_vienna uuid := '5eed3000-0000-4000-8000-000000000002';
  v_offer_jonas  uuid := '5eed3000-0000-4000-8000-000000000003';

  v_stay_vienna  uuid;
  v_stay_jonas   uuid;
begin
  -- ── who am I ────────────────────────────────────────────────────────────
  select p.id into v_me
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = v_email;

  if v_me is null then
    raise exception
      'No profile found for %. Create that account first (Authentication → Add user), then re-run.',
      v_email;
  end if;

  -- ── cities ──────────────────────────────────────────────────────────────
  select id into v_munich from public.cities
    where name in ('Munich', 'München') order by population desc limit 1;
  select id into v_berlin from public.cities
    where name = 'Berlin' order by population desc limit 1;
  select id into v_vienna from public.cities
    where name in ('Vienna', 'Wien') order by population desc limit 1;

  if v_munich is null or v_berlin is null or v_vienna is null then
    raise exception 'Missing a city (Munich %, Berlin %, Vienna %). Is the cities table seeded?',
      v_munich, v_berlin, v_vienna;
  end if;

  -- ── clean any previous run ──────────────────────────────────────────────
  -- Deleting the profiles cascades to their trips, availability, offers,
  -- stays and reviews. The demo user's own rows are removed by id.
  delete from public.profiles where id in
    (v_lena, v_tomas, v_chiara, v_marek, v_anneke, v_jonas);
  delete from public.trips where id in (v_trip_berlin, v_trip_vienna);
  delete from public.availability where id::text like '5eed2000%';

  -- ── the demo account itself ─────────────────────────────────────────────
  update public.profiles set
    display_name   = coalesce(nullif(display_name, ''), 'App Review'),
    discipline     = 'voice',
    specialisation = 'Mezzo-soprano',
    bio            = 'Freelance mezzo, mostly oratorio and Lieder. Based in Munich, on the road about fifteen weeks a year. Happy to lend the couch when I am home.',
    home_city_id   = v_munich,
    home_district  = 'Neuhausen',
    status         = 'approved',
    verified_at    = coalesce(verified_at, now() - interval '40 days')
  where id = v_me;

  insert into public.contact_details (profile_id, email, whatsapp, preferred_channel)
  values (v_me, v_email, '+491701234567', 'whatsapp')
  on conflict (profile_id) do update
    set whatsapp = excluded.whatsapp, preferred_channel = excluded.preferred_channel;

  -- ── the cast ────────────────────────────────────────────────────────────
  insert into public.profiles
    (id, display_name, discipline, specialisation, home_city_id, home_district,
     bio, status, verified_at, created_at)
  values
    (v_lena, 'Lena Vogt', 'voice', 'Soprano', v_munich, 'Haidhausen',
     'Soprano, opera and concert. Munich for six years now — I know which pianists rehearse cheaply and where to warm up on a Sunday.',
     'approved', now() - interval '8 months', now() - interval '8 months'),

    (v_tomas, 'Tomás Ferreira', 'strings', 'Cello', v_munich, 'Schwabing',
     'Cellist, orchestral and chamber. Portuguese, in Munich since my studies. Spare room whenever my flatmate is on tour, which is often.',
     'approved', now() - interval '6 months', now() - interval '6 months'),

    (v_chiara, 'Chiara Bellini', 'dance', 'Contemporary', v_munich, 'Sendling',
     'Contemporary dancer, currently freelancing between companies. Small flat, good couch, excellent coffee.',
     'approved', now() - interval '5 months', now() - interval '5 months'),

    (v_marek, 'Marek Sobczak', 'winds', 'Clarinet', v_berlin, 'Kreuzberg',
     'Clarinettist, mostly new music. Berlin-based. I have hosted eleven people and stayed with seven — it works.',
     'approved', now() - interval '10 months', now() - interval '10 months'),

    (v_anneke, 'Anneke de Vries', 'keyboard', 'Piano', v_vienna, 'Leopoldstadt',
     'Pianist and répétiteur in Vienna. Quiet flat, upright piano you are welcome to use, cat who will ignore you.',
     'approved', now() - interval '11 months', now() - interval '11 months'),

    (v_jonas, 'Jonas Lindqvist', 'brass', 'Horn', v_berlin, 'Neukölln',
     'Horn player, Swedish, Berlin for now. Auditioning constantly, so I am away more than I am home.',
     'approved', now() - interval '4 months', now() - interval '4 months');

  insert into public.contact_details (profile_id, email, whatsapp, preferred_channel)
  values
    (v_lena,   'lena.vogt@example.com',       '+491621112233', 'whatsapp'),
    (v_tomas,  'tomas.ferreira@example.com',  '+491622223344', 'whatsapp'),
    (v_chiara, 'chiara.bellini@example.com',  '+391623334455', 'whatsapp'),
    (v_marek,  'marek.sobczak@example.com',   '+491624445566', 'whatsapp'),
    (v_anneke, 'anneke.devries@example.com',  '+431625556677', 'email'),
    (v_jonas,  'jonas.lindqvist@example.com', '+461626667788', 'whatsapp');

  -- ── availability ────────────────────────────────────────────────────────
  -- Munich hosts: these populate the home feed's "in your city" band and the
  -- match results for anyone travelling to Munich.
  insert into public.availability
    (id, profile_id, city_id, start_date, end_date, offers, constraints, max_nights, note)
  values
    ('5eed2000-0000-4000-8000-000000000001', v_lena, v_munich,
     current_date - 4, current_date + 38,
     array['couch','tips'], array['no_smoking'], 4,
     'Couch in the living room. I rehearse mornings, so the flat is yours until about two.'),

    ('5eed2000-0000-4000-8000-000000000002', v_tomas, v_munich,
     current_date + 2, current_date + 30,
     array['spare_room','tips','coffee'], array['no_pets','quiet_household'], 6,
     'Proper spare room with a bed. Ten minutes from the Hochschule on the U2.'),

    ('5eed2000-0000-4000-8000-000000000003', v_chiara, v_munich,
     current_date - 1, current_date + 21,
     array['couch','coffee'], array['no_smoking'], 3,
     'Couch is short but comfortable. I can point you at the good studios.'),

    -- Berlin, covering the demo user's upcoming trip
    ('5eed2000-0000-4000-8000-000000000004', v_marek, v_berlin,
     current_date + 8, current_date + 34,
     array['spare_room','tips'], array['no_smoking'], 7,
     'Spare room, own key. Kreuzberg, twenty minutes to most of the audition venues.'),

    -- Vienna, covering the past stay that carries the reviews
    ('5eed2000-0000-4000-8000-000000000005', v_anneke, v_vienna,
     current_date - 65, current_date - 20,
     array['couch','tips','coffee'], array['quiet_household'], 5,
     'Couch, and the piano is free most afternoons.'),

    -- The demo user's own availability — this is the host-side screenshot
    ('5eed2000-0000-4000-8000-000000000006', v_me, v_munich,
     current_date + 5, current_date + 40,
     array['couch','tips','coffee'], array['no_smoking'], 5,
     'Couch in a quiet flat in Neuhausen. I am away a lot, so ask and I will check the calendar.');

  -- ── trips ───────────────────────────────────────────────────────────────
  insert into public.trips
    (id, profile_id, city_id, start_date, end_date, needs, note)
  values
    -- demo user → Berlin, upcoming. This is the "trip with matches" screen.
    (v_trip_berlin, v_me, v_berlin, current_date + 12, current_date + 16,
     array['couch','tips'],
     'Second round of the Deutsche Oper audition. Arriving the evening before.'),

    -- demo user → Vienna, past. Carries the completed stay and its reviews.
    (v_trip_vienna, v_me, v_vienna, current_date - 60, current_date - 56,
     array['couch'], 'Musikverein audition.'),

    -- colleagues coming to Munich — the home feed's "coming to your city" band
    (v_trip_anneke, v_anneke, v_munich, current_date + 9, current_date + 13,
     array['couch','company'],
     'Competition at the Hochschule. Would love a coffee with someone who knows the city.'),

    (v_trip_jonas, v_jonas, v_munich, current_date + 20, current_date + 24,
     array['couch','tips'], 'Probespiel at the Rundfunkorchester.'),

    -- Jonas → Vienna, past: a second published review on Anneke's profile
    (v_trip_jvienna, v_jonas, v_vienna, current_date - 45, current_date - 42,
     array['couch'], null);

  -- ── offers, accepted ────────────────────────────────────────────────────
  -- enforce_offer_range() checks each of these against the availability above
  -- and fills in city_id, exactly as it would in the app.
  insert into public.offers
    (id, trip_id, from_profile, to_profile, start_date, end_date, message, status, responded_at)
  values
    (v_offer_berlin, v_trip_berlin, v_marek, v_me,
     current_date + 12, current_date + 16,
     'Room is free that whole week — take it. I am around on the Thursday if you want company after.',
     'accepted', now() - interval '2 days'),

    (v_offer_vienna, v_trip_vienna, v_anneke, v_me,
     current_date - 60, current_date - 56,
     'Couch is yours. The piano is free in the afternoons if you need to warm up.',
     'accepted', now() - interval '62 days'),

    (v_offer_jonas, v_trip_jvienna, v_anneke, v_jonas,
     current_date - 45, current_date - 42,
     'Of course — see you Thursday.',
     'accepted', now() - interval '47 days');

  -- ── stays ───────────────────────────────────────────────────────────────
  insert into public.stays (offer_id, host_id, guest_id, city_id, start_date, end_date)
  values
    (v_offer_berlin, v_marek,  v_me,    v_berlin, current_date + 12, current_date + 16),
    (v_offer_vienna, v_anneke, v_me,    v_vienna, current_date - 60, current_date - 56),
    (v_offer_jonas,  v_anneke, v_jonas, v_vienna, current_date - 45, current_date - 42);

  -- Fetched rather than RETURNed: a multi-row INSERT ... RETURNING INTO raises
  -- "query returned more than one row" in plpgsql.
  select id into v_stay_vienna from public.stays where offer_id = v_offer_vienna;
  select id into v_stay_jonas  from public.stays where offer_id = v_offer_jonas;

  -- ── contact grants — this is what the reveal screen reads ───────────────
  insert into public.contact_grants (profile_a, profile_b, source, source_id)
  values
    (least(v_marek, v_me),  greatest(v_marek, v_me),  'offer', v_offer_berlin),
    (least(v_anneke, v_me), greatest(v_anneke, v_me), 'offer', v_offer_vienna)
  on conflict do nothing;

  -- ── reviews, published ──────────────────────────────────────────────────
  -- Published outright: these stays are long finished, so the double-blind
  -- window has closed either way.
  insert into public.reviews
    (stay_id, author_id, subject_id, would_again, body, submitted_at, published_at)
  values
    (v_stay_vienna, v_me, v_anneke, true,
     'Anneke could not have been easier to stay with. Clear directions, a key waiting, and she left me completely alone on the morning of the audition without me having to ask.',
     now() - interval '54 days', now() - interval '54 days'),

    (v_stay_vienna, v_anneke, v_me, true,
     'Tidy, considerate, and left a note and good coffee. Welcome back whenever.',
     now() - interval '53 days', now() - interval '53 days'),

    (v_stay_jonas, v_jonas, v_anneke, true,
     'Second time staying with Anneke. The piano alone is worth the trip, and she knows every répétiteur in the city.',
     now() - interval '40 days', now() - interval '40 days');

  -- ── a pending request, so the app is not all resolved states ────────────
  insert into public.requests
    (id, kind, trip_id, from_profile, to_profile, message, status)
  values
    ('5eed5000-0000-4000-8000-000000000001', 'host_stay', v_trip_anneke,
     v_anneke, v_me,
     'I saw you have the couch free that week. Four nights, arriving late on the Tuesday — would that work?',
     'pending')
  on conflict do nothing;

  raise notice 'Seeded. Demo profile: %', v_me;
end;
$$;

-- ═══ verify ════════════════════════════════════════════════════════════════
select 'profiles'        as what, count(*) from public.profiles where status = 'approved'
union all select 'availability, active', count(*) from public.availability where status = 'active'
union all select 'trips',               count(*) from public.trips
union all select 'accepted offers',     count(*) from public.offers where status = 'accepted'
union all select 'stays',               count(*) from public.stays
union all select 'published reviews',   count(*) from public.reviews where published_at is not null
union all select 'contact grants',      count(*) from public.contact_grants
union all select 'pending requests',    count(*) from public.requests where status = 'pending';


-- ═══════════════════════════════════════════════════════════════════════════
-- TEARDOWN — run this to remove everything above.
-- Deleting the profiles cascades to their trips, offers, stays and reviews.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- delete from public.profiles where id::text like '5eed0000%';
-- delete from public.trips        where id::text like '5eed1000%';
-- delete from public.availability where id::text like '5eed2000%';
-- delete from public.requests     where id::text like '5eed5000%';
