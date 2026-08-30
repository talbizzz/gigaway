import { formatDateRange, nightCount } from "@gigaway/shared";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Badge, type BadgeTone } from "@/components/badge";
import { Button, TextLink } from "@/components/button";
import { Callout } from "@/components/callout";
import { PersonRow } from "@/components/person";
import { Screen } from "@/components/screen";
import {
  useAcceptCoRequest,
  useDeclineRequest,
  useIncomingRequests,
  useOutgoingRequests,
  useWithdrawRequest,
  type StayRequest,
} from "@/features/requests/use-requests";
import {
  useSentOffers,
  useWithdrawOffer,
  type Offer,
} from "@/features/offers/use-offers";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Everything waiting on the user, in one place.
 *
 * Incoming asks come first because they are the only rows that need an action
 * from this person; what they have sent is below, so a traveller can see what
 * they are waiting on without hunting through trips.
 */
export default function RequestsScreen() {
  const theme = useTheme();
  const incoming = useIncomingRequests();
  const outgoing = useOutgoingRequests();
  const sentOffers = useSentOffers();

  if (incoming.isPending) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const pendingIn = (incoming.data ?? []).filter(
    (row) => row.status === "pending",
  );
  const handledIn = (incoming.data ?? []).filter(
    (row) => row.status !== "pending",
  );
  const sentRequests = outgoing.data ?? [];
  const offers = sentOffers.data ?? [];

  // A request stays pending after it has been answered with an offer, so the
  // card below has to know the offer exists — otherwise it goes on inviting a
  // second one. At most one can be live per trip; the database enforces it.
  const liveOfferByTrip = new Map(
    offers
      .filter((offer) => offer.status === "pending")
      .map((offer) => [offer.trip_id, offer]),
  );

  const nothingAtAll =
    pendingIn.length === 0 &&
    handledIn.length === 0 &&
    sentRequests.length === 0 &&
    offers.length === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Requests" }} />

      {nothingAtAll ? (
        <Callout title="Nothing waiting">
          When a colleague asks about your couch, or answers a trip you posted,
          it turns up here.
        </Callout>
      ) : null}

      {pendingIn.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            Waiting on you
          </Text>
          {pendingIn.map((request) => (
            <IncomingCard
              key={request.id}
              request={request}
              liveOffer={liveOfferByTrip.get(request.trip_id) ?? null}
            />
          ))}
        </View>
      ) : null}

      {offers.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            Your offers
          </Text>
          {offers.map((offer) => (
            <SentOfferCard key={offer.id} offer={offer} />
          ))}
        </View>
      ) : null}

      {sentRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            You asked
          </Text>
          {sentRequests.map((request) => (
            <OutgoingCard key={request.id} request={request} />
          ))}
        </View>
      ) : null}

      {handledIn.length > 0 ? (
        <View style={styles.section}>
          <Text style={[typography.heading, { color: theme.text }]}>
            Earlier
          </Text>
          {handledIn.map((request) => (
            <IncomingCard
              key={request.id}
              request={request}
              liveOffer={liveOfferByTrip.get(request.trip_id) ?? null}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * A request addressed to this member.
 *
 * The two kinds diverge here and the copy has to make that obvious: a host_stay
 * is answered with an offer that may cover fewer nights, while a
 * co-accommodation is accepted or declined outright — nobody is hosting.
 *
 * Answering does not close the request, so once an offer exists this card
 * becomes the way back to it rather than a second chance to make one.
 */
function IncomingCard({
  request,
  liveOffer,
}: {
  request: StayRequest;
  /** This host's unanswered offer on the same trip, if they have already made one. */
  liveOffer: Offer | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const acceptCo = useAcceptCoRequest();
  const decline = useDeclineRequest();

  const trip = request.trips;
  const nights = trip
    ? nightCount({ start: trip.start_date, end: trip.end_date })
    : 0;
  const pending = request.status === "pending";
  const isCo = request.kind === "co_accommodation";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
      ]}
    >
      <View style={styles.cardTop}>
        <PersonRow
          person={request.sender}
          onPress={() => router.push(`/member/${request.from_profile}`)}
        />
        {!pending ? (
          <Badge
            label={statusLabel(request.status)}
            tone={statusTone(request.status)}
          />
        ) : null}
      </View>

      <Text style={[typography.bodyStrong, { color: theme.text }]}>
        {isCo ? "Wants to split a place" : "Asked about your couch"}
      </Text>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {trip?.cities?.name} ·{" "}
        {formatDateRange(trip?.start_date, trip?.end_date)} · {nights} night
        {nights === 1 ? "" : "s"}
      </Text>

      {request.message ? (
        <Text
          style={[
            typography.body,
            { color: theme.text, marginTop: spacing.xs },
          ]}
        >
          “{request.message}”
        </Text>
      ) : null}

      {pending ? (
        isCo ? (
          <>
            <Callout tone="neutral">
              Neither of you is hosting. Accepting shares your contact details
              so you can book something together.
            </Callout>
            <Button
              label="Accept and share contacts"
              onPress={() => {
                acceptCo.mutate(request.id, {
                  onSuccess: (result) =>
                    router.push(`/contact/${result.grantedWith}`),
                });
              }}
              loading={acceptCo.isPending}
            />
            <TextLink
              label="Not this time"
              onPress={() => decline.mutate(request.id)}
            />
          </>
        ) : liveOffer ? (
          <>
            {/*
                Already answered. Offering again would leave two overlapping
                offers on one trip and let the traveller accept either, so the
                only way forward from here is the offer that exists.
              */}
            <Callout tone="success" title="You have offered these nights">
              {formatDateRange(liveOffer.start_date, liveOffer.end_date)} ·{" "}
              {nightCount({
                start: liveOffer.start_date,
                end: liveOffer.end_date,
              })}{" "}
              night
              {nightCount({
                start: liveOffer.start_date,
                end: liveOffer.end_date,
              }) === 1
                ? ""
                : "s"}
              . Waiting on their answer.
            </Callout>
            <Button
              label="Change your offer"
              variant="secondary"
              onPress={() => router.push(`/offer/edit/${liveOffer.id}`)}
            />
          </>
        ) : (
          <>
            {/*
                The nudge that makes the product work. A host who cannot do the
                whole week routinely assumes they are no use at all; three nights
                is three nights not paid for.
              */}
            <Callout tone="neutral">
              You do not have to offer all {nights} nights. Whatever you can
              manage is worth having.
            </Callout>
            <Button
              label="Offer nights"
              onPress={() =>
                router.push({
                  pathname: "/offer/new",
                  params: { tripId: request.trip_id, requestId: request.id },
                })
              }
            />
            <TextLink
              label="Not this time"
              onPress={() => decline.mutate(request.id)}
            />
          </>
        )
      ) : null}
    </View>
  );
}

function OutgoingCard({ request }: { request: StayRequest }) {
  const theme = useTheme();
  const router = useRouter();
  const withdraw = useWithdrawRequest();
  const trip = request.trips;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
      ]}
    >
      <View style={styles.cardTop}>
        <PersonRow
          person={request.recipient}
          size={36}
          onPress={() => router.push(`/member/${request.to_profile}`)}
        />
        <Badge
          label={statusLabel(request.status)}
          tone={statusTone(request.status)}
        />
      </View>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {trip?.cities?.name} ·{" "}
        {formatDateRange(trip?.start_date, trip?.end_date)}
      </Text>

      {request.status === "pending" ? (
        <TextLink
          label="Withdraw"
          onPress={() => withdraw.mutate(request.id)}
        />
      ) : null}
    </View>
  );
}

