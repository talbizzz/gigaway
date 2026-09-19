/**
 * Generates the pose instruction shown before the verification selfie.
 *
 * The point is not secrecy — it's that the instruction changes on every
 * attempt, so a moderator checking the photo against the emailed text can
 * tell a fresh photo from a reused one. The exact sentence is sent back to
 * submit-verification and lands in the email untouched, so whatever this
 * returns is what gets checked against.
 */

const HANDS = ['right', 'left'] as const

const GESTURES = [
  'hold up one finger',
  'hold up two fingers',
  'hold up three fingers',
  'give a thumbs up',
  'show an open palm',
  'make a fist',
] as const

export function pickSelfiePrompt(): string {
  const idHand = HANDS[Math.floor(Math.random() * HANDS.length)]
  const otherHand = idHand === 'right' ? 'left' : 'right'
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)]

  return (
    `Hold your ID in your ${idHand} hand, clearly visible, and with your ` +
    `${otherHand} hand ${gesture}.`
  )
}
