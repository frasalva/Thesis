import { Renderer }       from './renderer.js';
import { analyzeAudio }   from './audio.js';
import { SAMPLE_LIBRARY } from './config.js';

// ── Panel state ────────────────────────────────────────────────────────────

const panels = {
  left: {
    renderer:    null,
    points:      null,
    audioBuffer: null,
    duration:    0,
  },
  right: {
    renderer:    null,
    points:      null,
    audioBuffer: null,
    duration:    0,
  },
};

// ── Transport ──────────────────────────────────────────────────────────────

let isPlaying   = false;
let currentTime = 0;        // seconds into the visualization
let lastWall    = null;     // performance.now() at the start of the last frame

function maxDuration() {
  return Math.max(panels.left.duration, panels.right.duration);
}

function anyLoaded() {
  return !!(panels.left.points || panels.right.points);
}

// ── Layout mode ────────────────────────────────────────────────────────────
// single-mode: only #panel-left visible, full viewport width
// split-mode:  both panels visible, 50/50
// The renderer's ResizeObserver handles the canvas/camera resize automatically
// when panel widths change.

const appEl = document.getElementById('app');

function setSingleMode(single) {
  appEl.classList.toggle('single-mode', single);
  // Layout changes immediately when the class flips, but we wait one
  // animation frame so the browser has resolved the new sizes before we
  // ask the renderers for their container dimensions. ResizeObserver should
  // also catch this, but calling explicitly removes any timing ambiguity.
  requestAnimationFrame(() => {
    panels.left.renderer.resize();
    panels.right.renderer.resize();
  });
}

// ── Audio playback ─────────────────────────────────────────────────────────
// AudioBuffer decoded during analysis is reused for playback in a separate
// AudioContext. Per the Web Audio API spec, AudioBuffer is not tied to the
// lifetime of the context that created it and can be shared freely.

let audioCtx = null;
const activeSources = { left: null, right: null };

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function startAudio(side) {
  const panel = panels[side];
  if (!panel.audioBuffer) return;
  if (currentTime >= panel.duration) return; // this panel has already finished

  if (activeSources[side]) {
    try { activeSources[side].stop(); } catch (_) {}
    activeSources[side] = null;
  }

  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = panel.audioBuffer;
  src.connect(ctx.destination);
  src.start(0, currentTime); // start at current visualization time
  activeSources[side] = src;
}

function stopAudio(side) {
  if (activeSources[side]) {
    try { activeSources[side].stop(); } catch (_) {}
    activeSources[side] = null;
  }
}

// ── Play / Pause ───────────────────────────────────────────────────────────

function play() {
  if (!anyLoaded()) return;

  getAudioCtx().resume(); // un-suspend context if browser auto-suspended it
  isPlaying = true;
  lastWall  = performance.now();

  startAudio('left');
  startAudio('right');
  updateTransportUI();
}

function pause() {
  isPlaying = false;
  stopAudio('left');
  stopAudio('right');
  updateTransportUI();
}

function togglePlay() {
  // If playback reached the end, pressing play restarts from zero.
  if (!isPlaying && maxDuration() > 0 && currentTime >= maxDuration()) {
    currentTime = 0;
    for (const side of ['left', 'right']) {
      panels[side].renderer.clear();
      if (panels[side].points) panels[side].renderer.loadPoints(panels[side].points);
    }
    updateProgress();
  }

  if (isPlaying) pause(); else play();
}

// ── File loading ───────────────────────────────────────────────────────────
// Accepts either a File (user upload) or a { name, url } object (bundled
// library sample). Both end up as an ArrayBuffer fed into analyzeAudio.

