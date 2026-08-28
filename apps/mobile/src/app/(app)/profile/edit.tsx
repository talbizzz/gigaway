import { isValidWhatsAppNumber, normalisePhoneNumber } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { OptionChips } from '@/components/option-chips'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import { useCity } from '@/features/cities/use-city'
import {
  useMyContactDetails,
  useUpdateContactDetails,
  type ContactDetails,
} from '@/features/contacts/use-contacts'
import {
  DISCIPLINES,
  useMyProfile,
  type DisciplineValue,
  type Profile,
} from '@/features/profile/use-profile'
import { avatarUrl, useUpdateProfile, useUploadAvatar } from '@/features/profile/use-update-profile'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Editing your own profile.
 *
 * Pushed over the tab bar rather than living inside the profile tab: a form
 * with unsaved state should not sit one stray tab tap away from being
 * abandoned, and the stack gives it a back affordance the tab bar cannot.
 */
export default function EditProfileScreen() {
  const theme = useTheme()
  const { data: profile } = useMyProfile()
  const contact = useMyContactDetails()

  // The form seeds its state from the loaded profile and contact row, so it is
  // only mounted once both exist. Keying on the id remounts it if the identity
  // ever changes — which avoids seeding state from inside an effect.
  if (!profile || contact.isPending) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <Stack.Screen options={{ title: 'Edit profile' }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return <ProfileForm key={profile.id} profile={profile} contact={contact.data ?? null} />
}

function ProfileForm({
  profile,
  contact,
}: {
  profile: Profile
  contact: ContactDetails | null
}) {
  const theme = useTheme()
  const router = useRouter()
  const update = useUpdateProfile()
  const updateContact = useUpdateContactDetails()
  const uploadAvatar = useUploadAvatar()

  const initialLinks = (profile.links ?? []) as { label: string; url: string }[]

  const [displayName, setDisplayName] = useState(profile.display_name)
  const [discipline, setDiscipline] = useState<DisciplineValue>(
    profile.discipline as DisciplineValue,
  )
  const [specialisation, setSpecialisation] = useState(profile.specialisation ?? '')
  const [district, setDistrict] = useState(profile.home_district ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [website, setWebsite] = useState(initialLinks[0]?.url ?? '')
  const [whatsapp, setWhatsapp] = useState(contact?.whatsapp ?? '')
  // `undefined` means untouched — fall back to the stored city. `null` means
  // the member cleared it to search for another, which is what the picker's
  // tap-to-change sends. Collapsing the two into one null would make the
  // fallback fire on every clear, leaving the stored city unchangeable.
  const [city, setCity] = useState<City | null | undefined>(undefined)

  const currentCity = useCity(profile.home_city_id)
  const selectedCity = city === undefined ? (currentCity.data ?? null) : city
  const photo = avatarUrl(profile.photo_path)

  // What saving would write. Built once so the enabled state of the button and
  // the update itself cannot drift apart — the button is only live when this
  // differs from what is already stored.
  const draft = {
    display_name: displayName.trim(),
    discipline,
    specialisation: specialisation.trim() || null,
    home_city_id: selectedCity?.id,
    home_district: district.trim() || null,
    bio: bio.trim() || null,
    links: website.trim() ? [{ label: 'Website', url: website.trim() }] : [],
  }

  // A null city writes nothing to that column, so it is not a change — which
  // also covers the window before the stored city has loaded.
  const cityChanged = selectedCity !== null && selectedCity.id !== profile.home_city_id

  // Compared normalised, so retyping the same number with different spacing is
  // not a change.
  const whatsappChanged = normalisePhoneNumber(whatsapp) !== (contact?.whatsapp ?? '')

  const changed =
    whatsappChanged ||
    draft.display_name !== profile.display_name ||
    draft.discipline !== profile.discipline ||
    draft.specialisation !== (profile.specialisation ?? null) ||
    draft.home_district !== (profile.home_district ?? null) ||
    draft.bio !== (profile.bio ?? null) ||
    website.trim() !== (initialLinks[0]?.url ?? '') ||
    cityChanged

  const save = async () => {
    // The number first, and only when it actually changed: it is the required
    // half, so a failure here must not be preceded by a successful profile
    // write that makes the form look saved.
    if (whatsappChanged) {
      await updateContact.mutateAsync({ whatsapp: normalisePhoneNumber(whatsapp) })
    }
    await update.mutateAsync(draft)
    // Back to the read view, which re-reads the invalidated profile. The
    // confirmation is seeing the change, rather than a "Saved." notice on a
    // form the member then has to leave by hand.
    router.back()
  }

  return (
    <Screen
      footer={
        <Button
          label="Save changes"
          onPress={save}
          loading={update.isPending || updateContact.isPending}
          disabled={!changed || !isValidWhatsAppNumber(whatsapp)}
        />
      }
    >
      <Stack.Screen options={{ title: 'Edit profile' }} />

      <View style={styles.avatarRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => uploadAvatar.mutate()}
          style={[styles.avatar, { backgroundColor: theme.bgSubtle, borderColor: theme.border }]}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text style={[typography.caption, { color: theme.textMuted }]}>Add photo</Text>
          )}
        </Pressable>

        <View style={styles.avatarHint}>
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            {profile.display_name}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {uploadAvatar.isPending ? 'Uploading…' : 'Tap the circle to change your photo.'}
          </Text>
        </View>
      </View>

      {uploadAvatar.isError ? (
        <Callout tone="danger">{(uploadAvatar.error as Error).message}</Callout>
      ) : null}

      <TextField label="Your name" value={displayName} onChangeText={setDisplayName} />

      <OptionChips<DisciplineValue>
        label="Discipline"
        options={DISCIPLINES}
        value={discipline}
        onChange={setDiscipline}
      />

      <TextField
        label="Instrument or voice type"
        value={specialisation}
        onChangeText={setSpecialisation}
        placeholder="Mezzo-soprano"
      />

      <CityPicker label="Home city" value={selectedCity} onChange={setCity} />

      <TextField
        label="WhatsApp number"
        value={whatsapp}
        onChangeText={setWhatsapp}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="+49 170 1234567"
        error={
          whatsapp.length > 0 && !isValidWhatsAppNumber(whatsapp)
            ? 'Include the country code, like +49 170 1234567.'
            : undefined
        }
        hint="Shared with the other person only once an offer is accepted, together with your email."
      />

      <TextField
        label="Neighbourhood"
        value={district}
        onChangeText={setDistrict}
        placeholder="Neuhausen"
        hint="Shown to members before a match. Your exact address is never stored here."
      />

      <TextField
        label="About you"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={4}
        maxLength={600}
        style={styles.bio}
      />

      <TextField
        label="Website"
        value={website}
        onChangeText={setWebsite}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://your-website.com"
      />

      {update.isError || updateContact.isError ? (
        <Callout tone="danger">
          {((update.error ?? updateContact.error) as Error).message}
        </Callout>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarHint: { flex: 1, gap: 2 },
  bio: { minHeight: 110, textAlignVertical: 'top' },
})
