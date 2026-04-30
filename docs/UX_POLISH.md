# UX_POLISH.md -- Tabletop Games Platform

Polish language: **"Make it feel alive, without making it loud."** `DESIGN.md`
defines the visual language, `LAYOUT.md` defines the structure. This doc
defines **how a static game room becomes a lived-in table** -- through scene
theming, motion, and thematic detail -- without violating the platform's
restraint.

Rule of thumb: a player who disables animations should still be able to
play. Every polish layer is additive.

> Sound effects and background music are intentionally out of scope for
> this document. Tabletop games reward quiet concentration; adding audio
> is a larger design conversation and will live in a separate doc if it
> ever happens.

---

## 1. Three Dimensions of Game Feel

| Dimension | What it adds | Status |
|-----------|--------------|--------|
| **Spatial** | A sense of place -- the table, the room, the lighting | Shipped (`<GameScene>`) |
| **Alive** | Breathing, timers, bot-thinking cues | Partial |
| **Thematic** | Each game owns a mood (wood / felt / velvet / leather / paper) | Shipped (all 11 games themed) |

Each section below is a recipe a contributor (human or agent) can follow
without a round of design review.

---

## 2. Spatial -- the Scene System

**Status: implemented.** See `packages/game-ui/src/scene/GameScene.tsx`.

### 2.1 `meta.scene` schema

```ts
scene?: {
  surface?: {
    color?: string;       // base color of the play area
    texture?: 'wood' | 'felt' | 'velvet' | 'leather' | 'paper' | null;
    accent?: string;      // hex; exposed as CSS var --scene-accent
  };
  ambience?: {
    type?: 'spotlight' | 'ambient' | 'none';
    warmth?: 'warm' | 'cool' | 'neutral';
    intensity?: number;   // 0..1
  };
}
```

- Omitting `scene` entirely falls back to the cream platform look. This is
  the default for games that do not have a strong thematic identity.
- Omit the ambience block if the game feels wrong under directional light
  (abstract games often do).
- `accent` is exposed as `var(--scene-accent)` on the scene wrapper, so
  board-level components can color ring highlights, last-move markers, and
  timers without hardcoding.

### 2.2 Texture quality standard

A texture must do **all three** to count as shipped:

1. **Organic noise layer** -- SVG `<feTurbulence>` (or equivalent) so the
   surface doesn't read as a repeating mathematical pattern.
2. **Signature detail elements** -- actual drawn shapes that identify the
   material (wood rings, leather stitching, paper fiber specks).
3. **Non-uniform lighting** -- directional or radial gradient on top,
   different per texture, not a one-size-fits-all wash.

See `scene/textures/` for the per-texture SVG sources and the conventions
they follow.

### 2.3 Suggested scenes per game

| Game | Surface | Texture | Ambience | Accent | Notes |
|------|---------|---------|----------|--------|-------|
| Gomoku | `#4a3528` | wood | spotlight / warm / 0.35 | `#d4a056` | Shipped |
| Hive | `#3d4a3a` | felt | ambient / neutral / 0.25 | `#c79a3d` | Hex tiles read better on matte green |
| Connect Four | `#1f3a6b` | velvet | spotlight / cool / 0.30 | `#f4c744` | Carnival feel |
| Battleship | `#0f3a4d` | leather | ambient / cool / 0.20 | `#5fb9c7` | Naval, not game-show |
| Love Letter | `#4a2c55` | velvet | spotlight / warm / 0.45 | `#d4a056` | Court intrigue |
| UNO | `#d94040` | paper | none | `#ffffff` | Plastic, flat, loud |
| Texas Hold'em | `#1f5233` | felt | spotlight / warm / 0.40 | `#d4a056` | Casino classic |
| Splendor | `#2d2a4a` | velvet | ambient / cool / 0.30 | `#c79a3d` | Gem sparkle below |
| Yahtzee | `#223a5c` | leather | spotlight / neutral / 0.30 | `#f4c744` | Retro score pad |
| Liar's Bar | `#3a1a1a` | leather | spotlight / warm / 0.50 | `#d94040` | Smoky, dim |
| Blackjack | `#1f5233` | felt | ambient / neutral / 0.25 | `#ffffff` | Dealer-neutral |

These are starting points, not rules. Each game's implementer can propose
adjustments with a before/after screenshot.

### 2.4 Platform chrome stays cream

**Non-negotiable.** Zones A (Platform Header), B (Match Status Bar), D
(Action Zone), and E (Private Info Panel) always render on cream. Scene
theming is scoped to the inside of `<GameTable>` via `<GameScene>`. This
keeps brand identity stable and prevents the platform from feeling like
11 different apps stitched together.

---

## 3. Alive -- motion that breathes

### 3.1 Use `framer-motion`, not a new animation lib

The client already depends on `framer-motion ^11`. Do not introduce Lottie,
react-spring, GSAP, or a CSS animation framework unless you have a specific
reason and bring a PR discussion.

### 3.2 Motion tokens

