import { addDays, nightCount, today, type DateRange } from '@gigaway/shared'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Calendar, type DateData } from 'react-native-calendars'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

/**
 * Inclusive range selection: the first and last NIGHT of a stay, matching
 * domain/dates.ts. Tapping one date selects a single night, which is a real
 * case — a host free on one night is still worth matching.
 */
export function DateRangePicker({
  label,
  value,
  onChange,
  maxNights = 61,
  error,
}: {
  label: string
  value: DateRange | null
  onChange: (range: DateRange | null) => void
  /** Cap matching the database constraint (end - start <= 60). */
  maxNights?: number
  error?: string
}) {
  const theme = useTheme()
  const minDate = today()

  const marked = useMemo(() => {
    if (!value) return {}

    const marks: Record<string, object> = {}
    let cursor = value.start
    while (cursor <= value.end) {
      const isStart = cursor === value.start
      const isEnd = cursor === value.end
      marks[cursor] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: theme.accent,
        textColor: theme.accentText,
      }
      cursor = addDays(cursor, 1)
    }
    return marks
  }, [value, theme])

  const handleDayPress = (day: DateData) => {
    const picked = day.dateString

    // No range yet, or a complete range: start a new one.
    if (!value || value.start !== value.end) {
      onChange({ start: picked, end: picked })
      return
    }

    // A single date is selected — extend it, in whichever direction was tapped.
    if (picked < value.start) {
      onChange({ start: picked, end: value.start })
    } else {
      const range = { start: value.start, end: picked }
      if (nightCount(range) > maxNights) {
        onChange({ start: picked, end: picked })
        return
      }
      onChange(range)
    }
  }

  const nights = value ? nightCount(value) : 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[typography.captionStrong, { color: theme.textMuted }]}>
          {label.toUpperCase()}
        </Text>
        {/* Nights, not days: it is the unit the whole product is denominated in. */}
        {nights > 0 ? (
          <Text style={[typography.captionStrong, { color: theme.accent }]}>
            {nights} night{nights === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      <View style={[styles.calendar, { borderColor: theme.border, backgroundColor: theme.bgSubtle }]}>
        <Calendar
          minDate={minDate}
          markingType="period"
          markedDates={marked}
          onDayPress={handleDayPress}
          firstDay={1}
          theme={{
            calendarBackground: theme.bgSubtle,
            dayTextColor: theme.text,
            monthTextColor: theme.text,
            textDisabledColor: theme.textFaint,
            arrowColor: theme.accent,
            todayTextColor: theme.accent,
            textSectionTitleColor: theme.textMuted,
          }}
        />
      </View>

      <Text style={[typography.caption, { color: error ? theme.danger : theme.textMuted }]}>
        {error ??
          (value
            ? 'Tap a new date to start again.'
            : 'Tap your first night, then your last night.')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
})
