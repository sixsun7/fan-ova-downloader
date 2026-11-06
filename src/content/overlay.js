'use strict';

// Hover overlay on post media.

Fanova.resolveCurrentMedia = function () {
  if (Fanova.lastEvent) {
    const fresh = Fanova.findMediaNear(Fanova.lastEvent);
    if (fresh) {
      Fanova.currentMedia = fresh;
      return fresh;
    }
  }
  return Fanova.currentMedia;
}

Fanova.buildUi = function () {
  Fanova.overlay = document.createElement('div');
  Fanova.overlay.className = 'fanova-dl-overlay';
  (document.documentElement || document.body).appendChild(Fanova.overlay);

  const group = document.createElement('div');
  group.className = 'fanova-dl-group';
  Fanova.overlay.appendChild(group);

  Fanova.btnDownload = document.createElement('button');
  Fanova.btnDownload.className = 'fanova-dl-btn primary tooltip';
  Fanova.btnDownload.dataset.tooltip = 'Download original (Alt+D)';
  Fanova.btnDownload.innerHTML = Fanova.SVG.download;
  Fanova.btnDownload.setAttribute('aria-label', 'Download original image or video');
  Fanova.btnDownload.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const media = Fanova.resolveCurrentMedia();
    if (media) Fanova.downloadMedia(media);
  });

  Fanova.btnOpen = document.createElement('button');
  Fanova.btnOpen.className = 'fanova-dl-btn tooltip';
  Fanova.btnOpen.dataset.tooltip = 'Open original (Alt+O)';
  Fanova.btnOpen.innerHTML = Fanova.SVG.open;
  Fanova.btnOpen.setAttribute('aria-label', 'Open original in a new tab');
  Fanova.btnOpen.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const media = Fanova.resolveCurrentMedia();
    if (media) Fanova.openMedia(media);
  });

  group.append(Fanova.btnDownload, Fanova.btnOpen);
  Fanova.overlay._group = group;
}

Fanova.isFanovaMediaUrl = function (value) {
  if (!value) return false;
  if (value.startsWith('blob:')) return true;
  return value.includes('fbcdn.net') || value.includes('cdninstagram.com') ||
    value.includes('fanova') || value.includes('imagekit.io') ||
    value.includes('scontent') || value.includes('cloudfront') || value.includes('supabase') ||
    value.includes('fna.') || /\.(mp4|m4v|mov|webm|m3u8|mpd|jpg|jpeg|png|webp)(\?|#|$)/i.test(value);
}

Fanova.isVideoThumbnail = function (img) {
  if (!img || img.tagName !== 'IMG') return false;
  // Per-item wrapper (width:640px) — most precise, avoids carousel mix-ups
  const wrapper = img.closest('div[style*="width: 640px"]');
  if (wrapper) {
    if (wrapper.querySelector('svg.play-fill__svg-icon-phosphor') || wrapper.querySelector('svg[class*="play-fill"]')) {
      return true;
    }
    const style = wrapper.getAttribute('style') || '';
    if (style.includes('height: 360px') && wrapper.querySelector('div[style*="cursor: pointer"]')) {
      return true;
    }
  }
  let node = img.parentElement;
  for (let i = 0; i < 6 && node; i++) {
    if (node.querySelector && node.querySelector('svg.play-fill__svg-icon-phosphor')) {
      const r = node.getBoundingClientRect();
      if (r.width < 800 && r.height < 1200 && node.contains(img)) return true;
    }
    node = node.parentElement;
  }
  return false;
}

Fanova.findVideoIndicatorNear = function (img) {
  let n = img;
  for (let i = 0; i < 6 && n; i++) {
    if (n.querySelector && n.querySelector('svg.play-fill__svg-icon-phosphor')) return true;
    n = n.parentElement;
  }
  return false;
}

Fanova.isValidMedia = function (el) {
  if (el.closest && el.closest('.fanova-dl-post, .fanova-dl-post-backdrop')) return false;
  if (el.tagName === 'IMG') {
    const src = el.currentSrc || el.src || el.dataset.src || el.getAttribute('data-src') || '';
    if (!Fanova.isFanovaMediaUrl(src) || src.includes('icon') || src.includes('logo')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 50 && r.height < 50) return false;
    return true;
  }
  if (el.tagName === 'VIDEO') {
    const src = el.currentSrc || el.src || '';
    const sources = [src, ...Array.from(el.querySelectorAll('source')).map(s => s.src || '')];
    const poster = el.poster || el.getAttribute('poster') || '';
    if (sources.some(s => s && Fanova.isFanovaMediaUrl(s))) return true;
    if (poster && Fanova.isFanovaMediaUrl(poster)) return true;
    if (sources.some(s => s && s.startsWith('blob:'))) {
      const rect = el.getBoundingClientRect();
      return rect.width > 80 && rect.height > 80;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width > 120 && rect.height > 120) return true;
    return false;
  }
  return false;
}

Fanova.findMediaNear = function (e) {
  let node = e.target;
  for (let i = 0; i < 6 && node; i++) {
    if ((node.tagName === 'IMG' || node.tagName === 'VIDEO') && Fanova.isValidMedia(node)) return node;
    node = node.parentElement;
  }
  node = e.target;
  for (let i = 0; i < 15 && node && node !== document.body; i++) {
    if (node.querySelectorAll) {
      const all = node.querySelectorAll('img, video');
      for (const el of all) {
        if (el.tagName !== 'VIDEO' || !Fanova.isValidMedia(el)) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          return el;
        }
      }
      for (const el of all) {
        if (el.tagName !== 'IMG' || !Fanova.isValidMedia(el)) continue;
        if (!Fanova.isVideoThumbnail(el)) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          return el;
        }
      }
      for (const el of all) {
        if (!Fanova.isValidMedia(el)) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          return el;
        }
      }
    }
    node = node.parentElement;
  }
  const videos = [...document.querySelectorAll('video')].filter(Fanova.isValidMedia);
  if (videos.length === 1) {
    const r = videos[0].getBoundingClientRect();
    if (r.width > 200 && r.height > 200) return videos[0];
  }
  const allImgs = [...document.querySelectorAll('img')].filter(Fanova.isValidMedia).filter(Fanova.isVideoThumbnail);
  for (const el of allImgs) {
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return el;
  }
  return null;
}

