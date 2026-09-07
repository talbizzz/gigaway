# Google Play — Default store listing

Copy each block into Play Console verbatim. Character counts are checked by
`store/play/check-listing.sh`.

---

## App name (max 30)

```
GigAway
```

---

## Short description (max 80)

```
Invite-only couch sharing for performing artists who travel for work.
```

---

## Full description (max 4000)

```
GigAway is a closed, invite-only network for professional performing artists —
singers, instrumentalists and dancers — who travel constantly for auditions,
competitions and guest contracts.

Post a trip, and see verified colleagues in that city who have a couch free, know
the place, or are heading there the same week.

No money changes hands. GigAway takes no fee and is not an accommodation
provider. It exists because lodging is usually the single largest cost of a
four-day competition, and because a colleague's spare couch is often sitting
empty that same week.


HOW IT WORKS

Post a trip — destination city, dates, and what you are looking for: a couch,
local tips, company, or someone to split a room with.

See who is there — verified members in that city whose availability overlaps your
dates, plus other artists travelling there in the same window.

Ask, or be asked — send a request, or answer one. Hosts can offer part of your
dates rather than all of them, and can revise an offer before it is answered.

Arrange it directly — contact details are revealed to both sides only when an
offer is accepted. Nothing is shared before that.


WHY IT IS CLOSED

Membership is restricted to working artists, and that wall is the product. It is
the reason anyone trusts a stranger enough to host them.

There are two ways in: an invite from an existing member, or document review,
where a human reads evidence of professional standing. Invites are rationed, so
the network cannot dilute quietly, and every member is traceable to whoever
vouched for them.

We do not ask for identity documents. Verification confirms that you work in this
field — nothing more.


BUILT AROUND PRIVACY

Broadcasting to a large group that your flat is empty for four days is a real
deterrent to taking part. GigAway is built so you never have to.

- Your street address is never asked for or stored — only a city, and optionally
  a district
- Contact details stay hidden until a stay is agreed
- Access is enforced in the database, not just the interface: an unapproved
  account sees no member content at all
- Blocking is instant and mutual
- Reports are private, and the reported person is never told who raised them
- Verification documents are deleted the moment a decision is made


REPUTATION THAT TRAVELS

After a stay, both sides can leave a review. Reviews are published double-blind —
neither is shown until both are written, or fourteen days have passed — so nobody
is writing in response to what the other person said.


WHO IT IS FOR

Professional and pre-professional performing artists in Europe. Conservatory
students through mid-career freelancers, travelling five to twenty times a year,
in a small world where reputation carries real weight.

Both sides of the network are the same people. You are a traveller on some trips
and a host in your own city on others.


GigAway is currently in closed testing. You will need an invite from an existing
member, or an approved application, to take part.

Privacy policy: https://gigaway.app/privacy
Terms of service: https://gigaway.app/terms
Community guidelines: https://gigaway.app/guidelines
```

---

## Assets

| Asset                      | File                             | Status                                              |
| -------------------------- | -------------------------------- | --------------------------------------------------- |
| App icon, 512×512          | `store/play/icon-512.png`        | Generated from `apps/mobile/assets/images/icon.png` |
| Feature graphic, 1024×500  | `store/play/feature-graphic.png` | Generated                                           |
| Phone screenshots, 2–8     | —                                | **You must capture these from the app**             |
| 7-inch tablet screenshots  | —                                | Only if Play insists; see below                     |
| 10-inch tablet screenshots | —                                | Only if Play insists; see below                     |
| Promo video                | —                                | Optional, skip                                      |

### The screenshot aspect-ratio trap

Play requires **16:9 or 9:16** with each side between 320 px and 3840 px.

Modern Android phones are taller than that — a Pixel screenshot is around
1080×2400, which is 9:20 and **will be rejected**. Raw screenshots off your phone
almost certainly will not pass as-is.

Capture them anyway and they can be padded to a clean 1080×1920 with the app's
own background colour, which satisfies the ratio without stretching anything.
`store/play/pad-screenshots.sh` does that.

### Which screens to capture

Four to six, in the order a new member meets them:

1. **Home feed** — who is around, the passive view
2. **A trip** with matches, showing colleagues in that city
3. **A member profile**, with reviews visible
4. **The offer or acceptance screen**, where contact details are revealed
5. **Availability**, from the host's side
6. Optional: profile or settings

Sign in as the demo account first, so the screenshots show a populated app rather
than empty states.
