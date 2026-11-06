'use strict';

// URL cleanup, filenames, and single-file download.

Fanova.extractUrl = async function (media) {
  const isVideo = media.tagName === 'VIDEO' || Fanova.isVideoThumbnail(media) || Fanova.findVideoIndicatorNear(media);
  const domSrc = media.currentSrc || media.src || media.dataset.src || media.getAttribute('data-src') || media.poster || '';

  console.log('[Fanova Downloader] extractUrl isVideo=', isVideo, 'media=', media.tagName, Fanova.fileStem(media.src || media.currentSrc || media.dataset.src || ''));

  if (isVideo) {
    let best = Fanova.resolveVideoFromSrc(domSrc);
    if (media.tagName === 'VIDEO') {
      const direct = Fanova.bestVideoUrl(media);
      if (direct && (!best || Fanova.qualityScore(direct) < Fanova.qualityScore(best))) best = direct;
    }
    // JSON fileURL for video is a q-50 transcode. One scoped play can capture
    // a fuller signed file for this same asset. Never take a sibling post.
    if (!best || Fanova.isImageKitTransform(best)) {
      const thumbId = Fanova.extractImageKitId(media);
      await Fanova.tryLazyLoadVideo(media, thumbId);
      const after = Fanova.resolveVideoFromSrc(domSrc);
      if (after && (!best || Fanova.qualityScore(after) < Fanova.qualityScore(best))) best = after;
    }
    if (best) return best;
    const thumbId = Fanova.extractImageKitId(media);
    console.warn('[Fanova Downloader] no video URL for thumbId', thumbId, 'captured:', [...Fanova.apiUrls].slice(-10));
    Fanova.notify('Video is not loaded yet. Click play, then download again.', true);
    return null;
  }

  const fromDom = Fanova.resolveImageFromSrc(domSrc);
  if (fromDom) return fromDom;
  const img = Fanova.bestImageUrl(media);
  if (img && img !== domSrc) {
    const fromBest = Fanova.resolveImageFromSrc(img);
    if (fromBest) return fromBest;
  }
  return null;
}

Fanova.findVideoUrlFromPerformanceForId = function (id) {
  try {
    const entries = performance.getEntriesByType('resource');
    for (let i = entries.length - 1; i >= 0; i--) {
      const n = entries[i].name || '';
      if (n.includes(id) && Fanova.isVideoUrl(n) && !n.includes('bytestart=')) return Fanova.clean(n);
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const n = entries[i].name || '';
      if (n.includes(id) && (n.includes('.mp4') || n.includes('.m3u8') || n.includes('video')) && !n.includes('bytestart=')) return Fanova.clean(n);
    }
  } catch (err) {
    console.warn('[Fanova Downloader] performance lookup failed', err);
  }
  return null;
}

Fanova.tryLazyLoadVideo = async function (media, thumbId) {
  try {
    const beforeVideos = new Set([...Fanova.apiUrls].filter(Fanova.isVideoUrl));
    const wrapper = Fanova.findVideoWrapper(media);
    if (!wrapper) return null;
    const playBtn = wrapper.querySelector('svg.play-fill__svg-icon-phosphor')?.closest('div')?.parentElement || wrapper.querySelector('div[style*="cursor: pointer"]');
    let clickable = null;
    let n = media;
    for (let i = 0; i < 6 && n; i++) {
      const cand = n.parentElement?.querySelector('div[style*="cursor: pointer"]');
      if (cand) {
        clickable = cand;
        break;
      }
      n = n.parentElement;
    }
    const target = clickable || playBtn || wrapper;
    if (!target) return null;

    console.log('[Fanova Downloader] lazy-load: clicking play for thumbId', thumbId);
    const before = performance.getEntriesByType('resource').length;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise(r => setTimeout(r, 2200));

    if (thumbId && Fanova.thumbToVideo.has(thumbId)) return Fanova.thumbToVideo.get(thumbId);

    const newVideos = [...Fanova.apiUrls].filter(u => Fanova.isVideoUrl(u) && !beforeVideos.has(u));
    if (newVideos.length) {
      console.log('[Fanova Downloader] lazy-load new videos:', newVideos);
      const withId = newVideos.find(u => thumbId && u.includes(thumbId));
      if (withId) return withId;
    }

    const perfEntries = performance.getEntriesByType('resource');
    const newPerf = perfEntries.slice(before);
    for (let i = newPerf.length - 1; i >= 0; i--) {
      const name = newPerf[i].name || '';
      if (thumbId && name.includes(thumbId) && Fanova.isVideoUrl(name) && !name.includes('bytestart=')) return Fanova.clean(name);
    }
    for (const u of [...Fanova.apiUrls].reverse()) {
      if (thumbId && u.includes(thumbId) && Fanova.isVideoUrl(u)) return u;
    }
    return thumbId ? Fanova.findVideoUrlFromPerformanceForId(thumbId) : null;
  } catch (err) {
    console.warn('[Fanova Downloader] lazy load error', err);
    return null;
  }
}

