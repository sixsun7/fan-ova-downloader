'use strict';

// Library collect panel.

Fanova.setCollectStatus = function (text) {
  if (Fanova.collectStatusEl) Fanova.collectStatusEl.textContent = text;
}

Fanova.setCollectRunning = function (running) {
  Fanova.collectRunning = running;
  if (Fanova.collectStartBtn) Fanova.collectStartBtn.disabled = running;
  if (Fanova.collectStopBtn) Fanova.collectStopBtn.disabled = !running;
  if (Fanova.collectCopyBtn) Fanova.collectCopyBtn.disabled = running;
  if (Fanova.collectTxtBtn) Fanova.collectTxtBtn.disabled = running;
  if (Fanova.collectPanel) Fanova.collectPanel.classList.toggle('running', running);
  if (Fanova.collectFab) Fanova.collectFab.classList.toggle('running', running);
}

Fanova.cancelCollect = function () {
  Fanova.collectCancelled = true;
  Fanova.setCollectStatus('Stopping after the current request…');
}

Fanova.setCollectHidden = function (hidden) {
  Fanova.collectHidden = !!hidden;
  Fanova.applyCollectVisibility();
  try {
    chrome.storage.sync.set({ hideCollectPanel: Fanova.collectHidden });
  } catch (err) {
    console.warn('[Fanova Downloader] failed to save panel visibility', err);
  }
}

Fanova.applyCollectVisibility = function () {
  if (Fanova.collectPanel) Fanova.collectPanel.style.display = Fanova.collectHidden ? 'none' : '';
  if (Fanova.collectFab) {
    Fanova.collectFab.style.display = Fanova.collectHidden ? '' : 'none';
    Fanova.collectFab.classList.toggle('running', Fanova.collectRunning);
  }
}

Fanova.loadCollectVisibility = function () {
  try {
    chrome.storage.sync.get(['hideCollectPanel'], (result) => {
      if (chrome.runtime.lastError) return;
      Fanova.collectHidden = !!result.hideCollectPanel;
      Fanova.applyCollectVisibility();
    });
  } catch (err) {
    console.warn('[Fanova Downloader] failed to load panel visibility', err);
  }
}

Fanova.listenCollectVisibilityChanges = function () {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.hideCollectPanel) return;
      Fanova.collectHidden = !!changes.hideCollectPanel.newValue;
      Fanova.applyCollectVisibility();
    });
  } catch (err) {
    console.warn('[Fanova Downloader] failed to watch panel visibility', err);
  }
}

Fanova.buildCollectUi = function () {
  Fanova.collectPanel = document.createElement('div');
  Fanova.collectPanel.className = 'fanova-dl-collect';

  const header = document.createElement('div');
  header.className = 'fanova-dl-collect-header';

  const title = document.createElement('div');
  title.className = 'fanova-dl-collect-title';
  title.textContent = 'Library collect';

  const hideBtn = document.createElement('button');
  hideBtn.className = 'fanova-dl-collect-hide';
  hideBtn.textContent = 'Hide';
  hideBtn.setAttribute('aria-label', 'Hide library panel');
  hideBtn.title = 'Hide panel';
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.setCollectHidden(true);
  });

  header.append(title, hideBtn);

  Fanova.collectStatusEl = document.createElement('div');
  Fanova.collectStatusEl.className = 'fanova-dl-collect-status';
  Fanova.collectStatusEl.textContent = 'Idle — 3s between each request';

  const actions = document.createElement('div');
  actions.className = 'fanova-dl-collect-actions';

  Fanova.collectStartBtn = document.createElement('button');
  Fanova.collectStartBtn.className = 'fanova-dl-collect-start';
  Fanova.collectStartBtn.textContent = 'Collect library';
  Fanova.collectStartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.startCollectLibrary();
  });

  Fanova.collectStopBtn = document.createElement('button');
  Fanova.collectStopBtn.className = 'fanova-dl-collect-stop';
  Fanova.collectStopBtn.textContent = 'Stop';
  Fanova.collectStopBtn.disabled = true;
  Fanova.collectStopBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.cancelCollect();
  });

  Fanova.collectCopyBtn = document.createElement('button');
  Fanova.collectCopyBtn.className = 'fanova-dl-collect-stop';
  Fanova.collectCopyBtn.textContent = 'Copy links';
  Fanova.collectCopyBtn.title = 'Copy all official links as TXT to clipboard';
  Fanova.collectCopyBtn.setAttribute('aria-label', 'Copy all official links to clipboard');
  Fanova.collectCopyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.copyLibraryLinks();
  });

  Fanova.collectTxtBtn = document.createElement('button');
  Fanova.collectTxtBtn.className = 'fanova-dl-collect-stop';
  Fanova.collectTxtBtn.textContent = 'Save .txt';
  Fanova.collectTxtBtn.title = 'Save all official links as a TXT file';
  Fanova.collectTxtBtn.setAttribute('aria-label', 'Save all official links as TXT');
  Fanova.collectTxtBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.downloadLibraryList();
  });

  actions.append(Fanova.collectStartBtn, Fanova.collectStopBtn, Fanova.collectCopyBtn, Fanova.collectTxtBtn);

  const hint = document.createElement('div');
  hint.className = 'fanova-dl-collect-hint';
  hint.textContent = 'This creator\'s post list only. Original image URLs, official video URLs, plus a TXT list. 3s between files.';

  Fanova.collectPanel.append(header, Fanova.collectStatusEl, actions, hint);
  (document.documentElement || document.body).appendChild(Fanova.collectPanel);

  Fanova.collectFab = document.createElement('button');
  Fanova.collectFab.className = 'fanova-dl-collect-fab';
  Fanova.collectFab.textContent = 'Library';
  Fanova.collectFab.setAttribute('aria-label', 'Show library panel');
  Fanova.collectFab.title = 'Show library collect panel';
  Fanova.collectFab.style.display = 'none';
  Fanova.collectFab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Fanova.setCollectHidden(false);
  });
  (document.documentElement || document.body).appendChild(Fanova.collectFab);
}

