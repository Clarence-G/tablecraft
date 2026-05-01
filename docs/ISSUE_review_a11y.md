# TableCraft — Accessibility & UX Edge-Case Audit

**Scope:** lobby, side panel, room, in-game chrome, leaderboard, auth pages, shared `@repo/game-ui` components.
**Method:** static grep (`search_files`), DOM inspection on running dev server at `http://localhost:5173` (guest session, zh locale), manual WCAG contrast math.
**Read-only review.** No source files modified.

## Severity Summary

| Severity | Count | Area                                                                 |
| -------- | ----- | -------------------------------------------------------------------- |
| P0       | 0     | —                                                                    |
| P1       | 5     | GameOverModal a11y, mobile tap targets, muted-foreground contrast, visible focus on all custom buttons, tab-panel semantics |
| P2       | 6     | Heading hierarchy skip (h1→h3), color-only status dots & ready state, backdrop-as-button, `<a href="/forgot-password">` hard-nav, filter-chip & LocaleSwitch under 44px on mobile, no aria-live on turn/chat notifications |
| P3       | 4     | Hero `<img alt="">` is correct but no `<picture>` fallback visible to SR; decorative "coming soon" uses `aria-hidden` on a still-focusable sibling grid; inconsistent tab icon sizes between side panels; tab "active" state uses only bg color in some pills |

### Top 3 findings (one-liner)

1. **P1** — `GameOverModal` is a hand-rolled fullscreen overlay with **no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler, no focus-return** (`packages/game-ui/src/feedback/GameOverModal.tsx`). Keyboard & SR users can tab into the disabled board behind it.
2. **P1** — Global `text-muted-foreground` token resolves to `rgb(107, 87, 68)` on white card = **6.84 (pass)**, BUT several places use hand-rolled `text-[#9c8b78]` on cream (`#faf6ed`) = **~3.05, fails WCAG AA normal text 4.5:1** (`Room.tsx:50,62,72`, `Leaderboard.tsx:49` via `LeaderboardRow`).
3. **P1** — 49 / 55 interactive buttons on the Lobby have **no `focus-visible:` Tailwind utility class**. They currently rely on the global `outline-ring/50` from `index.css` (browser default outline) — which works for now but is fragile (any descendant `outline-none` shadcn Button class could leak), and none have a designed visible focus style matching the skeuomorphic language.

---

## P1 — High

### P1-1. GameOverModal has no dialog semantics, focus trap, or Escape

- **File:** `packages/game-ui/src/feedback/GameOverModal.tsx:25-93`
- **Evidence:**
  ```tsx
  <div className="fixed inset-0 bg-[#1a1108]/50 flex items-center justify-center z-50"
       data-testid="game-over-modal">
    <div className="bg-card border-thick ...">
      <h2>...</h2>
      {/* action buttons */}
    </div>
  </div>
  ```
  No `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` pointing at the h2, no focus management, no keydown listener for Escape.
- **Impact:** Screen readers don't announce a modal context. Keyboard users can Tab *past* the modal into the underlying (but still live) board DOM. No way to dismiss via Escape — only mouse clicks on the three action buttons. Focus is not returned to the game board when dismissed.
- **Suggested fix:** Swap the implementation for `@/components/ui/dialog` (already used by GameRoomLayout for the Rules modal, which correctly traps focus via `@base-ui/react/dialog`). Minimum-viable patch if that's too invasive:
  - Wrap root div with `role="dialog" aria-modal="true" aria-labelledby="gameover-title"`
  - Add `id="gameover-title"` to the h2
  - `useEffect` to `firstButtonRef.current?.focus()` on mount and restore previous `document.activeElement` on unmount
  - Listen for `Escape` to fire `onReturnToLobby` (or the first available handler)

### P1-2. Muted-foreground via `text-[#9c8b78]` hardcodes fail AA contrast

