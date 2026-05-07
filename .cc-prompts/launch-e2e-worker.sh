#!/usr/bin/env bash
# Launch a single CC worker in tmux for a given e2e stage prompt.
# Usage: bash .cc-prompts/launch-e2e-worker.sh <stage-name>
# Example: bash .cc-prompts/launch-e2e-worker.sh stage1-infra

set -euo pipefail

STAGE_NAME="${1:?usage: $0 <stage-name>}"
PROJECT=/Users/bytedance/Projects/tablecraft
PROMPT_FILE="${PROJECT}/.cc-prompts/e2e-${STAGE_NAME}.md"
SESSION="e2e-${STAGE_NAME}"

ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git *),Bash(pnpm *),Bash(node *),Bash(npx *),Bash(curl *),Bash(mkdir *),Bash(chmod *),Bash(lsof *),Bash(tmux *),Bash(rg *),Bash(find *),Bash(cat *),Bash(echo *),Bash(head *),Bash(tail *),Bash(grep *),Bash(ls *),Bash(tsx *)'

[[ -f "$PROMPT_FILE" ]] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" -x 200 -y 60 \
  "zsh -i -c 'source ~/.zshenv && cd \"$PROJECT\" && claude --dangerously-skip-permissions --model sonnet --effort high --allowedTools '\''$ALLOWED'\'' '"

sleep 10

# Click through trust + skip-permissions dialogs
tmux send-keys -t "$SESSION" Enter; sleep 1
tmux send-keys -t "$SESSION" Down; sleep 0.3
tmux send-keys -t "$SESSION" Enter; sleep 2

# Paste prompt via buffer (avoids argv-length hang)
BUF="prompt-${STAGE_NAME}"
tmux set-buffer -b "$BUF" "$(cat "$PROMPT_FILE")"
tmux paste-buffer -b "$BUF" -t "$SESSION"
sleep 1
tmux send-keys -t "$SESSION" Enter

echo "Session: $SESSION"
echo "Monitor: tmux capture-pane -t $SESSION -p -S -80 | tail -40"
echo "Kill:    tmux kill-session -t $SESSION"
