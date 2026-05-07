#!/usr/bin/env bash
# Micro-agent: review ONLY undercover (3-12p social deduction).
# Avoid codenames's giveClue API trap by staying scope-simple.

set -euo pipefail

PROJECT=/Users/bytedance/Projects/tablecraft
SESSION="cc-ui-review-undercover"
MODEL=opus
EFFORT=high

ALLOWED='Read,Edit,Write,Glob,Grep,Bash(git status),Bash(git diff *),Bash(curl *),Bash(jq *),Bash(mkdir *),Bash(ls *),Bash(cat *),Bash(rg *),Bash(find *),Bash(echo *),Bash(date *),Bash(pnpm exec *),Bash(tsx *),Bash(npx tsx *),Bash(sleep *),Bash(tmux *)'

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" -x 220 -y 60 \
  "zsh -i -c 'source ~/.zshenv && cd \"$PROJECT\" && claude --dangerously-skip-permissions --model $MODEL --effort $EFFORT --allowedTools '\''$ALLOWED'\'' '"

sleep 10

if tmux capture-pane -t "$SESSION" -p -S -50 | grep -q "install it"; then
  tmux send-keys -t "$SESSION" "y" Enter
  sleep 60
fi

tmux send-keys -t "$SESSION" Enter; sleep 1
tmux send-keys -t "$SESSION" Down; sleep 0.3
tmux send-keys -t "$SESSION" Enter; sleep 3

# Paste a TRIMMED spec — not the full ui-review.md (which tries to hit
# complex API flows like codenames giveClue that tripped batch-c).
cat > /tmp/undercover-review.md <<'EOF'
# TASK: Quick UI review of `undercover` (谁是卧底) ONLY

Scope: a single game. Do NOT try to review anything else.

## Setup (do these IN ORDER, and IF any fail, WRITE WHAT FAILED in REPORT.md and move on)

1. Health: `curl -sS http://localhost:3001/api/health` — should be ok.
2. Create output dir: `TS=$(date +%Y%m%d-%H%M%S); OUT=screenshots/ui-review/$TS; mkdir -p $OUT`. Tell me that $TS value.
3. Check if `scripts/ui-review-shoot.ts` already has an `undercover` branch. If yes, use it. If NOT: write a MINIMAL Playwright script that for each viewport (desktop 1440×900, then mobile 375×812):
   - navigates to /games, clicks the undercover card, gets room code
   - joins 2 bots (minPlayers=3, so host + 2 bots)
   - clicks ready, clicks start
   - waits 5 seconds for board to render
   - screenshots `<OUT>/undercover_ingame_<viewport>.png`
   - ALSO captures `undercover_waiting_<viewport>.png` BEFORE clicking ready

   Reuse helper functions from `scripts/shoot-games.ts` (read it first). Do NOT try to drive game actions — just capture waiting + initial ingame. If bots don't auto-ready, skip ready and just screenshot the waiting room.

4. Run the script. Capture its log. Don't retry more than twice per viewport. If 2nd attempt fails, save whatever partial screenshot you have as `*-ERROR.png` and MOVE ON.

## Review (the real work)

For each screenshot you successfully captured, use the Read tool to view the PNG (vision). Evaluate against this rubric and record findings:

1. Visual hierarchy & readability
2. Feedback & state visibility (whose turn, what phase, role visibility)
3. Information architecture
4. Touch targets (at 375px mobile, are buttons/cards ≥ 44×44 CSS px?)
5. Design-system consistency (no hardcoded `[#xxxxxx]` colors; uses tokens)

**ANTI-HALLUCINATION RULES** (critical):
- If you claim "button X is missing", GREP `games/undercover/Board.tsx` first to confirm it isn't conditionally rendered (only shows in some phase/role).
- If you claim "hardcoded colors", grep for `\[#[0-9a-f]+` in that file and cite line numbers.
- If you claim sizing issues, cite the exact class names from source (e.g. `h-10 = 40px`).
- Do NOT invent findings; if everything looks fine, SCORE 5/5 and say so.

## Output

Write TWO files into `<OUT>/`:
- `REPORT.md` — markdown with Executive Summary, Scorecard, Findings by severity (critical/major/minor), Per-screenshot notes, Recommendations
- `findings.json` — array of `{severity, category, screenshot, location, issue, suggestion}`

Then print `git status -s` and exit. Do NOT commit. Do NOT modify any source file.

## Time cap

Budget: 10 minutes. If screenshots alone take longer, skip scripting improvements and just write a partial report based on what you have.

EOF

tmux load-buffer -b undercover-review /tmp/undercover-review.md
tmux paste-buffer -b undercover-review -t "$SESSION"
sleep 1
tmux send-keys -t "$SESSION" Enter

echo "Session: $SESSION (model=$MODEL)"
echo "Monitor: tmux capture-pane -t $SESSION -p -S -30 | tail -15"
