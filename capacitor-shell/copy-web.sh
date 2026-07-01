#!/usr/bin/env bash
# ============================================================================
# AUBS Android shell — copy the PWA into the Capacitor webDir (www/).
#
# The repo root IS the AUBS PWA (source of truth). Capacitor needs the web assets
# inside its webDir, so we copy the files the app actually needs into ./www — WITHOUT
# clobbering the two shell-only files (index.html, aubs-native-facade.js) that live there.
#
# No build step, no bundler, no secrets. Idempotent. Run from capacitor-shell/:
#   bash ./copy-web.sh   (or: npm run copy-web)
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WWW="$HERE/www"
mkdir -p "$WWW"

# The app entry + its runtime assets. We copy the directories/files the PWA references.
# (Explicit allow-list — we never copy .git, tests/, node_modules, or capacitor-shell itself.)
ASSETS=(
  "aubs-app.html"
  "manifest.json"
  "sw.js"
  "fonts.css"
  "core"
  "spine"
  "fonts"
)
# Optional image/icon assets — copied when present (globs tolerated).
OPTIONAL_GLOBS=( "*.png" "*.svg" "*.ico" "*.webp" )

for a in "${ASSETS[@]}"; do
  if [ -e "$ROOT/$a" ]; then
    rm -rf "$WWW/${a}"
    cp -R "$ROOT/$a" "$WWW/"
  else
    echo "warn: missing asset '$a' (skipped)"
  fi
done

shopt -s nullglob
for g in "${OPTIONAL_GLOBS[@]}"; do
  for f in "$ROOT"/$g; do cp -f "$f" "$WWW/"; done
done
shopt -u nullglob

echo "copied PWA into $WWW (index.html + aubs-native-facade.js preserved)."