Fanova.requestCollectPage = function (url) {
  const requestId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  return new Promise((resolve) => {
    Fanova.collectWaiters.set(requestId, resolve);
    window.postMessage({
      __FANOVA_COLLECT_FETCH__: true,
      requestId,
      url,
      method: 'GET'
    }, location.origin);
    setTimeout(() => {
      const pending = Fanova.collectWaiters.get(requestId);
      if (!pending) return;
      Fanova.collectWaiters.delete(requestId);
      pending({ ok: false, reason: 'timeout' });
    }, 20000);
  });
}

Fanova.downloadUrlDirect = async function (url) {
  const isVideo = Fanova.isVideoUrl(url);
  let folder = Fanova.DEFAULT_FOLDER;
  try {
    const st = await chrome.storage.sync.get(['customFolder']);
    if (st.customFolder) folder = st.customFolder.replace(/\/+$/, '');
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read custom folder', err);
  }
  let filename = Fanova.buildFilename(url, isVideo);
  if (folder !== Fanova.DEFAULT_FOLDER) {
    filename = filename.replace(new RegExp('^' + Fanova.DEFAULT_FOLDER + '/'), folder + '/');
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', url, filename }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message, filename });
        return;
      }
      resolve({ ok: !!(resp && resp.success), error: resp && resp.error, filename });
    });
  });
}

Fanova.loadMorePosts = async function () {
  if (!Fanova.isCreatorProfileFeed(Fanova.lastFeed && Fanova.lastFeed.requestUrl)) {
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollBy(0, Math.max(window.innerHeight * 0.85, 600));
    Fanova.setCollectStatus('Waiting for this creator\'s post list…');
    await Fanova.sleep(Fanova.COLLECT_DELAY_MS);
  }
  if (Fanova.collectCancelled) return Fanova.getLibraryEntries(Fanova.dominantUserId()).length;
  if (!Fanova.isCreatorProfileFeed(Fanova.lastFeed && Fanova.lastFeed.requestUrl)) {
    Fanova.setCollectStatus('Creator post list not captured yet — scroll once and retry');
    return Fanova.getLibraryEntries(Fanova.dominantUserId()).length;
  }

  const first = Fanova.getFeedProgress(Fanova.lastFeed);
  let pageSize = first.pageSize || 10;
  try {
    const fromUrl = parseInt(new URL(Fanova.lastFeed.requestUrl, location.href).searchParams.get('pageSize') || '', 10);
    if (!first.pageSize && fromUrl) pageSize = fromUrl;
  } catch (err) {
    console.warn('[Fanova Downloader] failed to read pageSize', err);
  }
  let total = first.total;
  const seen = new Set();
  let page = 1;
  let idle = 0;

  while (!Fanova.collectCancelled && page <= Fanova.COLLECT_MAX_PAGES) {
    const before = Fanova.getLibraryEntries(Fanova.dominantUserId()).length;
    if (before >= Fanova.COLLECT_MAX_FILES) break;

    let pageUrl = null;
    try {
      const u = new URL(Fanova.lastFeed.requestUrl, location.href);
      u.searchParams.set('page', String(page));
      if (!u.searchParams.get('pageSize')) u.searchParams.set('pageSize', String(pageSize));
      pageUrl = u.toString();
    } catch (err) {
      console.warn('[Fanova Downloader] failed to build feed page url', err);
      break;
    }
    if (seen.has(pageUrl)) break;
    seen.add(pageUrl);

    const skipFirst = page === 1 && Fanova.libraryPosts.size > 0 && first.current === 1;
    const pageCount = total != null ? Math.ceil(total / pageSize) : null;
    const label = pageCount ? ' (page ' + page + '/' + pageCount + ')' : ' (page ' + page + ')';

    if (!skipFirst) {
      Fanova.setCollectStatus('Fetching posts… ' + before + ' files' + label);
      await Fanova.sleep(Fanova.COLLECT_DELAY_MS);
      if (Fanova.collectCancelled) break;
      const result = await Fanova.requestCollectPage(pageUrl);
      if (!result.ok) {
        Fanova.setCollectStatus('Page ' + page + ' failed (' + (result.status || result.reason || 'error') + ')');
        break;
      }
      const prog = Fanova.getFeedProgress(Fanova.lastFeed);
      if (typeof prog.total === 'number') total = prog.total;
      if (typeof prog.pageSize === 'number' && prog.pageSize > 0) pageSize = prog.pageSize;
    }

    const after = Fanova.getLibraryEntries(Fanova.dominantUserId()).length;
    if (total != null && page * pageSize >= total) break;
    if (after > before) idle = 0;
    else if (!skipFirst) idle += 1;
    if (total == null && idle >= Fanova.COLLECT_IDLE_ROUNDS) break;
    page += 1;
  }
  return Fanova.getLibraryEntries(Fanova.dominantUserId()).length;
}

