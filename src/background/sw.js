'use strict';

importScripts('paths.js');

function startSilentDownload(url, filename, callback) {
  const safeName = sanitizeDownloadPath(filename);
  chrome.downloads.download({
    url,
    filename: safeName,
    saveAs: false,
    conflictAction: 'uniquify'
  }, (downloadId) => {
    if (typeof callback === 'function') callback(downloadId, chrome.runtime.lastError);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_ORIGINAL' && message.url) {
    const url = cleanMediaUrl(message.url);
    if (!url) {
      sendResponse({ success: false, error: 'invalid url' });
      return true;
    }
    chrome.tabs.create({ url, active: true });
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'DOWNLOAD_MEDIA' && message.url) {
    const url = cleanMediaUrl(message.url);
    if (!url) {
      sendResponse({ success: false, error: 'invalid url' });
      return true;
    }
    const filename = message.filename || `${DEFAULT_FOLDER}/media`;
    startSilentDownload(url, filename, (downloadId, lastError) => {
      if (lastError) {
        sendResponse({ success: false, error: lastError.message });
      } else if (downloadId === undefined) {
        sendResponse({ success: false, error: 'downloadId undefined' });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
  if (message.type === 'DOWNLOAD_LIST' && typeof message.content === 'string') {
    const filename = message.filename || `${DEFAULT_FOLDER}/links.txt`;
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(message.content);
    startSilentDownload(dataUrl, filename, (downloadId, lastError) => {
      if (lastError) {
        sendResponse({ success: false, error: lastError.message });
      } else if (downloadId === undefined) {
        sendResponse({ success: false, error: 'downloadId undefined' });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fanova-dl-open',
    title: 'Open original (Fanova)',
    contexts: ['image', 'video'],
    targetUrlPatterns: ['*://*.fanova.com/*', '*://*.fbcdn.net/*', '*://*.cdninstagram.com/*']
  });
  chrome.contextMenus.create({
    id: 'fanova-dl-download',
    title: 'Download original → Fanova folder',
    contexts: ['image', 'video'],
    targetUrlPatterns: ['*://*.fanova.com/*', '*://*.fbcdn.net/*', '*://*.cdninstagram.com/*']
  });
  console.log('[Fanova Downloader] installed');
});

function resolveSrcInTab(tabId, srcUrl) {
  return new Promise((resolve) => {
    if (tabId == null) {
      resolve(null);
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'RESOLVE_SRC', srcUrl }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.url) {
        resolve(null);
        return;
      }
      resolve(resp);
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const src = info.srcUrl;
  if (!src) return;

  let cleaned = cleanMediaUrl(src);
  let isVideo = /\.mp4|\.mov|\.webm|\.m3u8|\.mpd/i.test(cleaned || '') || info.mediaType === 'video';
  const resolved = await resolveSrcInTab(tab && tab.id, src);
  if (resolved && resolved.url) {
    cleaned = cleanMediaUrl(resolved.url) || resolved.url;
    if (typeof resolved.isVideo === 'boolean') isVideo = resolved.isVideo;
  }
  if (!cleaned) return;

  if (info.menuItemId === 'fanova-dl-open') {
    chrome.tabs.create({ url: cleaned, active: true });
    return;
  }

  if (info.menuItemId === 'fanova-dl-download') {
    const folder = await getDownloadFolder();
    const creator = getCreator(tab?.url);
    const filename = buildFilename(folder, creator, cleaned, isVideo);
    startSilentDownload(cleaned, filename);
  }
});

// Keep extension downloads in the default folder without a Save As prompt.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) {
    suggest();
    return;
  }
  suggest({
    filename: sanitizeDownloadPath(item.filename),
    conflictAction: 'uniquify'
  });
});
