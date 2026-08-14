import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { TextField } from '@/components/text-field'
import { supabase } from '@/lib/supabase'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type City = {
  id: string
  name: string
  name_local: string | null
  country_code: string
  population: number
}

/**
 * Search-and-select over the fixed city table. Free text is never accepted —
 * the caller only ever receives a city id, which is what makes matching exact.
 */
export function CityPicker({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: City | null
  onChange: (city: City | null) => void
  error?: string
}) {
  const theme = useTheme()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 250)
    return () => clearTimeout(timer)
  }, [term])

  const results = useQuery({
    queryKey: ['cities', 'search', debounced],
    enabled: debounced.trim().length >= 2 && value === null,
    queryFn: async (): Promise<City[]> => {
      const { data, error: queryError } = await supabase.rpc('search_cities', {
        q: debounced,
        max_results: 12,
      })
      if (queryError) throw queryError
      return data ?? []
    },
  })

  if (value) {
    return (
      <View style={styles.container}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          {label.toUpperCase()}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${value.name}. Tap to change.`}
          onPress={() => {
            onChange(null)
            setTerm('')
          }}
          style={[
            styles.selected,
            { backgroundColor: theme.accentSubtle, borderColor: theme.accent },
          ]}
        >
          <Text style={[typography.bodyStrong, { color: theme.text }]}>
            {value.name}
            {value.name_local && value.name_local !== value.name ? ` · ${value.name_local}` : ''}
          </Text>
          <Text style={[typography.caption, { color: theme.textMuted }]}>
            {value.country_code} — tap to change
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TextField
        label={label}
        value={term}
        onChangeText={setTerm}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder="Start typing a city…"
        error={error}
      />

      {results.isFetching ? (
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
      ) : null}

      {results.data?.length ? (
        <View style={[styles.results, { borderColor: theme.border }]}>
          {results.data.map((city) => (
            <Pressable
              key={city.id}
              accessibilityRole="button"
              onPress={() => onChange(city)}
              style={({ pressed }) => [
                styles.result,
                { borderBottomColor: theme.border },
                pressed && { backgroundColor: theme.bgSubtle },
              ]}
            >
              <Text style={[typography.body, { color: theme.text }]}>{city.name}</Text>
              <Text style={[typography.caption, { color: theme.textMuted }]}>
                {city.name_local && city.name_local !== city.name
                  ? `${city.name_local} · ${city.country_code}`
                  : city.country_code}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : debounced.trim().length >= 2 && !results.isFetching ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>
          No city by that name. Try the local spelling, or a larger nearby city.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  selected: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
  },
  spinner: { alignSelf: 'flex-start' },
  results: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  result: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
})
