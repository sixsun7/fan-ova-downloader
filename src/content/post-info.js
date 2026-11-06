'use strict';

// Per-post info dialog.

let postModalContext = null;

Fanova.enhancePostInfoButtons = function () {
  try {
    const dated = document.querySelectorAll('[data-fanova-dl-date="1"]');
    for (const el of dated) {
      if (el.querySelector('.fanova-dl-post-info-btn')) continue;
      const found = Fanova.findPostImageMs(el);
      if (!found) continue;
      Fanova.addPostInfoBadge(el, found);
    }
  } catch (err) {
    console.warn('[Fanova Downloader] post info button sweep failed', err);
  }
}

Fanova.formatPostCount = function (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

Fanova.postCandidateSrcs = function (root, max) {
  const out = [];
  if (!root || !root.querySelectorAll) return out;
  const cap = max || 8;
  for (const img of root.querySelectorAll('img')) {
    const src = img.currentSrc || img.src || '';
    if (!src || src.startsWith('blob:')) continue;
    if (!out.includes(src)) out.push(src);
    if (out.length >= cap) break;
  }
  return out;
}

Fanova.postInfoSrcForRoot = function (root) {
  const srcs = Fanova.postCandidateSrcs(root, 8);
  if (!srcs.length) return null;
  if (Fanova.libraryPosts.size) {
    for (const src of srcs) {
      if (Fanova.findMediaRecord(src)) return src;
    }
  }
  return srcs[0];
}

Fanova.findUniquePostByFileStem = function (stem) {
  if (!stem) return null;
  let match = null;
  for (const post of Fanova.libraryPosts.values()) {
    const mediaList = Array.isArray(post.media) ? post.media : [];
    let matchedMedia = null;
    for (const media of mediaList) {
      for (const url of Fanova.mediaUrlList(media)) {
        if (Fanova.mediaStem(url) === stem) {
          matchedMedia = media;
          break;
        }
      }
      if (matchedMedia) break;
    }
    if (!matchedMedia) continue;
    if (match) return null;
    match = { post, media: matchedMedia };
  }
  return match;
}

Fanova.findPostForRoot = function (root) {
  const srcs = Fanova.postCandidateSrcs(root, 8);
  for (const src of srcs) {
    const record = Fanova.findMediaRecord(src);
    if (record && record.post) return record.post;
  }
  const seen = new Set();
  for (const src of srcs) {
    const stem = Fanova.mediaStem(src);
    if (!stem || seen.has(stem)) continue;
    seen.add(stem);
    const record = Fanova.findUniquePostByFileStem(stem);
    if (record && record.post) return record.post;
  }
  return null;
}

Fanova.addPostInfoBadge = function (anchor, found) {
  try {
    if (!anchor || !found || !found.root) return;
    if (anchor.querySelector('.fanova-dl-post-info-btn')) return;
    if (found.root.querySelector('.fanova-dl-post-info-btn')) return;
    const src = Fanova.postInfoSrcForRoot(found.root);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fanova-dl-post-info-btn';
    btn.textContent = 'Info';
    btn.setAttribute('aria-label', 'Show post details');
    btn.title = 'Show post details';
    // Live refs: root and src survive React re-renders of our anchor; ms is
    // the fallback date when the images cannot be re-read.
    btn._fanovaRoot = found.root;
    btn._fanovaSrc = src || null;
    btn._fanovaMs = found.ms || null;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Fanova.openPostModalForButton(btn);
    });
    anchor.appendChild(btn);
  } catch (err) {
    console.warn('[Fanova Downloader] post info badge failed', err);
  }
}

Fanova.isPostModalOpen = function () {
  return !!(Fanova.postBackdrop && Fanova.postBackdrop.style.display === 'flex');
}

Fanova.closePostModal = function () {
  if (Fanova.postBackdrop) Fanova.postBackdrop.style.display = 'none';
  postModalContext = null;
}

