#!/usr/bin/env bash
# Regenerates the app icon set from one shape definition.
#
# The mark is a chevron — a roof. Brass on ink, taken from the app's own theme
# tokens (brass400 #D4A548 on ink900 #0B0E11), so the icon matches the product
# rather than the Expo template it replaced.
#
#   ./scripts/build-icons.sh
#
# Writes into apps/mobile/assets/images/ and store/play/.
#
# NOTE: cap and join styles must live inside the -draw MVG string. ImageMagick 7
# has no -linecap CLI option, and passing one is a fatal error.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
img="$root/apps/mobile/assets/images"
store="$root/store/play"
mkdir -p "$img" "$store"

BRASS='#D4A548'
INK_TOP='#1B242D'
INK_BOT='#0B0E11'
INK_FLAT='#101418'   # matches splash backgroundColor in app.config.ts

# Chevron on a 1024 grid.
PTS_FULL='polyline 236,742 512,286 788,742'
# Inset for the Android adaptive-icon safe zone: launchers crop to a circle and
# shift the foreground during animation, so anything near the edge is lost.
PTS_SAFE='polyline 276,690 512,318 748,690'

mark() {  # $1 colour, $2 width, $3 points
  echo "stroke-linecap round stroke-linejoin round stroke '$1' stroke-width $2 fill none $3"
}

# ── 1024 master ────────────────────────────────────────────────────────────
magick -size 1024x1024 "gradient:${INK_TOP}-${INK_BOT}" \
  -draw "$(mark "$BRASS" 128 "$PTS_FULL")" \
  -strip "$img/icon.png"

# ── Play store icon, 512 ───────────────────────────────────────────────────
magick "$img/icon.png" -resize 512x512 -strip "$store/icon-512.png"

# ── Android adaptive layers ────────────────────────────────────────────────
magick -size 1024x1024 xc:none \
  -draw "$(mark "$BRASS" 124 "$PTS_SAFE")" \
  -resize 512x512 -strip "$img/android-icon-foreground.png"

magick -size 512x512 "xc:${INK_FLAT}" -strip "$img/android-icon-background.png"

# Themed icons are re-tinted by the launcher, so this layer must be a white
# silhouette on transparency — any colour here is discarded.
magick -size 1024x1024 xc:none \
  -draw "$(mark white 124 "$PTS_SAFE")" \
  -resize 432x432 -strip "$img/android-icon-monochrome.png"

# ── Splash ─────────────────────────────────────────────────────────────────
# Transparent: app.config.ts already paints #101418 behind it.
magick -size 1024x1024 xc:none \
  -draw "$(mark "$BRASS" 128 "$PTS_FULL")" \
  -trim +repage -resize 512x512 -strip "$img/splash-icon.png"

# ── Favicon for the web build ──────────────────────────────────────────────
magick "$img/icon.png" -resize 48x48 -strip "$img/favicon.png"

# ── Play feature graphic, 1024x500 ─────────────────────────────────────────
# Generated here rather than by hand because it embeds the icon: when the mark
# changes, this must change with it or the store listing and the installed app
# disagree.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

magick "$img/icon.png" -resize 200x200 "$tmp/i.png"
magick -size 200x200 xc:black -fill white \
  -draw 'roundrectangle 0,0 199,199 36,36' "$tmp/mask.png"
magick "$tmp/i.png" "$tmp/mask.png" -alpha off -compose CopyOpacity -composite "$tmp/round.png"
magick -size 1024x500 "gradient:#182029-${INK_BOT}" "$tmp/bg.png"
magick "$tmp/bg.png" "$tmp/round.png" -geometry +76+150 -composite "$tmp/composed.png"

magick "$tmp/composed.png" -gravity NorthWest \
  -font Avenir-Black  -pointsize 76 -fill '#FFFFFF'  -annotate +324+176 'GigAway' \
  -font Avenir-Medium -pointsize 30 -fill "$BRASS"   -annotate +328+262 "A couch, a colleague, a city you don't know yet." \
  -font Avenir-Medium -pointsize 21 -fill '#8A99A8'  -annotate +328+312 'Invite-only. For performing artists who travel.' \
  -strip "$store/feature-graphic.png"

echo "icons rebuilt:"
for f in "$img/icon.png" "$img/android-icon-foreground.png" \
         "$img/android-icon-background.png" "$img/android-icon-monochrome.png" \
         "$img/splash-icon.png" "$img/favicon.png" "$store/icon-512.png" "$store/feature-graphic.png"; do
  printf '  %-48s %s\n' "${f#$root/}" "$(magick identify -format '%wx%h' "$f")"
done
