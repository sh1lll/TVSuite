// Sound engine: synthesized effects, generated ambient beds, the user's own files/links, and voice.
// Runs in the extension's audio frame (extension origin) or, on TradingView Desktop, in the page.
// Synths take (ctx, out) so they also render into an OfflineAudioContext for the self-test.

const noiseCache = new WeakMap();
function noiseBuffer(ctx, type = 'white', seconds = 2) {
  const key = `${type}${seconds}`;
  let m = noiseCache.get(ctx);
  if (!m) { m = new Map(); noiseCache.set(ctx, m); }
  if (m.has(key)) return m.get(key);
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    } else d[i] = w;
  }
  m.set(key, buf);
  return buf;
}

// Envelope helper: attack → exponential decay.
function env(ctx, gainNode, t, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function tone(ctx, out, { type = 'sine', freq, t = ctx.currentTime, peak = 0.3, attack = 0.005, decay = 0.5, glideTo = null, glideTime = 0.1 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + glideTime);
  env(ctx, g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + attack + decay + 0.05);
}
function noiseHit(ctx, out, { t = ctx.currentTime, peak = 0.3, decay = 0.05, filter = 'highpass', freq = 3000, q = 0.7, sweepTo = null }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 'white', 1);
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
  const g = ctx.createGain(); env(ctx, g, t, peak, 0.003, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t); s.stop(t + decay + 0.05);
}

export const SYNTHS = {
  chime: { name: 'Chime', play: (c, o) => { tone(c, o, { freq: 880, decay: 1.2, peak: 0.25 }); tone(c, o, { freq: 1320, decay: 0.9, peak: 0.12 }); } },
  bell: { name: 'Bell', play: (c, o) => { for (const [f, p, d] of [[660, 0.25, 1.6], [1584, 0.08, 1.1], [2376, 0.05, 0.7]]) tone(c, o, { freq: f, peak: p, decay: d }); } },
  ding: { name: 'Ding', play: (c, o) => tone(c, o, { type: 'triangle', freq: 1250, decay: 0.45, peak: 0.3 }) },
  pop: { name: 'Pop', play: (c, o) => tone(c, o, { freq: 620, glideTo: 180, glideTime: 0.09, decay: 0.12, peak: 0.45 }) },
  click: { name: 'Click', play: (c, o) => noiseHit(c, o, { decay: 0.018, peak: 0.5, freq: 2500 }) },
  tick: { name: 'Tick', play: (c, o) => tone(c, o, { type: 'square', freq: 2200, decay: 0.025, peak: 0.12 }) },
  blip: { name: 'Blip', play: (c, o) => tone(c, o, { freq: 1500, decay: 0.06, peak: 0.25 }) },
  coin: { name: 'Coin', play: (c, o) => { const t = c.currentTime; tone(c, o, { type: 'square', freq: 988, t, decay: 0.08, peak: 0.12 }); tone(c, o, { type: 'square', freq: 1319, t: t + 0.08, decay: 0.35, peak: 0.12 }); } },
  cash: { name: 'Cash register', play: (c, o) => { const t = c.currentTime; noiseHit(c, o, { t, decay: 0.08, peak: 0.35, filter: 'bandpass', freq: 4000, q: 2 }); tone(c, o, { freq: 1568, t: t + 0.05, decay: 0.9, peak: 0.2 }); tone(c, o, { freq: 2093, t: t + 0.05, decay: 0.7, peak: 0.12 }); } },
  whoosh: { name: 'Whoosh', play: (c, o) => noiseHit(c, o, { decay: 0.55, peak: 0.35, filter: 'bandpass', freq: 300, sweepTo: 3500, q: 1.2 }) },
  success: { name: 'Success', play: (c, o) => { const t = c.currentTime; [523.25, 659.25, 783.99].forEach((f, i) => tone(c, o, { freq: f, t: t + i * 0.09, decay: 0.5, peak: 0.2 })); } },
  fail: { name: 'Fail', play: (c, o) => { const t = c.currentTime; tone(c, o, { type: 'triangle', freq: 392, t, decay: 0.25, peak: 0.25 }); tone(c, o, { type: 'triangle', freq: 261.6, t: t + 0.22, decay: 0.5, peak: 0.25 }); } },
  alarm: { name: 'Alarm', play: (c, o) => { const t = c.currentTime; for (let i = 0; i < 4; i++) tone(c, o, { type: 'square', freq: i % 2 ? 660 : 880, t: t + i * 0.18, decay: 0.15, peak: 0.1 }); } },
  gong: { name: 'Gong', play: (c, o) => { for (const [f, p] of [[110, 0.35], [174, 0.18], [262, 0.1], [403, 0.06]]) tone(c, o, { freq: f, peak: p, attack: 0.02, decay: 3 }); } },
  levelup: { name: 'Level up', play: (c, o) => { const t = c.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(c, o, { type: 'triangle', freq: f, t: t + i * 0.06, decay: 0.25, peak: 0.18 })); } },
};

