import { Renderer }     from './renderer.js';
import { analyzeAudio } from './audio.js';

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

async function loadPanel(side, file) {
  setFileName(side, file.name, 'loading');
  pause();

  const arrayBuf = await file.arrayBuffer();
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

  setFileName(side, file.name, 'loaded');
  document.getElementById('btn-play').disabled = false;
  updateProgress();

  console.log(
    `[main] "${file.name}" → ${points.length} points, ` +
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

document.getElementById('btn-play').addEventListener('click', togglePlay);

document.getElementById('btn-compare').addEventListener('click', () => {
  setSingleMode(false);
});

requestAnimationFrame(tick);
