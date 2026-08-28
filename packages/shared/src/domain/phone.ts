import { z } from 'zod'

/**
 * WhatsApp numbers.
 *
 * Stored in E.164 — a leading `+`, country code, then the national number, no
 * spaces or punctuation. That is not house style for its own sake: wa.me takes
 * digits only and has no idea what country the reader is in, so a German member
 * who stores "0170 1234567" produces a link that dials a nonexistent number in
 * whatever country the person tapping it happens to be. Requiring the country
 * code at entry is the only point where that can be caught.
 *
 * Deliberately not a full phone-number library. The check is that a number is
 * plausibly dialable internationally; whether it rings is between the two
 * members, and a wrong-but-well-formed number fails visibly at the first
 * message rather than silently at the database.
 */

/** E.164 allows at most 15 digits after the `+`. Eight is the shortest that is plausible. */
const E164 = /^\+[1-9]\d{7,14}$/

/**
 * Strips the punctuation people naturally type — spaces, dashes, brackets,
 * and the dots some European sites use — leaving a leading `+` and digits.
 * A leading `00` international prefix is rewritten to `+`, because it means
 * exactly the same thing and is how most of the continent writes it.
 */
export function normalisePhoneNumber(input: string): string {
  const stripped = input.replace(/[\s().-]/g, '')
  if (stripped.startsWith('00')) return `+${stripped.slice(2)}`
  return stripped
}

export const WhatsAppNumberSchema = z
  .string()
  .transform(normalisePhoneNumber)
  .refine((value) => E164.test(value), {
    message: 'Include the country code, like +49 170 1234567.',
  })

/** True when the input normalises to something dialable internationally. */
export function isValidWhatsAppNumber(input: string): boolean {
  return E164.test(normalisePhoneNumber(input))
}

/**
 * The wa.me deep link. Digits only — wa.me rejects the `+`, spaces and dashes,
 * so this is the one place that conversion should live.
 */
export function whatsAppLink(number: string): string {
  return `https://wa.me/${normalisePhoneNumber(number).replace(/\D/g, '')}`
}
