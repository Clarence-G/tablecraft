#!/usr/bin/env bash
# Launch the UI review CC agent.
# Usage:
#   bash .cc-prompts/launch-ui-review.sh              # default: battleship only
#   bash .cc-prompts/launch-ui-review.sh all          # every game from /api/games
#   bash .cc-prompts/launch-ui-review.sh "battleship gomoku uno"
#
# Creates tmux session cc-ui-review. Uses Sonnet (vision-capable) on high effort.

set -euo pipefail

TARGETS="${1:-battleship}"
MODEL="${2:-sonnet}"
EFFORT="${3:-high}"
# Optional 4th arg: suffix to disambiguate parallel review sessions.
# e.g. launch-ui-review.sh "blackjack hive" sonnet high batch-a
#   → tmux session "cc-ui-review-batch-a"
SUFFIX="${4:-}"

PROJECT=/Users/bytedance/Projects/tablecraft
PROMPT_FILE="${PROJECT}/.cc-prompts/ui-review.md"
SESSION="cc-ui-review${SUFFIX:+-$SUFFIX}"

# Tool surface: Read/Write/Edit for scripts + report, Bash limited to dev-server
# health checks, Playwright runs, git status (read-only), jq/curl/tsx for API
# queries. No git stash/reset/checkout. No pnpm install/build — dev server
# should already be up.
ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git status),Bash(git diff *),Bash(git log *),Bash(pg_isready *),Bash(curl *),Bash(jq *),Bash(nohup *),Bash(mkdir *),Bash(ls *),Bash(cat *),Bash(head *),Bash(tail *),Bash(grep *),Bash(rg *),Bash(find *),Bash(echo *),Bash(date *),Bash(wc *),Bash(pnpm exec *),Bash(pnpm --filter *),Bash(tsx *),Bash(npx tsx *),Bash(sleep *),Bash(tmux *)'

[[ -f "$PROMPT_FILE" ]] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" -x 220 -y 60 \
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

# Paste prompt + targets via tmux buffer
BUF="prompt-ui-review"
{
  cat "$PROMPT_FILE"
  echo ""
  echo ""
  echo "---"
  echo ""
  echo "**Targets for this run**: $TARGETS"
  echo ""
  echo "Begin now."
} > /tmp/ui-review-prompt.md

tmux load-buffer -b "$BUF" /tmp/ui-review-prompt.md
tmux paste-buffer -b "$BUF" -t "$SESSION"
sleep 1
tmux send-keys -t "$SESSION" Enter

echo "Session: $SESSION (model: $MODEL, effort: $EFFORT, targets: $TARGETS)"
echo "Monitor: tmux capture-pane -t $SESSION -p -S -80 | tail -40"
echo "Attach:  tmux attach -t $SESSION"
echo "Kill:    tmux kill-session -t $SESSION"
