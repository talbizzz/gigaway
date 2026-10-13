import { SERVICES } from '@gigaway/shared'
import { Stack, useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Screen } from '@/components/screen'
import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * The first step of offering a service: which one.
 *
 * One service per post. Choosing here, before any form, is what keeps each form
 * about a single thing: a couch asks for nights and house rules, a coffee asks
 * for neither. Someone who wants to offer two things posts twice.
 */
export default function ChooseServiceScreen() {
  const theme = useTheme()
  const router = useRouter()

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Offer a service' }} />

      <View style={styles.intro}>
        <Text style={[typography.display, { color: theme.text }]}>What would you like to offer?</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          One at a time. You can add another afterwards.
        </Text>
      </View>

      <View style={styles.list}>
        {SERVICES.map((service) => (
          <Pressable
            key={service.value}
            accessibilityRole="button"
            accessibilityLabel={`${service.label}. ${service.description}`}
            onPress={() =>
              router.push({ pathname: '/availability/new', params: { kind: service.value } })
            }
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: theme.bgSubtle, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.optionText}>
              <Text style={[typography.bodyStrong, { color: theme.text }]}>{service.label}</Text>
              <Text style={[typography.caption, { color: theme.textMuted }]}>
                {service.description}
              </Text>
            </View>
            <Text style={[typography.body, { color: theme.accent }]}>›</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  list: { gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.7 },
})
