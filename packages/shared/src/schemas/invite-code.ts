import { z } from "zod";

/**
 * Invite codes are 8 characters from an unambiguous alphabet.
 *
 * `I`, `O`, `0` and `1` are excluded so that a code read aloud over the phone,
 * or retyped from a screenshot, cannot be transcribed wrongly.
 *
 * NOTE: this alphabet is duplicated in SQL (`generate_invite_code()`), because
 * codes are generated database-side. If it changes here, change it there too.
 */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

const INVITE_CODE_PATTERN = new RegExp(
  `^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`,
);

/**
 * Accepts user input leniently — trims whitespace and upper-cases — then
 * validates. Users paste codes out of WhatsApp messages, so leading spaces and
 * lower case are expected, not exceptional.
 */
export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => INVITE_CODE_PATTERN.test(value), {
    message: `Invite codes are ${INVITE_CODE_LENGTH} characters (letters and numbers).`,
  });

export type InviteCode = z.infer<typeof InviteCodeSchema>;

/** True if the string could be a valid code. Used for cheap client-side UI feedback. */
export function looksLikeInviteCode(value: string): boolean {
  return INVITE_CODE_PATTERN.test(value.trim().toUpperCase());
}
