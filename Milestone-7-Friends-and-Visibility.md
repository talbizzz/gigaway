# Milestone 7: Usernames, Friends and Trip Visibility

> **Wording (2026-10-07):** "friends" became "connections" everywhere, members
> and code alike. The file names of this plan and of the first migrations still
> say friends because they were already applied; `20260921230000_friends_become_connections`
> renames the table (`connections`), the helpers (`are_connected`, `is_connected`,
> `send_connection_request`), the stored trip visibility value (`connections`), the
> notification types and the setting. A profile shows the number of connections
> beside the picture, and tapping it opens the list.

## Goal

Members find each other by username or name, become friends, and choose who
sees each trip they post. Home shows what is happening around them: in their
city, among their friends, and in the cities they will visit, plus the
answers to and incoming requests.

## Decisions (made 2026-10-06)

| Question | Decision |
|---|---|
| Usernames | Chosen at sign-up, changeable later (once per 30 days). Existing members are auto-assigned one from their first name and can change it once, right away. |
| Before friendship | A non-friend sees a **card**: name ("Aziz T."), username, photo, discipline, profession, home city, neighbourhood (on match cards), reviews. A friend additionally sees **bio, links and the full name**. |
| Existing trips | Become **Public**. |
| Tips / coffee requests | Accepting shares contact both ways, exactly like co-accommodation. |

**Where "friends see more" is enforced.** In the app, not the database: bio,
links and the family name remain readable through the API by any approved
member (as the family name already was, by the earlier decision). Hiding them
in the database would mean moving the columns out of `profiles` and rewriting
home_feed, search_matches and the rest, which all read `profiles` under RLS.
That is a possible later hardening. **Trip visibility is enforced in the
database**, in row-level security.

## Trip visibility

A trip has `visibility`: `public`, `friends` or `private`. Its owner always
sees it. Everyone else needs one of:

- **public**: a friend of the owner; or anyone who lives in the destination
  city (home city); or anyone who will be in that city on overlapping dates
  (one of their own trips there, or availability they posted there)
- **friends**: a friend of the owner
- **private**: only someone the owner has sent a request or offer to about
  that trip

Matching, the home feed and the open-trips search run with invoker rights, so
they inherit all of this without being rewritten.

## Phases

1. **Usernames**: column, format and uniqueness, reserved names, once-a-month
   change limit, backfill, sign-up field with live availability check, edit
   profile.
2. **Friends**: `friendships` (request, accept, decline, remove), blocking
   removes a friendship, member search by username or name, friends screen
   with incoming and outgoing requests, a friend button on a member's page,
   notifications for a request and its acceptance, profile page shows more to
   friends.
3. **Trip visibility**: column, the visibility policy, a selector in the trip
   form, shown on trip cards.
4. **Request kinds**: `tips` and `coffee` alongside `host_stay` and
   `co_accommodation`, sent to hosts who offer them, accepted through the
   existing accept path (contact is shared), notifications and copy.
5. **Home**: a friends band (what friends are doing), alongside the existing
   in-your-city and destinations bands; incoming friend requests surfaced.

## What was built (2026-10-06)

Six migrations, `20260921170000` to `20260921220000`, all applied to dev; pgTAP in
`usernames.sql`, `friendships.sql`, `trip_visibility.sql`,
`tips_and_coffee_requests.sql` and `home_feed_friends.sql`.

Judgement calls made while building, worth a second look:

- **Neighbourhood stays on match cards.** Hosts' neighbourhoods are shown to
  travellers choosing a host, so hiding them from non-friends would break
  matching. Bio, links and the full name are what is friends-only.
- **Tips and coffee requests go to hosts who offer them** (their availability
  already lists "tips" and "coffee"), from the trip's match screen. They are
  not yet offered from a friend's profile.
- **Accepting reuses `accept_co_request`**; acceptance and decline notifications
  keep their types and carry the kind in the payload.
- **Friend requests need an approved sender and an approved recipient.** A member
  waiting for approval can search and browse but not befriend.
- **Declining or cancelling deletes the row**, leaving no record that anyone was
  declined. There is no cooldown, only a cap of 50 requests waiting for an answer.
- **A public trip is visible to people who live in the destination or have a trip
  or availability there on overlapping dates**, which includes hosts offering
  nights then.

## Done when

- A member can claim a username at sign-up, find another by username or name,
  befriend them, and unfriend.
- A private trip is invisible to everyone except people it was sent to; a
  friends-only trip only to friends; a public one to friends, residents and
  overlapping visitors. pgTAP proves each, including that blocking and
  deletion remove friendships.
- A traveller can ask a host for tips or a coffee; accepting reveals contact.
- Home shows friends' trips alongside the city bands.
