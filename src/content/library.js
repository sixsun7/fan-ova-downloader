'use strict';

// Captured post list and official file URLs.

const reportedStems = new Set();

Fanova.pageCreatorUuid = function () {
  try {
    const el = document.getElementById('fanova-profile-preview');
    if (!el) return null;
    const data = JSON.parse(el.textContent || '{}');
    const re = /\/users\/([a-f0-9-]{36})\//i;
    for (const cand of [data.avatarUrl, data.bannerUrl]) {
      if (typeof cand !== 'string') continue;
      const m = cand.match(re);
      if (m) return m[1].toLowerCase();
    }
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read profile preview uuid', err);
  }
  return null;
}

Fanova.postMatchesUuid = function (post, uuid) {
  if (!post || typeof post !== 'object' || !uuid) return false;
  if (typeof post.userId === 'string' && post.userId.toLowerCase() === uuid) return true;
  const mediaList = Array.isArray(post.media) ? post.media : [];
  for (const media of mediaList) {
    for (const url of Fanova.mediaUrlList(media)) {
      if (url.toLowerCase().includes(uuid)) return true;
    }
  }
  return false;
}

Fanova.dominantUserId = function () {
  const counts = new Map();
  const bump = (id) => counts.set(id, (counts.get(id) || 0) + 1);
  const re = /\/users\/([a-f0-9-]{36})\//gi;
  for (const u of Fanova.apiUrls) {
    re.lastIndex = 0;
    const m = re.exec(u);
    if (m) bump(m[1]);
  }
  document.querySelectorAll('img, video').forEach((el) => {
    const src = el.currentSrc || el.src || '';
    re.lastIndex = 0;
    const m = re.exec(src);
    if (m) bump(m[1]);
  });
  let best = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

Fanova.stemKey = function (url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/tr:[^/]+/gi, '');
    const file = path.split('/').pop() || '';
    const stem = (file.split('.')[0] || '').toLowerCase();
    if (stem.length < 6) return null;
    const parent = path.slice(0, Math.max(0, path.length - file.length)).toLowerCase();
    return parent + stem;
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read stem key', err);
    return null;
  }
}

Fanova.fileStem = function (url) {
  const key = Fanova.stemKey(url);
  if (!key) return null;
  const slash = key.lastIndexOf('/');
  return slash >= 0 ? key.slice(slash + 1) : key;
}

Fanova.libraryAssetKey = function (url) {
  const stem = Fanova.stemKey(url);
  if (!stem) return url;
  // Poster jpg and video mp4 often share a stem. Keep them as two files.
  const kind = Fanova.isVideoUrl(url) ? 'v' : 'i';
  return stem + '/' + kind;
}

Fanova.isImageKitTransform = function (url) {
  return /\/tr:[^/]+\//.test(url);
}

