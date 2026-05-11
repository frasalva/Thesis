# CLAUDE.md — Neck Symbiont: Network Visualization

## Project Overview

**"Neck Symbiont"** is a generative, autonomous visualization representing a bird moving through a sensor-embedded environment. The bird (a red triangle) flies across a dark canvas dotted with sensor nodes. As it approaches nodes, lines form between the bird and nearby sensors, creating a dynamic network graph in real time.

This is a **passive, looping visualization** — no user input, no controls. It runs automatically and is meant to be displayed full-screen (e.g., as a projection or screen installation).

Reference assets are in `reference/`:
- `UI-ref.png` — static UI mockup showing layout and visual language
- `network_viz.mp4` — reference video showing the intended motion behavior

***

Output should be a single HTML file or html, js and css at the root: `index.html` (or `network-viz.html`).

***

## Visual Language

Extracted from the reference screenshot:

| Element | Description |
|---|---|
| Background | Pure black (`#000000`) |
| Dot grid | Small white dots (`2–3px`) arranged in a regular grid across the canvas |
| Bird (agent) | Red filled triangle (`▶`), pointing in the direction of movement |
| Connection lines | Thin white lines from the bird to nearby dots, when within proximity radius |
| Connected dots | Slightly enlarged, higher-opacity white circles when connected |
| UI overlay | Top-left: "Neck Symbiont"; Top-center: "Perceive your impact"; Top-right: "Lorem…" in small sans-serif type |
| Info panel | Top-left: bordered box with "ECOSYSTEM" label and lorem text description |

Typography: small, clean, light-weight sans-serif. All caps for labels. Sparse — the visualization dominates.

***

## Technical Specification

### Stack

- Vanilla HTML + CSS + JavaScript (no framework)
- Canvas 2D API for rendering
- No external dependencies required

### Canvas Rendering

Use a single `<canvas>` element covering the full viewport (`100vw × 100vh`). Redraw every frame using `requestAnimationFrame`.

**Render order per frame:**
1. Clear canvas (fill black)
2. Draw dot grid
3. Draw connection lines (bird → nearby dots)
4. Draw bird (red triangle)
5. Draw UI overlay (text labels, info panel)

### Dot Grid

- Regular grid with ~60–80px spacing (tune visually)
- Each dot: 2px radius, `rgba(255, 255, 255, 0.4)` default opacity
- On connect: scale up to 4–5px radius, opacity 1.0
- Grid should tile the full canvas; recalculate on resize

### Bird (Agent)

- Red filled triangle pointing in the direction of current velocity
- Size: ~14–16px base, equilateral or near-equilateral
- Color: `#FF2222` or `#E8001C`
- Movement: autonomous, smooth, continuous
- Behavior:
  - Drifts across the canvas in a naturalistic flight pattern
  - Uses **Perlin/simplex noise** or **steering behaviors** (seek + wander) to vary direction gradually
  - Wraps around canvas edges (or gently steers away from edges)
  - Speed: moderate (~1.5–2.5 px/frame). Should feel like a bird gliding, not a bouncing ball

**Recommended approach — Boid-style wander:**
```js
// Each frame, add small angular noise to the current heading
heading += (Math.random() - 0.5) * maxTurnRate;
vx = Math.cos(heading) * speed;
vy = Math.sin(heading) * speed;
```
Or use a simple noise-based steering field for more organic movement.

### Connection Logic

- On each frame, iterate over all grid dots
- If `distance(bird, dot) < CONNECTION_RADIUS` (suggest 120–160px, tune to match reference):
  - Draw a line from bird center to dot center
  - Line: 1px, `rgba(255, 255, 255, 0.6)`
  - Dot: enlarged + full opacity
- Number of connections visible at once should feel like a "star burst" — typically 5–12 lines

### Animation Parameters (tune to match reference video) double check and change if needed

```js
const CONFIG = {
  dotSpacing: 70,           // px between grid dots
  dotRadius: 2,             // base dot radius
  dotRadiusActive: 4.5,     // dot radius when connected
  connectionRadius: 140,    // bird–dot connection threshold (px)
  birdSize: 14,             // triangle half-length
  birdSpeed: 2.0,           // px per frame
  maxTurnRate: 0.04,        // radians per frame (wander jitter)
  edgeMargin: 80,           // px from edge before steering back
  lineOpacity: 0.55,
  dotOpacity: 0.35,
  dotOpacityActive: 1.0,
};
```

***

## UI Overlay

Rendered on top of the canvas using absolute-positioned HTML (not drawn in canvas) for crispness:

- **Top-left**: `NECK SYMBIONT` — small, uppercase, tracking ~0.1em
- **Top-center**: `PERCEIVE YOUR IMPACT` — same treatment
- **Top-right**: `LOREM ...` — placeholder for project subtitle/version

**Info panel** (top-left, below header label):
- Thin 1px white border, ~240×160px
- Left cell: `ECOSYSTEM` label in medium caps
- Right cell: body text (lorem placeholder or real description)
- Translucent black background: `rgba(0,0,0,0.5)` or no background (transparent)

Font: `'IBM Plex Mono'`, `'Courier New'`, or `monospace` for a technical readout feel.  
Alternatively `'Inter'` or `'DM Sans'` at light weight for a cleaner look — match reference screenshot.

***

## Responsive Behavior

- Canvas always fills viewport (`width: 100vw; height: 100vh`)
- On `window resize`: recalculate dot grid positions, reset bird if out of bounds
- No mobile-specific interactions needed (passive display only)

***

## File Output

```
index.html          ← single self-contained file (HTML + CSS + JS inline)
```

All styles and scripts should be inline (no external files except optional Google Fonts CDN link).

***

## Implementation Order

1. **Canvas setup** — full-screen canvas, black background, resize handler
2. **Dot grid** — generate and render static dot array
3. **Bird movement** — triangle with wander steering, wrapping/edge avoidance
4. **Connection rendering** — proximity check, lines + active dot states
5. **UI overlay** — text labels and info panel
6. **Polish** — tune CONFIG values to match reference video pacing and density

***

## Reference Behavior (from `network_viz.mp4`)

- The bird moves in smooth, continuous arcs — no sharp turns
- Connections appear and disappear fluidly as the bird passes through the dot field
- At any given moment, ~6–10 lines radiate from the bird
- The overall rhythm is calm and meditative, not frantic
- The dot grid is sparse enough that the connections feel intentional
- Add play/pause controls (spacebar trigger)

***

## Do NOT

- Add any mouse/keyboard interaction
- Use a physics engine (unnecessary complexity)
- Use Three.js or WebGL (Canvas 2D is sufficient and simpler)
- Add sound
- Use random movement that feels jittery — use smoothed noise or heading interpolation
