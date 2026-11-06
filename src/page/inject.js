(() => {
  'use strict';

  // Runs in the page world so it can see Fanova's own fetch/XHR.
  // Captured media URLs are forwarded to the isolated content script.
  const found = new Set();
  let lastPerfIndex = 0;

  function isFanovaApiHost(hostname) {
    return hostname === 'fanova.com'
      || hostname.endsWith('.fanova.com')
      || hostname === 'fanova.io'
      || hostname.endsWith('.fanova.io');
  }

  function looksLikeFeedUrl(url) {
    if (!url) return false;
    const s = String(url).toLowerCase();
    if (s.includes('imagekit.io')) return false;
    return /post|feed|profile|media|content|timeline|creator|moment|gallery|library/.test(s);
  }

  function readPagination(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const current = typeof p.current === 'number' ? p.current : (typeof p.page === 'number' ? p.page : null);
    const pageSize = typeof p.pageSize === 'number' ? p.pageSize : (typeof p.page_size === 'number' ? p.page_size : null);
    let total = null;
    if (typeof p.total === 'number') total = p.total;
    else if (typeof p.totalCount === 'number') total = p.totalCount;
    else if (typeof p.total_count === 'number') total = p.total_count;
    if (current == null && pageSize == null && total == null) return null;
    let nextUrl = null;
    if (typeof p.nextUrl === 'string' && /^https?:\/\//i.test(p.nextUrl)) nextUrl = p.nextUrl;
    else if (typeof p.next_url === 'string' && /^https?:\/\//i.test(p.next_url)) nextUrl = p.next_url;
    else if (typeof p.next === 'string' && /^https?:\/\//i.test(p.next)) nextUrl = p.next;
    let cursor = null;
    if (typeof p.nextCursor === 'string') cursor = p.nextCursor;
    else if (typeof p.next_cursor === 'string') cursor = p.next_cursor;
    else if (typeof p.endCursor === 'string') cursor = p.endCursor;
    else if (typeof p.cursor === 'string') cursor = p.cursor;
    const hasNext = current != null && pageSize != null && total != null
      ? current * pageSize < total
      : p.hasNextPage === true || p.hasMore === true || p.has_more === true || p.hasNext === true;
    return { hasNext, cursor, nextUrl, page: current, current, pageSize, total };
  }

  // Profile feed pagination is { pagination: { current, pageSize, total } }.
  // Read that object only. A deep scan also matches unrelated totals inside posts.
  function extractPagination(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const direct = readPagination(obj.pagination);
    if (direct) return direct;
    return null;
  }

  function pickMediaList(post) {
    if (!post || typeof post !== 'object') return [];
    return post.Media || post.media || post.attachments || post.files || [];
  }

  function toCleanString(v) {
    return typeof v === 'string' && /^https?:\/\//i.test(v) ? v : null;
  }

  function postText(v, max) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t) return null;
    const cap = max || 2000;
    return t.length > cap ? t.slice(0, cap) : t;
  }

  function postNum(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  }

  function readPostCaption(post) {
    if (!post || typeof post !== 'object') return null;
    return postText(post.caption, 2000)
      || postText(post.description, 2000)
      || postText(post.text, 2000)
      || postText(post.body, 2000);
  }

  function readPostNumber(post, keys) {
    if (!post || typeof post !== 'object') return null;
    for (const key of keys) {
      const n = postNum(post[key]);
      if (n != null) return n;
    }
    return null;
  }

  function readPostBool(post, keys) {
    if (!post || typeof post !== 'object') return null;
    for (const key of keys) {
      if (typeof post[key] === 'boolean') return post[key];
    }
    return null;
  }

  function readPostPrice(post) {
    if (!post || typeof post !== 'object') return null;
    const vault = post.vault && typeof post.vault === 'object' && !Array.isArray(post.vault) ? post.vault : null;
    if (!vault) return null;
    const amount = postNum(vault.priceAmount);
    if (amount == null) return null;
    const symbol = typeof vault.currencySymbol === 'string' && vault.currencySymbol.trim()
      ? vault.currencySymbol.trim().slice(0, 8)
      : (typeof vault.currency === 'string' ? vault.currency.trim().slice(0, 12) : null);
    return { amount, symbol };
  }

  function extractLibraryPosts(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const out = [];
    const candidates = [];
    if (Array.isArray(payload.data)) candidates.push(payload.data);
    if (Array.isArray(payload.posts)) candidates.push(payload.posts);
    if (Array.isArray(payload.items)) candidates.push(payload.items);
    if (!candidates.length) {
      const stack = [payload];
      const visited = new WeakSet();
      let steps = 0;
      while (stack.length && steps < 120 && !candidates.length) {
        steps += 1;
        const cur = stack.pop();
        if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
        visited.add(cur);
        for (const k in cur) {
          const v = cur[k];
          if (Array.isArray(v) && v.length && typeof v[0] === 'object' && !Array.isArray(v[0])) {
            const sample = v[0];
            if ('Media' in sample || 'media' in sample || ('caption' in sample && ('createdAt' in sample || 'created_at' in sample))) {
              candidates.push(v);
              break;
            }
          }
          if (v && typeof v === 'object') stack.push(v);
        }
      }
    }
    for (const list of candidates) {
      for (const post of list) {
        if (!post || typeof post !== 'object' || Array.isArray(post)) continue;
        if ('comment' in post && !('Media' in post) && !('media' in post)) continue;
        const mediaList = pickMediaList(post);
        if (!Array.isArray(mediaList) || !mediaList.length) continue;
        const media = [];
        for (const m of mediaList) {
          if (!m || typeof m !== 'object') continue;
          const fileURL = toCleanString(m.fileURL || m.fileUrl || m.url || m.src);
          const thumbnailURL = toCleanString(m.thumbnailURL || m.thumbnailUrl || m.thumbnail);
          const previewURL = toCleanString(m.previewImageURL || m.previewImageUrl || m.preview);
          if (!fileURL && !thumbnailURL && !previewURL) continue;
          media.push({
            type: typeof m.type === 'string' ? m.type : null,
            fileURL,
            thumbnailURL,
            previewURL
          });
          if (media.length >= 80) break;
        }
        if (!media.length) continue;
        let showPaid = null;
        try {
          if (post.metaData && typeof post.metaData.showPaidContent === 'boolean') showPaid = post.metaData.showPaidContent;
          else if (post.metadata && typeof post.metadata.showPaidContent === 'boolean') showPaid = post.metadata.showPaidContent;
          else if (typeof post.showPaidContent === 'boolean') showPaid = post.showPaidContent;
        } catch (err) {
          console.warn('[Fanova Downloader] failed to read showPaidContent', err);
          showPaid = null;
        }
        let userId = null;
        if (typeof post.userID === 'string') userId = post.userID;
        else if (typeof post.userId === 'string') userId = post.userId;
        else if (post.user && typeof post.user.id === 'string') userId = post.user.id;
        const rawDate = post.createdAt != null ? post.createdAt : (post.created_at != null ? post.created_at : null);
        const price = readPostPrice(post);
        out.push({
          id: typeof post.id === 'string' || typeof post.id === 'number' ? String(post.id) : null,
          createdAt: typeof rawDate === 'string' || typeof rawDate === 'number' ? rawDate : null,
          showPaidContent: showPaid,
          userId,
          caption: readPostCaption(post),
          likeCount: readPostNumber(post, ['likeCount', 'likesCount', 'likes', 'like_count', 'legacyLikeCount']),
          commentCount: readPostNumber(post, ['commentCount', 'commentsCount', 'comments', 'comment_count']),
          views: readPostNumber(post, ['views', 'viewCount', 'viewsCount', 'view_count']),
          isPinned: readPostBool(post, ['isPinned']),
          isExclusive: readPostBool(post, ['isExclusive']),
          priceAmount: price ? price.amount : null,
          priceSymbol: price ? price.symbol : null,
          media
        });
        if (out.length >= 100) return out;
      }
    }
    return out;
  }

  function countMediaHints(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    let count = 0;
    const stack = [obj];
    const visited = new WeakSet();
    let steps = 0;
    while (stack.length && steps < 400) {
      steps += 1;
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
      visited.add(cur);
      for (const k in cur) {
        const v = cur[k];
        if (typeof v === 'string' && v.includes('imagekit.io')) count += 1;
        else if (v && typeof v === 'object') stack.push(v);
      }
    }
    return count;
  }

  function emitFeed(requestUrl, method, payload) {
    if (!requestUrl || !looksLikeFeedUrl(requestUrl)) return;
    const pagination = extractPagination(payload);
    const mediaCount = countMediaHints(payload);
    const posts = extractLibraryPosts(payload);
    if (!pagination && mediaCount < 1 && !posts.length) return;
    try {
      window.postMessage({
        __FANOVA_FEED__: true,
        requestUrl,
        method: method || 'GET',
        pagination,
        mediaCount,
        posts
      }, location.origin);
    } catch (err) {
      console.warn('[Fanova Downloader] feed postMessage failed', err);
    }
  }

  function broadcast(url, meta) {
    if (!url || found.has(url)) return;
    if (!/^https?:\/\//i.test(url)) return;
    const lower = url.toLowerCase();
    const isImageKit = lower.includes('imagekit.io');
    const hasExt = /\.(mp4|m4v|mov|webm|m3u8|mpd|ts|m4s|jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url);
    const isMediaHint = lower.includes('fbcdn.net') || lower.includes('cdninstagram') || lower.includes('fanova') || lower.includes('scontent') || lower.includes('/v/t')
      || lower.includes('video') || lower.includes('media') || lower.includes('hls') || lower.includes('dash')
      || lower.includes('cloudfront') || lower.includes('amazonaws') || lower.includes('supabase');
    if (!isImageKit && !hasExt && !isMediaHint) {
      if (!(meta && meta.key && /url|src|source|uri|path/i.test(meta.key))) return;
    }
    found.add(url);
    try {
      // Same-window delivery to the content script. Origin must match the page
      // (fanova.com); '*' would leak URLs to unexpected frames.
      window.postMessage({ __FANOVA_MEDIA__: true, url, meta: meta || null }, location.origin);
    } catch (err) {
      console.warn('[Fanova Downloader] postMessage failed', err);
    }
  }

  // Comment timestamps have no ImageKit URL to read a date from, so capture
  // the API's own created_at per comment and match it in the content script by author + text.
  const commentSeen = new Set();

  function normCommentText(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function parseStampMs(v) {
    if (typeof v === 'number') {
      if (v >= 1577836800000 && v <= 1893456000000) return v;
      if (v >= 1577836800 && v <= 1893456000) return v * 1000;
      return null;
    }
    if (typeof v !== 'string' || !v) return null;
    if (/^\d{10}$/.test(v)) return parseInt(v, 10) * 1000;
    if (/^\d{13}$/.test(v)) {
      const ms = parseInt(v, 10);
      if (ms >= 1577836800000 && ms <= 1893456000000) return ms;
      return null;
    }
    const ms = Date.parse(v);
    if (Number.isNaN(ms)) return null;
    if (ms < 1577836800000 || ms > 1893456000000) return null;
    return ms;
  }

  function emitCommentStamp(key, ms) {
    if (commentSeen.has(key)) return;
    commentSeen.add(key);
    if (commentSeen.size > 3000) {
      const first = commentSeen.values().next().value;
      commentSeen.delete(first);
    }
    window.postMessage({ __FANOVA_COMMENT__: true, key, ms }, location.origin);
  }

  function collectAuthorVariants(obj) {
    const out = [];
    const push = (v) => {
      if (typeof v !== 'string') return;
      const t = v.trim();
      if (!t || t.length > 80) return;
      if (!out.includes(t)) out.push(t);
    };
    for (const k in obj) {
      const v = obj[k];
      if (v == null) continue;
      const lk = k.toLowerCase();
      if (typeof v === 'string' && /(^|_)(username|display_name|displayname|handle|name)$/.test(lk)) {
        push(v);
      } else if (typeof v === 'object' && /author|user|profile|account|member|commenter|creator/.test(lk)) {
        for (const k2 in v) {
          if (typeof v[k2] === 'string' && /(^|_)(username|display_name|displayname|handle|name)$/.test(k2.toLowerCase())) {
            push(v[k2]);
          }
        }
      }
    }
    return out;
  }

  function tryCommentStamp(obj) {
    try {
      // Fast path for Fanova's own shape:
      // { createdAt, comment, user: { name, handle } } inside { data: [...] }.
      // createdAt is ISO, comment is the full body, user carries both display
      // name and handle because the page may render either one.
      let ms = null;
      let msFallback = null;
      let text = null;
      for (const k in obj) {
        const v = obj[k];
        const lk = k.toLowerCase();
        if ((lk === 'createdat' || lk === 'created_at') && ms == null) {
          ms = parseStampMs(v);
        } else if (/inserted_at|published_at|posted_at|commented_at|timestamp/.test(lk) && msFallback == null) {
          msFallback = parseStampMs(v);
        } else if (text == null && typeof v === 'string' && v.trim()) {
          if (lk === 'comment' || /(^|_)(body|text|content|message)$/.test(lk)) {
            text = v;
          }
        }
        if (ms != null && text != null) break;
      }
      // Generic fallback for unknown shapes keeps the old broad matchers.
      if (text == null || (ms == null && msFallback == null)) {
        for (const k in obj) {
          const v = obj[k];
          const lk = k.toLowerCase();
          if (ms == null && msFallback == null && /created_at|createdat|inserted_at|published_at|posted_at|commented_at|timestamp/.test(lk)) {
            msFallback = parseStampMs(v);
          } else if (text == null && /(^|_)(body|text|content|message|comment)$/.test(lk) && typeof v === 'string' && v.trim()) {
            text = v;
          }
          if (text != null && msFallback != null) break;
        }
      }
      const stamp = ms != null ? ms : msFallback;
      if (stamp == null || !text) return;
      const authors = collectAuthorVariants(obj);
      if (!authors.length) return;
      const body = normCommentText(text);
      if (!body) return;
      for (const author of authors) {
        const key = normCommentText(author) + '\n' + body;
        emitCommentStamp(key, stamp);
      }
    } catch (err) {
      console.warn('[Fanova Downloader] comment stamp scan failed', err);
    }
  }

  // Exact post dates come from the site's own post list
  // (GET /functions/v1/post/feed, /post/world): each item carries createdAt
  // plus a Media[] with fileURL / thumbnailURL / previewImageURL. Asset
  // filename timestamps are only an upload-time guess, and locked PPV posts
  // show no usable time row, so map each post's createdAt to its media URL
  // stems and match it in the content script by the rendered <img> src.
  const postSeen = new Set();

  function mediaStem(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/\/([^\/?#]+?)(?:\.[a-z0-9]{3,4})?(?:[?#]|$)/i);
    if (!m) return null;
    const stem = m[1].split('.')[0].toLowerCase();
    if (stem.length < 6) return null;
    return stem;
  }

  function emitPostStamp(stem, ms) {
    const key = stem + '\n' + ms;
    if (postSeen.has(key)) return;
    postSeen.add(key);
    if (postSeen.size > 4000) {
      const first = postSeen.values().next().value;
      postSeen.delete(first);
    }
    try {
      window.postMessage({ __FANOVA_POST_DATE__: true, stem, ms }, location.origin);
    } catch (err) {
      console.warn('[Fanova Downloader] post date postMessage failed', err);
    }
  }

  function collectMediaStems(obj) {
    const out = [];
    const stack = [obj];
    const visited = new WeakSet();
    let steps = 0;
    while (stack.length && steps < 120) {
      steps += 1;
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
      visited.add(cur);
      const items = Array.isArray(cur) ? cur : Object.values(cur);
      for (const v of items) {
        if (typeof v === 'string' && /^https?:\/\//i.test(v) && isMediaUrlLike(v)) {
          const stem = mediaStem(v);
          if (stem && !out.includes(stem)) out.push(stem);
        } else if (v && typeof v === 'object') {
          stack.push(v);
        }
      }
    }
    return out;
  }

  function isMediaUrlLike(url) {
    const l = url.toLowerCase();
    return l.includes('imagekit.io') || l.includes('fanova')
      || /\.(mp4|m4v|mov|webm|jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url);
  }

  function tryPostStamp(obj) {
    try {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      // Comments share createdAt but carry `comment` + `postID`; posts carry
      // `caption` and/or a Media[] plus creator/comment counters. The media
      // key spelling has varied, so accept the known alternatives.
      if ('comment' in obj) return;
      if (!('caption' in obj) && !('Media' in obj) && !('media' in obj)
        && !('attachments' in obj) && !('files' in obj)) return;
      let raw = null;
      if ('createdAt' in obj) raw = obj.createdAt;
      else if ('created_at' in obj) raw = obj.created_at;
      else return;
      const ms = parseStampMs(raw);
      if (ms == null) return;
      const stems = collectMediaStems(obj.Media || obj.media || obj.attachments || obj.files || obj);
      if (!stems.length) return;
      for (const stem of stems) emitPostStamp(stem, ms);
    } catch (err) {
      console.warn('[Fanova Downloader] post stamp scan failed', err);
    }
  }

  function scanJson(obj) {
    if (!obj || typeof obj !== 'object') return;
    const stack = [obj];
    const visited = new WeakSet();
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
      visited.add(cur);
      if (!Array.isArray(cur)) {
        tryCommentStamp(cur);
        tryPostStamp(cur);
      }
      for (const k in cur) {
        const v = cur[k];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
          const lk = k.toLowerCase();
          if (lk.includes('url') || lk.includes('src') || lk.includes('source') || lk.includes('uri') || lk.includes('path') || lk.includes('image') || lk.includes('video') || lk.includes('media') || lk.includes('thumbnail') || lk.includes('poster')) {
            broadcast(v, { key: k });
          } else if (v.includes('imagekit.io') || v.includes('fanova') || v.includes('fbcdn') || v.includes('cdninstagram') || /\.(mp4|m3u8|jpg|jpeg|png|webp)/i.test(v)) {
            broadcast(v, { key: k });
          } else if (v.length < 600 && (v.includes('ik-t=') || v.includes('token') || v.includes('signature'))) {
            broadcast(v, { key: k });
          }
        } else if (v && typeof v === 'object') {
          stack.push(v);
        }
      }
    }
  }

  // Supabase attaches apikey + Authorization on the page's own fetch.
  // A bare replay drops them and the next creator page comes back 401,
  // so the official file URLs for later pages never arrive. Kept here, in
  // the page world, and never forwarded to the content script or logged.
  let fanovaAuthHeaders = null;

  function rememberAuthHeaders(input, init) {
    try {
      const rawUrl = typeof input === 'string' ? input : (input && input.url);
      if (!rawUrl) return;
      const host = new URL(rawUrl, location.href).hostname;
      if (!isFanovaApiHost(host)) return;
      const headers = new Headers();
      if (input && typeof input !== 'string' && input.headers) {
        new Headers(input.headers).forEach((value, key) => headers.set(key, value));
      }
      if (init && init.headers) {
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      }
      const kept = {};
      for (const name of ['apikey', 'authorization', 'x-client-info']) {
        const value = headers.get(name);
        if (value) kept[name] = value;
      }
      if (kept.apikey || kept.authorization) fanovaAuthHeaders = kept;
    } catch (err) {
      console.warn('[Fanova Downloader] failed to read request headers', err);
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    rememberAuthHeaders(args[0], args[1]);
    const requestUrl = (() => {
      try {
        if (!args[0]) return null;
        return typeof args[0] === 'string' ? args[0] : args[0].url;
      } catch {
        return null;
      }
    })();
    const method = (() => {
      try {
        if (args[1] && args[1].method) return String(args[1].method).toUpperCase();
        if (args[0] && typeof args[0] !== 'string' && args[0].method) return String(args[0].method).toUpperCase();
      } catch {
        /* default GET */
      }
      return 'GET';
    })();
    try {
      if (requestUrl) broadcast(requestUrl);
    } catch (err) {
      console.warn('[Fanova Downloader] fetch URL capture failed', err);
    }
    const res = await origFetch.apply(this, args);
    try {
      const clone = res.clone();
      const ct = clone.headers.get('content-type') || '';
      if (ct.includes('json')) {
        clone.json().then((data) => {
          scanJson(data);
          emitFeed(requestUrl, method, data);
        }).catch((err) => { console.warn('[Fanova Downloader] response body was not JSON', err); });
      } else if (!/image|video|audio|octet-stream|pdf|zip|font|text|html|xml|css|javascript/i.test(ct)) {
        // Unknown or missing content-type: try JSON once so comment payloads
        // without a JSON header are still captured. Binary is excluded above
        // and text/* keeps its own single-consumer branch below.
        clone.json().then((data) => {
          if (data && typeof data === 'object') {
            scanJson(data);
            emitFeed(requestUrl, method, data);
          }
        }).catch((err) => { console.warn('[Fanova Downloader] response body was not JSON', err); });
      }
      if (ct.includes('text')) {
        clone.text().then(t => {
          let parsed = null;
          try { parsed = JSON.parse(t); } catch { parsed = null; }
          if (parsed) {
            scanJson(parsed);
            emitFeed(requestUrl, method, parsed);
          }
          const re = /https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8|mpd|jpg|jpeg|png|webp|mov|webm)[^"'\s<>]*/gi;
          let m;
          while ((m = re.exec(t)) !== null) broadcast(m[0]);
          const re2 = /https?:\/\/[^"'\s<>]*imagekit\.io[^"'\s<>]*/gi;
          while ((m = re2.exec(t)) !== null) broadcast(m[0]);
        }).catch((err) => { console.warn('[Fanova Downloader] response body was not JSON', err); });
      }
    } catch (err) {
      console.warn('[Fanova Downloader] fetch body scan failed', err);
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._fanova_url = url;
    this._fanova_method = method;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (ct.includes('json')) {
          try {
            const data = JSON.parse(this.responseText);
            scanJson(data);
            emitFeed(this._fanova_url, this._fanova_method, data);
          } catch { /* not JSON */ }
        }
      } catch (err) {
        console.warn('[Fanova Downloader] XHR body scan failed', err);
      }
      try { broadcast(this._fanova_url); } catch (err) {
        console.warn('[Fanova Downloader] XHR URL capture failed', err);
      }
      try { broadcast(this.responseURL); } catch (err) {
        console.warn('[Fanova Downloader] XHR responseURL capture failed', err);
      }
    });
    return origSend.apply(this, args);
  };

  setInterval(() => {
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = lastPerfIndex; i < entries.length; i++) {
        if (entries[i].name) broadcast(entries[i].name);
      }
      lastPerfIndex = entries.length;
    } catch (err) {
      console.warn('[Fanova Downloader] performance scan failed', err);
    }
  }, 1500);

  // Collect library: replay a GET the site already made (same cookies, Fanova hosts only).
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.__FANOVA_COLLECT_FETCH__ !== true) return;
    const requestId = e.data.requestId;
    const url = e.data.url;
    const method = String(e.data.method || 'GET').toUpperCase();
    const fail = (reason) => {
      window.postMessage({ __FANOVA_COLLECT_FETCH_DONE__: true, requestId, ok: false, reason }, location.origin);
    };
    if (method !== 'GET') {
      fail('only GET pagination is allowed');
      return;
    }
    let parsed;
    try {
      parsed = new URL(url, location.href);
    } catch {
      fail('bad url');
      return;
    }
    if (!isFanovaApiHost(parsed.hostname)) {
      fail('host not allowed');
      return;
    }
    if (!fanovaAuthHeaders) {
      console.warn('[Fanova Downloader] collect GET has no captured auth headers');
    }
    origFetch.call(window, parsed.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: fanovaAuthHeaders ? { ...fanovaAuthHeaders } : {}
    })
      .then(async (res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('json')) {
            const data = await res.json();
            scanJson(data);
            emitFeed(parsed.toString(), 'GET', data);
          }
        } catch (err) {
          console.warn('[Fanova Downloader] collect fetch parse failed', err);
        }
        window.postMessage({ __FANOVA_COLLECT_FETCH_DONE__: true, requestId, ok: res.ok, status: res.status }, location.origin);
      })
      .catch((err) => {
        console.warn('[Fanova Downloader] collect fetch failed', err);
        fail(String(err && err.message ? err.message : err));
      });
  });

  // Fanova is a client-side app. Full document loads are not the only way
  // the creator handle changes, and the content script does not see pushState.
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  function notifyNavigation() {
    try {
      window.postMessage({ __FANOVA_NAV__: true }, location.origin);
    } catch (err) {
      console.warn('[Fanova Downloader] nav postMessage failed', err);
    }
  }
  history.pushState = function (...args) {
    const result = origPushState.apply(this, args);
    notifyNavigation();
    return result;
  };
  history.replaceState = function (...args) {
    const result = origReplaceState.apply(this, args);
    notifyNavigation();
    return result;
  };
  window.addEventListener('popstate', notifyNavigation);
})();
