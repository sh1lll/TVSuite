// Turn the links people actually paste into direct media URLs a <video>/<img> can play. Pure logic.
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
const IMAGE_EXT = /\.(gif|png|jpe?g|webp|avif|svg|apng|bmp)(\?|#|$)/i;

export function mediaTypeOf(url) {
  if (/^data:video\//.test(url) || VIDEO_EXT.test(url)) return 'video';
  if (/^data:image\//.test(url) || IMAGE_EXT.test(url)) return 'image';
  return 'auto';
}

// Returns { url, type: 'video'|'image'|'auto', note? } or throws with a helpful message.
export function normalizeMediaLink(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('Paste a link to an image, GIF or video');
  if (/^http:\/\//i.test(raw)) raw = raw.replace(/^http:/i, 'https:');
  if (!/^https:\/\//i.test(raw)) throw new Error('Links must start with https://');
  let u;
  try { u = new URL(raw); } catch (_) { throw new Error('That does not look like a valid link'); }
  const host = u.hostname.replace(/^www\./, '');

  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) {
    throw new Error('YouTube pages can\'t be used as a background (no direct video file). Download the clip and add it as a file, or use a direct .mp4/.webm link.');
  }
  // giphy.com/gifs/some-name-ID  →  media.giphy.com/media/ID/giphy.mp4
  if (host === 'giphy.com') {
    const m = u.pathname.match(/\/(?:gifs|clips|stickers)\/(?:.*-)?([A-Za-z0-9]{6,})\/?$/);
    if (m) return { url: `https://media.giphy.com/media/${m[1]}/giphy.mp4`, type: 'video', note: 'Converted the Giphy page to its MP4' };
  }
  // i.imgur.com/abc.gifv  →  .mp4
  if (/(^|\.)imgur\.com$/.test(host) && /\.gifv$/i.test(u.pathname)) {
    return { url: `https://i.imgur.com${u.pathname.replace(/\.gifv$/i, '.mp4')}`, type: 'video', note: 'Converted .gifv to MP4' };
  }
  // Dropbox share links → raw file
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    u.searchParams.delete('dl'); u.searchParams.set('raw', '1');
    return { url: u.toString(), type: mediaTypeOf(u.pathname), note: 'Using the direct Dropbox file' };
  }
  // Google Drive file share → direct download
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/) || [null, u.searchParams.get('id')];
    if (m[1]) return { url: `https://drive.google.com/uc?export=download&id=${m[1]}`, type: 'auto', note: 'Using the direct Drive file (works for public files under ~100 MB)' };
  }
  // GitHub blob → raw
  if (host === 'github.com' && /\/blob\//.test(u.pathname)) {
    return { url: `https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}`, type: mediaTypeOf(u.pathname), note: 'Using the raw GitHub file' };
  }
  return { url: u.toString(), type: mediaTypeOf(u.pathname) };
}
