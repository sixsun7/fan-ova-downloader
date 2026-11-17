const inp = document.getElementById('folder');
const status = document.getElementById('status');
const hintFolder = document.getElementById('hintFolder');

function showStatus(text) {
  status.textContent = text;
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}

chrome.storage.sync.get(['customFolder', 'hideCollectPanel'], (stored) => {
  if (stored.customFolder) {
    inp.value = stored.customFolder;
    hintFolder.textContent = stored.customFolder + '/{creator}/';
  }
  document.getElementById('showPanel').checked = !stored.hideCollectPanel;
});

document.getElementById('showPanel').addEventListener('change', (e) => {
  chrome.storage.sync.set({ hideCollectPanel: !e.target.checked }, () => {
    showStatus(e.target.checked ? 'Library panel visible' : 'Library panel hidden');
  });
});

inp.addEventListener('input', () => {
  hintFolder.textContent = (inp.value.trim() || 'Fanova') + '/{creator}/';
});

document.getElementById('save').addEventListener('click', () => {
  const folder = inp.value.trim().replace(/^\/+|\/+$/g, '') || 'Fanova';
  chrome.storage.sync.set({ customFolder: folder }, () => {
    hintFolder.textContent = folder + '/{creator}/';
    showStatus('Saved: ' + folder + '/');
  });
});

document.getElementById('reset').addEventListener('click', () => {
  inp.value = 'Fanova';
  chrome.storage.sync.set({ customFolder: 'Fanova' }, () => {
    hintFolder.textContent = 'Fanova/{creator}/';
    showStatus('Reset to Fanova/');
  });
});

document.getElementById('collect').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      status.textContent = 'No active tab';
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_LIBRARY' }, () => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Open a Fanova profile tab first';
        return;
      }
      showStatus('Collect started (3s between files)');
    });
  });
});
