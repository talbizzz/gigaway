/**
 * Usernames.
 *
 * 3-20 characters: lower case letters, digits, dots and underscores, starting
 * and ending with a letter or digit, with no two dots or underscores in a row.
 * Stored lower case. These rules are repeated by is_valid_username() in the
 * database, which is the real gate; this copy exists so the app can say what is
 * wrong. Change one, change the other (username.test.ts states the rule).
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

/** Not available to anyone. Matches the list in is_valid_username(). */
export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'help',
  'gigaway',
  'official',
  'staff',
  'team',
  'security',
  'system',
  'root',
  'null',
  'undefined',
  'anonymous',
  'deleted',
  'deleted_member',
] as const

export type UsernameProblem =
  | 'too_short'
  | 'too_long'
  | 'characters'
  | 'edges'
  | 'repeated'
  | 'reserved'

/** Lower case, trimmed, with any leading @ dropped, which is how people type it. */
export function normaliseUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase()
}

/** What is wrong with a username, or null when it is fine. */
export function usernameProblem(input: string): UsernameProblem | null {
  const value = normaliseUsername(input)

  if (value.length < USERNAME_MIN_LENGTH) return 'too_short'
  if (value.length > USERNAME_MAX_LENGTH) return 'too_long'
  if (!/^[a-z0-9._]+$/.test(value)) return 'characters'
  if (!/^[a-z0-9].*[a-z0-9]$/.test(value)) return 'edges'
  if (/[._]{2}/.test(value)) return 'repeated'
  if ((RESERVED_USERNAMES as readonly string[]).includes(value)) return 'reserved'
  return null
}

export function isValidUsername(input: string): boolean {
  return usernameProblem(input) === null
}

export const USERNAME_PROBLEM_MESSAGES: Record<UsernameProblem, string> = {
  too_short: `Use at least ${USERNAME_MIN_LENGTH} characters.`,
  too_long: `Use at most ${USERNAME_MAX_LENGTH} characters.`,
  characters: 'Use only letters, digits, dots and underscores.',
  edges: 'Start and end with a letter or a digit.',
  repeated: 'No two dots or underscores in a row.',
  reserved: 'That name is reserved. Choose another.',
}

export function usernameProblemMessage(input: string): string | null {
  const problem = usernameProblem(input)
  return problem ? USERNAME_PROBLEM_MESSAGES[problem] : null
}
