# Project memory

Running log of non-obvious changes, decisions, and gotchas. Append new entries
at the top so the most recent state is easy to find.

---

## 2026-05-13 — Bundled sample library, layout fixes, mobile adaptation

### Bundled sample library
- New export `SAMPLE_LIBRARY` in `src/config.js` — declarative catalog of the
  audio files in `assets/audio/`. Add new entries here when files land.
- Each panel header gets a native `<select class="library-select">` populated
  from this list in `src/main.js`. `index.html` ships only the placeholder
  `library ▾` option; the rest is added by JS so the list stays in one place.
- `loadPanel(side, source)` in `src/main.js` now accepts either a `File`
  (upload route) or a `{ name, url }` object (library route). The library
  route uses `fetch(url).then(r => r.arrayBuffer())`; everything downstream
  is shared.
- First-time visitors get sample 1 auto-loaded into panel A so they see the
  visualization immediately without picking a file.
- Loading wraps the fetch in a `try / catch` so a missing file shows
  `name — not found` in the filename slot instead of leaving the UI stuck
  on `loading`.

### Split-mode 50/50 layout fix
- Symptom: after adding the library `<select>`, the split-mode panels were
  no longer equal halves. Cause: CSS Grid's `1fr` is short for
  `minmax(auto, 1fr)`, which won't shrink a column below its content's
  min-content width. Native `<select>` elements report a min-content based
  on the widest *option* text, which bloated the column.
- Fix in `style.css`: use `minmax(0, 1fr) 1px minmax(0, 1fr)` (and
  `minmax(0, 1fr) 0 0` for single-mode), and add `min-width: 0` to `.panel`
  so the grid item is also allowed to shrink past its content.
- General rule for future flex/grid items containing canvases or selects:
  set `min-width: 0` (and `min-height: 0` when relevant) on the item, and
  use `minmax(0, 1fr)` on the track.

### Renderer resize robustness
- Symptom: switching from single → split mode sometimes left the panel
  canvases sized for the *previous* layout, so the camera aspect was wrong
  and the cloud rendered into the wrong portion of the panel.
- Fix in `src/renderer.js`:
  - The `ResizeObserver` callback now reads dimensions from
    `entries[0].contentRect` instead of re-reading `container.clientWidth`.
    `contentRect` is the size the browser laid out for that frame and
    avoids any ambiguity about whether `clientWidth` has caught up yet.
  - Added a public `resize()` method on `Renderer` that re-runs the same
    sizing logic on demand.
- Fix in `src/main.js`: `setSingleMode()` now calls
  `panels.left.renderer.resize()` and `panels.right.renderer.resize()` on
  the next animation frame after toggling the `single-mode` class.
  Belt-and-braces alongside the `ResizeObserver`.

### Mobile adaptation (≤ 700px)
- One panel at a time, swapped via a tab bar at the top of `#app`. Tab bar
  is in the HTML always; CSS hides it on desktop via `display: none` and
  shows it as `display: flex` inside the `@media (max-width: 700px)` block.
- A new `.show-b` class on `#app` controls which panel is visible on mobile;
  the existing `single-mode` class is left untouched (it only governs the
  desktop layout). Source-order means the mobile rules win when both classes
  are present.
- Hidden on mobile: `.divider`, `.compare-btn`, `#hint` (keyboard
  shortcut text), and the redundant `.panel-name` (tab bar already says
  A / B).
- Panel header switches to `flex-wrap: wrap` with `auto` height so its
  controls can wrap to a second line on very narrow screens — that required
  `.panel { grid-template-rows: auto minmax(0, 1fr) }` so the header row
  isn't locked at 34px.
- Play / pause button bumped to 44×36 px with `touch-action: manipulation`
  for fast iOS taps. The same `touch-action` is on the tab buttons.
- Tab handler in `src/main.js` toggles `.show-b` and calls
  `panels[side].renderer.resize()` on the next frame — necessary because
  the freshly visible panel went from `display: none` to `display: grid`
  and its `ResizeObserver` may not catch up before the first render.

### Mobile follow-up — two bugs caught on a real phone
The first mobile commit looked fine in DevTools device emulation but didn't
render correctly on an actual handset. Two causes:

- **Missing viewport meta tag.** Without
  `<meta name="viewport" content="width=device-width, initial-scale=1">`
  mobile browsers render the page at a virtual ~980 px wide layout and scale
  the result down, so `@media (max-width: 700px)` never matched on real
  devices — only DevTools emulation, which injects the meta implicitly.
  Always add this meta to any new HTML entry point.
- **`#transport` grid-row collision.** Desktop CSS pins `#transport` to
  `grid-row: 2`, which is also the panel row in the new 3-row mobile grid
  (`36px / 1fr / 44px`). Result: the transport bar painted on top of the
  panel. Fix: explicit `#transport { grid-row: 3 }` inside the mobile
  media query. Lesson: any element with an explicit `grid-row` set
  outside a media query needs to be re-checked inside any media query
  that changes `grid-template-rows`.

### Reminder for future changes
- The audio analysis pipeline (`src/audio.js`) does FFT in JS on the main
  thread. On phones, the auto-load of sample 1 will run that pipeline on
  pageload. If we ever switch to a longer default sample or auto-load
  multiple files, consider a Web Worker or a "tap to start" gate so we
  don't burn battery before the user has shown intent.
