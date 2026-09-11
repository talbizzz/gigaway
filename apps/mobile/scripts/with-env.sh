#!/usr/bin/env bash
#
# Runs an Expo command against a named environment file.
#
#   ./scripts/with-env.sh .env.dev expo run:ios
#
# Why this exists: EXPO_PUBLIC_* values are inlined when Metro bundles, and
# Expo picks them up from whichever dotenv files happen to be on disk. That
# makes "which database am I talking to" depend on a file existing, which is a
# bad thing to be unsure about when one of the two has real users and no
# backups. This makes the choice explicit and prints it before anything runs.
#
# Real environment variables win over dotenv files, so exporting here overrides
# .env and .env.local regardless of what is lying around.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

env_file="${1:-}"
shift || true

if [ -z "$env_file" ] || [ $# -eq 0 ]; then
  echo "usage: with-env.sh <env-file> <command...>" >&2
  exit 64
fi

if [ ! -f "$env_file" ]; then
  echo "error: $env_file not found in apps/mobile/" >&2
  [ "$env_file" = ".env.dev" ] && \
    echo "hint: copy .env and swap the Supabase URL and anon key for the dev project" >&2
  exit 66
fi

set -a
# shellcheck disable=SC1090
. "./$env_file"
set +a

# CocoaPods calls String#unicode_normalize on the project path and dies with
# "Unicode Normalization not appropriate for ASCII-8BIT" unless the locale is
# UTF-8. Non-interactive shells frequently have no LANG at all, so prebuild
# fails here and nowhere else.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

# React Native's artifact CDN (repo.reactnative.dev) intermittently 404s, and
# when it does the failure is silent and vicious: rndependencies.rb checks
# whether the artifact exists before declaring the pod, so a 404 makes the pod
# disappear from the graph entirely. The prebuilt React.framework is still
# linked against it, so the app builds, installs, and then dies in dyld before
# a single line of JS runs — with no error surfaced anywhere.
#
# This points CocoaPods at a local copy taken from its own cache, so builds no
# longer depend on that host being up. Regenerate it with:
#
#   tar -czf apps/mobile/.rn-artifacts/ReactNativeDependencies-<version>.tar.gz \
#     -C ~/Library/Caches/CocoaPods/Pods/External/ReactNativeDependencies/<hash> \
#     Headers framework
#
# Local builds only — EAS does not use this script.
_rndep="$here/.rn-artifacts/ReactNativeDependencies-0.86.2.tar.gz"
if [ -f "$_rndep" ]; then
  export RCT_USE_LOCAL_RN_DEP="$_rndep"
fi

url="${EXPO_PUBLIC_SUPABASE_URL:-unset}"
ref="${url#https://}"; ref="${ref%%.supabase.co*}"

case "$ref" in
  hrhoqmmxgfpyxwncmpjx) label="PRODUCTION — real users, no backups" ;;
  shhgzekofcetdenwpivm) label="development" ;;
  *)                    label="unrecognised project" ;;
esac

echo "──────────────────────────────────────────────"
echo "  env file : $env_file"
echo "  supabase : $ref"
echo "  target   : $label"
echo "──────────────────────────────────────────────"

# A deliberate pause on production. Cheap, and the one time it stops you is
# worth every second it costs the rest of the time.
if [ "$ref" = "hrhoqmmxgfpyxwncmpjx" ]; then
  echo "  Running against PRODUCTION. Ctrl-C within 3s to stop."
  sleep 3
fi

exec "$@"
