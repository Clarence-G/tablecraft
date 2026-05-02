#!/usr/bin/env bash
# Parametrized CC worker launcher.
# Usage: bash .cc-prompts/launch-worker.sh <prompt-name> [sonnet|opus] [effort]
# Example:
#   bash .cc-prompts/launch-worker.sh bot-ownership-api sonnet high
#   bash .cc-prompts/launch-worker.sh skill-doc-fixes opus medium
#
# Looks up prompt at .cc-prompts/<prompt-name>.md and creates tmux session
# named cc-<prompt-name>. Mixes models to avoid per-model daily cap on gateway.

set -euo pipefail

NAME="${1:?usage: $0 <prompt-name> [sonnet|opus] [effort]}"
MODEL="${2:-sonnet}"
EFFORT="${3:-high}"

PROJECT=/Users/bytedance/Projects/boardgames
PROMPT_FILE="${PROJECT}/.cc-prompts/${NAME}.md"
SESSION="cc-${NAME}"

# Safe tool surface: no destructive git ops (no stash/reset/checkout).
ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git status),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git add *),Bash(pnpm *),Bash(node *),Bash(npx *),Bash(curl *),Bash(mkdir *),Bash(chmod *),Bash(lsof *),Bash(tmux *),Bash(rg *),Bash(find *),Bash(cat *),Bash(echo *),Bash(head *),Bash(tail *),Bash(grep *),Bash(ls *),Bash(tsx *),Bash(jq *),Bash(sed *),Bash(awk *),Bash(wc *),Bash(sort *),Bash(uniq *)'

[[ -f "$PROMPT_FILE" ]] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" -x 200 -y 60 \
  "zsh -i -c 'source ~/.zshenv && cd \"$PROJECT\" && claude --dangerously-skip-permissions --model $MODEL --effort $EFFORT --allowedTools '\''$ALLOWED'\'' '"

sleep 10

# Handle fnm install prompt if present
if tmux capture-pane -t "$SESSION" -p -S -50 | grep -q "install it"; then
  tmux send-keys -t "$SESSION" "y" Enter
  sleep 60
fi

# Click through trust + skip-permissions dialogs
tmux send-keys -t "$SESSION" Enter; sleep 1
tmux send-keys -t "$SESSION" Down; sleep 0.3
tmux send-keys -t "$SESSION" Enter; sleep 3

# Paste prompt via buffer (avoids argv-length hang; uses load-buffer from file
# which accepts arbitrarily large prompts, unlike set-buffer's arg-length cap).
BUF="prompt-${NAME}"
tmux load-buffer -b "$BUF" "$PROMPT_FILE"
tmux paste-buffer -b "$BUF" -t "$SESSION"
sleep 1
tmux send-keys -t "$SESSION" Enter

echo "Session: $SESSION (model: $MODEL, effort: $EFFORT)"
echo "Monitor: tmux capture-pane -t $SESSION -p -S -80 | tail -40"
echo "Kill:    tmux kill-session -t $SESSION"
