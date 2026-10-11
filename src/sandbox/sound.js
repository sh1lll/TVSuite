// Audio frame (extension origin, invisible, embedded in the chart tab). Plays TVSuite sounds and
// ambient beds, including the user's own files from extension storage. Driven only by postMessage.
import { SoundEngine } from '../modules/sound/engine.js';
import { getMedia } from '../core/media-store.js';

const token = new URLSearchParams(location.hash.slice(1)).get('token');
const engine = new SoundEngine({ resolveFile: async (id) => (await getMedia(id))?.blob || null });
const reply = (msg) => parent.postMessage({ tvsuite: 'audio', token, ...msg }, '*');

window.addEventListener('message', async (e) => {
  const m = e.data;
  if (e.source !== parent || !m || m.tvsuite !== 'audio-cmd' || !token || m.token !== token) return;
  try {
    switch (m.type) {
      case 'config':
        engine.setVolume(m.volume);
        engine.setAmbientVolume(m.ambientVolume);
        await engine.setAmbient(m.ambient || null);
        break;
      case 'play': await engine.play(m.sound, { volume: m.volume }); reply({ type: 'played', event: m.event || null }); break;
      case 'speak': engine.speak(m.text, { rate: m.rate, voice: m.voice }); reply({ type: 'spoke', text: m.text }); break;
      case 'pause': engine.pauseAll(m.paused); break;
      case 'voices': reply({ type: 'voices', voices: (globalThis.speechSynthesis?.getVoices() || []).map((v) => v.name) }); break;
      default: break;
    }
  } catch (err) {
    reply({ type: 'error', message: String(err.message || err) });
  }
});
// Test hook (extension frame only; the page cannot reach into this frame).
globalThis.__tvsSoundSelfTest = () => SoundEngine.selfTest();
globalThis.__tvsAmbient = () => engine.ambientId();
reply({ type: 'hello' });
