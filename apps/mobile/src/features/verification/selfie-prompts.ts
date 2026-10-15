/**
 * Generates the pose instruction shown before the verification selfie.
 *
 * The point is not secrecy — it's that the instruction changes on every
 * attempt, so a moderator checking the photo against the emailed text can
 * tell a fresh photo from a reused one. The exact sentence is sent back to
 * submit-verification and lands in the email untouched, so whatever this
 * returns is what gets checked against.
 *
 * ONE HAND ONLY. Taking a selfie already takes a hand for the phone, and the
 * ID takes the other, so nothing here may ask for a second free hand. Every
 * variation is something the ID hand does while it holds the card: where the
 * card is held, and what the three fingers not pinching it are doing. Both are
 * easy to see in the photo and easy to check against the sentence.
 *
 * The card is pinched between thumb and first finger, which leaves the middle,
 * ring and little fingers free to show a sign.
 */

const HANDS = ['right', 'left'] as const

// `side` is the side of the face the ID hand is on, so the card stays in front
// of the hand holding it instead of reaching across the face.
const POSITIONS = [
  (side: string) => `beside your ${side} cheek`,
  (side: string) => `next to your ${side} ear`,
  () => 'just under your chin',
  () => 'level with your chest',
] as const

const SIGNS = [
  'your other three fingers spread wide',
  'your other three fingers held straight up together',
  'only your little finger raised',
] as const

export function pickSelfiePrompt(): string {
  const hand = HANDS[Math.floor(Math.random() * HANDS.length)]!
  const position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]!
  const sign = SIGNS[Math.floor(Math.random() * SIGNS.length)]!

  return (
    `Hold your ID in your ${hand} hand, pinched between your thumb and first ` +
    `finger, ${position(hand)}. Keep the text facing the camera and ${sign}.`
  )
}
