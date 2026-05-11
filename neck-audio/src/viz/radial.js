// Radial view: rings, crosshair, blob, center dot. Renders into the main
// full-screen canvas. All sizing is recomputed each frame so window resize is
// automatic.

import { SEGMENTS } from './blob.js';

// Distance rings, in meters. Outermost is solid; the rest are dashed.
export const RING_METERS = [3, 7, 15, 25];
const RING_MAX = RING_METERS[RING_METERS.length - 1];

export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array} radii        - radii in px (length === SEGMENTS)
 * @returns {{cx:number,cy:number,ringPx:number[]}} for use by overlay/annotations
 */
export function renderRadial(canvas, radii) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Outermost ring (25m) sits at ~36% of the smaller dimension.
  const outerR = Math.min(w, h) * 0.36;
  const ringPx = RING_METERS.map((m) => (m / RING_MAX) * outerR);

  drawCrosshair(ctx, cx, cy, w, h);
  drawRings(ctx, cx, cy, ringPx);
  drawRingLabels(ctx, cx, cy, ringPx);
  drawBlob(ctx, cx, cy, radii);
  drawCenterDot(ctx, cx, cy);

  return { cx, cy, ringPx, w, h };
}

function drawCrosshair(ctx, cx, cy, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, 40);
  ctx.lineTo(cx, h - 40);
  ctx.moveTo(40, cy);
  ctx.lineTo(w - 40, cy);
  ctx.stroke();
  ctx.restore();
}

function drawRings(ctx, cx, cy, ringPx) {
  for (let i = 0; i < ringPx.length; i++) {
    const r = ringPx[i];
    const isOutermost = i === ringPx.length - 1;
    ctx.save();
    ctx.lineWidth = 1;
    if (isOutermost) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.setLineDash([2, 3]);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRingLabels(ctx, cx, cy, ringPx) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '11px Inter, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < ringPx.length; i++) {
    const r = ringPx[i];
    const m = RING_METERS[i];
    const label = i === ringPx.length - 1 ? `${m} m` : `${m}m`;
    // Label sits just below the ring's intersection with the vertical axis.
    ctx.fillText(label, cx + 6, cy + r + 2);
  }
  ctx.restore();
}

function drawBlob(ctx, cx, cy, radii) {
  const N = radii.length;
  const points = new Array(N);
  for (let i = 0; i < N; i++) {
    // theta: 0 = top (-y), clockwise.
    const theta = (i / N) * Math.PI * 2 - Math.PI / 2;
    points[i] = {
      x: cx + Math.cos(theta) * radii[i],
      y: cy + Math.sin(theta) * radii[i],
    };
  }

  // Find max radius for gradient extent.
  let maxR = 0;
  for (let i = 0; i < N; i++) {
    if (radii[i] > maxR) maxR = radii[i];
  }

  ctx.save();
  // Smooth closed Catmull-Rom path through all points.
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < N; i++) {
    const p0 = points[(i - 1 + N) % N];
    const p1 = points[i];
    const p2 = points[(i + 1) % N];
    const p3 = points[(i + 2) % N];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  ctx.closePath();

  // Inverted radial gradient: transparent at the center (the white "you" dot
  // shows through), dark mid, bright at the perimeter. Reads as a sound
  // wavefront radiating outward from you.
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(maxR, 1));
  grad.addColorStop(0.0, 'rgba(0,0,0,0.0)');
  grad.addColorStop(0.35, 'rgba(35,35,35,0.45)');
  grad.addColorStop(0.7, 'rgba(150,150,150,0.85)');
  grad.addColorStop(0.92, 'rgba(235,235,235,0.95)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle edge stroke at the wavefront perimeter.
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawCenterDot(ctx, cx, cy) {
  ctx.save();
  // Soft halo so the dot reads clearly even at silence (when the surrounding
  // blob has fully collapsed and the dot is the only visible element).
  const haloR = 16;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  halo.addColorStop(0.0, 'rgba(255,255,255,0.55)');
  halo.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  halo.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
