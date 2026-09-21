-- Milestone 6 — correction: an admin account must not also be an artist
-- account.
--
-- handle_new_user() fires on every auth.users insert, unconditionally, and
-- creates a profiles + contact_details row. That's correct for the
-- consumer app's signup flow and wrong for admin provisioning — there is
-- no way to tell the trigger "this one's an admin" before it runs, because
-- admin_users.id can only be inserted AFTER the auth user (and therefore
-- the trigger) already exists. Rather than special-case handle_new_user()
-- — shared, load-bearing code the whole consumer app depends on — this
-- documents the two extra deletes that undo its side effect for this one
-- case. Both are safe on a freshly-created account: it has never been used
-- as a member, so neither row has anything hanging off it yet.
comment on table public.admin_users is
  'Admin allowlist for the apps/admin platform (Milestone 6). No signup flow '
  '— provision by hand: (1) create the Supabase Auth user (Dashboard -> '
  'Authentication -> Users -> Add User, or the Admin API), copy its id; '
  '(2) handle_new_user() just created a profiles + contact_details row for '
  'it like any signup — an admin account is not an artist account, so '
  'delete both first: delete from contact_details where profile_id = '
  '''<id>''; delete from profiles where id = ''<id>''; (3) insert into '
  'admin_users (id, display_name) values (''<id>'', ''Name''). Never '
  'queried directly by a client; is_admin() is the only door.';
