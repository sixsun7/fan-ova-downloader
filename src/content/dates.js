'use strict';

// Exact post and comment dates.

Fanova.formatBadgeTimestamp = function (ms) {
  try {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  } catch (err) {
    console.warn('[Fanova Downloader] failed to format badge date', err);
    return '';
  }
}

Fanova.scheduleBadgeRefresh = function () {
  if (window !== window.top) return;
  if (Fanova.badgeRafPending) return;
  Fanova.badgeRafPending = true;
  requestAnimationFrame(Fanova.refreshDateBadges);
}

Fanova.startDateBadges = function () {
  try {
    Fanova.scheduleBadgeRefresh();
    const obs = new MutationObserver(() => Fanova.scheduleBadgeRefresh());
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => Fanova.scheduleBadgeRefresh(), 2500);
  } catch (err) {
    console.warn('[Fanova Downloader] date badges failed to start', err);
  }
}

Fanova.normCommentPart = function (s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

Fanova.normCommentKey = function (key) {
  const s = String(key || '');
  const sep = s.indexOf('\n');
  if (sep < 0) return s.toLowerCase();
  return s.slice(0, sep).toLowerCase() + '\n' + s.slice(sep + 1);
}

Fanova.findCommentSheets = function () {
  const out = [];
  const seen = new Set();
  const push = (el) => {
    if (el && !seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  };
  document.querySelectorAll('[aria-label="Bottom Sheet"]').forEach(push);
  if (!out.length) {
    document.querySelectorAll('[role="dialog"]').forEach((d) => {
      const header = d.querySelector('div[dir="auto"]');
      if (header && Fanova.normCommentPart(header.textContent).toLowerCase() === 'comments') push(d);
    });
  }
  return out;
}

Fanova.findCommentSheet = function () {
  const all = Fanova.findCommentSheets();
  return all[0] || null;
}

Fanova.findCommentRows = function () {
  const found = [];
  const seen = new Set();
  const pushRow = (row, name, body, anchor) => {
    const key = name + '\n' + body;
    if (!name || !body || seen.has(key)) return;
    seen.add(key);
    found.push({ row, key, anchor: anchor && anchor.isConnected ? anchor : row });
  };
  try {
    const sheets = Fanova.findCommentSheets();
    if (!sheets.length) return found;
    for (const sheet of sheets) {
    const names = sheet.querySelectorAll('div[dir="auto"]');
    for (const nameEl of names) {
      if (found.length >= 30) break;
      const nstyle = nameEl.getAttribute('style') || '';
      if (!nstyle.includes('Inter-SemiBold') || !nstyle.includes('font-size: 14px')) continue;
      const name = Fanova.normCommentPart(nameEl.textContent);
      if (!name || name === 'Comments') continue;
      const block = nameEl.parentElement;
      if (!block) continue;
      let body = '';
      for (const sib of block.children) {
        if (sib === nameEl) continue;
        if (sib.getAttribute && sib.getAttribute('dir') === 'auto') {
          const sstyle = sib.getAttribute('style') || '';
          if (sstyle.includes('Inter-Regular')) {
            body = Fanova.normCommentPart(sib.textContent);
            break;
          }
        }
      }
      if (!body) continue;
      const row = block.parentElement;
      if (!row || !row.querySelector('img')) continue;
      pushRow(row, name, body, nameEl);
    }
    }
    if (found.length > 0) return found;
    for (const sheet of sheets) {
    const avatars = sheet.querySelectorAll('img');
    for (const avatar of avatars) {
      if (found.length >= 30) break;
      let row = avatar.parentElement;
      for (let depth = 0; depth < 3 && row && row !== sheet; depth++) {
        const texts = row.querySelectorAll('div[dir="auto"]');
        if (texts.length >= 2) break;
        row = row.parentElement;
      }
      if (!row || row === sheet) continue;
      const items = [...row.querySelectorAll('div[dir="auto"]')]
        .map((el) => ({ el, t: Fanova.normCommentPart(el.textContent) }))
        .filter((item) => item.t && item.t !== 'Comments' && item.t.length <= 500);
      if (items.length < 2) continue;
      const nameItem = items.find((item) => item.t.length <= 60) || items[0];
      let body = '';
      for (const item of items) {
        if (item.t !== nameItem.t && item.t.length > body.length) body = item.t;
      }
      if (!body) continue;
      pushRow(row, nameItem.t, body, nameItem.el);
    }
    }
    if (found.length > 0) return found;
    // Generic pass: no tag, font, or avatar assumptions. Any small container
    // with 2+ text leaves is a candidate row (name = first short leaf,
    // body = longest leaf). Candidates are safe: badges render only on an
    // exact API author+text match, so noise never gets a date.
    for (const sheet of sheets) {
    const els = sheet.querySelectorAll('*');
    for (const el of els) {
      if (found.length >= 30) break;
      if (el.children.length > 8) continue;
      if (el.classList && (el.classList.contains('fanova-dl-comment-date') || el.classList.contains('fanova-dl-inline-date'))) continue;
      const leaves = [];
      const stack = [el];
      let guard = 0;
      while (stack.length && guard < 40 && leaves.length <= 6) {
        guard += 1;
        const cur = stack.pop();
        if (!cur || cur.children.length === 0) {
          if (cur && !(cur.classList && cur.classList.contains('fanova-dl-comment-date'))) {
            const t = Fanova.normCommentPart(cur.textContent);
            if (t && t !== 'Comments' && t.length >= 1 && t.length <= 500) leaves.push({ el: cur, t });
          }
        } else {
          for (const c of cur.children) {
            if (c.classList && (c.classList.contains('fanova-dl-comment-date') || c.classList.contains('fanova-dl-inline-date'))) continue;
            stack.push(c);
          }
        }
      }
      if (leaves.length < 2 || leaves.length > 6) continue;
      const nameLeaf = leaves.find((leaf) => leaf.t.length >= 2 && leaf.t.length <= 60);
      if (!nameLeaf) continue;
      let body = '';
      for (const leaf of leaves) {
        if (leaf.t !== nameLeaf.t && leaf.t.length > body.length) body = leaf.t;
      }
      if (body.length < 2) continue;
      pushRow(el, nameLeaf.t, body, nameLeaf.el);
    }
    }
    if (found.length > 0) return found;
    // Text-node pass: groups raw text nodes by shared ancestor so mixed
    // content (mention links, emoji spans splitting one comment into
    // several leaves) still forms one candidate row. The body is the
    // remaining leaves joined in order, so a leading @mention is kept and
    // trailing action labels only append a suffix the prefix matcher
    // tolerates.
    for (const sheet of sheets) {
    try {
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      const byContainer = new Map();
      let tnode = null;
      let tguard = 0;
      while ((tnode = walker.nextNode()) && tguard < 2000) {
        tguard += 1;
        const t = Fanova.normCommentPart(tnode.nodeValue);
        if (!t || t === 'Comments' || t.length > 500) continue;
        const p = tnode.parentElement;
        if (!p || /^(SCRIPT|STYLE|INPUT|TEXTAREA)$/.test(p.tagName)) continue;
        if (p.closest && p.closest('.fanova-dl-comment-date,.fanova-dl-inline-date')) continue;
        let c = p;
        for (let d = 0; d < 6 && c && c !== sheet; d++) {
          if (!byContainer.has(c)) byContainer.set(c, []);
          byContainer.get(c).push({ t, el: p });
          c = c.parentElement;
        }
      }
      for (const [container, texts] of byContainer) {
        if (found.length >= 30) break;
        if (texts.length < 2) continue;
        const nameItem = texts.find((item) => item.t.length >= 2 && item.t.length <= 60);
        if (!nameItem) continue;
        const rest = texts.filter((item) => item.t !== nameItem.t);
        if (!rest.length) continue;
        const body = Fanova.normCommentPart(rest.map((item) => item.t).join(' '));
        if (body.length < 2) continue;
        pushRow(container, nameItem.t, body, nameItem.el);
      }
    } catch (err) {
      console.warn('[Fanova Downloader] comment text scan failed', err);
    }
    }
  } catch (err) {
    console.warn('[Fanova Downloader] comment scan failed', err);
  }
  return found;
}

Fanova.findCommentMs = function (rawKey) {
  const key = Fanova.normCommentKey(rawKey);
  const exact = Fanova.commentStamps.get(key);
  if (exact) return exact;
  if (Fanova.commentFuzzyCache.size !== Fanova.commentStamps.size) {
    Fanova.commentFuzzyCache = { size: Fanova.commentStamps.size, map: new Map() };
  }
  if (Fanova.commentFuzzyCache.map.has(key)) return Fanova.commentFuzzyCache.map.get(key) || null;
  let found = null;
  const sep = key.indexOf('\n');
  const author = sep < 0 ? key : key.slice(0, sep);
  const body = sep < 0 ? '' : key.slice(sep + 1);
  if (author && body.length > 24) {
    for (const [k, ms] of Fanova.commentStamps) {
      const s = k.indexOf('\n');
      if (s < 0 || k.slice(0, s) !== author) continue;
      const tb = k.slice(s + 1);
      if (tb.length > 24 && (tb.startsWith(body) || body.startsWith(tb))) {
        found = ms;
        break;
      }
    }
  }
  if (!found && body.length > 12) {
    let matches = 0;
    for (const [k, ms] of Fanova.commentStamps) {
      const s = k.indexOf('\n');
      const tb = s < 0 ? k : k.slice(s + 1);
      if (tb === body || (tb.length > 24 && body.length > 24 && (tb.startsWith(body) || body.startsWith(tb)))) {
        found = ms;
        matches += 1;
        if (matches > 1) {
          found = null;
          break;
        }
      }
    }
  }
  Fanova.commentFuzzyCache.map.set(key, found || null);
  return found;
}

Fanova.isRelativeDateText = function (s) {
  if (!s) return false;
  const t = s.trim();
  return /\bago$/i.test(t) || /^hace\b/i.test(t) || /^\d{1,2}-\d{1,2}$/.test(t) || /^\d+\s*[smhdw]$/i.test(t);
}

Fanova.findPostImageMs = function (node) {
  let n = node;
  for (let i = 0; i < 15 && n && n !== document.body; i++) {
    if (n.querySelectorAll) {
      const imgs = n.querySelectorAll('img');
      let best = null;
      let bestArea = 0;
      let bestExact = null;
      let bestExactArea = 0;
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.width < 200 || r.height < 200) continue;
        const src = img.currentSrc || img.src || '';
        const found = Fanova.findPostMsForSrc(src);
        if (!found.ms) continue;
        const area = r.width * r.height;
        if (found.exact) {
          if (area > bestExactArea) {
            bestExactArea = area;
            bestExact = found.ms;
          }
        } else if (area > bestArea) {
          bestArea = area;
          best = found.ms;
        }
      }
      if (bestExact) return { ms: bestExact, root: n };
      if (best) return { ms: best, root: n };
    }
    n = n.parentElement;
  }
  return null;
}