Fanova.findVideoWrapper = function (media) {
  let n = media;
  for (let i = 0; i < 10 && n; i++) {
    if (n.querySelector && n.querySelector('svg.play-fill__svg-icon-phosphor')) return n;
    n = n.parentElement;
  }
  return media.parentElement;
}

Fanova.isVideoUrl = function (u) {
  if (!u) return false;
  const path = u.split('?')[0].split('#')[0].toLowerCase();
  // A poster jpg can share its folder with the mp4. The image is not the video.
  if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(path)) return false;
  // Match the extension at the end of the path: substring checks misfire on
  // names like manifest.webmanifest (contains ".webm").
  if (/\.(mp4|m4v|mov|webm|m3u8|mpd)$/i.test(path)) return true;
  const l = u.toLowerCase();
  return l.includes('/video') || l.includes('video/');
}

Fanova.extractImageKitId = function (media) {
  try {
    const src = media.currentSrc || media.src || media.getAttribute('src') || media.poster || '';
    return Fanova.fileStem(src);
  } catch (err) {
    console.warn('[Fanova Downloader] failed to extract ImageKit id', err);
  }
  return null;
}

Fanova.bestImageUrl = function (img) {
  const entries = [];
  if (img.srcset) {
    img.srcset.split(',').forEach(s => {
      const parts = s.trim().split(/\s+/);
      const u = parts[0];
      const w = parts[1] ? parseInt(parts[1].replace(/[wx]/g, ''), 10) : 0;
      if (u) entries.push({ u, w });
    });
  }
  [img.currentSrc, img.src, img.dataset.src, img.getAttribute('data-src')].forEach(u => {
    if (u) entries.push({ u, w: Fanova.getUrlWidth(u) });
  });
  const pic = img.closest('picture');
  if (pic) {
    pic.querySelectorAll('source').forEach(s => {
      if (s.srcset) {
        s.srcset.split(',').forEach(p => {
          const u = p.trim().split(/\s+/)[0];
          if (u) entries.push({ u, w: 0 });
        });
      }
      if (s.src) entries.push({ u: s.src, w: 0 });
    });
  }
  entries.sort((a, b) => b.w - a.w);
  for (const e of entries) {
    const c = Fanova.clean(e.u);
    if (c) return c;
  }
  return Fanova.clean(img.src);
}

Fanova.bestVideoUrl = function (video) {
  const direct = [];
  if (video.currentSrc && !video.currentSrc.startsWith('blob:')) direct.push(video.currentSrc);
  if (video.src && !video.src.startsWith('blob:')) direct.push(video.src);
  video.querySelectorAll('source').forEach(s => {
    if (s.src && !s.src.startsWith('blob:')) direct.push(s.src);
  });
  for (const u of direct) {
    if (u.includes('fbcdn') || u.includes('cdninstagram') || u.includes('fanova') || u.includes('.mp4')) return Fanova.clean(u);
  }
  return null;
}

