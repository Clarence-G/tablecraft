#!/usr/bin/env bash
# Launch 3 Claude Code tmux sessions for ActivityLog worker task (CC-A, CC-B, CC-C).
set -euo pipefail

PROJECT=/Users/bytedance/Projects/boardgames
PROMPT_DIR=$PROJECT/.cc-prompts
ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git *),Bash(pnpm *),Bash(node *),Bash(npx *),Bash(curl *),Bash(mkdir *),Bash(chmod *)'

for UNIT in cc-a cc-b cc-c; do
  SESSION="activity-log-${UNIT}"
  PROMPT_FILE="${PROMPT_DIR}/activity-log-${UNIT}.md"

  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: missing prompt: $PROMPT_FILE" >&2
    exit 1
  fi

  echo "=== launching $SESSION ==="
  tmux kill-session -t "$SESSION" 2>/dev/null || true

  tmux new-session -d -s "$SESSION" -x 180 -y 50 \
    "zsh -i -c 'source ~/.zshenv && cd \"$PROJECT\" && claude --dangerously-skip-permissions --model sonnet --effort high --allowedTools '\''$ALLOWED'\'' '"

  sleep 10

  # Trust dialog (first run per dir; harmless if absent)
  tmux send-keys -t "$SESSION" Enter
  sleep 1

  # Dangerously-skip-permissions dialog: Down then Enter
  tmux send-keys -t "$SESSION" Down
  sleep 0.3
  tmux send-keys -t "$SESSION" Enter
  sleep 2

  # Paste prompt via buffer (argv hang pitfall)
  BUF="prompt-${UNIT}"
  tmux set-buffer -b "$BUF" "$(cat "$PROMPT_FILE")"
  tmux paste-buffer -b "$BUF" -t "$SESSION"
  sleep 1
  tmux send-keys -t "$SESSION" Enter

  echo "   ✓ prompt sent to $SESSION"
done

echo ""
echo "All 3 launched. Attach with: tmux attach -t activity-log-cc-a (or -cc-b / -cc-c)"
echo "Monitor: tmux capture-pane -t activity-log-cc-a -p -S -80 | tail -40"