Fanova.enhancePostDates = function () {
  try {
    const all = document.querySelectorAll('div[dir="auto"]');
    let budget = 80;
    const loose = [];
    for (const el of all) {
      if (budget <= 0) break;
      // '1' means a label was inserted. React re-renders can drop our
      // injected nodes while keeping the attribute, which used to make the
      // date and info button vanish for that post until reload. If the
      // label is gone, clear the stale flag and enhance the row again.
      const flag = el.dataset.fanovaDlDate;
      let wasDated = flag === '1';
      if (flag) {
        if (!wasDated || el.querySelector('.fanova-dl-inline-date')) continue;
        el.removeAttribute('data-fanova-dl-date');
      }
      if (el.closest('[aria-label="Bottom Sheet"]') || el.closest('[role="dialog"]')) continue;
      if (el.closest('.fanova-dl-post-backdrop,.fanova-dl-collect')) continue;
      // Sidebar and header links (profile name, nav) are SemiBold text but
      // never post anchors. Post captions and dates never live inside links.
      if (el.closest('header,nav,[role="banner"],[role="link"]')) {
        el.dataset.fanovaDlDate = 'skip';
        continue;
      }
      const style = el.getAttribute('style') || '';
      const text = (el.textContent || '').trim();
      const isDate = style.includes('rgb(136, 151, 174)') && style.includes('font-size: 12px') && Fanova.isRelativeDateText(text);
      const isCaption = style.includes('Inter-SemiBold') && style.includes('font-size: 16px') && el.querySelector('span');
      const isCaptionLoose = !isDate && !isCaption
        && (style.includes('SemiBold') || style.includes('Bold'))
        && text.length >= 8 && text.length <= 600;
      if (!isDate && !isCaption) {
        if (isCaptionLoose) loose.push(el);
        continue;
      }
      // Dates and captions share one once-per-post guard so a shared
      // ancestor can never stamp two rows with one post's image. A row that
      // already carried the label before a re-render is exempt: its own
      // root is expected to stay in datedRoots.
      if (!wasDated) {
        let n = el;
        let hasDate = false;
        for (let i = 0; i < 15 && n && n !== document.body; i++) {
          if (Fanova.datedRoots.has(n)) {
            hasDate = true;
            break;
          }
          n = n.parentElement;
        }
        if (hasDate) {
          el.dataset.fanovaDlDate = 'skip';
          continue;
        }
      }
      budget -= 1;
      const found = Fanova.findPostImageMs(el);
      if (!found) continue;
      if (found.root.querySelectorAll('img').length > 25) {
        // Scope escaped to the feed/app root (many posts inside): resolving
        // here would stamp this row with a sibling post's image.
        el.dataset.fanovaDlDate = 'skip';
        continue;
      }
      const label = document.createElement('span');
      label.className = 'fanova-dl-inline-date';
      label.textContent = ' • ' + Fanova.formatBadgeTimestamp(found.ms);
      el.appendChild(label);
      Fanova.datedRoots.add(found.root);
      el.dataset.fanovaDlDate = '1';
      Fanova.addPostInfoBadge(el, found);
    }
    for (const el of loose) {
      if (budget <= 0) break;
      const flag = el.dataset.fanovaDlDate;
      let wasDated = flag === '1';
      if (flag) {
        if (!wasDated || el.querySelector('.fanova-dl-inline-date')) continue;
        el.removeAttribute('data-fanova-dl-date');
      }
      if (el.closest('.fanova-dl-post-backdrop,.fanova-dl-collect')) continue;
      if (el.closest('header,nav,[role="banner"],[role="link"]')) {
        el.dataset.fanovaDlDate = 'skip';
        continue;
      }
      if (!wasDated) {
        let n = el;
        let hasDate = false;
        for (let i = 0; i < 15 && n && n !== document.body; i++) {
          if (Fanova.datedRoots.has(n)) {
            hasDate = true;
            break;
          }
          n = n.parentElement;
        }
        if (hasDate) {
          el.dataset.fanovaDlDate = 'skip';
          continue;
        }
      }
      budget -= 1;
      const found = Fanova.findPostImageMs(el);
      if (!found) continue;
      if (found.root.querySelectorAll('img').length > 25) {
        el.dataset.fanovaDlDate = 'skip';
        continue;
      }
      const label = document.createElement('span');
      label.className = 'fanova-dl-inline-date';
      label.textContent = ' • ' + Fanova.formatBadgeTimestamp(found.ms);
      el.appendChild(label);
      Fanova.datedRoots.add(found.root);
      el.dataset.fanovaDlDate = '1';
      Fanova.addPostInfoBadge(el, found);
    }
  } catch (err) {
    console.warn('[Fanova Downloader] post date enhance failed', err);
  }
}