Fanova.getUrlWidth = function (url) {
  try {
    const u = new URL(url);
    const w = u.searchParams.get('w') || u.searchParams.get('width');
    if (w) {
      const n = parseInt(w, 10);
      if (!Number.isNaN(n)) return n;
    }
    const m = /(?:^|[\/_-])(\d{3,4})(?:x\d{3,4})?(?=[._-]|$)/.exec(u.pathname);
    if (m) return parseInt(m[1], 10);
    return 0;
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read url width', err);
    return 0;
  }
}

Fanova.clean = function (url) {
  if (!url || typeof url !== 'string') return null;
  let raw = url.trim().replace(/&amp;/gi, '&');
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

Fanova.pathHandle = function () {
  const m = location.pathname.match(/^\/(?:me\/|creators\/)?([^/?#]+)/);
  if (!m || !m[1]) return null;
  let handle = m[1];
  try {
    handle = decodeURIComponent(handle);
  } catch (err) {
    console.warn('[Fanova Downloader] failed to decode creator handle', err);
  }
  if (Fanova.RESERVED_PATHS.includes(handle.toLowerCase())) return null;
  return handle;
}

Fanova.getCreator = function () {
  const fromPath = Fanova.pathHandle();
  if (fromPath) return fromPath;
  const og = document.querySelector('meta[property="og:url"]');
  if (og && og.content) {
    const mm = og.content.match(/fanova\.com\/([^/?#]+)/);
    if (mm && mm[1] && !Fanova.RESERVED_PATHS.includes(mm[1].toLowerCase())) return mm[1];
  }
  return 'fanova';
}

Fanova.getAssetTimestampMs = function (url) {
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

Fanova.mediaStem = function (url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').pop() || '';
    const base = seg.split('.')[0] || '';
    if (base.length < 6) return null;
    return base.toLowerCase();
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read media stem', err);
    return null;
  }
}

Fanova.findPostMsForSrc = function (src) {
  const stem = Fanova.mediaStem(src);
  if (stem && Fanova.postStamps.has(stem)) return { ms: Fanova.postStamps.get(stem), exact: true };
  return { ms: Fanova.getAssetTimestampMs(src), exact: false };
}

Fanova.formatFilenameTimestamp = function (ms) {
  try {
    const d = ms ? new Date(ms) : new Date();
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  } catch (err) {
    console.warn('[Fanova Downloader] failed to format timestamp', err);
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }
}

Fanova.getMediaFallbackUrl = function (media) {
  try {
    if (!media) return null;
    if (media.tagName === 'VIDEO') {
      const poster = media.poster || media.getAttribute('poster');
      if (poster) return poster;
    }
    const src = media.currentSrc || media.src || media.dataset.src || media.getAttribute('data-src');
    return src || null;
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read fallback URL', err);
    return null;
  }
}

Fanova.buildFilename = function (url, isVideo, fallbackUrl) {
  const creator = Fanova.sanitize(Fanova.getCreator());
  const ext = Fanova.getExt(url, isVideo);
  const ts = Fanova.formatFilenameTimestamp(Fanova.getAssetTimestampMs(url) || Fanova.getAssetTimestampMs(fallbackUrl));
  const rand = Math.random().toString(36).slice(2, 6);
  let id = '';
  try {
    const u = new URL(url);
    id = u.pathname.split('/').pop().split('.')[0].slice(0, 12);
  } catch {
    id = '';
  }
  if (!id && fallbackUrl) {
    try {
      const f = new URL(fallbackUrl);
      id = f.pathname.split('/').pop().split('.')[0].slice(0, 12);
    } catch {
      /* keep empty, rand fallback below */
    }
  }
  const name = `${ts}_${id || rand}${ext}`;
  return `${Fanova.DEFAULT_FOLDER}/${creator}/${name}`;
}

Fanova.sanitize = function (s) {
  return s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'fanova';
}

Fanova.getExt = function (url, isVideo) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]{3,4})$/i);
    if (m) return '.' + m[1].toLowerCase();
  } catch {
    /* fall through to default */
  }
  return isVideo ? '.mp4' : '.jpg';
}

Fanova.downloadMedia = async function (media) {
  Fanova.setLoading(true);
  try {
    const url = await Fanova.extractUrl(media);
    const isVideoThumb = media.tagName === 'VIDEO' || Fanova.isVideoThumbnail(media) || Fanova.findVideoIndicatorNear(media);
    if (!url) {
      if (isVideoThumb) {
        Fanova.notify('Could not extract the VIDEO. Click play and try again.', true);
        console.warn('[Fanova Downloader] video extract failed. apiUrls:', [...Fanova.apiUrls]);
      } else {
        Fanova.notify('Could not extract the original URL', true);
      }
      return;
    }
    const isVideo = isVideoThumb || /\.mp4|\.m3u8|\.mpd/i.test(url);
    let folder = Fanova.DEFAULT_FOLDER;
    try {
      const st = await chrome.storage.sync.get(['customFolder']);
      if (st.customFolder) folder = st.customFolder.replace(/\/+$/, '');
    } catch (err) {
      console.warn('[Fanova Downloader] failed to read custom folder', err);
    }
    let filename = Fanova.buildFilename(url, isVideo, Fanova.getMediaFallbackUrl(media));
    if (folder !== Fanova.DEFAULT_FOLDER) {
      filename = filename.replace(new RegExp('^' + Fanova.DEFAULT_FOLDER + '/'), folder + '/');
    }
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', url, filename }, (resp) => {
      if (chrome.runtime.lastError) {
        Fanova.notify('Error: ' + chrome.runtime.lastError.message, true);
      } else if (resp && resp.success) {
        Fanova.notify('Download started → ' + filename + (Fanova.isWatermarkedUrl(url) ? ' (watermarked file)' : ''), false);
      } else {
        Fanova.notify(resp?.error || 'Download failed', true);
      }
    });
  } catch (err) {
    console.error('[Fanova Downloader] download failed', err);
    Fanova.notify('Download failed', true);
  } finally {
    Fanova.setLoading(false);
  }
}

