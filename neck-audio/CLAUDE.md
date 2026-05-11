# CLAUDE.md — Neck Symbiont · Audio Impact Visualizer

## Project Overview

**Neck Symbiont** is an interactive sound-impact visualization tool. It answers a single question: *How far does the sound you produce in an environment actually travel — and in which direction?*

The metaphor is ecological: you are an animal. Sound radiates from your body and reaches other living beings. The visualization makes this spatial, directional, and real-time legible.

***

## Concept

A wearable or desktop experience that listens to ambient sound (microphone input, or a pre-loaded audio demo) and renders two synchronized visualizations:

1. **Radial View** — A radar-like top-down map centered on "you" (a white dot). Concentric dashed circles represent distance in meters. A trembling, organic blob radiates outward from the center — its shape driven by frequency content (trembling = spectral variation), its overall radius driven by loudness (volume = how far you are "heard"). The blob is directional: it deforms asymmetrically based on which frequency bands are louder at any given moment, implying a spatial listening cone.

2. **Linear View** — The same blob data unrolled into a horizontal strip. The vertical axis represents amplitude at each angular slice; the horizontal axis represents the 360° sweep. It is the same data as the radial view, just flattened — so the two are always in sync.

***

## Visual Reference

Reference UI is in `Assets/UI-figma/Main-UI.png` and `Assets/UI-figma/Component-Explanation.png`.
Reference audio viz animations are in `Assets/audio-viz/`.

### Key UI Elements (from reference)

- **Pure black background** (`#000000` or very near)
- **White on black typography** — small, sparse, scientific instrument aesthetic
- **Top bar**: `Neck Symbiont` (left) · `Perceive your impact` (center) · `Lorem...` placeholder (right)
- **Radial view** centered on canvas, taking ~65% of screen width
- **Right panel**: two small annotated preview cards explaining the blob behavior (tremble = frequency, radius = volume) + a "Real Time Noise" waveform mini-strip at bottom right
- **Bottom-left controls**: Play Audio button · Allow Mic button (pill-shaped, minimal)
- **Crosshair lines** (solid white, thin) through the center on vertical and horizontal axes
- **Concentric circles**: outermost solid white, inner ones dashed white — labeled `3m`, `7m`, `15m`, `25m`
- **Annotation lines** with text: "This is you" and "All of the circles are meters of radius around you" with thin connecting lines to the relevant elements

***

## Audio Analysis Behavior

### Inputs (for now: faked / demo)
- A pre-baked audio demo loop (`Assets/audio-viz/` videos are reference only — generate a synthetic audio signal in JS)
- Future: `getUserMedia()` microphone input via "Allow mic" button

### What to extract from audio
| Parameter | Source | Used for |
|---|---|---|
| **RMS volume** | Time-domain RMS | Overall blob radius (louder = bigger) |
| **Frequency bands** | FFT (e.g. 8–16 bands) | Per-angle blob deformation (trembling) |
| **Spectral centroid** | Weighted frequency mean | Controls the "roughness" of the blob edge |
| **Directional illusion** | Band energy mapped to angles | Different freq bands drive different angular sectors |

### Directional Mapping
Since this is mono audio (not spatial audio), directionality is **simulated**, not real. Map frequency bands to angular sectors to create the illusion of directionality:
- Low frequencies (bass) → bottom/left sectors
- Mid frequencies → front/top sectors  
- High frequencies → right sectors
- This mapping should be configurable and feel organic, not mechanical

***

## Blob Rendering

The central blob is the core visual object. It should feel **alive and organic**, not mechanical.

### Algorithm
1. Divide the circle into `N` angular segments (e.g. 128)
2. For each segment `i`:
   - Base radius = `baseR` (minimum blob size, e.g. 20px logical)
   - Volume contribution: `volR = rms * maxVolRadius` (scales with loudness)
   - Frequency contribution: `freqR = freqBands[i % numBands] * maxTrembleDepth`
   - Apply smoothing over time (`lerp` or low-pass filter per segment)
   - Final radius: `r[i] = baseR + volR + freqR`
3. Draw as a smooth closed path using cubic bezier / catmull-rom splines through all `N` points
4. Fill with a **radial gradient**: white/light-gray at center → dark gray → near-black at edges
5. Add a subtle white stroke on the blob edge at low opacity

### Trembling feel
- Apply a small Perlin/simplex noise offset per segment that evolves over time, even when audio is silent — so the blob never feels completely dead
- Noise amplitude scales with spectral centroid (brighter sound = more jagged edges)

***

## File Structure

```
neck-audio/
├── CLAUDE.md                    ← this file
├── index.html                   ← main entry point
├── src/
│   ├── main.js                  ← app init, audio engine bootstrap
│   ├── audio/
│   │   ├── engine.js            ← AudioContext, analyser, demo signal
│   │   ├── analyser.js          ← FFT extraction, RMS, band mapping
│   │   └── demo.js              ← synthetic demo audio buffer generator
│   ├── viz/
│   │   ├── radial.js            ← radial blob renderer (canvas)
│   │   ├── linear.js            ← linear strip renderer (canvas)
│   │   └── blob.js              ← shared blob geometry (angle → radius[])
│   └── ui/
│       ├── layout.js            ← top bar, annotation lines, labels
│       ├── controls.js          ← Play Audio / Allow Mic buttons
│       └── ministrip.js         ← bottom-right "Real Time Noise" waveform
├── Assets/
│   ├── audio-viz/               ← reference videos (do not import in build)
│   └── UI-figma/                ← reference screenshots (do not import in build)
└── style.css                    ← global styles
```

