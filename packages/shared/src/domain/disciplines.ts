/**
 * The categories a member chooses between at sign-up.
 *
 * The values are what is stored in profiles.discipline, and must match the
 * `discipline_known` constraint and normalize_discipline() in the database.
 * `example` is the placeholder shown when asking for a more specific
 * profession; `other` has none, because there is nothing sensible to suggest.
 */
export const DISCIPLINES = [
  { value: 'singer', label: 'Singer', example: 'Mezzo-soprano' },
  { value: 'instrumentalist', label: 'Instrumentalist', example: 'Cello' },
  { value: 'musical_theatre', label: 'Musical Theatre', example: 'Ensemble' },
  { value: 'dancer', label: 'Dancer', example: 'Contemporary' },
  { value: 'actor', label: 'Actor/Actress', example: 'Film and stage' },
  { value: 'conductor', label: 'Conductor', example: 'Choral conductor' },
  { value: 'stage_director', label: 'Stage Director', example: 'Opera director' },
  { value: 'artist', label: 'Artist', example: 'Painter' },
  { value: 'photographer', label: 'Photographer', example: 'Portrait photographer' },
  { value: 'designer', label: 'Designer', example: 'Costume designer' },
  { value: 'other', label: 'Other', example: '' },
] as const

export type DisciplineValue = (typeof DISCIPLINES)[number]['value']

/**
 * The readable name for a stored value. Falls back to the value itself rather
 * than to nothing, so an unexpected one still shows something recognisable.
 */
export function disciplineLabel(value: string | null | undefined): string {
  if (!value) return ''
  return DISCIPLINES.find((d) => d.value === value)?.label ?? value
}

/** A suggestion for the "specify your profession" field, or '' for none. */
export function disciplineExample(value: string | null | undefined): string {
  return DISCIPLINES.find((d) => d.value === value)?.example ?? ''
}
