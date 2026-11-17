# Fan ova Media Downloader

Chrome extension (Manifest V3) for personal, experimental use: it saves original Fan ova images and videos that the user is authorized to access into a `Fan ova/{creator}/` folder. Hover a post for download and open-original. Collect walks the creator's own post list, with a pause between requests.

## Purpose

The main goal of this project is **offline access**: keeping local copies of content the user is already allowed to view, so it can be re-watched or re-read later without needing a connection or re-loading it every time. This is useful to avoid repeated data usage and slow loads when revisiting content, for example on limited or unstable connections.

This purpose applies only to content the user has legitimate access to and permission to save. Offline archiving is not a justification for downloading content you are not authorized to keep.

## Scope and intended use

This repository is published as a personal-use tool for keeping local copies of content that the user has legitimate access to and permission to save.

- This project is **not affiliated with, endorsed by, or associated with Fan ova or its creators**.
- It is **not intended to promote or facilitate** unauthorized access, redistribution, paywall/DRM circumvention, or violation of any platform's terms of service.
- It does **not include or link to third-party content**.
- It is intended only for cases where the user has the right or permission to download and keep the content.
- The user is solely responsible for complying with applicable terms of service, copyright laws, and any other rules that apply.

This README is not legal advice. A disclaimer does not make an unauthorized use authorized.

## Responsible use

Use this project only for personal archiving of content you own or are authorized to save.

Do not use it to:

- download or redistribute third-party content without permission;
- bypass access controls, paywalls, DRM, or other technical restrictions;
- share, sell, publish, or otherwise distribute downloaded content;
- violate Fan ova's terms of service or any other platform's rules.

Any use outside the intended scope is not supported by the author.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Load unpacked and choose this folder.
4. Reload the extension after each change, then refresh the Fan ova tab.

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
