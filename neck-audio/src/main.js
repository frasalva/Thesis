// App entry. Owns the render loop, the audio engine, and the smoothing state
// that ties audio frames to visual frames.

import { AudioEngine } from './audio/engine.js';
import { extractFeatures } from './audio/analyser.js';
import { computeRadii, SEGMENTS } from './viz/blob.js';
import { renderRadial, RING_METERS } from './viz/radial.js';
import { renderLinear } from './viz/linear.js';
import { initControls } from './ui/controls.js';

const BANDS = 16;

const engine = new AudioEngine();

const state = {
  rms: 0,
  bands: new Float32Array(BANDS),
  centroid: 0,
  smoothedRadii: new Float32Array(SEGMENTS),
  scratch: {},
  startTime: performance.now(),
};

const radialCanvas = document.getElementById('radial-canvas');
const linearCanvas = document.getElementById('linear-canvas');

initControls(engine);

// Test/dev hooks (URL params, harmless in normal use):
//   ?autoplay=1  -> simulate a click on Play after load (best-effort).
//   ?fake=1      -> bypass the AudioContext entirely and inject synthetic
//                   features into the render loop. Used for headless render
//                   verification, where Web Audio is not reliable.
const params = new URLSearchParams(location.search);
if (params.get('autoplay') === '1') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const btn = document.getElementById('btn-play');
      if (btn) btn.click();
    }, 50);
  });
}
if (params.get('fake') === '1') {
  state.fake = true;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function decay(value, factor) { return value * factor; }

function tick() {
  const now = performance.now();
  const t = (now - state.startTime) / 1000;

  if (state.fake) {
    // Synthetic walking footsteps: pulse 0 -> peak -> 0 every ~0.66s, with
    // each step emphasizing a different band. Used only for headless render
    // verification.
    const period = 0.66;
    const phase = (t % period) / period; // 0..1
    const env = Math.max(0, Math.sin(phase * Math.PI)) ** 1.6; // bell, 0..1
    const stepIdx = Math.floor(t / period);
    const dominant = stepIdx % BANDS;
    const peak = 0.45 + 0.35 * Math.sin(stepIdx * 1.7);
    state.rms = env * Math.max(0.2, peak);
    for (let b = 0; b < BANDS; b++) {
      const dist = Math.min(Math.abs(b - dominant), BANDS - Math.abs(b - dominant));
      const w = Math.exp(-(dist * dist) / 4);
      state.bands[b] = env * Math.max(0.15, peak) * w;
    }
    state.centroid = 0.35 + 0.4 * (dominant / BANDS);
  } else if (engine.isRunning() && engine.analyser) {
    const f = extractFeatures(engine.analyser, BANDS, state.scratch);
    state.rms = lerp(state.rms, f.rms, 0.35);
    for (let b = 0; b < BANDS; b++) {
      state.bands[b] = lerp(state.bands[b], f.bands[b], 0.45);
    }
    state.centroid = lerp(state.centroid, f.centroid, 0.2);
  } else {
    // No audio: gently relax toward zero so the blob settles to its idle
    // organic shape (driven by Perlin noise alone).
    state.rms = decay(state.rms, 0.94);
    for (let b = 0; b < BANDS; b++) state.bands[b] = decay(state.bands[b], 0.94);
    state.centroid = decay(state.centroid, 0.96);
  }

  // Visual scale is relative to the radial canvas so the blob always sits
  // inside the inner rings. Pixel scale is recomputed each frame in case the
  // window has been resized.
  const rect = radialCanvas.getBoundingClientRect();
  const outerR = Math.min(rect.width, rect.height) * 0.36; // 25m ring radius
  const ring7 = (RING_METERS[1] / RING_METERS[3]) * outerR;
  // No baseR: at silence the blob collapses to the central white dot.
  // A loud, mostly-omnidirectional pulse should push the perimeter near
  // the 15m ring; pulses with a strong directional bias can stretch
  // toward 20-25m on the dominant side.
  // Sound spreads mostly evenly around "you" (the mic on you, listening to a
  // step radiating in all directions). The frequency component adds subtle
  // directional peaks where the dominant bands sit.
  const scale = {
    volR: outerR * 0.85,    // omnidirectional reach — the radial component
    freqR: outerR * 0.18,   // small directional bias on top of the radial body
    trembleR: ring7 * 0.10, // light edge tremble, gated by amplitude
  };

  const radii = computeRadii(state.bands, state.rms, state.centroid, t, scale);
  for (let i = 0; i < SEGMENTS; i++) {
    state.smoothedRadii[i] = lerp(state.smoothedRadii[i], radii[i], 0.45);
  }

  renderRadial(radialCanvas, state.smoothedRadii);
  // Linear cap = expected peak-loudness radius (volR + freqR). A bar reaching
  // this cap = the radial blob has reached that direction's max stretch.
  renderLinear(linearCanvas, state.smoothedRadii, scale.volR + scale.freqR);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