- **File:** `packages/client/src/pages/Room.tsx:50, 62, 72`
- **Evidence:**
  ```tsx
  <h2 className="text-sm text-[#9c8b78] uppercase tracking-wider ...">Player list</h2>
  <span ... bg-[#c4b8a8] border-[#9c8b78] />  // disconnected dot
  <span className={`text-sm ... ${player.ready ? 'text-success' : 'text-[#9c8b78]'}`}>Not ready</span>
  ```
  Computed `#9c8b78` on cream body (`#faf6ed`) = **3.05:1**. WCAG AA normal body text requires **4.5:1**.
- **Impact:** Section labels, "Not ready" status, and disconnected-player text are hard to read for low-vision users. Violates project rule in CLAUDE.md §5 ("Use Design Tokens. Never hardcode colors.")
- **Suggested fix:** Replace with the `text-muted-foreground` token (resolves to `#6b5744`, contrast 6.8:1). Four sites in `Room.tsx` to swap. Also audit other pages — `Lobby.tsx:397` uses `text-[#6b5744]` which passes but still violates the token rule.

### P1-3. No visible focus style on custom buttons (implicit default ring only)

- **File:** broad — `packages/client/src/components/layout/LobbySidePanel.tsx:82, 107, 133, 215, 288, 300, 307, 359, 368, 465, 517, 533, 559, 567, 592, 628, 636, 711, 795, 870, 919, 932`; `packages/client/src/pages/Lobby.tsx:284, 313, 342, 379, 478`; `packages/client/src/pages/Leaderboard.tsx:76, 160`; `packages/game-ui/src/side-panel/SidePanel.tsx:198, 218, 280, 351, 393, 411`; `packages/game-ui/src/header/GameHeader.tsx:140, 158, 213, 223, 233`; `packages/game-ui/src/section/SectionHead.tsx:35`; `packages/client/src/components/LocaleSwitch.tsx:10`
- **Evidence:** Runtime enumeration at `http://localhost:5173`: **49 of 55 lobby buttons have no `focus-visible:` / `focus:ring` class**. Only shadcn `Button` primitive (`packages/client/src/components/ui/button.tsx:7`) sets `focus-visible:border-ring focus-visible:ring-3`.
  Example — LocaleSwitch:
  ```tsx
  <button ... className="inline-flex ... border-2 border-border bg-card rounded-full px-2.5 py-1 hover:border-foreground hover:-translate-y-0.5 transition-all">
  ```
- **Impact:** These currently work only because the global `@layer base { * { @apply outline-ring/50 } }` in `index.css:116` lets the browser's default `outline: auto` show through. This is brittle: any future `outline-none` (e.g. from a copy-pasted shadcn class) silently removes all keyboard visibility. Keyboard-only users also get no designed focus affordance matching the skeuomorphic thick-border aesthetic.
- **Suggested fix:** Add a project-wide `focus-visible:ring-2 focus-visible:ring-warning/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background` class (or a shared token) to each custom button. Alternatively create a `warmButton` util in `cn()` that TabButton / PeriodPill / FilterChip / RailIcon / GameHeader icon buttons all consume. Verify the LocaleSwitch, collapse/expand chevron buttons, and `FilterChip` (Lobby:478) get the treatment since they're the highest-traffic controls.

### P1-4. Mobile tap targets below 44×44 CSS px

