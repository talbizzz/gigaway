-- Blocking clears the notifications between the pair.
--
-- Blocking already withdraws what is still open between two people, and row
-- level security then hides those requests and offers from both. But the
-- notification that announced a request ("X asked about your couch") was
-- written earlier and stays in the other person's Activity list and on their
-- Home feed. They tap it and land on a request that no longer exists for them.
--
-- The blocked person must not learn they were blocked, and an orphaned
-- notification is the one thing that still shows something was there. Delete
-- them, in both directions, rather than hide them: unblocking restores
-- visibility but not anything that was withdrawn, and a notification brought
-- back by an unblock would point at a request that stays withdrawn.
--
-- Unsent pushes are removed with them, so one queued before the block is not
-- delivered after it.

create or replace function public.clear_notifications_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
   where (n.profile_id = new.blocker_id
          and new.blocked_id::text in (n.payload ->> 'fromProfileId',
                                       n.payload ->> 'withProfileId',
                                       n.payload ->> 'toProfileId'))
      or (n.profile_id = new.blocked_id
          and new.blocker_id::text in (n.payload ->> 'fromProfileId',
                                       n.payload ->> 'withProfileId',
                                       n.payload ->> 'toProfileId'));
  return null;
end;
$$;

revoke all on function public.clear_notifications_on_block()
  from public, anon, authenticated;

drop trigger if exists blocks_clear_notifications on public.blocks;
create trigger blocks_clear_notifications
  after insert on public.blocks
  for each row execute function public.clear_notifications_on_block();

-- Blocks made before this migration left their notifications behind. Clear
-- them now, the same way.
delete from public.notifications n
 using public.blocks b
 where (n.profile_id = b.blocker_id
        and b.blocked_id::text in (n.payload ->> 'fromProfileId',
                                   n.payload ->> 'withProfileId',
                                   n.payload ->> 'toProfileId'))
    or (n.profile_id = b.blocked_id
        and b.blocker_id::text in (n.payload ->> 'fromProfileId',
                                   n.payload ->> 'withProfileId',
                                   n.payload ->> 'toProfileId'));
