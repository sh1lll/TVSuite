// WebCodecs recording engine with pre-roll: frames are encoded continuously (a keyframe every second) into
// a ring buffer; a clip starts at the newest keyframe at least `preRollSec` old and continues live. Chunks
// are muxed with their real timestamps into MP4 (H.264, via mp4-muxer) or WebM (VP9/VP8, via webm-muxer).
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';

const CANDIDATES = [
  { codec: 'avc1.42001f', mux: 'mp4', muxCodec: 'avc', mime: 'video/mp4', maxPixels: 1280 * 720 },  // Baseline 3.1
  { codec: 'avc1.4d0028', mux: 'mp4', muxCodec: 'avc', mime: 'video/mp4', maxPixels: 1920 * 1088 }, // Main 4.0
  { codec: 'avc1.640033', mux: 'mp4', muxCodec: 'avc', mime: 'video/mp4', maxPixels: 4096 * 2304 }, // High 5.1
  { codec: 'vp09.00.40.08', mux: 'webm', muxCodec: 'V_VP9', mime: 'video/webm', maxPixels: Infinity },
  { codec: 'vp8', mux: 'webm', muxCodec: 'V_VP8', mime: 'video/webm', maxPixels: Infinity },
];

export const webCodecsAvailable = () => typeof globalThis.VideoEncoder === 'function' && typeof globalThis.VideoFrame === 'function';

export async function pickEncoderConfig({ width, height, bitrate, fps }) {
  if (!webCodecsAvailable()) return null;
  for (const c of CANDIDATES) {
    if (width * height > c.maxPixels) continue;
    const config = { codec: c.codec, width, height, bitrate, framerate: fps, latencyMode: 'realtime', ...(c.muxCodec === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try { const r = await VideoEncoder.isConfigSupported(config); if (r.supported) return { ...c, config }; } catch (_) { /* try the next one */ }
  }
  return null;
}

export class RollingEncoder {
  constructor({ width, height, fps, bitrate, preRollSec }) {
    Object.assign(this, { width, height, fps, bitrate, preRollSec });
    this.ring = []; this.meta = null; this.clip = null; this.frames = 0; this.error = null;
  }
  async init() {
    this.pick = await pickEncoderConfig(this);
    if (!this.pick) throw new Error('No WebCodecs video encoder available');
    this.encoder = new VideoEncoder({ output: (chunk, meta) => this._out(chunk, meta), error: (e) => { this.error = e; } });
    this.encoder.configure(this.pick.config);
    return this;
  }
  get mime() { return this.pick?.mime; }
  // ts in microseconds (monotonic). Drops frames when the encoder falls behind.
  encode(source, ts) {
    if (!this.encoder || this.encoder.state !== 'configured' || this.encoder.encodeQueueSize > 4) return false;
    // A keyframe at least every second of real time (frame timers slow down under load), so pre-roll
    // can start within a second of the requested point.
    const key = this.lastKey == null || ts - this.lastKey >= 1e6;
    if (key) this.lastKey = ts;
    const frame = new VideoFrame(source, { timestamp: Math.round(ts) });
    try { this.encoder.encode(frame, { keyFrame: key }); } finally { frame.close(); }
    this.frames++;
    return true;
  }
  _out(chunk, meta) {
    if (meta?.decoderConfig) this.meta = meta;
    const item = { chunk, ts: chunk.timestamp, key: chunk.type === 'key' };
    if (this.clip) { this._mux(item); return; }
    this.ring.push(item);
    const keep = (this.preRollSec + 2) * 1e6;
    while (this.ring.length && this.ring[this.ring.length - 1].ts - this.ring[0].ts > keep) this.ring.shift();
  }
  _mux(item) {
    if (!this.clip.started) { if (!item.key) return; this.clip.started = true; this.clip.firstTs = item.ts; }
    this.clip.lastTs = item.ts;
    this.clip.muxer.addVideoChunk(item.chunk, this.clip.metaSent ? undefined : this.meta);
    this.clip.metaSent = true;
  }
  // Start a clip that begins up to preRollSec before `nowTs` (at a keyframe). Returns the clip start ts.
  startClip(nowTs) {
    const muxer = this.pick.mux === 'mp4'
      ? new Mp4Muxer({ target: new Mp4Target(), video: { codec: 'avc', width: this.width, height: this.height, frameRate: this.fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
      : new WebmMuxer({ target: new WebmTarget(), video: { codec: this.pick.muxCodec, width: this.width, height: this.height, frameRate: this.fps }, firstTimestampBehavior: 'offset' });
    this.clip = { muxer, started: false, metaSent: false, firstTs: null, lastTs: null };
    const from = nowTs - this.preRollSec * 1e6;
    const keys = this.ring.filter((x) => x.key);
    // Newest keyframe at or before the pre-roll point; else the oldest we have.
    const startKey = [...keys].reverse().find((k) => k.ts <= from) || keys[0] || null;
    if (startKey) for (const item of this.ring.filter((x) => x.ts >= startKey.ts)) this._mux(item);
    this.ring = [];
    return startKey ? startKey.ts : nowTs;
  }
  async stopClip() {
    await this.encoder.flush().catch(() => {});
    const clip = this.clip; this.clip = null;
    if (!clip?.started) return { blob: null, duration: 0, firstTs: null };
    clip.muxer.finalize();
    const buf = clip.muxer.target.buffer;
    return { blob: new Blob([buf], { type: this.pick.mime }), duration: (clip.lastTs - clip.firstTs) / 1e6 + 1 / this.fps, firstTs: clip.firstTs };
  }
  close() { try { this.encoder?.close(); } catch (_) { /* closed */ } this.encoder = null; this.ring = []; this.clip = null; }
}
