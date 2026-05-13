# Bird Song 3D Visualization

3D point cloud visualization of bird songs, inspired by Lucio Arese's
TouchDesigner model. Each audio frame becomes a colored point in 3D space;
the cloud builds up over time and can be frozen into a navigable snapshot.

## How to run

```sh
cd /path/to/bird_song_arese
python -m http.server 8000
```

Then open **http://localhost:8000** in a browser (Chrome or Firefox).

> A local server is required because browsers block ES module imports from
> `file://` URLs. The `python -m http.server` command serves the current
> directory over HTTP with no configuration needed.

## Audio files

Place WAV or MP3 files in `assets/audio/` using the naming pattern:

```
species_source_id.ext
```

Example: `blackbird_xeno_12345.wav`

## Source layout

| File | Purpose |
|---|---|
| `index.html` | Two-panel layout and Three.js import map |
| `style.css` | Black background, 50/50 split grid |
| `src/config.js` | Encoding configuration (axis mapping, color scale, …) |
| `src/main.js` | Entry point |
| `src/audio.js` | Audio decoding and FFT analysis (Step 2) |
| `src/renderer.js` | Three.js scene, point cloud, connecting lines (Step 3) |
| `src/labels.js` | Per-point floating text labels (Step 4) |
