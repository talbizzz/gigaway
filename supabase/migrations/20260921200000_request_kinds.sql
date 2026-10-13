-- Two more kinds of request: tips and coffee.
--
-- Beside host_stay (answered with an offer) and co_accommodation (accepted
-- outright), a traveller can ask someone for local tips, or to meet for a
-- coffee. Both are accepted or declined like a co-accommodation request, and
-- accepting shares contact details both ways.
--
-- On its own because Postgres will not let a new enum value be USED in the
-- transaction that adds it. The migration after this one uses them.

alter type public.request_kind add value if not exists 'tips';
alter type public.request_kind add value if not exists 'coffee';
