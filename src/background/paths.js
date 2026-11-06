'use strict';

var DEFAULT_FOLDER = 'Fanova';

// Same rules as the content-script clean(): drop byte-range params only.
// Rebuilding with URL.toString() re-encodes ik-s and the signed path.
function cleanMediaUrl(src) {
  if (!src || typeof src !== 'string') return null;
  let raw = src.trim().replace(/&amp;/gi, '&');
  if (raw.startsWith('blob:')) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  const hashAt = raw.indexOf('#');
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const withoutHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const qAt = withoutHash.indexOf('?');
  if (qAt < 0) return withoutHash;
  const base = withoutHash.slice(0, qAt);
  const kept = withoutHash.slice(qAt + 1).split('&').filter((part) => {
    if (!part) return false;
    const name = part.split('=')[0].replace(/\+/g, ' ').toLowerCase();
    return name !== 'bytestart' && name !== 'byteend';
  });
  if (!kept.length) return base + hash;
  return base + '?' + kept.join('&') + hash;
}

function getExtension(url, isVideo) {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{3,4})$/i);
    if (m) return '.' + m[1].toLowerCase();
  } catch (err) {
    console.warn('[Fanova Downloader] failed to parse extension', err);
  }
  return isVideo ? '.mp4' : '.jpg';
}

function getCreator(tabUrl) {
  try {
    const m = new URL(tabUrl || '').pathname.match(/^\/(?:me\/|creators\/)?([^\/\?#]+)/);
    if (m && m[1]) return m[1].replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
  } catch (err) {
    console.warn('[Fanova Downloader] failed to parse creator', err);
  }
  return 'fanova';
}

function sanitizePathSegment(segment) {
  return String(segment || '')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/[<>:"|?*\x00-\x1f\\]/g, '_')
    .replace(/\.+$/g, '')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 60);
}

function sanitizeDownloadPath(filename) {
  const parts = String(filename || `${DEFAULT_FOLDER}/media`)
    .replace(/\\/g, '/')
    .split('/')
    .map(sanitizePathSegment)
    .filter((p) => p && p !== '.' && p !== '..');
  if (!parts.length) return `${DEFAULT_FOLDER}/media`;
  return parts.join('/');
}

async function getDownloadFolder() {
  try {
    const st = await chrome.storage.sync.get(['customFolder']);
    if (st.customFolder) {
      const folder = sanitizeDownloadPath(st.customFolder.replace(/\/+$/, ''));
      return folder || DEFAULT_FOLDER;
    }
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read custom folder', err);
  }
  return DEFAULT_FOLDER;
}

function getAssetTimestampMs(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').pop().split('.')[0] || '';
    const m = base.match(/^(\d{13})/);
    if (!m) return null;
    const ms = parseInt(m[1], 10);
    if (Number.isNaN(ms)) return null;
    if (ms < 1577836800000 || ms > 1893456000000) return null;
    return ms;
  } catch (err) {
    console.warn('[Fanova Downloader] failed to parse asset timestamp', err);
    return null;
  }
}

function formatFilenameTimestamp(ms) {
  try {
    const d = ms ? new Date(ms) : new Date();
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  } catch (err) {
    console.warn('[Fanova Downloader] failed to format timestamp', err);
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }
}

function getAssetId(url) {
  try {
    const u = new URL(url);
    return u.pathname.split('/').pop().split('.')[0].slice(0, 12) || '';
  } catch (err) {
    console.warn('[Fanova Downloader] failed to parse asset id', err);
    return '';
  }
}

function buildFilename(folder, creator, url, isVideo) {
  const ext = getExtension(url, isVideo);
  const ts = formatFilenameTimestamp(getAssetTimestampMs(url));
  const rand = Math.random().toString(36).slice(2, 6);
  const id = getAssetId(url);
  return sanitizeDownloadPath(`${folder}/${creator}/${ts}_${id || rand}${ext}`);
}
