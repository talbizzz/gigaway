-- Milestone 1 — extensions and reference data.
--
-- Verified available on Supabase local (2026-08-13):
--   pg_cron 1.6.4, pg_net 0.20.3, pg_trgm 1.6, btree_gist 1.7, pgtap 1.3.3
-- pg_cron was smoke-tested by scheduling and unscheduling a job, so the
-- scheduled-job design in Project-Plan.md holds and needs no fallback.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ───────────────────────────────────────────────────────────────────────────
-- cities
--
-- A fixed, curated list. Matching is `city_id = city_id`, never string
-- comparison: "Munich", "München" and "munich " are three different cities to
-- a database, and in a density-constrained product a missed match is
-- indistinguishable from no supply.
-- ───────────────────────────────────────────────────────────────────────────
create table public.cities (
  id           uuid primary key default gen_random_uuid(),
  geoname_id   integer unique,
  name         text not null,
  name_local   text,
  country_code char(2) not null,
  lat          double precision not null,
  lon          double precision not null,
  population   integer not null default 0,
  aliases      text[] not null default '{}',
  is_active    boolean not null default true
);

comment on table public.cities is
  'Reference list of European cities, generated from the GeoNames cities5000 '
  'dataset (CC BY 4.0). Regenerate with scripts/build-cities-seed.mjs.';
comment on column public.cities.aliases is
  'Alternate spellings and local-language forms, used for search so that a '
  'German speaker typing "Muenchen" finds Munich.';

-- Fuzzy search over the display name.
create index cities_name_trgm on public.cities using gin (name extensions.gin_trgm_ops);
-- Alias search: array containment against a normalised query term.
create index cities_aliases on public.cities using gin (aliases);
create index cities_country on public.cities (country_code);
-- Ranking: bigger cities first when scores tie.
create index cities_population on public.cities (population desc);

-- ───────────────────────────────────────────────────────────────────────────
-- app_config
--
-- Tunable values that must be changeable without a deploy. Read by policies,
-- Edge Functions and scheduled jobs.
-- ───────────────────────────────────────────────────────────────────────────
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('default_invite_quota', '5'::jsonb),
  ('invite_ttl_days',      '30'::jsonb),
  ('doc_purge_days',       '90'::jsonb),
  ('doc_nudge_days',       '3'::jsonb),
  ('review_window_days',   '14'::jsonb)
on conflict (key) do nothing;

-- Typed accessor so callers cannot silently read a missing key as null.
create or replace function public.config_int(config_key text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result integer;
begin
  select (value #>> '{}')::integer into result
  from public.app_config where key = config_key;

  if result is null then
    raise exception 'app_config key % is missing', config_key;
  end if;

  return result;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Both tables are readable by any signed-in user and writable by no one but
-- service_role. Reference data has no per-user visibility rules, but RLS is
-- still enabled so that "every table has RLS" holds without exception.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.cities enable row level security;
alter table public.app_config enable row level security;

create policy cities_select_authenticated
  on public.cities for select
  to authenticated
  using (is_active);

create policy app_config_select_authenticated
  on public.app_config for select
  to authenticated
  using (true);

-- Table-level grants. RLS filters which rows a role may see; it does not grant
-- access to the table in the first place. Both are required.
grant select on public.cities to authenticated;
grant select on public.app_config to authenticated;
