'use strict';

// Page-world and extension messages.

Fanova.listenApiMessages = function () {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data && e.data.__FANOVA_MEDIA__ && e.data.url) {
      const u = Fanova.clean(e.data.url);
      if (u) {
        Fanova.apiUrls.add(u);
        if (Fanova.isVideoUrl(u)) {
          const id = Fanova.extractIdFromUrl(u);
          if (id) Fanova.thumbToVideo.set(id, u);
          console.log('[Fanova Downloader] API video captured:', u);
        }
      }
    }
    if (e.data && e.data.__FANOVA_FEED__) {
      // Other JSON lists match the feed hook. Only the creator post list
      // has official Media.fileURL values for this page.
      const gated = Fanova.isCreatorProfileFeed(e.data.requestUrl);
      const incoming = Array.isArray(e.data.posts) ? e.data.posts.length : 0;
      if (gated) {
        const handle = String(Fanova.getCreator() || '').toLowerCase();
        if (Fanova.libraryHandle !== handle) {
          Fanova.libraryPosts.clear();
          Fanova.libraryHandle = handle;
        }
        Fanova.lastFeed = {
          requestUrl: e.data.requestUrl,
          pagination: e.data.pagination || null
        };
        const before = Fanova.libraryPosts.size;
        Fanova.ingestLibraryPosts(e.data.posts);
        console.log('[Fanova Downloader] feed: creator list, posts=' + incoming + ' ingested=' + (Fanova.libraryPosts.size - before) + ' library=' + Fanova.libraryPosts.size);
        Fanova.refreshOpenPostModal();
      } else if (incoming) {
        // Gate missed (renamed params, alternate screen). Attribute per post
        // by creator uuid so this page still resolves clean fileURLs,
        // without mixing in other creators.
        const uuid = Fanova.pageCreatorUuid();
        const matching = uuid ? e.data.posts.filter((p) => Fanova.postMatchesUuid(p, uuid)) : [];
        if (matching.length) {
          const before = Fanova.libraryPosts.size;
          Fanova.ingestLibraryPosts(matching);
          console.log('[Fanova Downloader] feed: unattributed list, posts=' + incoming + ' matched=' + matching.length + ' ingested=' + (Fanova.libraryPosts.size - before) + ' library=' + Fanova.libraryPosts.size);
          Fanova.refreshOpenPostModal();
        } else {
          const hasUuid = !!uuid;
          console.log('[Fanova Downloader] feed: ignored other list, posts=' + incoming +
            ' url=' + String(e.data.requestUrl || 'n/a').slice(0, 160) +
            ' hasUuid=' + hasUuid);
        }
      }
    }
    if (e.data && e.data.__FANOVA_NAV__) Fanova.onRouteChange();
    if (e.data && e.data.__FANOVA_COMMENT__ && e.data.key && e.data.ms) {
      const normKey = Fanova.normCommentKey(e.data.key);
      if (!Fanova.commentStamps.has(normKey)) {
        Fanova.commentStamps.set(normKey, e.data.ms);
        if (Fanova.commentStamps.size > 2000) {
          const first = Fanova.commentStamps.keys().next().value;
          Fanova.commentStamps.delete(first);
        }
        // Stamps often arrive after the sheet already rendered; repaint so
        // dates appear without requiring another mouse move or scroll.
        Fanova.scheduleBadgeRefresh();
      }
    }
    if (e.data && e.data.__FANOVA_POST_DATE__ && e.data.stem && e.data.ms) {
      const stem = String(e.data.stem).toLowerCase();
      if (!Fanova.postStamps.has(stem)) {
        Fanova.postStamps.set(stem, e.data.ms);
        if (Fanova.postStamps.size > 4000) {
          const first = Fanova.postStamps.keys().next().value;
          Fanova.postStamps.delete(first);
        }
        Fanova.scheduleBadgeRefresh();
      }
    }
    if (e.data && e.data.__FANOVA_COLLECT_FETCH_DONE__) {
      const pending = Fanova.collectWaiters.get(e.data.requestId);
      if (pending) {
        Fanova.collectWaiters.delete(e.data.requestId);
        pending({ ok: !!e.data.ok, status: e.data.status, reason: e.data.reason });
      }
    }
  });
}

Fanova.listenExtensionMessages = function () {
  if (window !== window.top) return;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'COLLECT_LIBRARY') {
      Fanova.startCollectLibrary();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'COLLECT_CANCEL') {
      Fanova.cancelCollect();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'RESOLVE_SRC') {
      try {
        const url = Fanova.resolveOfficialFromSrc(message.srcUrl);
        sendResponse({ url: url || null, isVideo: !!(url && Fanova.isVideoUrl(url)) });
      } catch (err) {
        console.warn('[Fanova Downloader] resolve src failed', err);
        sendResponse({ url: null });
      }
    }
  });
}

Fanova.extractIdFromUrl = function (url) {
  try {
    const m = url.match(/\/fanova\/production\/users\/[^\/]+\/([^\.?&#\/]+)/i);
    if (m) return m[1].split('.')[0];
    const u = new URL(url);
    const seg = u.pathname.split('/').pop();
    if (seg) return seg.split('.')[0].slice(0, 20);
  } catch (err) {
    console.warn('[Fanova Downloader] failed to extract id from URL', err);
  }
  return null;
}

Fanova.onRouteChange = function () {
  const handle = String(Fanova.pathHandle() || '').toLowerCase();
  if (Fanova.libraryHandle && handle && Fanova.libraryHandle !== handle) {
    Fanova.libraryPosts.clear();
    Fanova.libraryHandle = null;
    Fanova.lastFeed = null;
  }
}
