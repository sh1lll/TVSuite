// Upload frame (extension origin, embedded in the TVSuite panel). Files go straight into the extension's
// local IndexedDB — they never pass through the TradingView page and are never uploaded anywhere.
import { addMedia, makeThumb, ACCEPT_VISUAL, ACCEPT_AUDIO, isAudio } from './core/media-store.js';

const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token');
const kind = params.get('accept') === 'audio' ? 'audio' : 'visual';
const accept = kind === 'audio' ? ACCEPT_AUDIO : ACCEPT_VISUAL;
const $ = (id) => document.getElementById(id);
$('file').accept = accept;
$('title').textContent = kind === 'audio' ? 'Drop sounds or click to choose' : 'Drop an image, GIF or video';
$('hint').textContent = kind === 'audio' ? 'MP3 · WAV · OGG · M4A · FLAC — stored only in this browser' : 'MP4 · WebM · MOV · GIF · PNG · JPG · WebP · AVIF · SVG — stored only in this browser';

async function take(files) {
  const added = [];
  for (const f of files) {
    if (!accept.split(',').includes(f.type)) { status(`${f.name}: unsupported type ${f.type || 'unknown'}`, true); continue; }
    status(`Saving ${f.name}…`);
    try {
      const thumb = isAudio(f.type) ? null : await makeThumb(f);
      added.push(await addMedia(f, { thumb }));
    } catch (err) { status(`${f.name}: ${err.message}`, true); }
  }
  if (added.length) {
    status(`Added ${added.length} file${added.length > 1 ? 's' : ''}`);
    parent.postMessage({ tvsuite: 'upload', token, items: added }, '*');
  }
}
function status(text, err = false) { $('status').textContent = text; $('status').className = `status${err ? ' err' : ''}`; }

$('file').addEventListener('change', () => { take([...$('file').files]); $('file').value = ''; });
const zone = $('zone');
for (const ev of ['dragenter', 'dragover']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); });
zone.addEventListener('drop', (e) => take([...e.dataTransfer.files]));
