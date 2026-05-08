#!/usr/bin/env bash
# Worktree-aware CC worker launcher.
# Usage: bash launch-worker.sh <prompt-name> [sonnet|opus] [effort]
# Reads prompt from $WORKTREE/.cc-prompts/<prompt-name>.md where WORKTREE
# is the directory this script lives in's parent (i.e. the worktree root).

set -euo pipefail

NAME="${1:?usage: $0 <prompt-name> [sonnet|opus] [effort]}"
MODEL="${2:-sonnet}"
EFFORT="${3:-high}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$WORKTREE/.cc-prompts/$NAME.md"
SESSION="cc-$NAME"

ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git status),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git add *),Bash(git commit *),Bash(git branch *),Bash(pnpm *),Bash(node *),Bash(npx *),Bash(curl *),Bash(mkdir *),Bash(chmod *),Bash(lsof *),Bash(tmux *),Bash(rg *),Bash(find *),Bash(cat *),Bash(echo *),Bash(head *),Bash(tail *),Bash(grep *),Bash(ls *),Bash(tsx *),Bash(jq *),Bash(sed *),Bash(awk *),Bash(wc *),Bash(sort *),Bash(uniq *)'

[[ -f "$PROMPT_FILE" ]] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" -x 200 -y 60 \
  "zsh -i -c 'source ~/.zshenv && cd \"$WORKTREE\" && claude --dangerously-skip-permissions --model $MODEL --effort $EFFORT --allowedTools '\''$ALLOWED'\'' '"

sleep 10

if tmux capture-pane -t "$SESSION" -p -S -50 | grep -q "install it"; then
  tmux send-keys -t "$SESSION" "y" Enter
  sleep 60
fi

tmux send-keys -t "$SESSION" Enter; sleep 1
tmux send-keys -t "$SESSION" Down; sleep 0.3
tmux send-keys -t "$SESSION" Enter; sleep 3

BUF="prompt-$NAME"
tmux load-buffer -b "$BUF" "$PROMPT_FILE"
tmux paste-buffer -b "$BUF" -t "$SESSION"
sleep 1
tmux send-keys -t "$SESSION" Enter

echo "Session: $SESSION (model: $MODEL, effort: $EFFORT)"
echo "Worktree: $WORKTREE"
echo "Monitor: tmux capture-pane -t $SESSION -p -S -80 | tail -40"
echo "Kill:    tmux kill-session -t $SESSION"
