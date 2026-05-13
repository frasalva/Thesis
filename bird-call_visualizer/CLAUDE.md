# Bird Song 3D Visualization — Project Context

## Goal
Build a 3D visualization of recorded bird songs, inspired by Lucio Arese's
TouchDesigner model demoed in the reference video. The original is a real-time
system; this project targets **pre-recorded audio files** (offline playback)
as a simpler, more shareable starting point.

## What the original model does
The model translates audio into points distributed in 3D space, building up
a layered structure over time. Each point carries:

- **Color**: dominant frequency band at emission time
- **Amplitude**: signal intensity at emission
- **Emission time**: timestamp in seconds
- **Lifetime**: animated age value in seconds
- **Spectral centroid**: spectrogram "center of mass" in kHz

Key feature in the original: ability to freeze the stream and save navigable
3D snapshots, plus secondary 2D graphs (amplitude vs frequency over time,
spectral centroid vs amplitude).

The original supports **configurable axis mappings** across multiple graph
types (Hertz-domain descriptors, dB-domain descriptors, Tone Map, Time Window,
Timbre Space, Tonality, Cepstrogram, Chromagram). Two 3D examples visible in
the reference: Timbre Space (centroid × spread × crest) and Tonality
(time × centroid × tonality). This informs the config-object design below.

## My version — scope and constraints

- **Input**: pre-recorded audio files (WAV / MP3), a few seconds to 2 minutes
- **Source material**: bird songs downloaded from the web (YouTube, specialized
  sites). 3 sample files available for prototyping.
- **Must have**:
  - 3D point distribution driven by audio
  - Color encoding dominant frequency band
  - Navigable snapshots
  - Ability to compare songs from different species side by side
- **Nice to have (later)**: secondary 2D graphs, snapshot export
- **Not in scope (for now)**: live microphone input, MIDI integration

## Stack

**Three.js + Web Audio API (browser).** Single HTML file, no install required.
Audio decoded offline via `AudioContext.decodeAudioData()`, FFT analysis run
in JavaScript. Three.js `BufferGeometry` + `PointsMaterial` for the point
cloud. OrbitControls for 3D navigation. CSS2DRenderer for floating text labels.

## Axis mapping and visual encodings (v1)

All encodings are defined in a **configuration object**, never hardcoded in the
renderer, so axis assignments and visual mappings can be swapped without
touching rendering code.

V1 mapping:
- **X** = emission time, normalized 0..1 over file duration
- **Y** = amplitude (RMS)
- **Z** = spectral centroid (kHz)
- **Color** = dominant frequency band (Arese scale: blue → magenta → red →
  orange → yellow → green → cyan → white, mapping 0–8 kHz)
- **Point size** = amplitude

## Visual design decisions

- **Connecting lines**: thin white lines between neighboring points are part of
  the aesthetic — keep them.
- **Per-point text labels**: floating numbers (amplitude, centroid, timestamp,
  lifetime) visible by default; togglable via a keyboard shortcut for
  readability when zoomed out.
- **Background**: black.

## Layout and interaction

- **Side-by-side**: two separate 3D panels (left / right split-screen), one
  audio file per panel, each with its own independent OrbitControls instance.
- **Snapshot mode**: the visualization builds up in real time as audio plays.
  Snapshot freezes whatever has accumulated at that moment; user orbits/zooms
  the frozen structure freely, then resumes playback.

## Audio files

Stored in `assets/audio/` with descriptive lowercase names following the
pattern `species_source_id.ext` (e.g. `blackbird_xeno_12345.wav`).

## Memory

A running log of non-obvious changes, decisions, and gotchas lives in
`memory.md` at the project root. Read it before making structural changes
so you don't re-litigate already-decided trade-offs. Append new dated
entries at the top as the project evolves.

## Reference material

All reference material is in `reference/`:
- `reference/note.md` — my personal notes (in Italian) on what I want
- `reference/transcript/reference_LucioArese.txt` — full transcript of the
  source video
- `reference/frames/` — key frames extracted from the video, organized in
  7 subfolders by section (01_intro, 02_model, 03_snapshots, 04_realtime,
  05_audio_sources, 06_future, 07_conclusion)
- `reference/frames/01_intro/project_viz_overview.png` — overview of all 8
  configurable graph types in Arese's model (the configurable-mapping reference)
- `reference/reference_LucioArese.mp4` — original video (do not read directly,
  use transcript and frames instead)

## Working conventions

- All code, code comments, commit messages, and generated documentation:
  **English**
- Source code goes in `src/`
- Audio test files will go in `assets/audio/` (create when needed)
- Ask before installing new dependencies; keep the stack minimal
- Ask before committing to architectural decisions; I want to learn, not
  just receive code
- Before generating code, always summarize what you understood and propose
  an approach for me to confirm