// Ambient beds: build(ctx, out) returns a stop() function.
export const AMBIENTS = {
  rain: { name: 'Rain', build(ctx, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 'pink', 4); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(bp).connect(lp).connect(g).connect(out); src.start();
    let alive = true;
    const drop = () => { if (!alive) return; noiseHit(ctx, out, { decay: 0.03, peak: 0.05 + Math.random() * 0.08, filter: 'bandpass', freq: 1500 + Math.random() * 3000, q: 4 }); setTimeout(drop, 40 + Math.random() * 220); };
    drop();
    return () => { alive = false; src.stop(); };
  } },
  ocean: { name: 'Ocean', build(ctx, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 'brown', 4); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.3;
    const lfo2 = ctx.createGain(); lfo2.gain.value = 500;
    lfo.connect(lfoGain).connect(g.gain); lfo.connect(lfo2).connect(lp.frequency);
    src.connect(lp).connect(g).connect(out); src.start(); lfo.start();
    return () => { src.stop(); lfo.stop(); };
  } },
  brown: { name: 'Brown noise', build(ctx, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 'brown', 4); src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.5; src.connect(g).connect(out); src.start();
    return () => src.stop();
  } },
  pink: { name: 'Pink noise', build(ctx, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 'pink', 4); src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0.35; src.connect(g).connect(out); src.start();
    return () => src.stop();
  } },
  lofi: { name: 'Lo-fi pad', build(ctx, out) {
    const chords = [[220, 261.6, 329.6, 392], [146.8, 174.6, 220, 261.6], [196, 246.9, 293.7, 349.2], [130.8, 164.8, 196, 246.9]];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out);
    let i = 0, alive = true, timer;
    const play = () => {
      if (!alive) return;
      const t = ctx.currentTime;
      for (const f of chords[i++ % chords.length]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
        o.connect(g).connect(lp); o.start(t); o.stop(t + 4.8);
      }
      for (let k = 0; k < 6; k++) noiseHit(ctx, out, { t: t + Math.random() * 4, decay: 0.01, peak: 0.02, freq: 4000 });
      timer = setTimeout(play, 4000);
    };
    play();
    return () => { alive = false; clearTimeout(timer); lp.disconnect(); };
  } },
  drone: { name: 'Space drone', build(ctx, out) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const oscs = [55, 55.4, 82.4].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 300;
    lfo.connect(lg).connect(lp.frequency); lfo.start();
    lp.connect(g).connect(out);
    return () => { oscs.forEach((o) => o.stop()); lfo.stop(); };
  } },
};

export class SoundEngine {
  // resolveFile(id) → Promise<Blob|null> for "local" sounds (extension frame only)
  constructor({ resolveFile = null } = {}) {
    this.resolveFile = resolveFile;
    this.ctx = null;
    this.volume = 0.7;
    this.ambientVolume = 0.35;
    this.ambientStop = null;
    this.ambientKey = null;
    this.played = 0;
    this.objectUrls = new Map();
  }

