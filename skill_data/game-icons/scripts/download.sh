#!/bin/bash
# Download icons from game-icons.net (SVG or PNG)
# Usage: download.sh <output_dir> <fg_color> <bg_color> <format> <icon_id> [icon_id...]
# format: svg or png
# Example: download.sh ./icons 000000 transparent svg 1x1/lorc/bee 1x1/delapouite/ant
# Example: download.sh ./icons 000000 transparent png 1x1/lorc/bee

OUTDIR="${1:?Usage: $0 <output_dir> <fg_color> <bg_color> <format:svg|png> <icon_id> [icon_id...]}"
FG="${2:?Foreground color hex (e.g. 000000)}"
BG="${3:?Background color (hex or 'transparent')}"
FORMAT="${4:?Format: svg or png}"
shift 4

if [ "$FORMAT" != "svg" ] && [ "$FORMAT" != "png" ]; then
  echo "Error: format must be 'svg' or 'png'" >&2
  exit 1
fi

mkdir -p "$OUTDIR"

for ICON_ID in "$@"; do
  SLUG=$(echo "$ICON_ID" | awk -F/ '{print $NF}')
  URL="https://game-icons.net/icons/${FG}/${BG}/${ICON_ID}.${FORMAT}"
  echo "Downloading: ${SLUG}.${FORMAT} from ${URL}"
  curl -s -o "${OUTDIR}/${SLUG}.${FORMAT}" "$URL"
  if [ $? -eq 0 ] && [ -s "${OUTDIR}/${SLUG}.${FORMAT}" ]; then
    echo "  OK: ${OUTDIR}/${SLUG}.${FORMAT}"
  else
    echo "  FAILED: ${SLUG}"
  fi
done

echo "Done. Files saved to ${OUTDIR}/"
