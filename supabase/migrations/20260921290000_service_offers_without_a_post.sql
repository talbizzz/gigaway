-- A coffee or local tips can be offered straight to one person.
--
-- The first version of service offers required the giver to have posted that
-- service in the trip's city on overlapping dates ("a coffee is offered from a
-- coffee post, not out of nowhere"). That forced anyone who only wanted to offer
-- a coffee to one traveller to publish a coffee offer to everybody first, which
-- is not what they meant.
--
-- The check is dropped. Everything else stays: the trip must exist, be the
-- addressee's own and still be ahead, the giver must be able to see it (the
-- insert policy reads the trip through RLS), one offer of each kind per person
-- per trip, and the cap on offers per trip. Offers of nights are unchanged: they
-- are bounded by a posted couch or room, because the nights come from it.

create or replace function public.enforce_service_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips t where t.id = new.trip_id;
  if not found then
    raise exception 'that trip no longer exists' using errcode = '23503';
  end if;

  if new.to_profile <> v_trip.profile_id then
    raise exception 'an offer must be addressed to the member who posted the trip'
      using errcode = '23514';
  end if;

  if v_trip.end_date < current_date then
    raise exception 'that trip is over' using errcode = '23514';
  end if;

  if public.service_offer_count(new.trip_id) >= public.config_int('max_service_offers_per_trip') then
    raise exception 'this trip already has as many offers as it can take'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
