// Geometry shared by radial + linear views.
// Produces an array of N radii, one per angular segment, in display pixels.
// Inputs are normalized (0..1) so radii live in a stable visual range.

import { noise2D } from './noise.js';

export const SEGMENTS = 160;

// Per-band anchor angle, measured from "up" (top of canvas) clockwise in radians.
// Lows -> bottom-left, mids -> top, highs -> right. Smoothly distributed so
// adjacent bands sit near each other on the circle for a flowing deformation.
function bandAnchorAngles(bandsCount) {
  const angles = new Float32Array(bandsCount);
  for (let b = 0; b < bandsCount; b++) {
    const t = b / (bandsCount - 1); // 0 = lowest band, 1 = highest band
    // Sweep from bottom-left (~ 7π/6) through top (0) to right (π/2).
    // Use an easing that lingers in the bass and treble regions.
    const eased = t < 0.5
      ? 0.5 * Math.pow(t * 2, 1.2)
      : 1 - 0.5 * Math.pow((1 - t) * 2, 1.2);
    // Map eased ∈ [0,1] -> angle from 7π/6 (bottom-left) -> 0 (top) -> π/2 (right)
    let a;
    if (eased < 0.6) {
      const k = eased / 0.6;
      a = (7 * Math.PI / 6) + k * (2 * Math.PI - (7 * Math.PI / 6)); // wrap to 0
    } else {
      const k = (eased - 0.6) / 0.4;
      a = k * (Math.PI / 2);
    }
    angles[b] = a;
  }
  return angles;
}

let cachedAnchors = null;
let cachedBandsCount = -1;
function getAnchors(bandsCount) {
  if (bandsCount !== cachedBandsCount) {
    cachedAnchors = bandAnchorAngles(bandsCount);
    cachedBandsCount = bandsCount;
  }
  return cachedAnchors;
}

function angularDistance(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/**
 * Compute the radius (in pixels) for each of SEGMENTS angles around the blob.
 * At true silence (rms === 0 and every band === 0) every radius is 0, so the
 * blob collapses into the central white dot ("you"). Audio grows the blob
 * outward; band weighting deforms it directionally.
 *
 * @param {Float32Array} bands     - per-band energies in 0..1
 * @param {number} rms             - 0..1 overall loudness
 * @param {number} centroid        - 0..1 spectral centroid (controls jaggedness)
 * @param {number} t               - elapsed seconds (for noise evolution)
 * @param {object} scale           - { volR, freqR, trembleR } in px
 * @returns {Float32Array}
 */
export function computeRadii(bands, rms, centroid, t, scale) {
  const N = SEGMENTS;
  const out = new Float32Array(N);
  const anchors = getAnchors(bands.length);
  const sigma = (Math.PI * 2) / Math.max(4, bands.length) * 0.9;
  const twoSigSq = 2 * sigma * sigma;

  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2;

    // Weighted band contribution at this angle. When all bands are 0 this is 0.
    let bandSum = 0;
    let weightSum = 0;
    for (let b = 0; b < bands.length; b++) {
      const d = angularDistance(theta, anchors[b]);
      const w = Math.exp(-(d * d) / twoSigSq);
      bandSum += bands[b] * w;
      weightSum += w;
    }
    const bandEnergy = weightSum > 0 ? bandSum / weightSum : 0;

    const amplitude = rms * scale.volR + bandEnergy * scale.freqR;

    // Tremble lives ON TOP of amplitude. The gate ensures silence collapses
    // to the dot — no organic motion when there is no sound.
    const wobble = noise2D(Math.cos(theta) * 1.0, Math.sin(theta) * 1.0 + t * 0.6);
    const edge = noise2D(
      Math.cos(theta) * 3.6 + t * 1.1,
      Math.sin(theta) * 3.6 - t * 0.85,
    );
    const noiseAmt = wobble * 0.55 + edge * (0.25 + centroid * 0.7);
    const gate = Math.min(1, amplitude / 6);
    const tremble = noiseAmt * scale.trembleR * gate;

    out[i] = Math.max(0, amplitude + tremble);
  }

  return out;
}
