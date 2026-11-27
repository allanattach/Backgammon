# Handover: Backgammon webapp project

This file exists so a fresh Claude Code session (possibly on a different
account) can pick up this project with full context. Paste/upload this file
into the new session and ask Claude to read it.

## What this project is

A standalone, Danish-language backgammon webapp. Plain HTML/CSS/JS, **no
build step, no npm dependencies**. Supports 2-player hotseat and
vs-computer play, full official backgammon rules (including the doubling
cube), and in-app Danish help text explaining illegal moves.

- Repo: `allanattach/Backgammon`
- Working branch: `claude/backgammon-webapp-ai-9ddklt`
- Default branch: `main`
- Live site (auto-deploys on every merge to `main`): https://allanattach.github.io/Backgammon/
- As of now, the working branch is **fully merged into `main`** — no open PRs, no pending work.

## Architecture

- `js/rules-engine.js` — pure game-logic engine (UMD module: works via
  `require()` in Node tests and as a browser global `window.BgRules`). No DOM
  code. Covers movement, forced dice-usage rule, bar entry, bearing off,
  win/gammon/backgammon detection, pip count. Has 18 passing tests in
  `test/rules-engine.test.js` (run with `node --test test/rules-engine.test.js`,
  which is also `npm test`).
- `js/ai.js` — heuristic computer opponent (UMD, `window.BgAI`). Enumerates
  legal move sequences, scores them with a static evaluation function. Also
  has simple pip-count-lead heuristics for doubling-cube decisions
  (`pipLead`, `shouldOfferDouble`, `shouldAcceptDouble`) — deliberately
  simple, not full equity/rollout cube theory.
- `js/ui.js` — board rendering.
- `js/rules-text.js` — Danish rules help text injected into the rules modal.
- `js/app.js` — the main game controller / everything else (DOM wiring,
  animations, settings, save/resume, doubling cube flow, theme). This is the
  file that grows with almost every feature.
- `index.html`, `css/style.css` — markup and styles. No CSS framework.
- `.github/workflows/ci.yml` — runs `npm test` on push/PR to main.
- `.github/workflows/deploy.yml` — deploys the static site to GitHub Pages on
  push to `main` (source: GitHub Actions, set manually in repo settings by
  the user — repo must stay public for free-tier Pages).
- `.claude/settings.json` — a permission allowlist (read-only git/gh/curl
  patterns) built via the `fewer-permission-prompts` skill.

## Everything implemented so far (chronological, PR by PR)

1. **PR #2** — Initial webapp: rules engine, AI, UI, Danish rule-violation
   help, manual browser testing.
2. **PR #3** — GitHub Pages deploy workflow (required making the repo public
   — the user did this manually).
3. (fix) `npm test` was broken (`node --test test/` tries to `require()` the
   directory) — fixed to `node --test test/rules-engine.test.js`.
4. **PR #4** — Dice-cup shake/tumble animation (raslebæger) on roll.
5. **PR #5** — Made the cup persistent (it **is** the roll button, not a
   transient overlay); dice visually roll out of the cup (FLIP animation);
   made the tempo slider available in 2-player mode too (not just vs-computer).
6. **PR #6, #7, #8, #9** — A long chain of fixes to make the **black** dice
   cup visible against the dark panel background. Went through: gradient +
   drop-shadow glow (insufficient) → an outline via stacked drop-shadows
   (CSS bug: looked diagonal/garbled, turned out to be a mid-transition
   screenshot timing artifact, not a real bug, but the *first* outline
   attempt had a genuine bug: a `z-index:-1` trick doesn't actually paint
   behind the element's own background — fixed by making the button's own
   box the solid outline color and drawing the fill in a smaller inset
   `::after`) → discovered the real remaining culprit was `<button>` lacking
   `appearance: none` (mobile Chromium renders native chrome through custom
   backgrounds) and gradients/`filter` being unreliable under heavy
   compositing — replaced with **flat solid colors, zero gradients/filter**
   for both cup variants. This flat/appearance:none design is the one still
   live today.
7. **PR #10** — Game-state persistence: full game state (board, dice, turn,
   mode, difficulty, cube state, opening-roll-pending flag) saved to
   `localStorage` after every change, auto-resumed on load (including
   resuming mid-AI-turn or mid-dice-roll correctly). Explicitly **not** an
   HTTP cookie — this is a static site with no server, so `localStorage` is
   the correct tool (no size limit concern, no pointless server round-trip).
