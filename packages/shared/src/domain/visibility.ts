/**
 * Who can see a trip.
 *
 * Stored in trips.visibility and enforced by the trips policy in the database;
 * this is only the names and explanations the app shows. The three words are the
 * stored values.
 */
export const TRIP_VISIBILITIES = ['public', 'connections', 'private'] as const

export type TripVisibility = (typeof TRIP_VISIBILITIES)[number]

export const DEFAULT_TRIP_VISIBILITY: TripVisibility = 'public'

export const TRIP_VISIBILITY_LABELS: Record<TripVisibility, string> = {
  public: 'Public',
  connections: 'Connections only',
  private: 'Private',
}

/** What each choice means in plain words, with the destination named if known. */
export function tripVisibilityDescription(
  visibility: TripVisibility,
  cityName?: string | null,
): string {
  const city = cityName?.trim() || 'the city you are going to'

  switch (visibility) {
    case 'public':
      return `Your connections, people who live in ${city}, and anyone who will be there at the same time.`
    case 'connections':
      return 'Only your connections.'
    case 'private':
      return 'Only the people you ask for a place to stay, tips or a coffee.'
  }
}

export function isTripVisibility(value: unknown): value is TripVisibility {
  return typeof value === 'string' && (TRIP_VISIBILITIES as readonly string[]).includes(value)
}
