// Pulls features out of an AnalyserNode each frame:
//   - rms       0..1 overall loudness (time-domain)
//   - bands[]   0..1 per-band magnitude, log-spaced (frequency-domain)
//   - centroid  0..1 normalized spectral centroid (controls edge jaggedness)
//   - timeData  raw Uint8Array of the time-domain waveform (for the ministrip)

export function createAnalyser(ctx) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;
  return analyser;
}

export function extractFeatures(analyser, bandsCount, scratch) {
  const fftBins = analyser.frequencyBinCount;
  const sampleRate = analyser.context.sampleRate;
  const nyquist = sampleRate / 2;

  if (!scratch.freq || scratch.freq.length !== fftBins) {
    scratch.freq = new Uint8Array(fftBins);
    scratch.time = new Uint8Array(analyser.fftSize);
    scratch.bands = new Float32Array(bandsCount);
  }
  const freqData = scratch.freq;
  const timeData = scratch.time;
  const bands = scratch.bands;

  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  // RMS in time domain.
  let sumSq = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / timeData.length);

  // Log-spaced frequency bands between minF and maxF.
  const minF = 40;
  const maxF = Math.min(16000, nyquist * 0.95);
  const ratio = maxF / minF;
  for (let b = 0; b < bandsCount; b++) {
    const lowF = minF * Math.pow(ratio, b / bandsCount);
    const highF = minF * Math.pow(ratio, (b + 1) / bandsCount);
    const lowBin = Math.max(0, Math.floor((lowF / nyquist) * fftBins));
    const highBin = Math.min(fftBins - 1, Math.ceil((highF / nyquist) * fftBins));
    let sum = 0;
    let count = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += freqData[i];
      count++;
    }
    bands[b] = count > 0 ? (sum / count) / 255 : 0;
  }

  // Spectral centroid (normalized 0..1 across frequencyBinCount).
  let weighted = 0;
  let mag = 0;
  for (let i = 0; i < fftBins; i++) {
    weighted += i * freqData[i];
    mag += freqData[i];
  }
  const centroid = mag > 0 ? (weighted / mag) / fftBins : 0;

  return { rms, bands, centroid, timeData };
}
