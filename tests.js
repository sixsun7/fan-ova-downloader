'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = __dirname;
const contentFiles = [
  'src/content/state.js',
  'src/content/messages.js',
  'src/content/overlay.js',
  'src/content/dates.js',
  'src/content/post-info.js',
  'src/content/media.js',
  'src/content/library.js',
  'src/content/collect.js',
  'src/content/boot.js'
];
const jsFiles = contentFiles.concat([
  'src/page/inject.js',
  'src/background/paths.js',
  'src/background/sw.js'
]);

let failed = 0;
function fail(msg) {
  console.error(msg);
  failed += 1;
}

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(file + ' failed syntax check\n' + (result.stderr || result.stdout));
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const listed = manifest.content_scripts[0].js;
if (listed.join('|') !== contentFiles.join('|')) fail('manifest content script order does not match tests');
if (manifest.background.service_worker !== 'src/background/sw.js') fail('service worker path');
for (const icon of Object.values(manifest.icons)) {
  if (!fs.existsSync(path.join(root, icon))) fail('missing icon ' + icon);
}

const context = vm.createContext({
  console,
  Set,
  Map,
  WeakSet,
  WeakMap,
  URL,
  Date,
  Promise,
  RegExp,
  parseInt,
  parseFloat,
  Number,
  String,
  Math,
  JSON,
  location: { origin: 'https://fanova.com', pathname: '/creator', href: 'https://fanova.com/creator' },
  document: {
    readyState: 'loading',
    documentElement: {},
    addEventListener() {}
  },
  chrome: { runtime: { getURL(u) { return u; } } }
});
context.window = context;
context.globalThis = context;
for (const file of contentFiles) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
for (const name of ['init', 'downloadMedia', 'startCollectLibrary', 'ingestLibraryPosts', 'onRouteChange', 'buildUi']) {
  if (typeof context.Fanova[name] !== 'function') fail('missing Fanova.' + name);
}
const filename = context.Fanova.buildFilename('https://ik.imagekit.io/fanova/production/users/x/file.mp4', true, null);
if (typeof filename !== 'string' || !filename.startsWith('Fanova/')) fail('video filename was not built: ' + filename);
for (const gone of ['acceptProfile', 'renderProfile', 'buildProfileUi', 'ensureProfile']) {
  if (context.Fanova[gone]) fail('profile UI still exported: ' + gone);
}

const banned = [/activeSubscribers/, /ENABLE_PROFILE/, /__FANOVA_PROFILE__/, /ik-s=[A-Za-z0-9%_/-]{8,}/];
const scanRoots = jsFiles.concat(['popup/popup.html', 'styles/content.css', 'manifest.json']);
for (const file of scanRoots) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const pattern of banned) {
    if (pattern.test(text)) fail(file + ' matches ' + pattern);
  }
}

if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('ok');