  _ctx() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      this.ambientGain = this.ctx.createGain(); this.ambientGain.gain.value = this.ambientVolume; this.ambientGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; if (this.ambientEl) this.ambientEl.volume = this._elVolume(); }
  setAmbientVolume(v) {
    this.ambientVolume = v;
    if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    if (this.ambientEl) this.ambientEl.volume = this._elVolume();
  }

  async _src(sound) {
    if (sound.kind === 'url') return sound.url;
    if (sound.kind === 'local' && this.resolveFile) {
      if (this.objectUrls.has(sound.id)) return this.objectUrls.get(sound.id);
      const blob = await this.resolveFile(sound.id);
      if (!blob) throw new Error('That sound file is no longer in TVSuite');
      const url = URL.createObjectURL(blob);
      this.objectUrls.set(sound.id, url);
      return url;
    }
    throw new Error('Unsupported sound');
  }

  // sound: { kind: 'synth', id } | { kind: 'local', id } | { kind: 'url', url }
  async play(sound, { volume = 1 } = {}) {
    if (!sound || sound.kind === 'none') return;
    const ctx = this._ctx();
    this.played++;
    this._duck();
    if (sound.kind === 'synth') {
      const s = SYNTHS[sound.id];
      if (!s) throw new Error(`Unknown sound ${sound.id}`);
      const g = ctx.createGain(); g.gain.value = Math.max(0, Math.min(2, volume)); g.connect(this.master);
      s.play(ctx, g);
      return;
    }
    const a = new Audio(await this._src(sound));
    a.volume = Math.max(0, Math.min(1, volume * this.volume));
    await a.play();
  }

  _duck() {
    if (!this.ambientGain || !this.ambientStop) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setTargetAtTime(this.ambientVolume * 0.3, t, 0.05);
    this.ambientGain.gain.setTargetAtTime(this.ambientVolume, t + 1.2, 0.4);
  }

  // source: null | { kind: 'gen', id } | { kind: 'local', id } | { kind: 'url', url }
  async setAmbient(source) {
    const key = source ? JSON.stringify(source) : null;
    if (key === this.ambientKey) return;
    this.ambientKey = key;
    this.ambientStop?.(); this.ambientStop = null;
    if (!source) return;
    const ctx = this._ctx();
    if (source.kind === 'gen') {
      const a = AMBIENTS[source.id];
      if (!a) throw new Error(`Unknown ambient ${source.id}`);
      this.ambientStop = a.build(ctx, this.ambientGain);
      return;
    }
    try {
      const el = new Audio(await this._src(source));
      el.loop = true;
      if (source.kind === 'url') {
        // Cross-origin links without CORS would be silent through WebAudio, so they play directly.
        this.ambientEl = el;
        el.volume = this._elVolume();
        await el.play();
        this.ambientStop = () => { el.pause(); el.removeAttribute('src'); el.load(); this.ambientEl = null; };
      } else {
        const node = ctx.createMediaElementSource(el);
        node.connect(this.ambientGain);
        await el.play();
        this.ambientStop = () => { el.pause(); el.removeAttribute('src'); el.load(); node.disconnect(); };
      }
    } catch (err) {
      this.ambientKey = null; // allow a retry
      throw err;
    }
  }

  _elVolume() { return Math.max(0, Math.min(1, this.volume * this.ambientVolume)); }
  ambientId() {
    if (!this.ambientKey || !this.ambientStop) return null;
    const s = JSON.parse(this.ambientKey);
    return s.kind === 'gen' ? `gen:${s.id}` : s.kind;
  }

  speak(text, { rate = 1, voice = '' } = {}) {
    const ss = globalThis.speechSynthesis;
    if (!ss || !text) return false;
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 200));
    u.rate = rate;
    u.volume = Math.min(1, this.volume + 0.2);
    const v = voice && ss.getVoices().find((x) => x.name === voice);
    if (v) u.voice = v;
    this._duck();
    ss.speak(u);
    this.played++;
    return true;
  }

  pauseAll(paused) { if (!this.ctx) return; if (paused) this.ctx.suspend(); else this.ctx.resume(); }

  // Renders every synth and ambient offline and returns peak/RMS levels (verifies sounds are audible).
  static async selfTest() {
    const out = {};
    for (const [id, s] of Object.entries(SYNTHS)) out[id] = await render((c, o) => s.play(c, o), 1.5);
    for (const [id, a] of Object.entries(AMBIENTS)) out[`ambient:${id}`] = await render((c, o) => a.build(c, o), 2);
    return out;
    async function render(fn, seconds) {
      const c = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100);
      const stop = fn(c, c.destination);
      const buf = await c.startRendering();
      try { stop?.(); } catch (_) { /* already finished */ }
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
    }
  }
}
