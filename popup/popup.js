const inp = document.getElementById('folder');
const status = document.getElementById('status');
const hintFolder = document.getElementById('hintFolder');

function showStatus(text) {
  status.textContent = text;
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}

chrome.storage.sync.get(['customFolder'], (stored) => {
  if (stored.customFolder) {
    inp.value = stored.customFolder;
    hintFolder.textContent = stored.customFolder + '/{creator}/';
  }
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
