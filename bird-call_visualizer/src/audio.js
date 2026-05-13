import { CONFIG } from './config.js';

// --- Cooley-Tukey FFT (radix-2, decimation in time, iterative) ---
//
// Takes a real-valued Float32Array of length N (must be a power of 2).
// Returns a Float32Array of length N/2 containing the magnitude spectrum
// for bins 0 .. N/2-1. Only these bins are meaningful for real input.
function fft(signal) {
  const N = signal.length;
  const re = new Float64Array(signal); // copy; will hold real parts
  const im = new Float64Array(N);      // imaginary parts, start at zero

  // Bit-reversal permutation (im is all-zero here, skipping its swap).
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i]; re[i] = re[j]; re[j] = t;
    }
  }

  // Butterfly passes.
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const baseWr = Math.cos(angle);
    const baseWi = Math.sin(angle);

    for (let i = 0; i < N; i += len) {
      let ur = 1, ui = 0;
      for (let k = 0; k < half; k++) {
        const tr = re[i + k + half] * ur - im[i + k + half] * ui;
        const ti = re[i + k + half] * ui + im[i + k + half] * ur;
        re[i + k + half] = re[i + k] - tr;
        im[i + k + half] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
        const newUr = ur * baseWr - ui * baseWi;
        ui = ur * baseWi + ui * baseWr;
        ur = newUr;
      }
    }
  }

  // Magnitude spectrum for the first N/2 bins.
  const halfN = N >> 1;
  const mag = new Float32Array(halfN);
  for (let i = 0; i < halfN; i++) {
    mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return mag;
}

// --- Hann window ---
// Applied before FFT to reduce spectral leakage at frame boundaries.
function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// --- Per-frame descriptors ---

function rms(samples) {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

// Frequency of the bin with the highest magnitude (skipping bin 0, the DC term).
function dominantFrequency(magnitudes, sampleRate) {
  const binHz = sampleRate / (magnitudes.length * 2);
  let maxVal = -Infinity, maxIdx = 1;
  for (let i = 1; i < magnitudes.length; i++) {
    if (magnitudes[i] > maxVal) { maxVal = magnitudes[i]; maxIdx = i; }
  }
  return maxIdx * binHz; // Hz
}

// Spectral centroid: amplitude-weighted mean frequency. Returns kHz.
function centroidKHz(magnitudes, sampleRate) {
  const binHz = sampleRate / (magnitudes.length * 2);
  let weightedSum = 0, totalMag = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    weightedSum += i * binHz * magnitudes[i];
    totalMag += magnitudes[i];
  }
  return totalMag > 0 ? (weightedSum / totalMag) / 1000 : 0;
}

// --- Public API ---

/**
 * Decode an audio ArrayBuffer and compute per-frame spectral descriptors.
 *
 * Returns { points, audioBuffer } where:
 *   points      — Array<{timeNorm, amplitude, centroid, dominantFreq, emissionTime}>
 *   audioBuffer — decoded AudioBuffer, usable for playback in any AudioContext
 *
 * Property names in each point match CONFIG.axes keys so the renderer can
 * look up values by name without knowing what they mean.
 */
export async function analyzeAudio(arrayBuffer) {
  const ctx = new AudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  // Mix all channels to mono.
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / numChannels;
  }

  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const { frameSize, hopSize } = CONFIG.fft;
  const window = hannWindow(frameSize);
  const points = [];

  for (let offset = 0; offset + frameSize <= length; offset += hopSize) {
    // Apply window to the frame before FFT.
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      frame[i] = mono[offset + i] * window[i];
    }

    const magnitudes = fft(frame);

    // RMS on the raw (unwindowed) samples for a true amplitude reading.
    const amplitude = rms(mono.subarray(offset, offset + frameSize));
    const centroid = centroidKHz(magnitudes, sampleRate);
    const domFreq = dominantFrequency(magnitudes, sampleRate);
    const emissionTime = offset / sampleRate;
    const timeNorm = emissionTime / duration;

    points.push({ timeNorm, amplitude, centroid, dominantFreq: domFreq, emissionTime });
  }

  return { points, audioBuffer };
}
