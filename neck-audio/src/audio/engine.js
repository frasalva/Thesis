// AudioContext lifecycle + source switching. Exposes the AnalyserNode that the
// rest of the app pulls features from. Source can be either the demo signal or
// a microphone stream (Phase 6 hook is wired but mic.start() is left for the
// "Allow mic" button to call when needed).

import { createDemoSource } from './demo.js';
import { createAnalyser } from './analyser.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;     // current source descriptor: { node, disconnect, kind }
    this.master = null;     // gain to destination so the demo is audible
    this.audible = true;    // route demo to speakers
  }

  async _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = createAnalyser(this.ctx);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18; // gentle: visualization > listening
      this.analyser.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async startDemo() {
    await this._ensureContext();
    this._teardownSource();
    const src = createDemoSource(this.ctx);
    src.kind = 'demo';
    src.node.connect(this.analyser);
    this.source = src;
  }

  async startMic() {
    await this._ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._teardownSource();
    const node = this.ctx.createMediaStreamSource(stream);
    node.connect(this.analyser);
    // Mic is NOT routed to speakers (would feedback).
    this.source = {
      node,
      stream,
      kind: 'mic',
      disconnect: () => {
        try { node.disconnect(); } catch (e) {}
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  }

  stop() {
    this._teardownSource();
  }

  _teardownSource() {
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
  }

  isRunning() {
    return Boolean(this.source) && this.ctx && this.ctx.state === 'running';
  }

  currentSource() {
    return this.source ? this.source.kind : null;
  }
}
