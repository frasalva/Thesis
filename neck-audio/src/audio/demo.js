// Synthetic "man walking in a forest" demo signal.
//
// Background is silent. Every STEP_PERIOD a footstep is scheduled:
//   - thump:   low-frequency bandpass noise burst (foot landing on soft ground)
//   - crackle: high-frequency bandpass noise burst, ~10-20ms after the thump
//              (leaves and twigs under the boot)
// Both layers contribute to the analyser, so each step paints both the
// low-frequency angular sector (bottom-left in our anchor mapping) and the
// high-frequency sector (right). The blob radiates radially with subtle
// directional peaks reflecting the step's spectral mix.
//
// Step-to-step variance is small but non-zero so the rhythm feels human, not
// metronomic.

const STEP_PERIOD = 0.62;     // seconds between footfalls
const SCHEDULE_HORIZON = 4.0; // schedule this many seconds ahead

export function createDemoSource(ctx) {
  const out = ctx.createGain();
  out.gain.value = 1.0;

  // Reusable noise buffer — every burst pulls a randomized slice via offset.
  const noiseSeconds = 1.0;
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseSeconds, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  let stepIdx = 0;
  let nextStepTime = ctx.currentTime + 0.2;
  let stopped = false;

  function scheduleBurst(t, freq, q, peak, attack, decay) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;

    const gain = ctx.createGain();
    const tail = t + attack + decay;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, tail);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    // Random offset into the noise buffer so successive bursts don't share
    // the same micro-texture (each leaf cracks differently).
    src.loopStart = 0;
    src.loopEnd = noiseSeconds;
    src.loop = true;

    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * (noiseSeconds - 0.1));
    src.stop(tail + 0.05);

    const delayMs = Math.max(50, (tail + 0.1 - ctx.currentTime) * 1000);
    setTimeout(() => {
      try { src.disconnect(); } catch (e) {}
      try { filter.disconnect(); } catch (e) {}
      try { gain.disconnect(); } catch (e) {}
    }, delayMs);
  }

  function scheduleStep(t, idx) {
    // Thump (foot landing on soft forest ground).
    const thumpFreq = 110 + (Math.random() - 0.5) * 50;     // ~85..135 Hz
    const thumpPeak = 0.42 + (Math.random() - 0.5) * 0.10;  // ~0.37..0.47
    scheduleBurst(t, thumpFreq, 1.4, thumpPeak, 0.006, 0.16 + Math.random() * 0.06);

    // Mid-low body — softer, gives the step a "weight" feel without booming.
    const bodyFreq = 260 + Math.random() * 120;             // 260..380 Hz
    scheduleBurst(t + 0.005, bodyFreq, 1.8, 0.18 + Math.random() * 0.06, 0.005, 0.12);

    // Leaf / twig crackle (high frequency, much shorter, slightly delayed).
    const crackleDelay = 0.012 + Math.random() * 0.012;     // 12..24 ms after thump
    const crackleFreq = 3500 + Math.random() * 2500;        // 3.5..6 kHz
    const cracklePeak = 0.16 + Math.random() * 0.08;        // ~0.16..0.24
    scheduleBurst(t + crackleDelay, crackleFreq, 2.2, cracklePeak, 0.003, 0.05 + Math.random() * 0.03);

    // Roughly 1-in-4 steps gets an extra fine "shimmer" — a second high crackle
    // a few ms later, simulating a small twig snapping after the main impact.
    if (Math.random() < 0.25) {
      const shimmerFreq = 5000 + Math.random() * 3000;
      scheduleBurst(t + crackleDelay + 0.025, shimmerFreq, 3.0, 0.10 + Math.random() * 0.05, 0.002, 0.04);
    }
  }

  function pump() {
    if (stopped) return;
    const horizon = ctx.currentTime + SCHEDULE_HORIZON;
    while (nextStepTime < horizon) {
      const t = Math.max(ctx.currentTime + 0.02, nextStepTime);
      scheduleStep(t, stepIdx++);
      // Walking has very steady cadence — small jitter only.
      const jitter = (Math.random() - 0.5) * 0.03;
      nextStepTime = t + STEP_PERIOD + jitter;
    }
  }

  pump();
  const pumpTimer = setInterval(pump, 1000);

  function disconnect() {
    stopped = true;
    clearInterval(pumpTimer);
    try { out.disconnect(); } catch (e) {}
  }

  return { node: out, disconnect };
}