Fanova.onMove = function (e) {
  Fanova.lastEvent = e;
  if (Fanova.rafPending) return;
  Fanova.rafPending = true;
  requestAnimationFrame(Fanova.processMove);
}

Fanova.processMove = function () {
  Fanova.rafPending = false;
  const e = Fanova.lastEvent;
  if (!e) return;
  if (Fanova.overlay.contains(e.target)) return;
  if (e.target && e.target.closest && e.target.closest('.fanova-dl-post-backdrop, .fanova-dl-collect')) {
    Fanova.scheduleHide();
    return;
  }
  const media = Fanova.findMediaNear(e);
  if (media) {
    if (Fanova.hideTimer) {
      clearTimeout(Fanova.hideTimer);
      Fanova.hideTimer = null;
    }
    Fanova.currentMedia = media;
    Fanova.showFor(media);
  } else {
    Fanova.scheduleHide();
  }
  Fanova.scheduleBadgeRefresh();
}

Fanova.scheduleHide = function () {
  if (Fanova.hideTimer) return;
  Fanova.hideTimer = setTimeout(() => {
    Fanova.hideTimer = null;
    if (!Fanova.isOverButtons()) Fanova.hideNow();
  }, 180);
}

Fanova.isOverButtons = function () {
  return Fanova.btnDownload.matches(':hover') || Fanova.btnOpen.matches(':hover') || Fanova.overlay._group.matches(':hover');
}

Fanova.showFor = function (media) {
  const rect = media.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return;
  const group = Fanova.overlay._group;
  let x = rect.right - 96;
  let y = rect.top + 8;
  x = Math.max(8, Math.min(x, window.innerWidth - 100));
  y = Math.max(8, Math.min(y, window.innerHeight - 50));
  group.style.left = x + 'px';
  group.style.top = y + 'px';
  const isVideoThumb = media.tagName === 'VIDEO' || Fanova.isVideoThumbnail(media) || (media.tagName === 'IMG' && Fanova.findVideoIndicatorNear(media));
  Fanova.btnDownload.dataset.tooltip = isVideoThumb ? 'Download original VIDEO (Alt+D)' : 'Download original image (Alt+D)';
  Fanova.btnOpen.dataset.tooltip = isVideoThumb ? 'Open original VIDEO (Alt+O)' : 'Open original image (Alt+O)';
  Fanova.btnDownload.style.background = isVideoThumb ? 'linear-gradient(135deg,#ff3b5c 0%,#9a00ff 100%)' : '';
  group.classList.add('visible');
}

Fanova.hideNow = function () {
  if (Fanova.overlay && Fanova.overlay._group) Fanova.overlay._group.classList.remove('visible');
  Fanova.currentMedia = null;
}
