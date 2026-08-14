-- Milestone 1 — city search.
--
-- Needed here because a profile carries a home city. Milestone 2 reuses this
-- for the trip and availability forms.
--
-- Invoker rights (the default), so the cities RLS policy still applies. Prefix
-- matching rather than fuzzy: users know the name of the city they are going
-- to, and prefix search keeps "Ber" from surprising them with "Hamberg".

create or replace function public.search_cities(q text, max_results integer default 20)
returns table (
  id           uuid,
  name         text,
  name_local   text,
  country_code char(2),
  population   integer
)
language sql
stable
set search_path = public
as $$
  select c.id, c.name, c.name_local, c.country_code, c.population
  from public.cities c
  where c.is_active
    and length(trim(q)) >= 2
    and (
      c.name ilike trim(q) || '%'
      or c.name_local ilike trim(q) || '%'
      or exists (
        select 1 from unnest(c.aliases) as alias
        where alias ilike trim(q) || '%'
      )
    )
  -- Bigger cities first: someone typing "Fran" almost certainly means Frankfurt.
  order by c.population desc, c.name asc
  limit least(greatest(max_results, 1), 50);
$$;

grant execute on function public.search_cities(text, integer) to authenticated;
