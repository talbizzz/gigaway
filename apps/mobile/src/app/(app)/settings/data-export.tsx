import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/button'
import { Callout } from '@/components/callout'
import { Screen } from '@/components/screen'
import { useExportData } from '@/features/account/use-account'
import { spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export default function DataExportScreen() {
  const theme = useTheme()
  const exportData = useExportData()

  return (
    <Screen
      footer={
        <Button
          label="Export my data"
          onPress={() => exportData.mutate()}
          loading={exportData.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Your data' }} />

      <View style={styles.header}>
        <Text style={[typography.display, { color: theme.text }]}>Your data</Text>
        <Text style={[typography.body, { color: theme.textMuted }]}>
          Everything GigAway holds about you, as a JSON file you can keep.
        </Text>
      </View>

      <Callout>
        Reports are not included, in either direction — returning them would expose who
        reported whom, which would destroy the point of reports being private. Reviews
        still awaiting the other side's response are excluded too, for the same reason:
        an export must not be a way to see inside the double-blind window early.
      </Callout>

      {exportData.isError ? (
        <Callout tone="danger">{(exportData.error as Error).message}</Callout>
      ) : null}
      {exportData.isSuccess ? (
        <Callout tone="success" title="Ready">
          Your export opened in the share sheet — save it, or send it wherever you keep
          things like this.
        </Callout>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
})