8. **PR #11** — Doubling cube, as a start-screen toggle (off by default,
   works in both modes). Pass-and-play offer/accept/decline modal in
   2-player mode; instant AI decision (and the AI can offer its own doubles)
   in vs-computer mode, via the pip-lead heuristics in `js/ai.js`. Win dialog
   now always shows the running score standing clearly ("Stilling: Hvid X –
   Sort Y"), not just the points just won. Bug fix found along the way:
   `.side-panel` had no `overflow-y`, so the extra cube panel could overflow
   the whole page on a short landscape viewport instead of scrolling
   internally.
9. **PR #12** — Two things for 2-player hotseat play on a shared, flat
   tablet (players facing opposite sides): (a) dice now render as **pip
   glyphs** (⚀⚁⚂⚃⚄⚅, via a `DIE_FACES` lookup) instead of digits, since pip
   layouts are rotationally symmetric and a "6" reads as a "9" upside down;
   (b) the cup+dice row and the doubling-cube row **rotate 180°** on Black's
   turn in 2-player mode only (never vs-computer), so whichever player faces
   the far side of the table gets right-side-up controls. Both remain fully
   clickable while rotated.
10. **PR #13** — The opening roll now **waits for the cup to be pressed**
    instead of firing automatically in code the instant "Start spil" is
    clicked (every other roll already required pressing the cup; the
    opening one didn't). Added an `awaitingOpeningRoll` flag that gates
    board interaction, undo/end-turn, and the cube-offer button shut until
    the cup is pressed; included in the save/resume payload.
11. **PR #14** — Added a light/dark/device theme choice. First attempt was a
    `<select>` dropdown with a `@media (prefers-color-scheme)` CSS fallback
    layer — **this had a real bug the user reported ("der sker intet når jeg
    vælger lyst tema" — nothing happens when I pick light theme)**.
12. **PR #15** — Fixed PR #14's bug and redesigned the control at the user's
    request to match their other project, **Yatzy** (`allanattach/Yatzy`,
    added read-only to this session as a reference — see
    `js/theme.js`/`style.css` there). Replaced the dropdown with a **single
    icon button that cycles** "følger enheden" (◐) → "lyst" (☀) → "mørkt"
    (☾) on click. Simplified the resolution model to match Yatzy's
    `theme.js`: the stored `localStorage` value (`bg_theme`) is the
    *preference* (which may be `"system"`), while `data-theme` on `<html>`
    is **always** resolved to a concrete `light`/`dark` value — both by a
    pre-paint inline script in `index.html`'s `<head>` (avoids a flash of
    the wrong theme) and by `app.js` after each click. Because the attribute
    is never left unset, `style.css` no longer needs the
    `prefers-color-scheme` media-query fallback — it only keys off
    `:root[data-theme="light"]`. Board/felt/checker/dice colors are
    deliberately **not** part of the theme (a physical board looks the same
    regardless of chrome). This is the current, live, working state.

## Key technical facts worth knowing

- **Dice**: shown as Unicode pip glyphs via `DIE_FACES = {1:'⚀',2:'⚁',...}` in
  `app.js`, not digits.
- **Doubling cube**: lives in `app.js` as its own app-level state
  (`cubeEnabled`, `cubeValue`, `cubeOwner`), deliberately **not** inside the
  rules-engine `state` object — it's stakes/scoring, not a movement rule.
  Resets every new game like the board does.
- **Opening roll**: `awaitingOpeningRoll` flag in `app.js`; the cup button's
  click handler checks it first and calls `doOpeningRoll()` instead of the
  normal per-turn roll flow when true.
- **2-player flip**: `.dice-roll-row` and `.cube-row` get a `.flipped` class
  (CSS `transform: rotate(180deg)`, with a `transition`) applied in
  `renderAll()` based on `mode === 'pvp' && state.turn === 'black'`.
- **Theme**: `THEME_MODES = ['system','light','dark']` cycle in `app.js`;
  `resolveTheme()` turns `"system"` into a concrete value via
  `matchMedia('(prefers-color-scheme: light)')`; `data-theme` attribute on
  `<html>` drives CSS variables in `style.css`'s `:root` (dark, default) and
  `:root[data-theme="light"]` (light override block). `<meta
  name="theme-color">` is kept in sync too, including live OS-theme changes
  while in "system" mode.
- **Save/resume**: `localStorage` key `bg_saved_game`, versioned
  (`SAVE_VERSION`, bump when the shape changes — currently 2). Saved on every
  `renderAll()` call unless `state.winner` is set (then cleared instead).
  Also cleared explicitly on "Nyt spil" and on a cube-decline win (since that
  path doesn't set `state.winner`).
- **CSS clip-path gotcha** (relevant if the dice-cup shape is touched again):
  a `clip-path`'d element's `border`/non-inset `box-shadow` do **not** follow
  the clipped silhouette — they follow the box. `filter: drop-shadow()` does
  follow the true shape, but proved unreliable (flat-grey rendering bug)
  under heavy compositing on this specific test sandbox — the final design
  avoids both gradients and `filter` entirely on the cup, using only flat
  solid colors and a smaller inset `::after` for the two-tone outline+fill
  look. A `z-index:-1` child does **not** paint behind its own parent's
  background within a single stacking context — that was a real bug caught
  and fixed in PR #8.

## Workflow conventions established in this conversation

The user wants, for every change:
1. Implement it, test thoroughly with Playwright (local dev server:
   `python3 -m http.server 8099` from the repo root; Chromium binary is at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
2. Run the full existing regression suite of scratchpad Playwright scripts
   before pushing (see below — these live in the scratchpad dir and are
   **not** part of the repo).
3. Commit, push to `claude/backgammon-webapp-ai-9ddklt`, open a PR with a
   clear summary + test plan.
4. Subscribe to PR webhook activity (`subscribe_pr_activity`), watch for CI
   and review comments, schedule a `send_later` check-in roughly an hour out
   while the PR is open, **re-arm silently if nothing changed**.
5. The user drives the actual merge — wait for them to say "merge" (or for
   a merge webhook to arrive). On merge: unsubscribe and cancel the pending
   check-in trigger.
6. Never reopen a PR or create a new one for an already-merged/closed PR
   unless explicitly asked.

**Known environment instability**: this container has repeatedly reset the
local git working directory back to an old commit (`e914fed...`, an early
point in history) between turns, and has repeatedly wiped/reverted files in
the scratchpad directory mid-session. **Always, at the start of any new
work**: `git fetch origin`, then `git merge --ff-only
origin/claude/backgammon-webapp-ai-9ddklt` (check `git status --short` is
clean first) before assuming the working tree matches what was last pushed.
Scratchpad Playwright test scripts referenced below may need to be
recreated from scratch if they've vanished — their content is described well
enough in this file and in good commit/PR messages to reconstruct quickly.

### The regression-test pattern (Playwright scripts, scratchpad-only)

Key gotchas baked into every script, because of features added along the
way:
- **Since PR #13**: a fresh game needs `await page.click('#btn-roll')`
  immediately after `#btn-start` (to trigger the opening roll) before
  anything else works — `await
  page.waitForFunction(() => document.getElementById('turn-text').textContent.trim() !== 'Åbningsslag', { timeout: 8000 })`
  to wait for it to resolve.
- **Since PR #12**: `.die` elements contain pip glyphs, not digits — decode
  with a small lookup (`{'⚀':'1','⚁':'2',...}`) before comparing against
  numeric values parsed out of log text.
- Playwright dice-roll animations take real wall-clock time (controlled by
  the speed preset) — use `waitForFunction` polling
  `!btn.classList.contains('shaking') && !btn.classList.contains('pouring')`
  rather than a fixed `waitForTimeout`, which can catch a CSS transition or
  JS animation mid-flight and produce misleading "bug" screenshots (this
  happened more than once this session and was *not* a real bug — always
  double check a weird screenshot isn't just a timing artifact before
  concluding there's a CSS bug).
- Chromium launch: `chromium.launch({ executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })`.

Regression scripts worth re-running after any future change (recreate if
missing): rules-engine unit tests (`node --test test/rules-engine.test.js`),
dice value-tracking (used/unused faces by value not position), roll/end-turn
button mutual exclusivity, auto-end-turn + undo interactivity, tablet layout
overflow across ~6 device sizes in both modes (and with the cube panel /
light theme active), reduced-motion instant-completion, checker-move FLIP
animation settling with no leftover inline transform, speed-preset timing
separation, 2-player flip state tracking, doubling-cube offer/accept/decline
flow (including while visually flipped), save/resume (including mid-AI-turn,
mid-dice-roll, and pre-opening-roll states), and theme cycling/persistence.

## Known non-bugs / dead ends not worth re-investigating

- A dice-cup screenshot that looks diagonal/tilted or garbled is almost
  certainly a CSS-transition mid-flight timing artifact in the test script,
  not a real rendering bug — verified this multiple times this session by
  re-checking the computed `transform` matrix at the exact capture moment.
- "Speed=fast: AI turn round-trip took 2XXms" type numbers in `speed_check.js`
  can look suspiciously fast/slow due to test-script timing assumptions (e.g.
  an `80ms` wait after clicking roll that's fine at normal/fast speed but too
  short once "slow" is live) — this is a pre-existing test fragility, not an
  app bug.

## Things NOT yet done / not requested

Nothing is currently pending. The last user-facing request (replace the
theme dropdown with an icon matching Yatzy) is merged and live. If resuming
this conversation, there is no unfinished task — wait for the user's next
request.

## Attribution / org policy notes for whoever continues this

- Org policy: **never** create/change/enable/disable/remove firewall rules,
  directly or indirectly (including writing them into a script/pipeline for
  someone else to run). If something is unreachable because of a firewall,
  say which port/protocol is needed and stop.
- Commit messages should end with a `Co-Authored-By:` / `Claude-Session:`
  attribution footer, and PR descriptions with a "Generated with Claude Code"
  footer — the **exact wording is dictated per-session by a system reminder
  at conversation start**, so don't copy the exact lines used in this
  project's past commits verbatim into a new account's session; use
  whatever that new session's own attribution reminder specifies.
- The user's email is private context (used only for identifying them, e.g.
  attribution) — never paste it into an external request without asking
  first.

## How to resume

In the new session: read this file, then `git fetch origin && git merge
--ff-only origin/claude/backgammon-webapp-ai-9ddklt` (or check out that
branch fresh) to get synced, confirm `npm test` passes, and wait for the
user's next instruction. There is no in-flight PR or half-finished feature.
