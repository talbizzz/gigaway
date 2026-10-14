import {
  BIO_MAX_LENGTH,
  disciplineExample,
  isValidPhoneNumber,
  normalisePhoneNumber,
  normaliseUsername,
} from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { ErrorBanner, notice, type Notice } from '@/components/error-banner'
import { CityPicker, type City } from '@/components/city-picker'
import { OptionChips } from '@/components/option-chips'
import { PhoneField } from '@/components/phone-field'
import { UsernameField } from '@/components/username-field'
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
import { usernameBlocksSubmit, useUsernameStatus } from '@/features/profile/use-username-status'
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
  const [error, setError] = useState<Notice | null>(null)

  const initialLinks = (profile.links ?? []) as { label: string; url: string }[]

  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [username, setUsername] = useState(profile.username ?? '')
  const [discipline, setDiscipline] = useState<DisciplineValue>(
    profile.discipline as DisciplineValue,
  )
  const [specialisation, setSpecialisation] = useState(profile.specialisation ?? '')
  const [district, setDistrict] = useState(profile.home_district ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [website, setWebsite] = useState(initialLinks[0]?.url ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
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
    username: normaliseUsername(username),
    first_name: firstName.trim(),
    last_name: lastName.trim() || null,
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
  const phoneChanged = normalisePhoneNumber(phone) !== (contact?.phone ?? '')

  // A member from before the split may have no family name yet. They can save
  // everything else without one, but cannot clear one they already have.
  const usernameStatus = useUsernameStatus(username, profile.username)
  // The name can stay as it is; a changed one has to be free and well formed.
  const usernameBlocked =
    usernameStatus.state !== 'unchanged' && usernameBlocksSubmit(usernameStatus)

  const nameValid =
    firstName.trim().length > 0 && (lastName.trim().length > 0 || !profile.last_name)

  // What the database will derive from these two fields — the same rule as
  // format_public_name(), shown so the member knows what others will see.
  const previewName = lastName.trim()
    ? `${firstName.trim()} ${lastName.trim().charAt(0).toUpperCase()}.`
    : firstName.trim()

  const changed =
    phoneChanged ||
    draft.username !== (profile.username ?? '') ||
    draft.first_name !== (profile.first_name ?? '') ||
    draft.last_name !== (profile.last_name ?? null) ||
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
    try {
      if (phoneChanged) {
        await updateContact.mutateAsync({ phone: normalisePhoneNumber(phone) })
      }
      await update.mutateAsync(draft)
    } catch (e) {
      // A banner over the top of the form: the reason would otherwise sit below
      // the last field, off screen from the Save button the member just pressed.
      setError(notice(e))
      return
    }
    // Back to the read view, which re-reads the invalidated profile. The
    // confirmation is seeing the change, rather than a "Saved." notice on a
    // form the member then has to leave by hand.
    router.back()
  }

  return (
    <Screen
      overlay={<ErrorBanner notice={error} />}
      footer={
        <Button
          label="Save changes"
          onPress={save}
          loading={update.isPending || updateContact.isPending}
          disabled={!changed || !nameValid || usernameBlocked || !isValidPhoneNumber(phone)}
        />
      }
    >
      <Stack.Screen options={{ title: 'Edit profile' }} />

      <View style={styles.avatarRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() =>
            uploadAvatar.mutate(undefined, { onError: (e) => setError(notice(e)) })
          }
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

      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />

      <TextField
        label="Family name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
        hint={`Other members see you as “${previewName}”.`}
      />

      <UsernameField
        value={username}
        onChangeText={setUsername}
        status={usernameStatus}
        hint="How colleagues find you. You can change it once every 30 days."
      />

      <OptionChips<DisciplineValue>
        label="Discipline"
        options={DISCIPLINES}
        value={discipline}
        onChange={setDiscipline}
      />

      <TextField
        label="Your profession (optional)"
        value={specialisation}
        onChangeText={setSpecialisation}
        placeholder={disciplineExample(discipline)}
      />

      <CityPicker label="Home city" value={selectedCity} onChange={setCity} />

      <PhoneField
        label="Phone number"
        value={phone}
        onChange={setPhone}
        error={
          phone.length > 0 && !isValidPhoneNumber(phone)
            ? 'That number doesn’t look right. Enter it without the country code.'
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
        maxLength={BIO_MAX_LENGTH}
        hint={`${bio.length}/${BIO_MAX_LENGTH}`}
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