async function loadPanel(side, source) {
  setFileName(side, source.name, 'loading');
  pause();

  let arrayBuf;
  try {
    if (source instanceof File) {
      arrayBuf = await source.arrayBuffer();
    } else {
      const res = await fetch(source.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`);
      arrayBuf = await res.arrayBuffer();
    }
  } catch (err) {
    console.error(`[main] failed to load "${source.name}":`, err);
    setFileName(side, `${source.name} — not found`, '');
    return;
  }

  const { points, audioBuffer } = await analyzeAudio(arrayBuf);

  panels[side].points      = points;
  panels[side].audioBuffer = audioBuffer;
  panels[side].duration    = audioBuffer.duration;

  // If a file was loaded into the right panel, split mode must be active.
  if (side === 'right') setSingleMode(false);

  // Reset both panels to t = 0 so the comparison starts in sync.
  currentTime = 0;
  for (const s of ['left', 'right']) {
    panels[s].renderer.clear();
    if (panels[s].points) panels[s].renderer.loadPoints(panels[s].points);
  }

  setFileName(side, source.name, 'loaded');
  document.getElementById('btn-play').disabled = false;
  updateProgress();

  console.log(
    `[main] "${source.name}" → ${points.length} points, ` +
    `${audioBuffer.duration.toFixed(2)} s`,
  );
}

// ── Animation loop ─────────────────────────────────────────────────────────

function tick() {
  if (isPlaying) {
    const now = performance.now();
    currentTime += (now - lastWall) / 1000;
    lastWall     = now;

    const dur = maxDuration();
    if (currentTime >= dur) {
      currentTime = dur;
      pause(); // reached the end — stay on the final snapshot
    }

    for (const side of ['left', 'right']) {
      if (panels[side].points) panels[side].renderer.playTo(currentTime);
    }

    updateProgress();
  }

  requestAnimationFrame(tick);
}

// ── UI helpers ─────────────────────────────────────────────────────────────

function updateTransportUI() {
  document.getElementById('btn-play').textContent = isPlaying ? '⏸' : '▶';
}

function updateProgress() {
  const dur = maxDuration();
  const pct = dur > 0 ? (currentTime / dur) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('time-display').textContent  =
    `${currentTime.toFixed(2)} / ${dur.toFixed(2)} s`;
}

function setFileName(side, name, state) {
  const el = document.getElementById(`fname-${side}`);
  el.textContent = name;
  el.className   = `file-name ${state}`;
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault(); // prevent page scroll
    togglePlay();
  }
  if (e.key === 'l' || e.key === 'L') {
    const visible = panels.left.renderer.toggleLabels();
    panels.right.renderer.toggleLabels();
    console.log(`[main] labels ${visible ? 'visible' : 'hidden'}`);
  }
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

panels.left.renderer  = new Renderer(document.getElementById('canvas-left'));
panels.right.renderer = new Renderer(document.getElementById('canvas-right'));

document.getElementById('file-left').addEventListener('change', (e) => {
  if (e.target.files[0]) loadPanel('left', e.target.files[0]);
});
document.getElementById('file-right').addEventListener('change', (e) => {
  if (e.target.files[0]) loadPanel('right', e.target.files[0]);
});

// Populate each library dropdown from SAMPLE_LIBRARY (defined in config.js).
// The first option is the placeholder ("library ▾"); samples follow.
for (const side of ['left', 'right']) {
  const sel = document.getElementById(`library-${side}`);
  SAMPLE_LIBRARY.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value       = String(i);
    opt.textContent = item.label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', (e) => {
    const i = e.target.value;
    if (i === '') return;
    const item = SAMPLE_LIBRARY[Number(i)];
    loadPanel(side, { name: item.label, url: item.url });
    // Reset so the same option can be re-picked later.
    e.target.value = '';
  });
}

document.getElementById('btn-play').addEventListener('click', togglePlay);

document.getElementById('btn-compare').addEventListener('click', () => {
  setSingleMode(false);
});

// Mobile tabs (hidden on desktop via CSS). Toggling .show-b on #app swaps
// which panel is rendered; the freshly visible panel needs its renderer
// resized because its container went from display:none → display:grid.
for (const tab of document.querySelectorAll('.mobile-tab')) {
  tab.addEventListener('click', () => {
    const side = tab.dataset.panel; // 'left' or 'right'
    appEl.classList.toggle('show-b', side === 'right');
    for (const t of document.querySelectorAll('.mobile-tab')) {
      t.classList.toggle('active', t === tab);
    }
    requestAnimationFrame(() => panels[side].renderer.resize());
  });
}

// Auto-load the first library sample into the left panel so a first-time
// visitor sees something without having to click. The right panel stays
// empty until the user chooses + compare.
if (SAMPLE_LIBRARY.length > 0) {
  const first = SAMPLE_LIBRARY[0];
  loadPanel('left', { name: first.label, url: first.url });
}

requestAnimationFrame(tick);
