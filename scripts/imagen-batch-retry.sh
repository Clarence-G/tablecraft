#!/usr/bin/env bash
# Batch with retry: for each line, try cmd_run up to 3 times with 20s cooldown on failure.
set -uo pipefail
TSV="${1:?usage: $0 <tsv>}"
OUT_DIR="${2:?usage: $0 <tsv> <out_dir>}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/imagen-hetop.sh"
mkdir -p "$OUT_DIR"

FIRST=1
LOG="$OUT_DIR/batch.log"
: > "$LOG"

while IFS=$'\t' read -r basename prompt; do
  [[ -z "$basename" || "$basename" == \#* ]] && continue
  OUT_PATH="$OUT_DIR/${basename}.png"
  if [[ -s "$OUT_PATH" ]]; then
    echo "[~] $basename already exists, skip" | tee -a "$LOG"
    continue
  fi
  if [[ $FIRST -eq 0 ]]; then
    echo "[~] 5s gap" | tee -a "$LOG"
    sleep 5
  fi
  FIRST=0
  echo "[>] $basename" | tee -a "$LOG"
  OK=0
  for attempt in 1 2 3 4; do
    if IMAGEN_OUT_DIR="$OUT_DIR" "$SCRIPT" run "$prompt" "$OUT_PATH" >> "$LOG" 2>&1; then
      echo "    attempt $attempt: ok -> $OUT_PATH" | tee -a "$LOG"
      OK=1; break
    else
      echo "    attempt $attempt FAILED, cooldown 25s" | tee -a "$LOG"
      sleep 25
    fi
  done
  if [[ $OK -eq 0 ]]; then
    echo "[!] GAVE UP: $basename" | tee -a "$LOG"
  fi
done < "$TSV"

echo "[done] see $LOG" | tee -a "$LOG"
