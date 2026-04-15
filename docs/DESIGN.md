# DESIGN.md -- Tabletop Games Platform

Design language: **"Digital objects on a physical table."** Every UI element feels like a real card, token, or board piece resting on a warm wooden surface. The core pillars are **thick borders, hard offset shadows, and tactile interactions**.

---

## 1. Color System

### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#faf5eb` | Page canvas -- warm cream tabletop |
| `--secondary` / `--muted` | `#f0e8d8` | Recessed areas, info blocks |
| `--card` | `#ffffff` | Cards, modals, inputs -- paper-white |

### Ink (Text & Borders)

| Token | Hex | Usage |
|-------|-----|-------|
| `--foreground` | `#3d2e1e` | Primary text, thick borders, hard shadows |
| Deep ink | `#1a1108` | Strongest emphasis (logo, hero titles, button shadow) |
| `--muted-foreground` | `#6b5744` | Secondary text, descriptions |
| Tertiary | `#9c8b78` | Placeholders, timestamps |
| `--border` | `#c4b8a8` | Borders, dividers, disabled states |

### Six Game Colors

Each game category has its own color from this palette. Used for tags, accent shadows, and status indicators.

| Name | Primary | Light (bg) | Dark (text) | Usage |
|------|---------|------------|-------------|-------|
| Dice Red | `#d94040` | `#fde8e8` | `#7a1a1a` | Error, destructive |
| Royal Blue | `#2563eb` | `#e8f0fe` | `#1a3a8a` | Strategy tags |
| Jade Green | `#16a34a` | `#e8f8ee` | `#0a5c2a` | Success, online, ready |
| Amber Gold | `#d97706` | `#fef3e0` | `#7a4006` | Warning, current turn, selected |
| Crown Purple | `#7c3aed` | `#f0e8fe` | `#4a1a8a` | Deduction, fantasy tags |
| Coral Pink | `#e8556d` | `#fde8ec` | `#8a1a30` | Party, social tags |

### Semantic Mapping

| Semantic | Color | Example |
|----------|-------|---------|
| `--success` | Jade `#16a34a` | Online dot, "ready" text, ready button |
| `--warning` | Amber `#d97706` | Current turn, host badge, selected card |
| `--destructive` | Dice Red `#d94040` | Error messages, elimination |
| Info | Royal Blue `#2563eb` | Tips, help text |

### Game-Specific Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--board` | `#d4a056` | Gomoku/Go board wood surface |
| `--board-line` | `#6b5744` | Board grid lines and star points |

---

## 2. Typography

### Font Stack

| Role | Font | Notes |
|------|------|-------|
| Display / UI | `"Noto Sans SC", "Inter Variable", system-ui` | Chinese + Latin |
| Monospace | `"Space Mono", "JetBrains Mono", monospace` | Room codes, rankings |

### Scale

Use Tailwind's type scale. Titles use `font-bold` (700) or `font-semibold` (600). Body text stays at 400-500.

| Role | Tailwind | Weight | Usage |
|------|----------|--------|-------|
| Page title | `text-4xl` | 700 | "Tabletop Games" in nav |
| Section title | `text-lg` / `text-xl` | 600 | "Select Game", "Rooms" |
| Card title | `text-base` | 700 | Game name |
| Body | `text-sm` | 400 | Descriptions |
| Small / label | `text-xs` | 600 | Tags, metadata, timestamps |
| Mono | `font-mono tracking-wider` | 600 | Room codes |

### Rules

- Titles: weight 600-700. Body: never exceed 500.
- Never use pure black `#000000`. Use `#1a1108` (deep ink) or `#3d2e1e` (foreground).

---

## 3. Shadows & Depth

The shadow system is the heart of the skeuomorphic feel. Hard offset shadows simulate directional light from the upper-right.

### Shadow Utilities (defined in index.css)

| Class | Value | Usage |
|-------|-------|-------|
| `shadow-card` | `#3d2e1e -6px 6px 0px, rgba(61,46,30,0.08) 0px 2px 8px` | Cards at rest |
| `shadow-card-hover` | `#3d2e1e -8px 10px 0px, rgba(61,46,30,0.12) 0px 8px 24px` | Card lifted (hover) |
| `shadow-card-active` | `#3d2e1e -3px 3px 0px, rgba(61,46,30,0.06) 0px 1px 4px` | Card pressed (active) |
| `shadow-button` | `#1a1108 -4px 4px 0px` | Button at rest |
| `shadow-button-hover` | `#1a1108 -5px 6px 0px` | Button lifted |
| `shadow-button-active` | `#1a1108 -2px 2px 0px` | Button pressed |
| `shadow-inset` | `inset rgba(61,46,30,0.08) 0px 2px 4px` | Input fields (recessed) |