Fanova.addPostModalRow = function (container, label, value) {
  if (value == null || value === '') return;
  const row = document.createElement('div');
  row.className = 'fanova-dl-sheet-row';
  const name = document.createElement('span');
  name.className = 'fanova-dl-sheet-label';
  name.textContent = label;
  const val = document.createElement('span');
  val.className = 'fanova-dl-sheet-value';
  val.textContent = value;
  row.append(name, val);
  container.appendChild(row);
}

Fanova.countPostMedia = function (post, wantVideo) {
  if (!post || !Array.isArray(post.media)) return 0;
  let n = 0;
  for (const item of post.media) {
    if (!item || typeof item !== 'object') continue;
    const kind = String(item.type || '').toLowerCase();
    const urls = Fanova.mediaUrlList(item);
    const isVideo = kind === 'video' || urls.some(Fanova.isVideoUrl);
    if (wantVideo ? isVideo : !isVideo) n += 1;
  }
  return n;
}

Fanova.buildPostModalUi = function () {
  if (Fanova.postBackdrop) return;
  try {
    Fanova.postBackdrop = document.createElement('div');
    Fanova.postBackdrop.className = 'fanova-dl-post-backdrop';
    Fanova.postBackdrop.style.display = 'none';
    Fanova.postBackdrop.addEventListener('click', (e) => {
      if (e.target === Fanova.postBackdrop) Fanova.closePostModal();
    });
    const panel = document.createElement('div');
    panel.className = 'fanova-dl-post';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Post info');
    const header = document.createElement('div');
    header.className = 'fanova-dl-sheet-header';
    Fanova.postTitleEl = document.createElement('div');
    Fanova.postTitleEl.className = 'fanova-dl-sheet-title';
    Fanova.postTitleEl.textContent = 'Post info';
    const hideBtn = document.createElement('button');
    hideBtn.className = 'fanova-dl-sheet-hide';
    hideBtn.textContent = 'Close';
    hideBtn.setAttribute('aria-label', 'Close post info');
    hideBtn.title = 'Close';
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Fanova.closePostModal();
    });
    header.append(Fanova.postTitleEl, hideBtn);
    Fanova.postBodyEl = document.createElement('div');
    Fanova.postBodyEl.className = 'fanova-dl-sheet-body';
    const hint = document.createElement('div');
    hint.className = 'fanova-dl-sheet-hint';
    hint.textContent = 'Caption, counts, and status come from this post in the creator feed.';
    panel.append(header, Fanova.postBodyEl, hint);
    Fanova.postBackdrop.appendChild(panel);
    (document.documentElement || document.body).appendChild(Fanova.postBackdrop);
  } catch (err) {
    console.warn('[Fanova Downloader] post modal build failed', err);
  }
}

Fanova.resolvePostModalContext = function (btn) {
  const found = Fanova.findPostImageMs(btn);
  const root = found ? found.root : (btn._fanovaRoot && btn._fanovaRoot.isConnected ? btn._fanovaRoot : null);
  let src = btn._fanovaSrc || null;
  if (root) {
    const freshSrc = Fanova.postInfoSrcForRoot(root);
    if (freshSrc) src = freshSrc;
  }
  let post = root ? Fanova.findPostForRoot(root) : null;
  if (!post && src) {
    const record = Fanova.findMediaRecord(src);
    if (record) post = record.post;
  }
  const ms = found && found.ms ? found.ms : (btn._fanovaMs || null);
  return { post, ms, root, src };
}

Fanova.openPostModalForButton = function (btn) {
  try {
    const ctx = Fanova.resolvePostModalContext(btn);
    postModalContext = { btn, post: ctx.post, ms: ctx.ms, src: ctx.src };
    Fanova.renderPostModal();
    if (Fanova.postBackdrop) Fanova.postBackdrop.style.display = 'flex';
  } catch (err) {
    console.warn('[Fanova Downloader] open post modal failed', err);
  }
}