Fanova.openMedia = function (media) {
  Fanova.btnOpen.classList.add('loading');
  Fanova.btnOpen.innerHTML = Fanova.SVG.spinner;
  Fanova.extractUrl(media).then(url => {
    if (!url) {
      Fanova.notify('Could not extract the URL', true);
      Fanova.resetOpen();
      return;
    }
    chrome.runtime.sendMessage({ type: 'OPEN_ORIGINAL', url });
    Fanova.notify(Fanova.isWatermarkedUrl(url) ? 'Opening watermarked original (server-issued)…' : 'Opening original…', false);
    Fanova.resetOpen();
  }).catch((err) => {
    console.error('[Fanova Downloader] open failed', err);
    Fanova.notify('Failed to extract URL', true);
    Fanova.resetOpen();
  });
}

Fanova.setLoading = function (v) {
  if (v) {
    Fanova.btnDownload.classList.add('loading');
    Fanova.btnDownload.innerHTML = Fanova.SVG.spinner;
  } else {
    setTimeout(() => {
      Fanova.btnDownload.classList.remove('loading');
      Fanova.btnDownload.innerHTML = Fanova.SVG.download;
    }, 400);
  }
}

Fanova.resetOpen = function () {
  setTimeout(() => {
    Fanova.btnOpen.classList.remove('loading');
    Fanova.btnOpen.innerHTML = Fanova.SVG.open;
  }, 400);
}

Fanova.enableRightClick = function () {
  document.addEventListener('contextmenu', (e) => {
    if (Fanova.findMediaNear(e)) e.stopPropagation();
  }, true);
}

Fanova.notify = function (msg, isError) {
  const old = document.querySelector('.fanova-dl-notification');
  if (old) old.remove();
  const n = document.createElement('div');
  n.className = 'fanova-dl-notification';
  n.textContent = msg;
  n.style.background = isError ? 'rgba(237,73,86,0.95)' : 'rgba(0,149,246,0.95)';
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.opacity = '0';
    n.style.transform = 'translateY(8px)';
    setTimeout(() => n.remove(), 250);
  }, 2800);
}

Fanova.sleep = function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Fanova.isTopFrame = function () {
  return window === window.top;
}

Fanova.isCreatorPage = function () {
  return !!Fanova.pathHandle();
}