Fanova.logCommentDiag = function () {
  try {
    const sheets = Fanova.findCommentSheets();
    const rows = Fanova.findCommentRows();
    let matched = 0;
    for (const item of rows) {
      if (Fanova.findCommentMs(item.key)) matched += 1;
    }
    let textNodes = 0;
    let dirAuto = 0;
    let imgs = 0;
    for (const sheet of sheets) {
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      let n = null;
      let guard = 0;
      while ((n = walker.nextNode()) && guard < 5000) {
        guard += 1;
        if (Fanova.normCommentPart(n.nodeValue)) textNodes += 1;
      }
      dirAuto += sheet.querySelectorAll('div[dir="auto"]').length;
      imgs += sheet.querySelectorAll('img').length;
    }
    console.log('[Fanova Downloader] comments: sheets=' + sheets.length + ' rows=' + rows.length + ' matched=' + matched + ' captured=' + Fanova.commentStamps.size + ' posts=' + Fanova.postStamps.size + ' texts=' + textNodes + ' dirAuto=' + dirAuto + ' imgs=' + imgs);
    if (rows.length > 0 && matched === 0) {
      console.log('[Fanova Downloader] comment sample row key:', JSON.stringify(rows[0].key));
      console.log('[Fanova Downloader] comment sample captured key:', JSON.stringify(Fanova.commentStamps.keys().next().value));
    }
    if (!sheets.length) {
      console.log('[Fanova Downloader] comment sheet not found: open a post comment thread first');
    } else if (rows.length === 0) {
      console.log('[Fanova Downloader] comment sheet open but no rows detected: markup may have changed');
    } else if (Fanova.commentStamps.size === 0) {
      console.log('[Fanova Downloader] rows detected but no comment API captured: reload with the extension active, then open comments');
    }
  } catch (err) {
    console.warn('[Fanova Downloader] comment diag failed', err);
  }
}