function SentOfferCard({ offer }: { offer: Offer }) {
  const theme = useTheme();
  const router = useRouter();
  const withdraw = useWithdrawOffer();
  const nights = nightCount({ start: offer.start_date, end: offer.end_date });

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.bgSubtle, borderColor: theme.border },
      ]}
    >
      <View style={styles.cardTop}>
        <PersonRow
          person={offer.traveller}
          size={36}
          onPress={() => router.push(`/member/${offer.to_profile}`)}
        />
        <Badge
          label={
            offer.auto_declined
              ? "They found a couch"
              : statusLabel(offer.status)
          }
          tone={statusTone(offer.status)}
        />
      </View>
      <Text style={[typography.caption, { color: theme.textMuted }]}>
        {nights} night{nights === 1 ? "" : "s"} ·{" "}
        {offer.cities?.name ?? offer.trips?.cities?.name} ·{" "}
        {formatDateRange(offer.start_date, offer.end_date)}
      </Text>

      {offer.status === "pending" ? (
        <>
          <TextLink
            label="Change offer"
            onPress={() => router.push(`/offer/edit/${offer.id}`)}
          />
          <TextLink
            label="Withdraw offer"
            onPress={() => withdraw.mutate(offer.id)}
          />
        </>
      ) : null}
    </View>
  );
}

function statusLabel(status: string): string {
  return (
    {
      pending: "Waiting",
      accepted: "Accepted",
      declined: "Declined",
      withdrawn: "Withdrawn",
      expired: "Expired",
    }[status] ?? status
  );
}

function statusTone(status: string): BadgeTone {
  return (
    (
      {
        pending: "muted",
        accepted: "success",
        declined: "muted",
        withdrawn: "muted",
        expired: "muted",
      } as Record<string, BadgeTone>
    )[status] ?? "muted"
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { gap: spacing.md },
  card: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
});
