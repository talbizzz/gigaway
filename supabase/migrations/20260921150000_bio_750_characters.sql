-- Raises the longest "about you" text from 600 to 750 characters.
--
-- The app stops typing at BIO_MAX_LENGTH (packages/shared/src/domain/profile.ts);
-- this is the database's own limit, which must be at least as large or a saved
-- 601-750 character bio would be refused here. Longer is only ever more
-- permissive, so no existing row can violate it.

alter table public.profiles drop constraint if exists bio_length;
alter table public.profiles
  add constraint bio_length check (bio is null or char_length(bio) <= 750);
