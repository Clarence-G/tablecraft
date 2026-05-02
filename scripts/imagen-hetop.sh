#!/usr/bin/env bash
# imagen-hetop.sh — Client for https://imagen.h-e.top/api/jobs
#
# Site quirks:
#   - Only ONE active job per user at a time (server returns {"detail":"you already have an active job"})
#   - ~45-60s per image; site hosts the history, no local state needed
#   - Cookie in $COOKIE below will expire; refresh from browser devtools
#
# Commands:
#   submit "<prompt>"                 -> prints job id
#   status <id>                       -> prints {status, download_url, error}
#   download <id> <out_path>          -> downloads finished image
#   wait-one <id> [<poll_secs=10>]    -> polls until done, prints final JSON
#   run "<prompt>" <out_path>         -> submit + wait + download (one shot, blocks ~60-120s)
#   batch <tsv>                       -> TSV: <out_basename>\t<prompt>; sequential, 5s gap
#
# TSV batch example:
#   gomoku    english prompt here
#   yahtzee   another prompt here

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${IMAGEN_OUT_DIR:-$ROOT_DIR/out/covers}"
mkdir -p "$OUT_DIR"

API="https://imagen.h-e.top"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0'

# Cookie (edit when session expires)
COOKIE='cf_clearance=SGbnF0sam.MI3VnlXWcc9h4brJK3QwkHWCpQBkv5in0-1777177161-1.2.1.1-yaQrmV0LPFLXTcTDB8OMZpetqkvM0t5uu9iLEIDG4DsThPx2I0_4P47L9hzhmhr.yUZQbnTvErtZ0Jgih_2t8QVUSeTClVacdUB9MzDfUCkJyGLkgvVcbVLFtWfgXxFCRUo3wPFWTCes_O7UtfKLQmu03YB6b15Hu_Uvfh8BP1re9jaVt0Zah.LXV.3AysFEJQzdIxm36lVXArTqDBkeHRUTRDMrj4snz.k0mSNoomvxQInbP1UoW6s1R5nw2h4bR6rrFomAScrF8.TkvCRKEq2GCENoHxVCz5go_ZjIyJzUqfWmZX0IFBGp9iQMAdHlnmtP1053MRcUj0VKZprCUg; session=eyJvYXV0aF9zdGF0ZSI6ICI2RlNVLWdpLUc4ZHlOcmdvcjVjRDRuWHFCMFd2V2lYdSIsICJ1c2VyIjogeyJpZCI6IDI5MjMsICJvYXV0aF9zdWJqZWN0IjogIjE4OTU3IiwgInVzZXJuYW1lIjogInZpdGFtaW4iLCAiZGlzcGxheV9uYW1lIjogIlZpdGFtaW4iLCAiYXZhdGFyX3VybCI6ICJodHRwczovL2Nkbi5sZHN0YXRpYy5jb20vdXNlcl9hdmF0YXIvbGludXguZG8vdml0YW1pbi8yODgvMTMwOTE3Ml8yLnBuZyIsICJ0cnVzdF9sZXZlbCI6IDJ9fQ==.afMRNA.UWlxPp-Z6Yo9WqUz6MAEb3BaNAk'

_curl() {
  curl -sS \
    -H "accept: */*" \
    -H "user-agent: $UA" \
    -H "referer: $API/" \
    -b "$COOKIE" \
    "$@"
}

cmd_submit() {
  local prompt="$1"
  local resp
  resp=$(_curl -X POST "$API/api/jobs" \
    -H "content-type: application/json" \
    -H "origin: $API" \
    --data-raw "$(jq -n --arg p "$prompt" '{prompt:$p, accept_public_share:true}')")
  local id
  id=$(echo "$resp" | jq -r '.id // empty')
  if [[ -z "$id" ]]; then
    echo "[!] submit failed: $resp" >&2
    return 1
  fi
  echo "$id"
}

cmd_status() {
  local id="$1"
  _curl "$API/api/jobs/$id" | jq '{id, status, download_url, error_message, started_at, finished_at}'
}

cmd_download() {
  local id="$1"
  local out_path="$2"
  mkdir -p "$(dirname "$out_path")"
  _curl -L "$API/api/images/$id/download" -o "$out_path"
  if [[ ! -s "$out_path" ]]; then
    echo "[!] downloaded file is empty" >&2
    return 1
  fi
  echo "$out_path"
}

cmd_wait_one() {
  local id="$1"
  local poll="${2:-10}"
  local max_iters=30
  for i in $(seq 1 $max_iters); do
    sleep "$poll"
    local resp status
    resp=$(_curl "$API/api/jobs/$id")
    status=$(echo "$resp" | jq -r '.status // empty')
    echo "[$((i * poll))s] $id=$status" >&2
    case "$status" in
      succeeded|completed|success|done)
        echo "$resp"
        return 0
        ;;
      failed|error)
        echo "[!] job $id failed" >&2
        echo "$resp" | jq . >&2
        return 1
        ;;
    esac
  done
  echo "[!] timeout waiting for $id" >&2
  return 1
}

cmd_run() {
  local prompt="$1"
  local out_path="$2"
  local id
  id=$(cmd_submit "$prompt")
  echo "[>] job $id submitted" >&2
  cmd_wait_one "$id" 10 >/dev/null
  cmd_download "$id" "$out_path"
}

cmd_batch() {
  local tsv="$1"
  local first=1
  while IFS=$'\t' read -r basename prompt; do
    [[ -z "$basename" || "$basename" == \#* ]] && continue
    if [[ $first -eq 0 ]]; then
      echo "[~] sleeping 5s..." >&2
      sleep 5
    fi
    first=0
    local out_path="$OUT_DIR/${basename}.png"
    echo "[>] $basename" >&2
    if cmd_run "$prompt" "$out_path"; then
      echo "    ok -> $out_path" >&2
    else
      echo "[!] failed: $basename" >&2
    fi
  done < "$tsv"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    submit)    cmd_submit "$@" ;;
    status)    cmd_status "$@" ;;
    download)  cmd_download "$@" ;;
    wait-one)  cmd_wait_one "$@" ;;
    run)       cmd_run "$@" ;;
    batch)     cmd_batch "$@" ;;
    *)
      sed -n '2,25p' "$0" >&2
      exit 1
      ;;
  esac
}

main "$@"