Fanova.startCollectLibrary = async function () {
  if (!Fanova.isTopFrame()) return;
  if (Fanova.collectRunning) return;
  if (Fanova.collectHidden) Fanova.setCollectHidden(false);
  if (!Fanova.isCreatorPage()) {
    Fanova.setCollectStatus('Open a creator page first');
    Fanova.notify('Open a creator page, then collect the library', true);
    return;
  }

  Fanova.collectCancelled = false;
  Fanova.setCollectRunning(true);
  Fanova.setCollectStatus('Starting collect… 3s between requests');

  try {
    await Fanova.loadMorePosts();
    const userId = Fanova.dominantUserId();
    if (Fanova.collectCancelled) {
      Fanova.setCollectStatus('Stopped before downloads');
      return;
    }

    const entries = Fanova.getLibraryEntries(userId).slice(0, Fanova.COLLECT_MAX_FILES);
    if (!entries.length) {
      if (Fanova.isCreatorProfileFeed(Fanova.lastFeed && Fanova.lastFeed.requestUrl)) {
        Fanova.setCollectStatus('No original files found on this page');
        Fanova.notify('No original files found on this page', true);
      } else {
        Fanova.notify('No media captured yet. Scroll the page, then try again.', true);
      }
      return;
    }
    const files = entries.map((e) => e.url);

    // Always save the official TXT link list first (list + download):
    // signed URLs work without login until expiry, one URL per line.
    const creator = Fanova.getCreator();
    const txt = Fanova.buildLibraryTxt(entries, creator);
    Fanova.setCollectStatus('Saving link list: ' + entries.length + ' links (3s pause)');
    await Fanova.sleep(Fanova.COLLECT_DELAY_MS);
    const listResult = await Fanova.saveLibraryListFile(txt, creator);
    if (!listResult.ok) {
      console.warn('[Fanova Downloader] link list save failed', listResult.error);
    }

    Fanova.setCollectStatus('Starting downloads: ' + files.length + ' files (3s pause)');
    await Fanova.sleep(Fanova.COLLECT_DELAY_MS);

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      if (Fanova.collectCancelled) break;
      Fanova.setCollectStatus('Downloading ' + (i + 1) + '/' + files.length + ' (3s pause)');
      if (i > 0) await Fanova.sleep(Fanova.COLLECT_DELAY_MS);
      if (Fanova.collectCancelled) break;
      const result = await Fanova.downloadUrlDirect(files[i]);
      if (result.ok) ok += 1;
      else failed += 1;
    }

    if (Fanova.collectCancelled) {
      Fanova.setCollectStatus('Stopped — saved ' + ok + ', failed ' + failed + ' + link list');
    } else {
      const listNote = listResult.ok ? ' + link list' : ' (link list failed)';
      Fanova.setCollectStatus('Done — saved ' + ok + ', failed ' + failed + ' of ' + files.length + listNote);
      Fanova.notify('Library collect finished: ' + ok + ' saved' + listNote, failed > 0 || !listResult.ok);
    }
  } catch (err) {
    console.error('[Fanova Downloader] collect failed', err);
    Fanova.setCollectStatus('Collect failed');
    Fanova.notify('Library collect failed', true);
  } finally {
    Fanova.setCollectRunning(false);
  }
}
