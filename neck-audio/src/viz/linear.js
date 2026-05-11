// Linear view — same blob radii unrolled into vertical bars rising from a
// shared baseline. Style matches Assets/audio-viz/linear viz.mov:
//   - white/grey bars only (no color)
//   - bottom-anchored (not centered/mirrored)
//   - thin dashed line at the baseline so silence still reads as a "strip"
//   - smooth bell-shaped envelopes when loud

import { setupCanvas } from './radial.js';

const BAR_COUNT = 96;

export function renderLinear(canvas, radii, maxRadius) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const N = radii.length;
  const baselineY = Math.round(h * 0.78); // bars rise from a low baseline
  const stride = N / BAR_COUNT;
  const slot = w / BAR_COUNT;
  const barW = Math.max(1, Math.round(slot * 0.55));
  const maxBarH = baselineY - 6;
  // Normalization target: any radius reaching maxRadius (the visual cap of
  // the radial blob) maps to a full-height bar. maxRadius is supplied by the
  // caller so the strip stays in sync with the radial scale.
  const denom = Math.max(1, maxRadius);

  // Dashed baseline (always visible — represents the resting strip).
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(6, baselineY + 0.5);
  ctx.lineTo(w - 6, baselineY + 0.5);
  ctx.stroke();
  ctx.restore();

  // Bars.
  ctx.save();
  for (let k = 0; k < BAR_COUNT; k++) {
    const idx = Math.floor(k * stride);
    const r = radii[idx];
    const norm = Math.min(1, r / denom);
    if (norm <= 0.001) continue; // baseline already drawn

    const barH = Math.max(2, norm * maxBarH);
    const x = Math.round(k * slot + (slot - barW) / 2);
    const y = baselineY - barH;
    const alpha = 0.55 + norm * 0.4;
    ctx.fillStyle = `rgba(235,235,235,${alpha})`;
    ctx.fillRect(x, y, barW, barH);
  }
  ctx.restore();
}