### Depth Layers

| Layer | Treatment | Usage |
|-------|-----------|-------|
| L-1 Recessed | `shadow-inset` | Inputs, search fields |
| L0 Table | No shadow, `bg-background` | Page canvas |
| L1 Info | `rgba(61,46,30,0.06) 0px 1px 3px` | Info blocks, param badges |
| L2 Card | `shadow-card` | Game cards, room list, modals |
| L3 Lifted | `shadow-card-hover` | Hovered cards, drag state |
| L4 Overlay | `bg-[#1a1108]/50` backdrop | Modal overlays |

### Interaction Physics

Every card and button responds to hover/press with shadow transitions:

```
Rest    → shadow-card,   transform: none
Hover   → shadow-card-hover, translateY(-4px) rotate(-1.5deg)
Active  → shadow-card-active, translateY(0) rotate(0)
```

Transition: `duration-200` with default ease. Cards feel like picking up and putting down a game piece.

---

## 4. Borders & Radius

### Border Widths

| Class | Width | Usage |
|-------|-------|-------|
| `border-thick` | 2.5px | Cards, main panels |
| `border-2` | 2px | Buttons, inputs, badges, status indicators |
| `border` | 1px | Subtle dividers, tag borders |

All borders use warm colors: `border-foreground` (#3d2e1e) for strong, `border-border` (#c4b8a8) for subtle.

### Radius Scale

| Size | Value | Usage |
|------|-------|-------|
| Small | `rounded-[8px]` | Badges, param blocks, room code |
| Medium | `rounded-[12px]` | Buttons, inputs, room list items |
| Large | `rounded-[16px]` | Cards, modals, main panels |
| Pill | `rounded-full` | Tags, status dots |

---

## 5. Icons

Use **lucide-react** exclusively. No emoji anywhere in code, UI, or docs.

### Size Convention

| Context | Size | Example |
|---------|------|---------|
| Inline with text | `size-3` to `size-3.5` | Metadata (clock, users count) |
| Button icon | `size-4` | Plus, ArrowLeft in buttons |
| Card icon | `size-6` | Game card icons (Target, Heart) |
| Empty state / modal | `size-10` | Trophy, Frown, Sofa |

### Current Icon Usage

| Icon | Usage |
|------|-------|
| `Dices` | Nav logo, default game icon |
| `Target` | Gomoku game card |
| `Heart` | Love Letter game card |
| `Users` | Player count badge |
| `Clock` | Duration badge |
| `Pencil` | Editable nickname hint |
| `RefreshCw` | Room list refresh (animate-spin when loading) |
| `Plus` | Create room button |
| `Sofa` | Empty room list state |
| `Trophy` | Game over -- winner |
| `Frown` | Game over -- loser |
| `ArrowLeft` | Return to room |
| `Home` | Return to lobby |

### Adding Game Icons

Each game defines an `icon` field in its `meta` (in `shared.ts`). The Lobby maps icon names to Lucide components via `ICON_MAP`. When adding a new game, add the icon name to meta and register it in the map.

---

## 6. Avatars

Use **boring-avatars** (`beam` variant) for user avatars. Generated from the user's name, producing unique face-like SVG identicons.

```tsx
<Avatar name={userName} size={32} variant="beam" colors={['#d94040', '#2563eb', '#16a34a', '#d97706', '#7c3aed']} />
```

Colors use the six game palette primaries. The avatar appears in the top-right nav bar.

---

## 7. Animation

Use **framer-motion** for meaningful transitions. Animations should reinforce the physical metaphor -- objects appearing, lifting, settling.

### Stone Placement (IntersectionBoard)

```tsx
initial={{ scale: 0, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
transition={{ type: 'spring', stiffness: 400, damping: 20 }}
```

Spring physics: the stone "pops" into place with a slight overshoot, like dropping a game piece.

### Hover Preview

```tsx
initial={{ opacity: 0 }}
animate={{ opacity: 0.4 }}
exit={{ opacity: 0 }}
```

Ghost stone fades in at 40% opacity to preview placement.

### CSS Transitions

Cards/buttons use CSS transitions for hover/active states:

```
transition-all duration-200
```

The card hover adds `hover:-translate-y-1 hover:-rotate-[1.5deg]` -- a subtle tilt like picking up a card. Active snaps back to origin.

### Loading States

- `RefreshCw` icon: `animate-spin` class while fetching.
- Room list: stays visible during refresh, data swaps silently. Loading spinner only on first mount.

### Rules

- Every interactive element must respond to hover and active with a physical metaphor (lift/press).
- Avoid flashy decorative animations. Motion should communicate state change.
- Use spring physics for game piece placement. Use CSS transitions for UI state changes.
- No flicker: never clear visible content to show a loading skeleton for in-place refreshes.

---

## 8. Component Patterns

### Game Card (Lobby)

```
┌───────────────────────┐   border-thick border-foreground
│  [icon]  Game Name    │   rounded-[16px]
│  Description text...  │   shadow-card
│  [2人] [10min] [策略] │   hover: lift + rotate + shadow-card-hover
│  3 rooms active       │   selected: bg-[#fef3e0] border-warning
└───────────────────────┘
```

### Room List Entry

```
┌──────────────────────────────────────┐
│  ABC123  [Game]  HostName   2/4 [加入]│   bg-secondary border-2 border-border
└──────────────────────────────────────┘   rounded-[10px]
```

### Player Badge

```
┌─────────────────────────────┐
│  ● PlayerName  你  回合中    │   border-2, shadow variant
└─────────────────────────────┘   turn: bg-[#fef3e0] border-warning
```

"回合中" always rendered, `invisible` when not active -- prevents layout shift.

### Game Over Modal

```
bg-[#1a1108]/50 backdrop
┌────────────────────┐  border-thick shadow-card
│    [Trophy/Frown]  │
│    You Won! / #2   │
│    1. Alice  (you) │  first place: amber bg
│    2. Bob          │  others: secondary bg
│    [Return Room]   │  primary button
│    [Return Lobby]  │  outline button
└────────────────────┘
```

### IntersectionBoard (Go/Gomoku)

```
bg-board (#d4a056) border-[2.5px] border-[#3d2e1e] shadow-card rounded-[16px]
SVG grid: stroke var(--board-line), star points r=3
Responsive: width min(maxPx, calc(100vw - 32px)), aspect-ratio 1
Grid: 1fr tracks, SVG viewBox auto-scales
Black stone: bg-[#1a1108] border-2 border-[#3d2e1e]
White stone: bg-white border-2 border-[#c4b8a8]
```

---

## 9. Tags

Each tag maps to a unique color from the game palette:

| Tag | Background | Text | Border |
|-----|-----------|------|--------|
| Strategy | `#e8f0fe` | `#1a3a8a` | `#2563eb` |
| Board | `#e8f8ee` | `#0a5c2a` | `#16a34a` |
| Deduction | `#f0e8fe` | `#4a1a8a` | `#7c3aed` |
| Card | `#fef3e0` | `#7a4006` | `#d97706` |
| Party | `#fde8ec` | `#8a1a30` | `#e8556d` |
| Casual | `#fde8e8` | `#7a1a1a` | `#d94040` |

Style: `text-xs font-semibold border rounded-full px-2 py-0.5`.

When adding a new tag, assign it an unused game color.

---

## 10. Responsive

### Breakpoints

| Name | Width | Key changes |
|------|-------|-------------|
| Mobile | <640px | 2-col game cards, compact padding (px-4), stacked controls |
| Tablet+ | >=640px (sm) | 3-col game cards, wider padding (px-6) |
| Content max | 768px (max-w-3xl) | Centered, generous side margins |

### Patterns

- Game cards: `grid-cols-2 sm:grid-cols-3`
- Page padding: `px-4 sm:px-6`
- Board: `width: min(maxPx, calc(100vw - 32px))` + `aspect-ratio: 1` -- fluid sizing
- Board padding: `clamp(8px, 2vw, 18px)`
- Touch targets: minimum 44x44px for buttons
- Hard shadows maintained at all sizes -- they are the visual identity

---

## 11. Do's and Don'ts

### Do

- Use 2-3px solid brown borders on all cards and panels.
- Use warm cream `#faf5eb` as page background. Never cold white or gray.
- Add hover micro-rotation `rotate(-1~-2deg)` on cards -- feels like picking up a game piece.
- Respond to hover/active with shadow depth changes on every interactive element.
- Use lucide-react for all icons. Match size to context (inline, button, card, empty state).
- Use the six game palette colors for tags, each tag getting a unique color.
- Use `font-mono tracking-wider` for room codes and numeric data.
- Use boring-avatars for user identity display.

### Don't

- No borderless cards or panels.
- No soft/blurred shadows as the primary shadow -- hard offset shadows are the identity.
- No cold grays (`#ccc`, `#eee`) -- all neutrals must be warm (brown-tinted).
- No pure black `#000000` text -- use `#1a1108` or `#3d2e1e`.
- No static hover states -- every card/button must have physical lift/press feedback.
- No emoji anywhere in code, UI, logs, or documentation.
- No `font-bold` (700) on body text -- only titles and buttons.
- No loading flicker -- keep content visible during in-place refreshes.