***

## Technology Stack

- **Vanilla JS + HTML5 Canvas** — no framework, no build step required
- **Web Audio API** — `AudioContext`, `AnalyserNode`, `ScriptProcessorNode` (or `AudioWorklet`)
- **Canvas 2D** — all rendering in 2D canvas, DPR-aware (`devicePixelRatio`)
- **No external dependencies** — the project must run by opening `index.html` in a browser (file:// or simple local server)

If a bundler is eventually needed: use **Vite** with zero-config.

***

## Style Guide

### Typography
- Font: system sans-serif fallback → `'Inter', 'Helvetica Neue', sans-serif`
- All labels: small, white, low opacity (`rgba(255,255,255,0.55)` for secondary, `rgba(255,255,255,0.85)` for primary)
- No decorative text — everything reads as instrument readout

### Color Palette
| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page background |
| `--surface` | `#0a0a0a` | Card/panel backgrounds |
| `--border` | `rgba(255,255,255,0.1)` | Panel borders, circle strokes |
| `--text-primary` | `rgba(255,255,255,0.85)` | Main labels |
| `--text-muted` | `rgba(255,255,255,0.45)` | Secondary labels, ticks |
| `--blob-fill-center` | `rgba(220,220,220,0.9)` | Blob center highlight |
| `--blob-fill-mid` | `rgba(100,100,100,0.5)` | Blob mid-tone |
| `--blob-fill-edge` | `rgba(30,30,30,0.0)` | Blob fade-out edge |
| `--blob-stroke` | `rgba(255,255,255,0.25)` | Blob perimeter line |
| `--circle-solid` | `rgba(255,255,255,0.7)` | Outermost ring (25m) |
| `--circle-dashed` | `rgba(255,255,255,0.3)` | Inner dashed rings |

### Circles (distance rings)
- `3m` — innermost dashed, smallest
- `7m` — dashed
- `15m` — dashed
- `25m` — solid white, outermost
- All labeled at the bottom intersection with the vertical axis
- Crosshair: full-height and full-width thin white lines through center

### Controls (bottom-left)
```
▶  [ Play Audio ]
🎤 [ Allow mic  ]
```
Pill-shaped buttons, 1px white border at low opacity, no fill, white text. Icon + label side by side.

***

## Phases / Build Order

Claude should build this in the following order:

### Phase 1 — Static Shell
- `index.html` with layout: top bar, radial canvas (center), right panel (two annotation cards + mini waveform), bottom-left controls
- `style.css` with full color tokens and layout
- No audio yet — just the visual scaffold with placeholder blob shape

### Phase 2 — Static Blob + Rings
- Draw the concentric distance rings with labels
- Draw crosshair lines
- Draw a static organic blob shape (hardcoded values) with radial gradient fill
- Draw annotation lines from text to elements

### Phase 3 — Demo Audio Engine
- Create a synthetic audio signal in `demo.js` (multi-sine + noise, looping)
- Wire `AnalyserNode` and extract: RMS, frequency band energies (8 bands min)
- Map bands to angular segments of the blob

### Phase 4 — Animated Blob
- Blob radius per segment driven by audio analysis
- Smooth interpolation between frames
- Perlin-style noise for organic trembling
- Radial gradient fill redrawn each frame

### Phase 5 — Linear View
- Unroll blob radii into a horizontal strip below or beside the radial view
- Style matching the reference (thin white bars or waveform, same data)
- Show in a small panel or overlay — reference positions it bottom-right as "Real Time Noise"

### Phase 6 — Microphone Input
- Add `getUserMedia()` behind the "Allow mic" button
- Replace demo source with live mic stream feeding the same `AnalyserNode`
- Handle permissions gracefully (error state if denied)

***

## Constraints & Notes

- **No audio plays without user gesture** — Web Audio API requires a user interaction to start. The "Play Audio" button is that gesture.
- **Canvas must be DPR-aware** — always set `canvas.width = rect.width * dpr` and scale context.
- **Blob must never be a perfect circle** — even at silence, the Perlin noise offset keeps it organic.
- **Distance rings are visual metaphor, not acoustic simulation** — the actual physics of sound propagation are not modeled. The circles exist to give scale intuition.
- **The project is about perception, not precision** — prefer beautiful and evocative over scientifically accurate.
- **Assets folder is read-only reference** — do not modify or import files from `Assets/` into the build.
- **Target browser**: latest Chrome/Safari desktop. No IE, no polyfills needed.

***

## First Prompt for Claude Code

When starting a new Claude Code session on this project, paste this:

> Read CLAUDE.md fully before writing any code. Start with Phase 1: build the static HTML/CSS shell matching the UI reference in `Assets/UI-figma/Main-UI.png`. Pure black background, top bar with three labels, radial canvas centered, right panel with two annotation cards and a mini waveform area, bottom-left pill controls. No audio, no animation yet. Just the layout and static blob placeholder.