Fanova.enhanceCommentDates = function () {
  try {
    const rows = Fanova.findCommentRows();
    for (const item of rows) {
      const ms = Fanova.findCommentMs(item.key);
      if (!ms) continue;
      if (!item.row.isConnected) continue;
      if (item.row.querySelector('.fanova-dl-comment-date')) continue;
      const label = document.createElement('span');
      label.className = 'fanova-dl-comment-date';
      label.textContent = ' • ' + Fanova.formatBadgeTimestamp(ms);
      const anchor = item.anchor && item.anchor.isConnected ? item.anchor : item.row;
      if (anchor === item.row) {
        anchor.appendChild(label);
      } else {
        anchor.after(label);
      }
    }
  } catch (err) {
    console.warn('[Fanova Downloader] comment date enhance failed', err);
  }
}

Fanova.refreshDateBadges = function () {
  Fanova.badgeRafPending = false;
  if (window !== window.top) return;
  if (document.hidden) return;
  try {
    Fanova.enhancePostDates();
    Fanova.enhancePostInfoButtons();
    const sheetOpen = !!Fanova.findCommentSheet();
    if (sheetOpen && !Fanova.commentSheetWasOpen) {
      Fanova.commentSheetWasOpen = true;
      setTimeout(Fanova.logCommentDiag, 1500);
    } else if (!sheetOpen) {
      Fanova.commentSheetWasOpen = false;
    }
    Fanova.enhanceCommentDates();
  } catch (err) {
    console.warn('[Fanova Downloader] badge refresh failed', err);
  }
}
