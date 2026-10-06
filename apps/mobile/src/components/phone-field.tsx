import {
  COUNTRIES,
  countryByIso,
  defaultCountry,
  flagEmoji,
  joinPhoneNumber,
  normalisePhoneNumber,
  splitPhoneNumber,
  type Country,
} from '@gigaway/shared'
import { getLocales } from 'expo-localization'
import { useMemo, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TextField } from '@/components/text-field'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/** Listed first, so most people find theirs without searching. */
const COMMON_ISOS = ['DE', 'AT', 'CH', 'GB', 'FR', 'IT', 'ES', 'NL', 'US']

/**
 * A phone number entered as a country code plus the national number.
 *
 * Two labelled boxes rather than one string with a `+` at the front, because
 * "include the country code" is the part people get wrong. The value in and out
 * is still plain E.164 (+491701234567), or '' until a number has been typed, so
 * nothing downstream changes.
 *
 * Tapping the country code opens a bottom sheet with every country, searchable.
 * The country starts from the number if there is one, otherwise from the
 * device's region. Pasting a whole international number into the number box
 * (+49 170 …, or 0049 …) sets the country from it.
 */
export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string
  /** E.164, or '' when empty. */
  value: string
  onChange: (e164: string) => void
  error?: string
  hint?: string
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const initial = useMemo(() => splitPhoneNumber(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<Country>(
    initial?.country ?? defaultCountry(getLocales()[0]?.regionCode),
  )
  const [national, setNational] = useState(initial?.national ?? '')
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')

  // Nothing typed: the common countries, then everyone else in alphabetical
  // order, so the whole list is one scroll away. Typing narrows it.
  const results = useMemo(() => {
    const query = term.trim().toLowerCase()
    const digits = query.replace(/\D/g, '')

    if (!query) {
      const deviceIso = getLocales()[0]?.regionCode ?? undefined
      const first = [...new Set([deviceIso, ...COMMON_ISOS].filter(Boolean) as string[])]
        .map((iso) => countryByIso(iso))
        .filter((c): c is Country => Boolean(c))
      const rest = COUNTRIES.filter((c) => !first.some((f) => f.iso === c.iso))
      return [...first, ...rest]
    }

    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.iso.toLowerCase() === query ||
        (digits.length > 0 && c.dial.startsWith(digits)),
    )
  }, [term])

  const closeSheet = () => {
    setOpen(false)
    setTerm('')
  }

  const chooseCountry = (next: Country) => {
    setCountry(next)
    closeSheet()
    onChange(joinPhoneNumber(next.dial, national))
  }

  const changeNational = (text: string) => {
    // A whole international number pasted or typed in: take the country from it.
    const full = text.trim().startsWith('+') || text.trim().startsWith('00')
    if (full) {
      const split = splitPhoneNumber(normalisePhoneNumber(text))
      if (split) {
        setCountry(split.country)
        setNational(split.national)
        onChange(`+${split.country.dial}${split.national}`)
        return
      }
    }

    setNational(text)
    onChange(joinPhoneNumber(country.dial, text))
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.codeColumn}>
          <Text style={[typography.captionStrong, { color: theme.textMuted }]}>COUNTRY CODE</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Country code, ${country.name} plus ${country.dial}. Tap to change.`}
            onPress={() => setOpen(true)}
            style={[
              styles.code,
              {
                backgroundColor: theme.bgSubtle,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[typography.body, { color: theme.text }]} numberOfLines={1}>
              {flagEmoji(country.iso)} +{country.dial}
            </Text>
            <Text style={[typography.caption, { color: theme.textMuted }]}>▾</Text>
          </Pressable>
        </View>

        <View style={styles.numberColumn}>
          <TextField
            label={label}
            value={national}
            onChangeText={changeNational}
            keyboardType="phone-pad"
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="170 1234567"
          />
        </View>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Tapping outside the sheet closes it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close country list"
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={closeSheet}
          />

          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.bg,
                borderColor: theme.border,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <Text style={[typography.heading, { color: theme.text }]}>Country code</Text>

            <TextField
              label="Search country or code"
              value={term}
              onChangeText={setTerm}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Austria, or 43"
            />

            <FlatList
              data={results}
              keyExtractor={(item) => item.iso}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={[typography.caption, { color: theme.textMuted }]}>
                  No country by that name or code.
                </Text>
              }
              renderItem={({ item }) => {
                const selected = item.iso === country.iso
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => chooseCountry(item)}
                    style={({ pressed }) => [
                      styles.result,
                      { borderTopColor: theme.border },
                      pressed && { backgroundColor: theme.bgSubtle },
                    ]}
                  >
                    <Text
                      style={[
                        selected ? typography.bodyStrong : typography.body,
                        styles.resultName,
                        { color: theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {flagEmoji(item.iso)} {item.name}
                    </Text>
                    <Text style={[typography.body, { color: selected ? theme.accent : theme.textMuted }]}>
                      +{item.dial}
                      {selected ? ' ✓' : ''}
                    </Text>
                  </Pressable>
                )
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {error ? (
        <Text style={[typography.caption, { color: theme.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  // Fixed, so the number box takes everything that is left and neither moves as
  // the digits change. minWidth 0 on the number column lets it shrink to fit.
  codeColumn: { width: 124, gap: spacing.xs },
  numberColumn: { flex: 1, minWidth: 0 },
  code: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  // A fixed share of the screen: the list inside needs a definite height to
  // scroll in. With the keyboard up the overlay shrinks and so does the sheet.
  sheet: {
    height: '72%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  list: { flex: 1 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultName: { flex: 1, minWidth: 0 },
})