- **File:** multiple — `packages/client/src/components/LocaleSwitch.tsx:13` (60×28), `packages/client/src/pages/Lobby.tsx:478` (FilterChip 70–94 × 28), `packages/client/src/pages/Lobby.tsx:284,313` (createForGame 56×36), `packages/client/src/components/layout/LobbySidePanel.tsx:110` (RailIcon size-8 = 32×32), `packages/client/src/pages/Leaderboard.tsx:76` (back button 32×26), `packages/game-ui/src/side-panel/SidePanel.tsx:233` (RailIcon 32×32), `packages/game-ui/src/side-panel/SidePanel.tsx:280` (collapse button size-7 = 28×28), `packages/client/src/components/layout/LobbySidePanel.tsx:795` (collapse size-7)
- **Evidence:** Runtime measurement at 1280px viewport: 32 of 56 buttons < 44px in at least one dimension. At 375px mobile (CLAUDE.md §5 explicitly requires 375 support), filter chips are exactly 28px tall — below WCAG 2.5.5 AAA and Apple HIG 44pt / Material 48dp recommendations.
- **Impact:** Thumb misses on the lobby filter strip, locale switch in the sticky nav, and the very-small panel collapse/expand chevrons (28×28). Users with tremor or larger fingers accidentally hit neighboring controls.
- **Suggested fix:**
  - Filter/Period chips: raise to `h-9` min (36px) and ensure outer `padding` + touch area ≥ 44px via invisible `::before` spacer, or use `min-h-[44px]` with tighter padding for visual compactness.
  - Collapse/expand panel buttons: `size-7` → `size-10` on mobile, `md:size-7` keep desktop look.
  - LocaleSwitch: `py-1` → `py-2` and add `min-h-[36px]`; wrap with a 44px hit region.
  - Leaderboard back button: same treatment as other icon-only nav back buttons; also currently has only aria-label (no visible text) and only the `<ArrowLeft size-3.5>` — bump icon to `size-4.5` and padding.

### P1-5. Tab buttons lack `role="tab"` / tablist semantics

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:770-803` (TabButton set), `packages/client/src/pages/Leaderboard.tsx:90-105`, `packages/game-ui/src/side-panel/SidePanel.tsx:266-289`
- **Evidence:** The four side-panel tabs (Leaderboard / Friends / Profile / Recent) are plain `<button>` elements with `active` styling; no `role="tablist"` on the container, no `role="tab"` / `aria-selected` / `aria-controls` on children, no `role="tabpanel"` on the rendered content. Same for Leaderboard overall/per-game tabs and the game-ui SidePanel log/chat tabs.
- **Impact:** Screen readers announce "button" and not "Leaderboard tab, selected, 1 of 4". No keyboard arrow-key navigation between tabs (users must Tab through each), which is the standard WAI-ARIA tab pattern.
- **Suggested fix:** Either add the full ARIA tab pattern (`role="tablist"`, each TabButton gets `role="tab" aria-selected={active} aria-controls={id}` + keydown handler for ArrowLeft/ArrowRight/Home/End) or use Radix/Base-UI `<Tabs>` primitive (already shipped via `@base-ui/react`). The latter is one import and handles all pattern details.

---

## P2 — Medium

### P2-1. Heading hierarchy skips h2 on multiple pages

- **File:** `packages/client/src/pages/Lobby.tsx:203` (`<span>` for app title in nav — OK), `packages/client/src/pages/lobby/sections.tsx:60,100` (Hero `<h1>`) → next heading is `<h3>` inside `SectionHead` (`packages/game-ui/src/section/SectionHead.tsx:30`).
- **Evidence:** Runtime: `h1s=['你好，博学松鼠 #HHL']`, `h2s=[]`, `h3s=['进行中的房间', '所有游戏']`. Same pattern exists on `Me.tsx` (h1 user name, h2 "pointsByGame" — that page is fine), and on Room.tsx (h1 "waitingRoom", h2 "playerList" — fine). Lobby is the broken one.
- **Impact:** Screen-reader users navigating by heading (H key in NVDA/JAWS) experience a level gap and may think they missed intermediate structure.
- **Suggested fix:** Change `SectionHead`'s `<h3>` → `<h2>` in `packages/game-ui/src/section/SectionHead.tsx:30`. All current callers render SectionHead as the top child below a page h1, so promoting to h2 is semantically correct across all pages (Lobby, Leaderboard has h1 already so its tab row would still be OK). No visual change required — the Tailwind class is font-size-independent.

### P2-2. Online/ready status conveyed only by color

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:620-623` (friends online dot), `packages/client/src/pages/Room.tsx:61-63` (connected dot), `packages/client/src/pages/Room.tsx:72-74` (ready/not-ready text)
- **Evidence:**
  ```tsx
  <span className={`w-2 h-2 rounded-full ${f.status === 'online' ? 'bg-success' : 'bg-muted-foreground/40'}`}
        title={f.status === 'online' ? t('online') : t('offline')} />
  ```
  The `title` helps, but title tooltips aren't exposed consistently by screen readers and not at all on touch. Red/green is the classic color-blindness trap.
