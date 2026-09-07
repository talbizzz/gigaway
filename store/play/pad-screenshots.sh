#!/usr/bin/env bash
# Prepares Play Store screenshots from raw phone captures.
#
#   ./store/play/pad-screenshots.sh
#
# Reads store/play/app-screenshots/, writes store/play/screenshots/{phone,tablet7,tablet10}/.
#
# WHY PADDING RATHER THAN RESIZING
# Play demands 16:9 or 9:16. Phones shoot far taller — these are 1080x2340,
# which is 9:19.5 and rejected as-is. Two ways to fix it:
#   - scale to fit 1080x1920  → drops to 886x1920, losing a fifth of the pixels
#   - pad the WIDTH to match  → 1316x2340, every original pixel preserved
# The second is better, so that is what this does. 1316 = round(2340 * 9/16).
#
# ONE OUTPUT SIZE COVERS ALL THREE SLOTS
#   phone      sides 320..3840   → 1316x2340 fits
#   7-inch     sides 320..3840   → fits
#   10-inch    sides 1080..7680  → fits (1316 and 2340 are both above 1080)
# The folders are separate only to make uploading less error-prone.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/app-screenshots"
out="$here/screenshots"

# The app is light-themed, so bars are white and read as part of the page.
PAD='#FFFFFF'

# Curated order. Play shows these left to right and the first two carry the
# listing, so the feed leads: what is around you is the whole product.
ORDER=(
  "1000025417:01-home-feed"
  "1000025416:02-your-trips"
  "1000025419:03-member-profile"
  "1000025423:04-request-received"
  "1000025422:05-make-an-offer"
  "1000025420:06-reviews-and-safety"
  "1000025425:07-activity"
  "1000025414:08-your-profile"
)

rm -rf "$out"
mkdir -p "$out/phone" "$out/tablet7" "$out/tablet10"

for entry in "${ORDER[@]}"; do
  stem="${entry%%:*}"
  name="${entry##*:}"
  f=$(ls "$src/$stem".* 2>/dev/null | head -1) || true
  if [ -z "${f:-}" ]; then
    echo "  MISSING $stem — skipped" >&2
    continue
  fi

  h=$(magick identify -format '%h' "$f")
  w=$(python3 -c "print(round($h * 9 / 16))")

  magick "$f" -background "$PAD" -gravity center -extent "${w}x${h}" \
    -strip "$out/phone/$name.png"

  cp "$out/phone/$name.png" "$out/tablet7/$name.png"
  cp "$out/phone/$name.png" "$out/tablet10/$name.png"

  printf '  %-24s %s → %s\n' "$name" "$(magick identify -format '%wx%h' "$f")" "${w}x${h}"
done

echo
echo "verifying against Play's rules:"
python3 - "$out" <<'PY'
import subprocess, sys, pathlib
root = pathlib.Path(sys.argv[1])
limits = {'phone': (320, 3840), 'tablet7': (320, 3840), 'tablet10': (1080, 7680)}
bad = 0
for folder, (lo, hi) in limits.items():
    files = sorted((root / folder).glob('*.png'))
    for f in files:
        wh = subprocess.run(['magick', 'identify', '-format', '%w %h', str(f)],
                            capture_output=True, text=True).stdout.split()
        w, h = int(wh[0]), int(wh[1])
        ratio_ok = abs(w / h - 9 / 16) < 0.005 or abs(w / h - 16 / 9) < 0.005
        side_ok = lo <= w <= hi and lo <= h <= hi
        if not (ratio_ok and side_ok):
            bad += 1
            print(f"  FAIL {folder}/{f.name} {w}x{h} ratio={'ok' if ratio_ok else 'BAD'} sides={'ok' if side_ok else 'BAD'}")
    print(f"  {folder:<9} {len(files)} files, all within {lo}-{hi}px" + ("" if not bad else ""))
print("\nall pass" if bad == 0 else f"\n{bad} FAILED")
PY
