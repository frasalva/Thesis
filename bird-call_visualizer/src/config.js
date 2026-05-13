// Central configuration object. Change values here to remap encodings;
// the renderer and audio modules read from this — nothing is hardcoded elsewhere.
export const CONFIG = {

  // --- Axis mapping ---
  // Keys must match the property names returned by audio.js per-point objects.
  // Valid values: 'timeNorm' | 'amplitude' | 'centroid' | 'dominantFreq'
  axes: {
    x: 'timeNorm',   // normalized emission time, 0..1 over file duration
    y: 'amplitude',  // RMS amplitude, 0..1
    z: 'centroid',   // spectral centroid in kHz
  },

  // Scene-unit range each axis maps to.
  // E.g. timeNorm 0..1 → x -5..5 (10 units wide).
  axisScale: {
    x: [-5, 5],
    y: [0, 4],
    z: [-3, 3],
  },

  // --- Color scale ---
  // Dominant frequency (Hz) → color, matching Arese's legend.
  // The renderer interpolates linearly between adjacent stops.
  colorScale: [
    { freq:    0, hex: '#0000ff' },  // blue
    { freq:  150, hex: '#ff00ff' },  // magenta
    { freq:  500, hex: '#ff0000' },  // red
    { freq: 1000, hex: '#ff8800' },  // orange
    { freq: 1500, hex: '#ffff00' },  // yellow
    { freq: 2500, hex: '#00ff00' },  // green
    { freq: 5000, hex: '#00ffff' },  // cyan
    { freq: 8000, hex: '#ffffff' },  // white
  ],

  // --- Point size ---
  // Amplitude 0..1 maps linearly to size min..max (screen pixels).
  pointSize: {
    min: 3,
    max: 14,
  },

  // --- Connecting lines ---
  // Maximum distance (scene units) between two points for a line to be drawn.
  lineNeighborDistance: 0.6,

  // --- FFT analysis ---
  // frameSize must be a power of 2.
  // hopSize controls time resolution: smaller = more points, slower analysis.
  fft: {
    frameSize: 2048,
    hopSize:    512,
  },

  // --- Feature ranges ---
  // Natural value range for each audio feature name.
  // The renderer uses these to normalize raw values to 0..1 before mapping
  // to scene coordinates. If you add a new axis feature, add its range here.
  featureRanges: {
    timeNorm:    [0, 1],
    amplitude:   [0, 1],     // pre-normalized per file by the renderer
    centroid:    [0, 8],     // kHz — bird songs rarely exceed 8 kHz
    dominantFreq:[0, 8000],  // Hz
    emissionTime:[0, 1],     // not used as axis in v1; placeholder
  },
};