- **Impact:** Deuteranopic / protanopic users can't distinguish online from offline friends; "ready" vs "not ready" in the waiting room is green-vs-beige text without an icon.
- **Suggested fix:**
  - Friends: add a small `<Circle fill>` vs `<CircleDashed>` icon, or an `aria-label` plus a visible "online" / "offline" text next to the dot on hover / always on mobile.
  - Room: add a check icon to the "ready" text and an hourglass or empty-circle to "not ready"; keep the color as secondary signal.

### P2-3. Mobile drawer backdrop is a fullscreen `<button>`

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:932-937`, `packages/game-ui/src/side-panel/SidePanel.tsx:411-416`
- **Evidence:**
  ```tsx
  <button type="button" aria-label={t('lobbyPanel.collapse')} onClick={() => setExpanded(false)}
    className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
  ```
- **Impact:** Tab order jumps from the last focusable element on the page *to a giant invisible button covering the whole viewport* before landing on the actual drawer content. With VoiceOver, swiping right lands on "Collapse, button" immediately, which is confusing. Also, there is no true focus trap inside the drawer — Tab can escape the drawer and land back on the page behind it.
- **Suggested fix:** Use a `<div onClick={...} role="presentation" aria-hidden="true">` for the backdrop (pointer event still works but it's not in the tab order), and implement a focus trap on the drawer itself (or lift this to `@base-ui/react/dialog`). Add Escape key handler to close.

### P2-4. `/forgot-password` uses a raw anchor instead of router link

- **File:** `packages/client/src/pages/Login.tsx:135`
- **Evidence:** `<a href="/forgot-password" className="text-xs ...">Forgot password?</a>`
- **Impact:** Full page reload, loses `useIdentity` state, locale resets if persisted only in memory, user sees a white flash. Minor but inconsistent with the rest of the auth flow (Register uses router navigate).
- **Suggested fix:** `<button type="button" onClick={() => navigate('/forgot-password')}>` or `<Link to="/forgot-password">` from react-router-dom. Keep same classes.

### P2-5. No `aria-live` on turn-change / reject notifications / chat unread

- **File:** `packages/game-ui/src/header/GameHeader.tsx:171-187` (turn indicator), `packages/game-ui/src/side-panel/SidePanel.tsx:111-148` (chat message list)
- **Evidence:** Turn indicator is a plain `<span>`; chat messages render inside an `overflow-y-auto` div with no `aria-live` region. Only the SpectatorView banner uses `role="status" aria-live="polite"` (good).
- **Impact:** A blind player doesn't know when it becomes their turn without polling the header. New chat messages while the tab is in log view aren't announced.
- **Suggested fix:** Wrap the turn pill in `<div role="status" aria-live="polite" aria-atomic="true">`. For chat, attach `aria-live="polite"` to the message list container, and add an off-screen announcer (`<span className="sr-only" aria-live="polite">{lastMessagePreview}</span>`) so messages are announced even when the panel is collapsed.

### P2-6. Filter-chip / period-pill "active" state differentiated mainly by background color

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:137-144` (PeriodPill), `packages/client/src/pages/Lobby.tsx:482-490` (FilterChip)
- **Evidence:**
  ```tsx
  active ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-[2px_2px_0px_0px_#d97706]'
         : 'bg-card border-border text-muted-foreground hover:border-foreground'
  ```
  Good: the hard offset shadow + warning border *do* provide a non-color cue. But it's subtle — on grayscale the warm amber/cream are similar luminance.
