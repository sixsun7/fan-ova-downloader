# Fanova Media Downloader

Chrome extension (Manifest V3) that saves original Fanova images and videos
into a `Fanova/{creator}/` folder. Hover a post for download and open-original.
Collect walks the creator's own post list, with a pause between requests.

It does not show subscriber counts, prices, bios, or other account info.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Load unpacked and choose this folder.
4. Reload the extension after each change, then refresh the Fanova tab.

## Layout

| Path | Role |
|---|---|
| `manifest.json` | Permissions and script order |
| `src/page/inject.js` | Page-world network hook |
| `src/content/` | Isolated-world UI and downloads (`state.js` first, `boot.js` last) |
| `src/background/` | Service worker downloads |
| `popup/popup.html` | Folder name and collect |
| `styles/content.css` | Overlay styles |
| `icons/` | Extension icons |
| `docs/api/` | Notes on the post and media responses |

`node tests.js` checks syntax and that the profile inspector is gone.
