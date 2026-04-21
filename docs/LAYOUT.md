# LAYOUT.md -- Tabletop Games Platform

Layout language: **"Every game is played _on_ a table, not _in_ a web page."** The screen is a table. The platform chrome is the room the table sits in. Everything else is objects resting on the surface. This doc complements `DESIGN.md` -- it defines **where things go**, not what they look like.

---

## 1. Anatomy of a Game Screen

Every game screen is composed of 5 stacked zones. The zones are fixed; the content inside them is game-specific.

```
┌──────────────────────────────────────────────────────────┐
│  A  Platform Header              44px, bg-card/80 blur   │  ← chrome
├──────────────────────────────────────────────────────────┤
│  B  Match Status Bar             ~56px, player badges    │  ← who + phase
├──────────────────────────────────────────────────────────┤
│                                                          │
│  C  Play Surface                  fills viewport height  │  ← the table
│     (bg-table / bg-board / bg-felt)                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  D  Action Zone                   ~72px, sticky bottom   │  ← your turn
├──────────────────────────────────────────────────────────┤
│  E  Private Info Panel            variable, collapsible  │  ← your hand
└──────────────────────────────────────────────────────────┘
```

Not every game uses all 5. Turn-based board games (Gomoku, Hive, Battleship) collapse D+E into the play surface. Card games (Love Letter, UNO, Texas Hold'em) use all 5.

### Zone Responsibilities

| Zone | Owned by | Purpose | Do NOT place here |
|------|----------|---------|-------------------|
| A Header | Platform (layout) | Identity, nav, meta-actions (rules, settings, exit) | Game-turn state, scores, player info |
| B Status Bar | Game (via layout slot) | Player list, current turn, round/phase | Play actions, hand cards |
| C Play Surface | Game | Board, shared cards, token pools, dice | Private hand, action buttons |
| D Action Zone | Game | Primary action (1 button), confirmation, cancel | Status info, scores |
| E Private Panel | Game | Hand, private hints, bet selector | Public info, other players |

**The rule:** if information is about _who is playing_, it goes in B. If it is _shared by all players_, it goes in C. If it is _only for you_, it goes in E. If it is _what you can do right now_, it goes in D.

---

## 2. Platform Header (Zone A)

A 44px (52px on mobile) bar across the top. Rendered by `<GameRoomLayout>`, never by the Board itself.

```
┌──────────────────────────────────────────────────────────────────┐
│ ←返回  🎯 德州扑克 #A3F2  │ 12:34 · 第3局翻牌前 │  规则 设置 退出 │
└──────────────────────────────────────────────────────────────────┘
  left                       center                     right
```

| Segment | Contents | Tap behavior |
|---------|----------|--------------|
| Left | Back arrow, game icon, game name, room code chip | Room code copies invite link |
| Center | Elapsed time, round/phase (`meta`-configurable via layout prop) | -- |
| Right | `Rules`, `Settings`, `Exit` (destructive) | Exit requires confirmation |

### Styling

- `bg-card/80 backdrop-blur` -- lets the play surface texture hint through
- 1px bottom border (`border-border`), **not** shadow -- flat chrome, not floating
- On mobile: collapse center to just elapsed time; collapse right to a `⋯` sheet

### What the Header is NOT

- Not a place for player info (that is Zone B)
- Not a place for score/chips (that is inside Zone B player badges)
- Not where "your turn" is announced (that is Zone B's highlight)

---

## 3. Match Status Bar (Zone B)

One horizontal row of `<PlayerBadge>`s plus a phase label. Lives directly under the header with ~12px top padding.

```
                ┌─────────────────┐    ┌─────────────────┐
                │ ● You   [slots] │    │ ○ Bot1  [slots] │
                │   回合中 •••    │    │                 │
                └─────────────────┘    └─────────────────┘
                      第 1 局 · 翻牌前 · 剩余 12s
```

### Player Badge Anatomy

```
┌────────────────────────────────────┐
│ [avatar]  Name  （你）  [slots ►] │  ← 2 lines, slots are game-specific
│           回合中 · 剩 12s          │
└────────────────────────────────────┘
```

The badge has 3 parts:
- **Identity** (avatar + name + self-marker) -- common to every game
- **State** (turn / eliminated / disconnected / timer) -- driven by a `status` prop
- **Slots** -- game-specific info. Texas Hold'em puts chip count + cards-face-down here; UNO puts hand count; Splendor puts 3 nobles + 6 gems miniature. Accepts `children` as freely composable nodes.

### Turn Signaling (propagates across zones)

When it is a player's turn, **three things happen simultaneously**:
1. That player's badge gets `ring-2 ring-warning` + `scale-[1.03]` + amber glow
2. The Action Zone (D) fills with the allowed action buttons (otherwise ghost/hidden)
3. The viewport edge pulses a thin amber glow (`box-shadow: inset 0 0 0 2px var(--warning)` with `animate-pulse`), decaying after 2s

All three must fire together. A single signal is easy to miss; triple-redundancy is the platform's "your turn" fingerprint.

---

## 4. The Play Surface (Zone C)

This is the single most important layout decision for each game. The Play Surface replaces the old `bg-card` white box. It has two properties: a **surface material** and a **content region**.

### Surface Materials

| Token | Appearance | Games |
|-------|-----------|-------|
| `bg-wood` (`--board`) | Warm amber wood grain | Gomoku, Go, Hive, Connect Four |
| `bg-felt` | Dark green felt, subtle weave | Texas Hold'em, Blackjack, Liar's Bar, Love Letter |
| `bg-water` | Deep blue, faint grid | Battleship |
| `bg-marble` | Cool cream with faint veins | Splendor, Yahtzee |
| `bg-parchment` | Aged paper, ink edges | Werewolf, deduction games |

Each game picks one by setting `meta.surface: SurfaceKind`. The `<GameTable>` component reads this and paints the Zone C background.

### Content Region

Inside the surface, content is positioned by layout type:

| Layout | Shape | Used by |
|--------|-------|---------|
| `centered-board` | Single board centered, 1:1 aspect, max 640px | Gomoku, Hive, Connect Four, Liar's Bar |
| `dual-board` | Two boards side-by-side desktop / stacked mobile | Battleship |
| `community-card-table` | Dealer strip top, community cards center, betting pot | Texas Hold'em, Blackjack |
| `tableau-grid` | Multi-row grid of cards/tiles | Splendor, Yahtzee |
| `hand-centric` | All public info compressed, hand dominates screen | Love Letter, UNO |

Set via `meta.playLayout`. Prevents the current chaos where every game invents its own layout.

### Rules

- **Fill the viewport height**: Zone C has `flex-1`. Never leave a game with 60% empty screen (Battleship, Texas Hold'em violations).
- **Max content width 960px**, centered. Surfaces bleed full-width but content does not.
- **Padding scales responsively**: `clamp(12px, 3vw, 32px)` inside the surface.
- **Never put action buttons inside Zone C** -- they live in Zone D. Exception: direct board clicks (place stone, click hex), which are not buttons.

---

## 5. Action Zone (Zone D)

Sticky bottom strip. Height 72px desktop, 88px mobile (touch target + safe area).

```
┌──────────────────────────────────────────────────────────┐
│   [重置]       [ 确认部署 (3/5) ]      [规则]             │
│   secondary       primary                ghost            │
└──────────────────────────────────────────────────────────┘
```

### Button Hierarchy (exactly one primary per state)

| Tier | Appearance | Count on screen | Usage |
|------|-----------|-----------------|-------|
| Primary | Filled deep ink, `shadow-button` | **1** | The next action in the happy path |
| Secondary | Ghost, foreground border | 0-2 | Reset, undo, skip |
| Destructive | Red border, red text | 0-1 | Fold, surrender, forfeit |
| Utility | Icon-only, text-muted | 0-3 | Rules popup, toggle |

**Enforced rule**: on any given turn, exactly one button has `variant="primary"`. If you find yourself wanting two, pick the most common action and push the other to secondary.

### Not-Your-Turn State

Zone D is **never empty**. When it is not your turn, it shows:

```
  ⏳ 等待 Bot1 出牌...
```

Centered muted text. No buttons. Keeps the layout stable; prevents the "is it my turn or frozen?" confusion.

### No Zone D Games

Games where all actions are direct-click on the board (Gomoku, Hive) omit Zone D. The Status Bar (B) shows turn + hint instead.

---

## 6. Private Info Panel (Zone E)

Your hand. Your secret bid. Your private targets. Below the Action Zone, always visible, never hidden behind a tab.

```
┌──────────────────────────────────────────────────────────┐
│  你的手牌 (7)                                             │
│  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐               │
│  │K │  │J │  │A │  │K │  │A │  │7 │  │3 │               │
│  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘               │
│  点击选牌，然后打出                                        │
└──────────────────────────────────────────────────────────┘
```

- **Label**: `你的XX` (private pronoun) -- never "玩家手牌"
- **Hint line**: one sentence of instruction, `text-xs text-muted-foreground`
- **Selection state**: selected card lifts `-translate-y-3` + `ring-2 ring-warning`
- **Overflow**: wrap to 2 rows, never horizontal scroll (breaks on mobile)

### Hiding Rule

If the game has no private info during a phase (between-round summary, spectator view), **render the panel with a placeholder** (`本阶段无手牌`) -- do not collapse it. Preserving the vertical rhythm matters more than saving pixels.

---

## 7. Information Layering

Every piece of data belongs to exactly one of four visibility levels. Placement follows:

| Level | Who sees it | Zone | Example |
|-------|------------|------|---------|
| Platform | Everyone, always | A | Game name, room code |
| Public | All players in the match | B + C | Scores, community cards, board state |
| Private | Only you | E | Hand, private goal |
| Hidden | Nobody yet | C with back-face | Deck, face-down community, opponent hand |

**Enforcement**: when adding a new data field to a game, first classify it. Then the zone follows deterministically. This prevents the pattern seen in current games where "我的得分" is in Zone C next to the board -- it belongs in Zone B (on your badge).

---

## 8. Responsive Rhythm

375px is the reference minimum. Every game must be tested there.

### Vertical Stack Order (Mobile)

The 5 zones stack top-to-bottom. **Do not break this order** for any game.

```
┌────────────────┐
│ A Header  44px │   sticky
├────────────────┤
│ B Status  80px │   2-row wrap if >4 players
├────────────────┤
│                │
│ C Play         │   fill, scrollable if needed
│  Surface       │
│                │
├────────────────┤
│ D Action  88px │   sticky-bottom, above-safe-area
├────────────────┤
│ E Private      │   scroll-into-view when hand changes
└────────────────┘
```

### Scaling Contract

| Viewport | Header | Status | Play | Action | Private |
|----------|--------|--------|------|--------|---------|
| 375px | 52px | 88px (wrap) | fill, min 320px | 88px | auto |
| 768px | 44px | 72px | fill, min 520px | 72px | auto |
| 1024px+ | 44px | 72px | max-w-[960px] centered | 72px | max-w-[960px] |

### Things That MUST Work at 375px

- Tapping any card/chip/button (min 44x44px target)
- Seeing all your badges (B) without horizontal scroll
- Reading the phase label
- Using the primary action without scrolling

---

## 9. Screen Utilization

**Rule of thirds for the play surface**: a well-laid-out game fills at least 2/3 of the viewport height with meaningful content.

### Current Violations (what this doc exists to prevent)

| Game | Symptom | Root cause |
|------|---------|-----------|
| Battleship | 2/3 of screen empty to the right | Only rendering own board; no dual-board layout |
| Texas Hold'em | Upper 1/3 empty | Players stacked at top, community cards floating mid-screen |
| Liar's Bar | Bottom 1/2 empty | Centered dice pattern with no action area |
| Yahtzee | Dice bar floats in upper 1/3 | No clear zones, vertical content doesn't extend |

### Fix Priority

1. **Ensure every game has a Zone D** (even if it is a "waiting..." label)
2. **Spread Zone C to fill** via `flex-1 min-h-0`
3. **Push Zone B against the header** (no gap) so it reads as one top strip
4. **Push Zone E against Zone D** (no gap) so they read as one bottom strip

The only gap is between the top strip (A+B) and the bottom strip (D+E). That gap **is** Zone C.

---

## 10. Lobby Layout

The lobby is the only screen that does not use the 5-zone anatomy. It has its own structure:

```
┌──────────────────────────────────────────────────────────┐
│  Platform Header (lobby variant, 64px)                   │
│    桌游大全 logo                    EN | avatar | name   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Hero (140px, cream)                                     │
│    和朋友一起，随时随地玩桌游                               │
│    [快速开始] [创建房间] [输入房间码]                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Active Rooms (3-card strip, full-bleed)   [refresh]     │
│    Room cards show: game icon, host avatar, N/M players  │
├──────────────────────────────────────────────────────────┤
│  Select Game                              [全部|策略|...] │
│  Game grid (2 cols mobile / 3 cols tablet / 4 cols wide) │
│    Each card has hero art strip + meta + active-room dot │
├──────────────────────────────────────────────────────────┤
│  Footer (thin, about/help/version)                       │
└──────────────────────────────────────────────────────────┘
```

### Rules

- **Rooms above games**: if there are active rooms, they get top visual weight. Joining > creating.
- **Game card hero**: each card has a 96-120px top image region with a game-specific gradient or illustration. Solves "all cards look the same."
- **Active-room indicator**: a small amber dot on game cards with active rooms (`N rooms` tooltip).
- **Filters are chips, not dropdowns**: single-select, with clear active state (`bg-warning text-warning-foreground`).
- **Empty state for rooms**: friendly illustration + "成为第一个开局的玩家" + primary create button.

---

## 11. Game-Specific Layout Metadata

Each game's `meta` gains three new fields:

```ts
export const meta: GameMeta = {
  // ... existing fields
  surface: 'felt',              // SurfaceKind
  playLayout: 'centered-board', // PlayLayoutKind
  statusSlots: ['chips', 'handCount'], // keys the PlayerBadge renders
}
```

This lets the platform render correct chrome **without each Board reinventing it**. Board components become pure game content -- no player badges, no headers, no back buttons.

---

## 12. Layout Stability (Jitter Control)

**The rule:** on a game platform, visible layout shift during play feels broken, not dynamic. Web apps reflow freely; games hold their frame. A button that grows when enabled, a status line that jumps when a timer ticks from 10s to 9s, a player badge that shortens when a bot disconnects -- all of these read as "the software is unsettled." We reserve space, we transition state, we never snap.

### 12.1 The Four Sources of Jitter

| Source | Symptom | Root cause |
|--------|---------|-----------|
| **Conditional mount** | Buttons/hints appear out of nowhere | `{condition && <X />}` removes from flow |
| **Content-sized boxes** | Zone heights change as content changes | Missing `min-h` / `h-*` on zone containers |
| **Variable-width text** | Timers, scores, names push siblings around | Proportional digits, unconstrained `max-w` |
| **Instant state swaps** | Card flips, turn highlight, phase change all snap | Missing transitions on state changes |

Each has a specific fix below.

### 12.2 Reserve Space, Don't Toggle

**Wrong** -- the Action Zone jumps when no actions are available:
```tsx
{isMyTurn && <Button>出牌</Button>}
```

**Right** -- slot is always occupied, content swaps:
```tsx
<Slot h={72}>
  {isMyTurn ? <Button>出牌</Button> : <WaitingLabel>等待 {opponent} 出牌</WaitingLabel>}
</Slot>
```

General rule: **every zone has a declared height**. Zone B is 72px (88px mobile, 2-row wrap). Zone D is 72/88px. Zone E is declared by the game. If content is missing, render a placeholder of the same height -- never collapse.

### 12.3 Fixed Dimensions on Mutable Content

| Element | Minimum dimension | Why |
|---------|-------------------|-----|
| Player badge | `min-w-[180px]` | Names vary 2-12 chars; keeps row stable when someone disconnects |
| Timer text | `tabular-nums` + `min-w-[3ch]` | Digit width varies in proportional fonts |
| Score numbers | `tabular-nums` | `10` is not the width of `11` in Noto Sans |
| Primary button | `min-w-[120px]` | Label text varies by phase ("出牌" -> "确认打出 3 张") |
| Card slots (community, deck) | Full card dimensions with back-face | Back face occupies the space, flips to reveal |
| Avatar | Fixed pixel size, never `%` | Square stays square |

The `tabular-nums` class (map to `font-variant-numeric: tabular-nums`) is required on **every number that updates in place** -- timers, scores, chips, round counters.

### 12.4 Transitions, Not Snaps

Every state change that would cause a paint must go through a transition. The duration scale:

| Change | Duration | Easing | Library |
|--------|----------|--------|---------|
| Turn highlight (badge ring) | 200ms | ease-out | CSS |
| Phase text change | 240ms | crossfade | framer `AnimatePresence mode="wait"` |
| Card enter (draw, deal) | 320ms | spring `stiffness: 300, damping: 24` | framer |
| Card exit (discard, play) | 200ms | ease-in, translate + fade | framer |
| Number tween (score, chips) | 400ms | ease-out | framer `animate` on `motion.span` |
| Timer countdown | 1000ms linear | -- | CSS `transition: width 1s linear` on ring |
| Player add/remove | 240ms | layout transition | framer `layout` prop |
| Cards reorder (sort hand) | 300ms | FLIP | framer `layout` |

Rule of thumb: **if it changes and it matters to the player, it transitions**. If it changes and the player won't notice, it still transitions (costs nothing, prevents jitter).

### 12.5 Enter/Exit Discipline

For any element that conditionally renders, wrap with `AnimatePresence`:

```tsx
<AnimatePresence mode="wait">
  {notification && (
    <motion.div
      key={notification.id}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {notification.text}
    </motion.div>
  )}
</AnimatePresence>
```

**Never** mount/unmount without exit animation if the element is visible during gameplay. Exception: modals, which use their own overlay transition.

### 12.6 List Operations (FLIP)

Player lists, hand cards, turn history -- any list whose order can change -- must use framer-motion's `layout` prop:

```tsx
{hand.map(card => (
  <motion.div key={card.id} layout transition={{ duration: 0.3, type: 'spring' }}>
    <PlayingCard {...card} />
  </motion.div>
))}
```

This handles insertion, removal, and reordering with the FLIP technique automatically. **Do not** rely on CSS `order` or manual keyframes for list reflow.

### 12.7 Numeric Tweens

Scores, chip counts, round numbers increment in steps -- but visually they should tween:

```tsx
<motion.span
  key={score}
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  className="tabular-nums"
>
  {score}
</motion.span>
```

For large deltas (chip win of +450), use a count-up animation rather than a swap -- the eye reads the magnitude of change, not just the final number.

### 12.8 Skeletons Match, Don't Reflow

When loading (game enters, reconnect), the skeleton **must have the same dimensions** as the loaded content. A skeleton that is 100px tall replaced by content that is 140px tall causes a 40px shift the moment data arrives. Measure the real content and pad the skeleton to match.

Corollary: if a zone's content is not yet ready (setup phase, waiting for other player to deploy), fill the zone with a descriptive placeholder of the same dimensions, not a smaller loading spinner.

### 12.9 Forbidden Patterns

These are the specific anti-patterns that create the "not a real game" feeling:

| Pattern | Why it jitters | Replacement |
|---------|----------------|-------------|
| `display: none` toggled by state | Element pops in/out of flow | `opacity` + `pointer-events` on a fixed-size container |
| `hidden` utility on conditional hints | Same as above | Render placeholder text of same height |
| `hover:scale-110` on resting elements | Next to siblings, causes neighbor shift | `hover:translate-y` or `hover:scale` with `transform-origin` and `will-change: transform` on an absolutely-positioned overlay, not the layout element itself |
| Responsive breakpoint that re-stacks during play | Window resize mid-game reflows the whole screen | Lock breakpoint behavior at match start; use `min-height` on Zone C |
| Text that grows with content ("等待" -> "等待 Bot1 摸牌中...") | Pushes sibling elements | Use `min-w` on the label slot, truncate with ellipsis if absolutely needed |
| Fresh mount of card back on reveal | Layout hop when size differs | Both faces share one component, flip via `rotateY` transform |
| Scroll-jump on hand expansion | Adding a card scrolls the hand | Reserve max hand width; if overflow, animate with `layout` |
| Player badge shrinks when name is shorter | Neighbor badges shift | Fixed `min-w-[180px]` on all badges |

### 12.10 The "Pause Frame" Rule

When a decision point arrives -- your turn begins, a phase transitions, a modal opens -- **freeze the layout for a beat** (150-200ms) before allowing action. This gives animations time to complete and prevents the player from clicking a button that is still mid-transition (and therefore in a slightly wrong position). The Action Zone's primary button should fade-in + be non-interactive until the turn-highlight animation finishes. This single rule is the difference between "responsive UI" and "game feel."

---

## 13. Do's and Don'ts

### Do

- Use the 5-zone anatomy. Name your regions: `header`, `status`, `surface`, `action`, `private`.
- Put game identity (name, room code) in the header, not in the Board.
- Put player info (avatar, turn, score) in Zone B, never in Zone C.
- Fill Zone C with the play surface -- give it `flex-1` and let it stretch.
- Keep exactly one primary button at a time in Zone D.
- Show a "waiting..." placeholder in Zone D on opponents' turns -- never blank.
- Signal "your turn" in three places simultaneously: player badge, Zone D, viewport edge.
- Test every game at 375px width. The 5 zones must stack cleanly.
- Declare a height on every zone. Empty states use placeholders of the same height.
- Use `tabular-nums` on every number that updates in place (timers, scores, chips).
- Give player badges and primary buttons `min-w` to absorb label variance.
- Wrap conditional elements in `AnimatePresence` with enter + exit animations.
- Use framer-motion `layout` prop on any reorderable list (hands, players, history).
- Hold a 150-200ms "pause frame" at phase transitions before enabling new actions.

### Don't

- No `bg-card` white boxes as the play surface. Pick a surface material.
- No action buttons floating in Zone C next to the board.
- No empty right-half or bottom-half of the viewport.
- No game-internal "back to lobby" buttons -- the platform header owns navigation.
- No `onReturnToRoom` / `onReturnToLobby` props on `BoardProps` -- the layout provides these.
- No player scores rendered inside Zone C -- they belong on player badges in Zone B.
- No hiding the hand (Zone E) behind a tab or collapse. Keep it visible.
- No private-info leaking into public zones. If unsure, classify first, then place.
- No `display: none` or `hidden` toggles on in-play elements -- use opacity + fixed dimensions.
- No `hover:scale` on elements whose size affects siblings. Put the scale on an absolute overlay.
- No proportional digits for live numbers. Always `tabular-nums`.
- No mount/unmount of visible elements without enter/exit transitions.
- No skeleton that differs in dimensions from the loaded content -- measure and match.
- No instant state swaps on turn / phase / score changes. Everything transitions.