- **Impact:** Not a blocker because the border thickness changes too, but consider adding `aria-pressed={active}` (already present on FilterChip — nice catch). PeriodPill has `aria-pressed`. LobbySidePanel TabButton does **not** — add it or switch to the ARIA tab pattern per P1-5.

---

## P3 — Nits

### P3-1. Hero illustration is correctly marked decorative

- **File:** `packages/client/src/pages/lobby/sections.tsx:28-33`
- **Evidence:** `alt=""` + `aria-hidden="true"` on the webp. Good — this is the correct pattern. No fix needed, just recording it passed.

### P3-2. "Coming soon" tile uses `aria-hidden` on a card that sits inside a focusable grid

- **File:** `packages/client/src/pages/Lobby.tsx:425-431`
- **Evidence:**
  ```tsx
  <div aria-hidden="true" className="border-2 border-dashed ...">
    <Plus /><span>Coming soon</span>
  </div>
  ```
- **Impact:** Correctly hidden from SR. No issue — recording as "this is right".

### P3-3. RailIcon (32×32) and side-panel collapse (28×28) are visually inconsistent with game-ui SidePanel equivalents

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:112` (`size-8`) vs `packages/game-ui/src/side-panel/SidePanel.tsx:235` (`size-8`, same), but `:285` (`size-7`) differs from LobbySidePanel's `:800` (`size-7`, same). They match each other but not the 36-40px toolbar spec in `docs/DESIGN.md`.
- **Impact:** Pure design-system drift; easily confused by Storybook viewers. Low priority.
- **Suggested fix:** Define a single `iconButton` / `railIconButton` token in design tokens; reuse across both side panels.

### P3-4. LobbySidePanel rail button has no `aria-current` / pressed on active tab

- **File:** `packages/client/src/components/layout/LobbySidePanel.tsx:107-117`
- **Evidence:** RailIcon is only rendered when the panel is collapsed so there's no "active" tab to communicate. Fine.
- **Suggested fix:** None — recording for completeness.

---

## Things that are GOOD (do not change)

- Semantic landmarks: `<nav>`, `<main>`, `<aside>` on Lobby. ✓
- All icon-only buttons we inspected on the live lobby have `aria-label` — **0 unlabeled icon buttons** out of 56. ✓
- `<form>` elements on Login / Register / ForgotPassword use `<label htmlFor>` + `id` correctly (`Login.tsx:118-127`). ✓
- `autoComplete="email"` / `current-password` / `new-password` set on auth inputs. ✓
- Error state uses `<p role="alert">` on Login / Register / ResetPassword. ✓
- SpectatorView banner uses `role="status" aria-live="polite"`. ✓
- Empty states present for: 0 rooms (`Lobby.tsx:276-295`), 0 leaderboard entries, 0 friends (`LobbySidePanel.tsx:648-655`), 0 recent games, 0 chat messages, 0 log entries. Copy is friendly in zh and en. ✓
- Shadcn Button + shadcn Dialog (used by Rules modal) both have proper `focus-visible` rings and focus management. ✓
- Hero `<img>` has `alt=""` + `aria-hidden` — correct decorative pattern. ✓
- Buttons use `type="button"` explicitly almost everywhere (prevents accidental form submits). ✓

---

## Suggested triage

1. Land P1-3 (focus rings) + P1-4 (tap targets) + P2-1 (h3→h2) together — single shared-class refactor, high keyboard & SR impact.
2. P1-1 (GameOverModal) — swap to shadcn Dialog; ~30-line change.
3. P1-2 (contrast) — 4-site token swap in Room.tsx.
4. P1-5 (tab semantics) — either migrate to `@base-ui/react` Tabs or add ARIA pattern manually. Two side panels + Leaderboard page affected.
5. P2-2 through P2-6 — incremental; color-only icons are the cheapest.