Fanova.isLibraryCandidate = function (url, userId) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (url.includes('bytestart=')) return false;
  if (/\.(m3u8|mpd|ts|m4s)(\?|#|$)/i.test(url)) return false;
  if (/\/(icon|logo|emoji|badge)(\/|$)/i.test(url)) return false;
  // Vault paths carry no creator uuid, so an unattributed vault URL cannot
  // be tied to this profile. Vault files enter the library only through
  // their owning post (see push fromPost below), never via raw captures.
  if (userId && !url.toLowerCase().includes(userId.toLowerCase())) return false;
  if (!Fanova.isFanovaMediaUrl(url)) return false;
  return true;
}

Fanova.isCreatorProfileFeed = function (url) {
  try {
    const u = new URL(url, location.href);
    const host = u.hostname;
    const hostOk = host === 'fanova.com' || host.endsWith('.fanova.com')
      || host === 'fanova.io' || host.endsWith('.fanova.io');
    if (!hostOk) return false;
    if (!u.pathname.includes('/post/feed')) return false;
    if (u.searchParams.get('screenName') !== 'creatorProfile') return false;
    const handle = (u.searchParams.get('handle') || '').toLowerCase();
    const creator = String(Fanova.getCreator() || '').toLowerCase();
    if (!handle || !creator || creator === 'fanova') return false;
    return handle === creator;
  } catch (err) {
    console.warn('[Fanova Downloader] profile feed check failed', err);
    return false;
  }
}

Fanova.postStoreKey = function (post) {
  if (!post || typeof post !== 'object') return null;
  if (post.id != null && String(post.id)) return String(post.id);
  const media = post.media && post.media[0];
  const url = media && (media.fileURL || media.previewURL || media.thumbnailURL);
  return url ? 'nokey-' + url : null;
}

Fanova.postRank = function (post) {
  let best = 999;
  let count = 0;
  const mediaList = Array.isArray(post && post.media) ? post.media : [];
  for (const media of mediaList) {
    count += 1;
    const url = Fanova.pickOfficialMediaUrl(media);
    const score = url ? Fanova.qualityScore(url) : 500;
    if (score < best) best = score;
  }
  return {
    locked: post && post.showPaidContent === false ? 1 : 0,
    best,
    count
  };
}

Fanova.postMetaScore = function (post) {
  if (!post || typeof post !== 'object') return 0;
  let score = 0;
  if (typeof post.caption === 'string' && post.caption.trim()) score += 1;
  if (typeof post.likeCount === 'number') score += 1;
  if (typeof post.commentCount === 'number') score += 1;
  if (typeof post.views === 'number') score += 1;
  return score;
}

Fanova.shouldReplacePost = function (prev, next) {
  if (!prev) return true;
  if (!next) return false;
  const a = Fanova.postRank(prev);
  const b = Fanova.postRank(next);
  if (a.locked !== b.locked) return b.locked < a.locked;
  if (a.best !== b.best) return b.best < a.best;
  if (b.count !== a.count) return b.count > a.count;
  return Fanova.postMetaScore(next) > Fanova.postMetaScore(prev);
}

Fanova.ingestLibraryPosts = function (posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    if (!post || typeof post !== 'object') continue;
    const key = Fanova.postStoreKey(post);
    if (!key) continue;
    const prev = Fanova.libraryPosts.get(key);
    if (prev && !Fanova.shouldReplacePost(prev, post)) continue;
    Fanova.libraryPosts.set(key, post);
    if (Fanova.libraryPosts.size > 3000) {
      const first = Fanova.libraryPosts.keys().next().value;
      Fanova.libraryPosts.delete(first);
    }
  }
}

Fanova.getFeedProgress = function (feed) {
  const p = (feed && feed.pagination) || {};
  const current = typeof p.current === 'number' ? p.current : (typeof p.page === 'number' ? p.page : null);
  const pageSize = typeof p.pageSize === 'number' ? p.pageSize : null;
  const total = typeof p.total === 'number' ? p.total : null;
  const totalPages = current != null && pageSize && total != null ? Math.ceil(total / pageSize) : null;
  return { current, pageSize, total, totalPages };
}

Fanova.isLockedBlurUrl = function (url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return lower.includes('bl-100') || lower.includes('w-20:w-400') || lower.includes('w-20%3Aw-400');
}

Fanova.isWatermarkedUrl = function (url) {
  if (!url || typeof url !== 'string') return false;
  return /\/tr:[^/]*l-text/i.test(url);
}

Fanova.isStreamPlaylist = function (url) {
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url || '');
}

Fanova.qualityScore = function (url) {
  if (!url) return 1000;
  if (Fanova.isWatermarkedUrl(url)) return 400;
  if (Fanova.isLockedBlurUrl(url)) return 300;
  if (Fanova.isStreamPlaylist(url)) return 250;
  if (!Fanova.isImageKitTransform(url)) return 0;
  let score = 40;
  const quality = url.match(/q-(\d+)/i);
  if (quality) score += 100 - Math.min(100, parseInt(quality[1], 10));
  else score += 20;
  const width = url.match(/w-(\d+)/i);
  if (width) {
    const px = parseInt(width[1], 10);
    if (px > 0 && px < 1920) score += (1920 - px) / 40;
  }
  return score;
}

Fanova.isBetterLibraryEntry = function (prev, next) {
  if (!prev) return true;
  if (!next) return false;
  if (prev.locked !== next.locked) return !next.locked;
  return Fanova.qualityScore(next.url) < Fanova.qualityScore(prev.url);
}

