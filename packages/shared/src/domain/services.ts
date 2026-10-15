/**
 * The services a member can offer: a couch, a spare room, a coffee, or local
 * tips.
 *
 * Each post offers exactly ONE of them. The values are what availability.offers
 * stores, and must match the `availability_offers_known` constraint. A couch or
 * a spare room is somewhere to sleep ("a stay"); a coffee or tips is not, and
 * that difference decides which details a post asks for and whether it can ever
 * be the source of an offer of nights.
 */
export const SERVICE_KINDS = ['couch', 'spare_room', 'coffee', 'tips'] as const

export type ServiceKind = (typeof SERVICE_KINDS)[number]

export type ServiceDefinition = {
  value: ServiceKind
  /** Short, for lists and tags. */
  label: string
  /** The heading of its form. */
  title: string
  /** One line, shown when choosing. */
  description: string
  /** Somewhere to sleep, so it has nights, a maximum stay and house rules. */
  stay: boolean
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    value: 'couch',
    label: 'Couch',
    title: 'Offer a couch',
    description: 'A couch or sofa bed for a colleague who needs somewhere to sleep.',
    stay: true,
  },
  {
    value: 'spare_room',
    label: 'Spare room',
    title: 'Offer a spare room',
    description: 'A room of their own for the length of a stay.',
    stay: true,
  },
  {
    value: 'coffee',
    label: 'Coffee',
    title: 'Offer a coffee',
    description: 'Meet a visiting colleague for a coffee and a chat.',
    stay: false,
  },
  {
    value: 'tips',
    label: 'Local tips',
    title: 'Offer local tips',
    description: 'Tell visitors what you know about the city: where to rehearse, eat, find things.',
    stay: false,
  },
]

export function isServiceKind(value: unknown): value is ServiceKind {
  return typeof value === 'string' && (SERVICE_KINDS as readonly string[]).includes(value)
}

export function serviceDefinition(kind: string | null | undefined): ServiceDefinition | undefined {
  return SERVICES.find((service) => service.value === kind)
}

/** The readable name of a service, falling back to the stored value. */
export function serviceLabel(kind: string | null | undefined): string {
  if (!kind) return ''
  return serviceDefinition(kind)?.label ?? kind
}

/** True for a couch or a spare room: somewhere to sleep. */
export function isStayService(kind: string | null | undefined): boolean {
  return serviceDefinition(kind)?.stay ?? false
}

/** True when any of the services is somewhere to sleep. */
export function offersAStay(kinds: readonly string[] | null | undefined): boolean {
  return (kinds ?? []).some(isStayService)
}
