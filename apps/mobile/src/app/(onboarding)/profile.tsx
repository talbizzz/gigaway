import { isValidWhatsAppNumber, normalisePhoneNumber } from '@gigaway/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useSessionStore } from '@/features/auth/session-store'
import { contactKeys, useUpdateContactDetails } from '@/features/contacts/use-contacts'
import { profileKeys, useMyProfile } from '@/features/profile/use-profile'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Completes the profile after verification. The home city and a WhatsApp number
 * are the two strictly required things — the rest is encouraged but never
 * blocking, because a half-filled profile that can post a trip is worth more
 * than a perfect one nobody finished.
 *
 * WhatsApp is required because it is the whole point of the reveal: an accepted
 * offer hands the two of them each other's number, and a member with no number
 * to hand over can be accepted and still be unreachable.
 */
export default function ProfileSetupScreen() {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const session = useSessionStore((state) => state.session)
  const { data: profile } = useMyProfile()

  const updateContact = useUpdateContactDetails()

  const [city, setCity] = useState<City | null>(null)
  const [whatsapp, setWhatsapp] = useState('')
  const [district, setDistrict] = useState('')
  const [specialisation, setSpecialisation] = useState(profile?.specialisation ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!city) {
      setError('Choose your home city so colleagues know where you can host.')
      return
    }

    if (!isValidWhatsAppNumber(whatsapp)) {
      setError('Add your WhatsApp number with its country code, like +49 170 1234567.')
      return
    }

    setError(null)
    setSaving(true)

    // The number first: it is the newly required half, and writing it last
    // would let a failure here leave a profile the gate reads as complete.
    try {
      await updateContact.mutateAsync({ whatsapp: normalisePhoneNumber(whatsapp) })
    } catch (caught) {
      setSaving(false)
      setError((caught as Error).message)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        home_city_id: city.id,
        home_district: district.trim() || null,
        specialisation: specialisation.trim() || null,
        bio: bio.trim() || null,
      })
      .eq('id', session!.user.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    track('profile_completed')
    // The auth gate moves the user into the app once both halves are complete.
    await queryClient.invalidateQueries({ queryKey: profileKeys.mine(session?.user.id) })
    await queryClient.invalidateQueries({ queryKey: contactKeys.mine(session?.user.id) })
  }

  return (
    <Screen
      footer={
        <Button
          label="Finish"
          onPress={save}
          loading={saving}
          disabled={!city || !isValidWhatsAppNumber(whatsapp)}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>
          You're in{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
        </Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          A little about where you're based. This is what colleagues see when you offer a
          couch or ask for one.
        </Text>
      </View>

      <CityPicker label="Home city" value={city} onChange={setCity} />

      <TextField
        label="WhatsApp number"
        value={whatsapp}
        onChangeText={setWhatsapp}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="+49 170 1234567"
        hint="Shared with the other person only once an offer is accepted, together with your email. Nobody can see it before that."
      />

      <TextField
        label="Neighbourhood"
        value={district}
        onChangeText={setDistrict}
        placeholder="Neuhausen"
        hint="Roughly where you live. Never your address — that stays between you and a guest you've accepted."
      />

      <TextField
        label="Instrument or voice type"
        value={specialisation}
        onChangeText={setSpecialisation}
        placeholder="Mezzo-soprano"
      />

      <TextField
        label="About you"
        value={bio}
        onChangeText={setBio}
        placeholder="A line or two — where you studied, what you're working on."
        multiline
        numberOfLines={4}
        maxLength={600}
        style={styles.bio}
      />

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  bio: { minHeight: 110, textAlignVertical: 'top' },
})