| Token | Duration | Easing | Use for |
|-------|----------|--------|---------|
| `instant` | 120ms | `easeOut` | Hover state, focus ring |
| `quick` | 220ms | `easeOut` | Button press, modal open |
| `settle` | 350ms | `[0.22, 1, 0.36, 1]` | Piece placement, card deal |
| `breathe` | 2200ms | `easeInOut` infinite | Your-turn indicator, ready pulse |
| `celebrate` | 1200ms | `easeOut` | Win line glow, confetti hold |

If you need a new timing, check if one of the above works first.

### 3.3 The five canonical motion moments

1. **Placement** -- piece scales `0.3 -> 1.05 -> 1.0` over `settle`. Never
   use a linear ease; it reads as "software", not "object".
2. **Your turn** -- the turn-status chip pulses box-shadow + opacity on
   `breathe`. Pulses stop the instant the player interacts.
3. **Bot thinking** -- same chip, subtler opacity pulse (no box-shadow).
   Clearly different from "your turn" so colorblind players can tell.
4. **Win line** -- 5 winning cells glow with accent color, pulsing on
   `celebrate`. The GameOverModal is delayed ~1.2s so the line registers
   first.
5. **Reject** -- invalid move shakes the pending stone back to origin
   (±4px, 150ms). Never a modal.

### 3.4 Reduced motion

Respect `prefers-reduced-motion`. Replace `breathe` and `celebrate` with a
static highlighted state. Placement becomes an instant swap. This is
non-negotiable.

```ts
import { useReducedMotion } from 'framer-motion';
const reduced = useReducedMotion();
```

---

## 4. Thematic -- mood per game

Each game's scene tokens (section 2) already establish a palette. Thematic
polish goes beyond color:

### 4.1 Piece material

Physical pieces should look like what the game says they are. Gomoku stones
get a subtle radial gradient (shiny glass). UNO cards get flat matte
plastic. Splendor gems get a faceted linear gradient. Texas Hold'em chips
get an edge ridge. Three extra lines of CSS each, not a full PBR shader.

### 4.2 Type pairing inside the scene

The platform uses Inter + Noto Sans SC. Inside a scene, a game may layer
**one** accent font for display-only text (titles, score numbers, the win
banner). Suggested pairings:

| Game | Accent font | Use for |
|------|-------------|---------|
| Gomoku | *(none -- board is visually dense enough)* | -- |
| Liar's Bar | `IM Fell English SC` | Round title, saloon banner |
| Texas Hold'em | `Bebas Neue` | Chip counts, all-in banner |
| Love Letter | `Cinzel` | Card names |
| UNO | `Fredoka` | Score bubbles |

Accent fonts are **display-only**. Body text, tooltips, error messages
stay on Inter/Noto Sans SC.

### 4.3 Ambient particles (optional, sparing)

A scene may include one low-density ambient particle layer -- for instance,
floating embers in Liar's Bar, or drifting dust motes in a dim wood scene.
Rules:

- Canvas-based, not DOM.
- **< 40 particles on screen**, ever.
- Paused when the tab is backgrounded.
- Disabled entirely under `prefers-reduced-motion`.

Particles are the most "video-gamey" tool in this doc. Use them once or
twice across the platform, not everywhere.

---

## 5. Decision checklist for a new polish PR

Before merging any polish change:

- [ ] Platform chrome (zones A, B, D, E) looks identical to before.
- [ ] The feature reads correctly at 375px viewport.
- [ ] `prefers-reduced-motion` is respected.
- [ ] No new runtime dependencies added unless justified in the PR.
- [ ] Existing tests pass; at least one new test covers the added behavior
      at the logic layer (visual polish doesn't need a unit test, but
      state transitions do).
- [ ] Before/after screenshots are attached (desktop + mobile).
- [ ] Total added weight (SVG assets) is under 80 KB per texture.

---

## 6. What NOT to do

- Do not add confetti canvases on win screens. They are cliché and hurt
  low-end devices.
- Do not animate the platform logo.
- Do not use emoji in UI copy (existing CLAUDE.md rule 5.1 -- also applies
  here).
- Do not add "haptics" on mobile web -- navigator.vibrate is unreliable
  and intrusive.
- Do not theme the lobby or leaderboard. Scenes live **inside** a game room
  only.
- Do not rely on `repeating-linear-gradient` alone for a texture. Every
  texture must include an organic noise layer (§2.2).

---

## 7. Roadmap

Approximate order, each step independently shippable:

1. **SVG texture upgrade for all 5 materials** -- wood / felt / velvet /
   leather / paper each get a proper SVG-backed layer meeting §2.2.
2. **Scene fill-out for the remaining 10 games** -- section 2.3 table.
3. **Piece material pass** -- one PR per game, cosmetic only.
4. **Reduced-motion audit** -- grep for `motion.div` and `animate={...}`,
   ensure every instance has a reduced-motion fallback.
5. **Optional: ambient particles for Liar's Bar** -- the one game where it
   genuinely fits.

Every step above is under 300 lines of diff. If a PR is bigger than that,
it's doing too much.
