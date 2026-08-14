import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { CityPicker, type City } from '@/components/city-picker'
import { OptionChips } from '@/components/option-chips'
import { Screen } from '@/components/screen'
import { TextField } from '@/components/text-field'
import {
  DISCIPLINES,
  useMyProfile,
  type DisciplineValue,
  type Profile,
} from '@/features/profile/use-profile'
import {
  avatarUrl,
  useUpdateProfile,
  useUploadAvatar,
} from '@/features/profile/use-update-profile'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function ProfileScreen() {
  const theme = useTheme()
  const { data: profile } = useMyProfile()

  // The form seeds its state from the loaded profile, so it is only mounted
  // once that profile exists. Keying on the id remounts it if the identity
  // ever changes — which avoids seeding state from inside an effect.
  if (!profile) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return <ProfileForm key={profile.id} profile={profile} />
}

function ProfileForm({ profile }: { profile: Profile }) {
  const theme = useTheme()
  const update = useUpdateProfile()
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
  const [city, setCity] = useState<City | null>(null)
  const [saved, setSaved] = useState(false)

  const currentCity = useQuery({
    queryKey: ['cities', 'byId', profile.home_city_id],
    enabled: Boolean(profile.home_city_id),
    queryFn: async (): Promise<City | null> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, name_local, country_code, population')
        .eq('id', profile.home_city_id!)
        .single()
      if (error) throw error
      return data
    },
  })

  const selectedCity = city ?? currentCity.data ?? null
  const photo = avatarUrl(profile.photo_path)

  const save = async () => {
    setSaved(false)
    await update.mutateAsync({
      display_name: displayName.trim(),
      discipline,
      specialisation: specialisation.trim() || null,
      home_city_id: selectedCity?.id,
      home_district: district.trim() || null,
      bio: bio.trim() || null,
      links: website.trim() ? [{ label: 'Website', url: website.trim() }] : [],
    })
    setSaved(true)
  }

  return (
    <Screen footer={<Button label="Save changes" onPress={save} loading={update.isPending} />}>
      <Stack.Screen options={{ title: 'Your profile' }} />

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

      {update.isError ? (
        <Callout tone="danger">{(update.error as Error).message}</Callout>
      ) : saved ? (
        <Callout tone="success">Saved.</Callout>
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
