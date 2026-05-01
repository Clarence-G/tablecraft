#!/usr/bin/env bash
set -euo pipefail
PROJECT=/Users/bytedance/Projects/boardgames
PROMPT_DIR="${PROJECT}/.cc-prompts"
STAGE="${1:?usage: $0 stage1|stage2|stage3}"
shift || true

# Default worker sets per stage; override by passing workers as args
case "$STAGE" in
  stage1) WORKERS=(${@:-stage1-foundation}) ;;
  stage2) WORKERS=(${@:-stage2-persist-afk stage2-email stage2-moderation stage2-observability}) ;;
  stage3) WORKERS=(${@:-stage3-reconnect-spectate stage3-friends}) ;;
  *) echo "unknown stage: $STAGE" >&2; exit 1 ;;
esac

ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git *),Bash(pnpm *),Bash(node *),Bash(npx *),Bash(curl *),Bash(mkdir *),Bash(chmod *),Bash(lsof *),Bash(tmux *),Bash(ls *),Bash(cat *),Bash(echo *)'

for WORKER in "${WORKERS[@]}"; do
  SESSION="cc-${WORKER}"
  PROMPT_FILE="${PROMPT_DIR}/${WORKER}.md"

  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: missing prompt: $PROMPT_FILE" >&2; exit 1
  fi

  echo "=== launching $SESSION ==="
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux new-session -d -s "$SESSION" -x 180 -y 50 \
    "zsh -i -c 'source ~/.zshenv && cd \"$PROJECT\" && claude --dangerously-skip-permissions --model sonnet --allowedTools '\\''$ALLOWED'\\'' '"
  sleep 10

  tmux send-keys -t "$SESSION" Enter; sleep 1
  tmux send-keys -t "$SESSION" Down; sleep 0.3
  tmux send-keys -t "$SESSION" Enter; sleep 2

  BUF="prompt-${WORKER}"
  tmux set-buffer -b "$BUF" "$(cat "$PROMPT_FILE")"
  tmux paste-buffer -b "$BUF" -t "$SESSION"
  sleep 1
  tmux send-keys -t "$SESSION" Enter

  echo "   prompt sent to $SESSION"
done

echo ""
echo "Monitor with:"
for W in "${WORKERS[@]}"; do
  echo "  tmux capture-pane -t cc-$W -p -S -80 | tail -40"
done
