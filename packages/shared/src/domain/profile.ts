/**
 * Longest "about you" text a member can save.
 *
 * Must match the `bio_length` constraint on profiles.bio in the database; the
 * app stops typing at this length and the database refuses anything longer.
 */
export const BIO_MAX_LENGTH = 750