Fanova.refreshOpenPostModal = function () {
  if (!postModalContext || !Fanova.isPostModalOpen()) return;
  const btn = postModalContext.btn;
  if (!btn || !btn.isConnected) return;
  try {
    const ctx = Fanova.resolvePostModalContext(btn);
    const improved = (!postModalContext.post && ctx.post)
      || Fanova.postMetaScore(ctx.post) > Fanova.postMetaScore(postModalContext.post)
      || (ctx.ms && ctx.ms !== postModalContext.ms);
    if (!improved) return;
    postModalContext = { btn, post: ctx.post, ms: ctx.ms, src: ctx.src };
    Fanova.renderPostModal();
  } catch (err) {
    console.warn('[Fanova Downloader] post modal refresh failed', err);
  }
}

Fanova.renderPostModal = function () {
  if (!Fanova.postBackdrop || !Fanova.postBodyEl) Fanova.buildPostModalUi();
  if (!Fanova.postBackdrop || !Fanova.postBodyEl) return;
  const post = postModalContext ? postModalContext.post : null;
  const ms = postModalContext ? postModalContext.ms : null;
  Fanova.postBodyEl.textContent = '';
  if (Fanova.postTitleEl) Fanova.postTitleEl.textContent = post && post.id ? 'Post info • ' + String(post.id).slice(0, 8) : 'Post info';
  const rows = document.createElement('div');
  rows.className = 'fanova-dl-sheet-rows';
  Fanova.addPostModalRow(rows, 'Date', Fanova.formatBadgeTimestamp(ms));
  if (post) {
    if (typeof post.showPaidContent === 'boolean') {
      Fanova.addPostModalRow(rows, 'Status', post.showPaidContent === false ? 'Locked' : 'Unlocked');
    }
    if (post.isPinned === true) Fanova.addPostModalRow(rows, 'Pinned', 'Yes');
    if (post.isExclusive === true) Fanova.addPostModalRow(rows, 'Exclusive', 'Yes');
    const likes = Fanova.formatPostCount(post.likeCount);
    const comments = Fanova.formatPostCount(post.commentCount);
    const views = Fanova.formatPostCount(post.views);
    if (likes != null) Fanova.addPostModalRow(rows, 'Likes', likes);
    if (comments != null) Fanova.addPostModalRow(rows, 'Comments', comments);
    if (views != null) Fanova.addPostModalRow(rows, 'Views', views);
    const photos = Fanova.countPostMedia(post, false);
    const videos = Fanova.countPostMedia(post, true);
    const files = [];
    if (photos) files.push(photos + (photos === 1 ? ' photo' : ' photos'));
    if (videos) files.push(videos + (videos === 1 ? ' video' : ' videos'));
    if (files.length) Fanova.addPostModalRow(rows, 'Files', files.join(' · '));
    if (post.priceAmount != null) {
      const symbol = typeof post.priceSymbol === 'string' && post.priceSymbol ? post.priceSymbol + ' ' : '';
      Fanova.addPostModalRow(rows, 'Price', symbol + String(post.priceAmount));
    }
    if (post.id != null) Fanova.addPostModalRow(rows, 'Post ID', String(post.id));
  }
  if (rows.childElementCount) Fanova.postBodyEl.appendChild(rows);
  const caption = post && typeof post.caption === 'string' ? post.caption.trim() : '';
  if (caption) {
    const section = document.createElement('section');
    section.className = 'fanova-dl-sheet-section';
    const heading = document.createElement('div');
    heading.className = 'fanova-dl-sheet-section-title';
    heading.textContent = 'Caption';
    const body = document.createElement('p');
    body.className = 'fanova-dl-sheet-bio';
    body.textContent = caption;
    section.append(heading, body);
    Fanova.postBodyEl.appendChild(section);
  }
  if (!post) {
    const empty = document.createElement('div');
    empty.className = 'fanova-dl-sheet-status';
    empty.textContent = 'Full details for this post are not captured yet. They appear here once the page loads this post — scroll the feed, then reopen.';
    Fanova.postBodyEl.appendChild(empty);
  }
}
