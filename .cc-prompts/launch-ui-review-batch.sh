#!/usr/bin/env bash
# Launch 3 parallel UI-review CC agents, one per batch, staggered by 5s.
# Each agent uses its own tmux session and writes to its own timestamped
# screenshots/ui-review/<ts>/ directory, so outputs don't collide.
#
# Usage: bash .cc-prompts/launch-ui-review-batch.sh

set -euo pipefail

PROJECT=/Users/bytedance/Projects/tablecraft
LAUNCHER="$PROJECT/.cc-prompts/launch-ui-review.sh"

# Stagger by 5 seconds so each agent starts with a distinct timestamp
# for its screenshots directory and Chromium instances don't all
# compete for CPU at once.

# Batch A — simple 2-player boards/dice
bash "$LAUNCHER" "blackjack connect-four hive yahtzee" sonnet high batch-a
sleep 5

# Batch B — multi-player card/bidding
bash "$LAUNCHER" "liar-bar love-letter splendor texas-holdem" opus high batch-b
sleep 5

# Batch C — social deduction, high player count
bash "$LAUNCHER" "codenames undercover" sonnet high batch-c

echo
echo "All 3 review agents launched."
echo "Monitor:  for s in cc-ui-review-batch-{a,b,c}; do echo; echo \"=== \$s ===\"; tmux capture-pane -t \"\$s\" -p -S -20 | tail -10; done"
