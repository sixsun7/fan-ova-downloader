'use strict';

// Startup. Loaded last, after every other content script.

Fanova.init = function () {
  try {
    Fanova.injectHook();
    Fanova.listenApiMessages();
    Fanova.listenExtensionMessages();
    Fanova.buildUi();
    if (window === window.top) {
      Fanova.buildCollectUi();
      Fanova.buildPostModalUi();
      Fanova.loadCollectVisibility();
      Fanova.listenCollectVisibilityChanges();
    }
    Fanova.enableRightClick();
    document.addEventListener('mousemove', Fanova.onMove, true);
    document.addEventListener('scroll', function () { Fanova.hideNow(); }, true);
    document.addEventListener('scroll', function () { Fanova.scheduleBadgeRefresh(); }, true);
    if (window === window.top) Fanova.startDateBadges();
    window.addEventListener('blur', function () { Fanova.hideNow(); });
    document.addEventListener('keydown', Fanova.onKey);
    console.log('[Fanova Downloader] active');
  } catch (err) {
    console.error('[Fanova Downloader] init failed:', err);
  }
}

Fanova.injectHook = function () {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('src/page/inject.js');
    s.onload = () => s.remove();
    (document.documentElement || document.head).appendChild(s);
  } catch (err) {
    console.error('[Fanova Downloader] failed to inject page hook', err);
  }
}

Fanova.onKey = function (e) {
  if (e.altKey && (e.key === 'd' || e.key === 'D') && Fanova.currentMedia) {
    e.preventDefault();
    Fanova.downloadMedia(Fanova.currentMedia);
  }
  if (e.altKey && (e.key === 'o' || e.key === 'O') && Fanova.currentMedia) {
    e.preventDefault();
    Fanova.openMedia(Fanova.currentMedia);
  }
  if (e.key === 'Escape' && Fanova.isPostModalOpen()) {
    e.preventDefault();
    e.stopPropagation();
    Fanova.closePostModal();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { Fanova.init(); }, { once: true });
} else {
  Fanova.init();
}
