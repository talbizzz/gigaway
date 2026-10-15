-- Nights can be offered to one person without a posted couch or room.
--
-- Until now an offer of nights had to fall inside an availability post of the
-- host's (a couch or a spare room, in the trip's city or a nearby one), and the
-- trigger refused anything else. That made anyone who simply had a spare bed for
-- one colleague publish it for everybody first.
--
-- When a post covers the nights, nothing changes: it still decides where the stay
-- happens, nearest city first. When none does, the stay is in the trip's own city.
-- The rest of the rule stays: the offer goes to the member who posted the trip, and
-- its nights fall inside the trip.
--
-- Written to be re-runnable.

create or replace function public.enforce_offer_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip    public.trips%rowtype;
  v_city    public.cities%rowtype;
  v_radius  integer := public.config_int('nearby_radius_km');
  v_city_id uuid;
begin
  select * into v_trip from public.trips t where t.id = new.trip_id;
  if not found then
    raise exception 'that trip no longer exists' using errcode = '23503';
  end if;

  if new.to_profile <> v_trip.profile_id then
    raise exception 'an offer must be addressed to the traveller who posted the trip'
      using errcode = '23514';
  end if;

  if not (daterange(v_trip.start_date, v_trip.end_date, '[]')
          @> daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'the offered nights fall outside the trip'
      using errcode = '23514';
  end if;

  select * into v_city from public.cities c where c.id = v_trip.city_id;

  -- A post that covers the nights also decides where the stay happens. Nearest
  -- city first, so a host with availability in both the destination and a
  -- neighbouring city resolves to the destination.
  select a.city_id into v_city_id
  from public.availability a
  join public.cities c on c.id = a.city_id
  where a.profile_id = new.from_profile
    and a.status = 'active'
    and a.offers && array['couch', 'spare_room']
    and daterange(a.start_date, a.end_date, '[]')
        @> daterange(new.start_date, new.end_date, '[]')
    and (
      a.city_id = v_trip.city_id
      or public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) <= v_radius
    )
  order by public.distance_km(v_city.lat, v_city.lon, c.lat, c.lon) asc
  limit 1;

  -- No post covers them: a direct offer, in the trip's own city.
  new.city_id := coalesce(v_city_id, v_trip.city_id);
  return new;
end;
$$;
