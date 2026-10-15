import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { radius, spacing, typography } from '@/theme/tokens'
import { useTheme } from '@/theme/use-theme'

export type Banner = {
  id: string
  title: string
  body: string
  onPress: () => void
  onDismiss: () => void
}

/** How many cards show as layers behind the front one. */
const LAYERS = 2
const LAYER_STEP = 8

/**
 * What is waiting on the member, as banners floating over the top of the screen.
 *
 * One waiting is one banner. Several are a stack: the newest in front with the
 * next ones peeking out beneath it, so the pile is visible without taking the
 * screen. Dismissing the front one brings up the next, and "Show all" lays the
 * whole pile out as a list. Render it as an overlay, over the content.
 */
export function NotificationStack({
  banners,
  onHeight,
}: {
  banners: Banner[]
  /** Called with the room the stack takes, so the screen can start its content below it. */
  onHeight?: (height: number) => void
}) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)

  const none = banners.length === 0

  // Nothing left to float, so the screen can take its space back.
  useEffect(() => {
    if (none) onHeight?.(0)
  }, [none, onHeight])

  if (none) return null

  const open = expanded && banners.length > 1
  const behind = Math.min(banners.length - 1, LAYERS)

  return (
    <View
      pointerEvents="box-none"
      style={styles.wrap}
      // Only the collapsed stack makes room: the open list is a sheet laid over
      // the feed, not part of it.
      onLayout={(event) => {
        if (!open) onHeight?.(event.nativeEvent.layout.height + spacing.md)
      }}
    >
      {open ? (
        <View style={[styles.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {banners.map((banner) => (
              <BannerCard key={banner.id} banner={banner} />
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded(false)}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
          >
            <Text style={[typography.captionStrong, { color: theme.accent }]}>Show less</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ paddingBottom: behind * LAYER_STEP }}>
          {/* The cards behind are only edges: shapes, not content, so a stack of
              five costs no more than a stack of three. */}
          {Array.from({ length: behind }, (_, i) => behind - i).map((depth) => (
            <View
              key={depth}
              style={[
                styles.layer,
                {
                  left: depth * spacing.md,
                  right: depth * spacing.md,
                  bottom: -depth * LAYER_STEP,
                  backgroundColor: theme.accentSubtle,
                  borderColor: theme.border,
                  opacity: 1 - depth * 0.2,
                },
              ]}
            />
          ))}

          <BannerCard banner={banners[0]!} />

          {banners.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show all ${banners.length} notifications`}
              onPress={() => setExpanded(true)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.more,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typography.captionStrong, { color: theme.accentText }]}>
                {banners.length} waiting
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  )
}

function BannerCard({ banner }: { banner: Banner }) {
  const theme = useTheme()

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.accentSubtle, borderColor: theme.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}. ${banner.body}`}
        onPress={banner.onPress}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <Text style={[typography.bodyStrong, { color: theme.text }]}>{banner.title}</Text>
        <Text style={[typography.caption, { color: theme.textMuted }]}>{banner.body}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={banner.onDismiss}
        hitSlop={12}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text style={[styles.dismiss, { color: theme.textMuted }]}>×</Text>
      </Pressable>
    </View>
  )
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: spacing.sm, left: spacing.lg, right: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  dismiss: { fontSize: 22, lineHeight: 24 },
  layer: {
    position: 'absolute',
    top: spacing.sm,
    height: '100%',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  more: {
    position: 'absolute',
    right: spacing.md,
    bottom: -spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
    gap: spacing.xs,
    ...shadow,
  },
  list: { maxHeight: 380 },
  listContent: { gap: spacing.sm },
  toggle: { alignItems: 'center', paddingVertical: spacing.xs },
  pressed: { opacity: 0.7 },
})