Fanova.mediaUrlList = function (media) {
  if (!media || typeof media !== 'object') return [];
  const out = [];
  for (const cand of [media.fileURL, media.previewURL, media.thumbnailURL]) {
    const cleaned = Fanova.clean(cand);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

Fanova.isVideoMedia = function (media) {
  if (!media || typeof media !== 'object') return false;
  if (typeof media.type === 'string' && media.type.toLowerCase() === 'video') return true;
  return Fanova.mediaUrlList(media).some(Fanova.isVideoUrl);
}

Fanova.bestUrl = function (candidates) {
  let best = null;
  let bestScore = Infinity;
  const seen = new Set();
  for (const cand of candidates) {
    const cleaned = Fanova.clean(cand);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    const score = Fanova.qualityScore(cleaned);
    if (score < bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  return best;
}

Fanova.pickOfficialMediaUrl = function (media) {
  const urls = Fanova.mediaUrlList(media);
  if (!urls.length) return null;
  if (Fanova.isVideoMedia(media)) return Fanova.bestUrl(urls.filter(Fanova.isVideoUrl)) || Fanova.bestUrl(urls);
  return Fanova.bestUrl(urls.filter((url) => !Fanova.isVideoUrl(url))) || Fanova.bestUrl(urls);
}

Fanova.findMediaRecord = function (srcUrl) {
  const key = Fanova.stemKey(srcUrl);
  if (!key) return null;
  let best = null;
  for (const post of Fanova.libraryPosts.values()) {
    const mediaList = Array.isArray(post.media) ? post.media : [];
    for (const media of mediaList) {
      let matched = false;
      for (const url of Fanova.mediaUrlList(media)) {
        if (Fanova.stemKey(url) === key) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      const rec = { post, media };
      if (!best) {
        best = rec;
        continue;
      }
      const prevLocked = best.post.showPaidContent === false;
      const nextLocked = post.showPaidContent === false;
      if (prevLocked && !nextLocked) best = rec;
    }
  }
  return best;
}

Fanova.resolveVideoFromSrc = function (srcUrl) {
  const record = Fanova.findMediaRecord(srcUrl);
  const candidates = [];
  const keys = new Set();
  const srcStem = Fanova.stemKey(srcUrl);
  if (srcStem) keys.add(srcStem);
  if (record && Fanova.isVideoMedia(record.media)) {
    for (const url of Fanova.mediaUrlList(record.media)) {
      if (!Fanova.isVideoUrl(url)) continue;
      candidates.push(url);
      const stem = Fanova.stemKey(url);
      if (stem) keys.add(stem);
    }
  }
  for (const url of Fanova.apiUrls) {
    if (!Fanova.isVideoUrl(url)) continue;
    const stem = Fanova.stemKey(url);
    if (stem && keys.has(stem)) candidates.push(url);
  }
  try {
    const entries = performance.getEntriesByType('resource');
    for (let i = entries.length - 1; i >= 0; i--) {
      const name = entries[i].name || '';
      if (!Fanova.isVideoUrl(name)) continue;
      const stem = Fanova.stemKey(name);
      if (stem && keys.has(stem)) candidates.push(name);
    }
  } catch (err) {
    console.warn('[Fanova Downloader] performance video lookup failed', err);
  }
  return Fanova.bestUrl(candidates);
}

Fanova.reportResolveOnce = function (stem, text) {
  if (!stem || reportedStems.has(stem)) return;
  reportedStems.add(stem);
  if (reportedStems.size > 200) {
    const first = reportedStems.values().next().value;
    reportedStems.delete(first);
  }
  console.log('[Fanova Downloader] resolve: ' + text);
}

Fanova.resolveImageFromSrc = function (srcUrl) {
  const cleanedSrc = Fanova.clean(srcUrl);
  if (!cleanedSrc || Fanova.isVideoUrl(cleanedSrc)) return null;
  const candidates = [cleanedSrc];
  const record = Fanova.findMediaRecord(cleanedSrc);
  if (record && !Fanova.isVideoMedia(record.media)) {
    for (const url of Fanova.mediaUrlList(record.media)) {
      if (!Fanova.isVideoUrl(url)) candidates.push(url);
    }
  }
  const srcStem = Fanova.stemKey(cleanedSrc);
  if (srcStem) {
    for (const url of Fanova.apiUrls) {
      if (Fanova.isVideoUrl(url)) continue;
      if (Fanova.stemKey(url) === srcStem) candidates.push(url);
    }
  }
  const best = Fanova.bestUrl(candidates);
  if (srcStem) {
    if (!record) {
      Fanova.reportResolveOnce(srcStem, 'no API record (library=' + Fanova.libraryPosts.size + ' posts). Opening the page-issued URL.');
    } else if (best && Fanova.isWatermarkedUrl(best)) {
      const hasClean = candidates.some((u) => !Fanova.isWatermarkedUrl(u) && !Fanova.isImageKitTransform(u));
      Fanova.reportResolveOnce(srcStem, hasClean ? 'clean file available, opening it.' : 'server issues watermarked files only for this photo (API fileURL is watermarked too).');
    }
  }
  return best;
}

Fanova.resolveOfficialFromSrc = function (srcUrl) {
  const cleaned = Fanova.clean(srcUrl);
  if (!cleaned) return null;
  const record = Fanova.findMediaRecord(cleaned);
  if (record && Fanova.isVideoMedia(record.media)) return Fanova.resolveVideoFromSrc(cleaned) || null;
  return Fanova.resolveImageFromSrc(cleaned) || cleaned;
}

Fanova.creatorUserIdFromPosts = function () {
  const counts = new Map();
  const re = /\/users\/([a-f0-9-]{36})\//i;
  for (const post of Fanova.libraryPosts.values()) {
    const mediaList = Array.isArray(post.media) ? post.media : [];
    for (const media of mediaList) {
      for (const url of Fanova.mediaUrlList(media)) {
        const match = url.match(re);
        if (!match) continue;
        const id = match[1].toLowerCase();
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
  }
  let best = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

Fanova.entryLocked = function (post, url) {
  if (Fanova.isLockedBlurUrl(url)) return true;
  // A locked PPV post has no clean original: its fileURL is the blur or a
  // gated vault file, even when the path carries no transform.
  return !!(post && post.showPaidContent === false);
}

Fanova.getLibraryEntries = function (userId) {
  const id = Fanova.creatorUserIdFromPosts() || userId || null;
  const byKey = new Map();
  const push = (url, info, fromPost) => {
    const cleaned = Fanova.clean(url);
    if (!cleaned) return;
    // Scoped-post vault URLs skip the uuid check: the creator-profile feed
    // gate already ties them to this profile. Raw vault captures stay out.
    if (!Fanova.isLibraryCandidate(cleaned, /\/vault\//i.test(cleaned) && fromPost ? null : id)) return;
    const key = Fanova.libraryAssetKey(cleaned);
    const prev = byKey.get(key);
    const entry = {
      url: cleaned,
      locked: !!(info && info.locked),
      watermarked: Fanova.isWatermarkedUrl(cleaned),
      type: (info && info.type) || (Fanova.isVideoUrl(cleaned) ? 'Video' : 'Image'),
      postId: (info && info.postId) || null
    };
    if (!prev || Fanova.isBetterLibraryEntry(prev, entry)) byKey.set(key, entry);
  };
  for (const post of Fanova.libraryPosts.values()) {
    const mediaList = Array.isArray(post.media) ? post.media : [];
    for (const media of mediaList) {
      const url = Fanova.pickOfficialMediaUrl(media);
      if (!url) continue;
      const type = Fanova.isVideoMedia(media) ? 'Video' : (typeof media.type === 'string' ? media.type : 'Image');
      push(url, { locked: Fanova.entryLocked(post, url), type, postId: post.id || null }, true);
    }
  }
  if (byKey.size) {
    for (const url of Fanova.apiUrls) {
      const cleaned = Fanova.clean(url);
      if (!cleaned || !byKey.has(Fanova.libraryAssetKey(cleaned))) continue;
      const prev = byKey.get(Fanova.libraryAssetKey(cleaned));
      push(cleaned, {
        locked: Fanova.isLockedBlurUrl(cleaned),
        type: prev && prev.type,
        postId: prev && prev.postId
      });
    }
  } else {
    for (const url of Fanova.apiUrls) {
      push(url, { locked: Fanova.isLockedBlurUrl(url), type: null, postId: null });
    }
  }
  const entries = [...byKey.values()];
  entries.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    if (a.watermarked !== b.watermarked) return a.watermarked ? 1 : -1;
    return 0;
  });
  return entries;
}

Fanova.buildLibraryTxt = function (entries, creator) {
  const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const watermarked = entries.filter((e) => e.watermarked);
  const locked = entries.filter((e) => e.locked && !e.watermarked);
  const clean = entries.filter((e) => !e.locked && !e.watermarked);
  const lines = [];
  lines.push('# Fanova official link list');
  lines.push('# Creator: ' + creator);
  lines.push('# Exported: ' + now);
  lines.push('# Page: ' + location.href);
  lines.push('# Total files: ' + entries.length + ' (originals: ' + clean.length + ', locked blur: ' + locked.length + ', watermarked: ' + watermarked.length + ')');
  lines.push('# Signed ik-t/ik-s links. They open without login until expiry. One URL per line.');
  lines.push('# Images are the original file (no transform). Videos are the official file URL.');
  lines.push('');
  for (const e of clean) lines.push(e.url);
  if (locked.length) {
    lines.push('');
    lines.push('# Locked blur below (not purchased, not the original file):');
    for (const e of locked) lines.push(e.url);
  }
  if (watermarked.length) {
    lines.push('');
    lines.push('# Watermarked below (l-text mosaic, lower quality, exposes viewer handle if shared):');
    for (const e of watermarked) lines.push(e.url);
  }
  lines.push('');
  return lines.join('\n');
}

Fanova.getLibraryListFilename = function (creator) {
  const safe = Fanova.sanitize(creator || Fanova.getCreator());
  const ts = Fanova.formatFilenameTimestamp(null);
  return Fanova.DEFAULT_FOLDER + '/' + safe + '/links_' + ts + '.txt';
}

Fanova.saveLibraryListFile = async function (txt, creator) {
  let folder = Fanova.DEFAULT_FOLDER;
  try {
    const st = await chrome.storage.sync.get(['customFolder']);
    if (st.customFolder) folder = st.customFolder.replace(/\/+$/, '');
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read custom folder', err);
  }
  let filename = Fanova.getLibraryListFilename(creator);
  if (folder !== Fanova.DEFAULT_FOLDER) {
    filename = filename.replace(new RegExp('^' + Fanova.DEFAULT_FOLDER + '/'), folder + '/');
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_LIST', filename, content: txt }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message, filename });
        return;
      }
      resolve({ ok: !!(resp && resp.success), error: resp && resp.error, filename });
    });
  });
}

Fanova.copyLibraryLinks = async function () {
  try {
    const userId = Fanova.dominantUserId();
    const entries = Fanova.getLibraryEntries(userId);
    if (!entries.length) {
      Fanova.notify('No links collected yet. Scroll the page, then try again.', true);
      return;
    }
    const txt = Fanova.buildLibraryTxt(entries, Fanova.getCreator());
    await navigator.clipboard.writeText(txt);
    Fanova.notify('Copied ' + entries.length + ' official links', false);
    Fanova.setCollectStatus('Copied ' + entries.length + ' links to clipboard');
  } catch (err) {
    console.error('[Fanova Downloader] copy links failed', err);
    Fanova.notify('Copy failed', true);
  }
}

Fanova.downloadLibraryList = async function () {
  try {
    const userId = Fanova.dominantUserId();
    const entries = Fanova.getLibraryEntries(userId);
    if (!entries.length) {
      Fanova.notify('No links collected yet. Scroll the page, then try again.', true);
      return;
    }
    const txt = Fanova.buildLibraryTxt(entries, Fanova.getCreator());
    const result = await Fanova.saveLibraryListFile(txt, Fanova.getCreator());
    if (result.ok) {
      Fanova.notify('Link list saved → ' + result.filename, false);
      Fanova.setCollectStatus('Link list saved: ' + entries.length + ' links → ' + result.filename);
    } else {
      Fanova.notify(result.error || 'Link list save failed', true);
    }
  } catch (err) {
    console.error('[Fanova Downloader] save link list failed', err);
    Fanova.notify('Link list save failed', true);
  }
}
