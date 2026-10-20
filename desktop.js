// desktop.js — open the Claude DESKTOP app (Code tab) in the student's starter-kit folder with a message already typed.
//   claude://code/new?folder=<absolute path>&q=<prompt>   (both encodeURIComponent; the student only presses Enter)
//   docs: https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link · https://code.claude.com/docs/en/desktop
// The kit folder is remembered per browser in localStorage "top1_kit_folder" (memory fallback when storage is blocked).
// Exposes window.T1Desktop = { folder, setFolder(path), validFolder(p), connectLink(key), makeLink(styleId), open(url,{fallbackText,onDone}), folderHelpHtml, maskKey, ... }
// open()'s onDone(notOpened) can run twice: true at ~2 s (hint shown), then false if the app still opens within ~60 s.
// Standalone (no app.js / account.js needed) and wrapped in an IIFE so it never clashes with app.js globals.
(function () {
  'use strict';
  const LS_KEY = 'top1_kit_folder';
  const MAX_LINK = 14000;                 // the app accepts q up to ~14 000 chars — our prompts are tiny, this is a guard
  let memFolder = '';
  const readLS = () => { try { const v = localStorage.getItem(LS_KEY); return v == null ? memFolder : v; } catch { return memFolder; } };
  const writeLS = v => { memFolder = v; try { v ? localStorage.setItem(LS_KEY, v) : localStorage.removeItem(LS_KEY); } catch {} };

  // ---------------------------------------------------------------- folder path
  // tidy what a student pastes: quotes from Windows "Copy as path", file:// URLs, Terminal "\ " escapes, trailing slashes
  function cleanFolder(p) {
    let s = String(p ?? '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
    s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
    if (/^file:\/\//i.test(s)) {
      try { const u = new URL(s); s = decodeURIComponent(u.pathname); if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1); } catch {}
    }
    if (/^[A-Za-z]:[\\/]/.test(s)) {                       // Windows: C:\Users\…  (forward slashes → backslashes)
      s = s.replace(/\//g, '\\').replace(/\\{2,}/g, '\\');
      s = s[0].toUpperCase() + s.slice(1);
      if (s.length > 3) s = s.replace(/\\+$/, '');
    } else if (s.startsWith('/')) {                       // Mac/Linux: /Users/…  (drag-and-drop from Terminal escapes spaces)
      s = s.replace(/\\([ \\'"()&!$#;,[\]{}~])/g, '$1');
      if (s.length > 1) s = s.replace(/\/+$/, '');
    }
    return s;
  }
  // '' when the (already cleaned) path is a usable absolute folder; otherwise a short Thai hint
  function folderError(p) {
    const s = String(p ?? '');
    if (!s) return 'วางที่อยู่โฟลเดอร์ชุดเริ่มต้นก่อน';
    if (s.length > 1000) return 'ที่อยู่ยาวเกินไป — คัดลอกใหม่อีกครั้ง';
    if (/[\u0000-\u001f\u007f]/.test(s)) return 'วางที่อยู่โฟลเดอร์เดียว (บรรทัดเดียว)';
    if (/^~/.test(s)) return 'ใช้ที่อยู่เต็ม เช่น /Users/ชื่อคุณ/Desktop/… (ห้ามขึ้นต้นด้วย ~)';
    if (/\.zip$/i.test(s)) return 'นี่คือไฟล์ .zip — แตกไฟล์ก่อน แล้วคัดลอกที่อยู่ของโฟลเดอร์ที่แตกออกมา';
    // the path of a file inside the kit (CLAUDE.md, README-อ่านก่อน.md …) instead of the folder itself
    if (/\.(md|txt|json|html?|pdf|js|mjs|py|sh|css|png|jpe?g|gif|webp|mp4|mov|m4v|webm|mp3|wav|docx?|xlsx?|pptx?|rtf)$/i.test(s.split(/[\\/]/).pop() || '')) return 'นี่คือที่อยู่ของไฟล์ — คลิกขวาที่โฟลเดอร์ชุดเริ่มต้น แล้วคัดลอกที่อยู่ของโฟลเดอร์';
    if (/^[A-Za-z]:\\/.test(s)) {
      if (s.length <= 3) return 'เลือกโฟลเดอร์ชุดเริ่มต้น ไม่ใช่ทั้งไดรฟ์';
      if (/[<>"|?*]/.test(s.slice(2))) return 'ที่อยู่มีตัวอักษรที่ใช้ไม่ได้ — คัดลอกใหม่ด้วย Copy as path';
      return '';
    }
    if (/^\/[^/]/.test(s)) return '';
    if (s === '/') return 'เลือกโฟลเดอร์ชุดเริ่มต้น ไม่ใช่ทั้งเครื่อง';
    return 'ที่อยู่ต้องขึ้นต้นด้วย / (Mac) หรือ C:\\ (Windows) — คัดลอกตามวิธีด้านล่าง';
  }
  const validFolder = p => folderError(cleanFolder(p)) === '';
  // save → the cleaned path, or '' when it is not a valid absolute folder (nothing is stored then)
  function setFolder(path) {
    const v = cleanFolder(path);
    if (folderError(v)) return '';
    writeLS(v);
    return v;
  }
  const clearFolder = () => writeLS('');

  // ---------------------------------------------------------------- links
  const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function normKey(raw) {
    const k = String(raw ?? '').trim().slice(0, 200);
    const m = /^t1[-\s]*(.+)$/i.exec(k);
    if (m) {
      const body = m[1].toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
      if (body.length === 12 && [...body].every(ch => KEY_ALPHABET.includes(ch))) return `T1-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
    }
    return k;
  }
  const KEY_RE = /^T1-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
  const STYLE_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;          // = the server's safeId (armory styles)
  // never show a full key on screen (same format as the kit's /top1-connect skill): T1-XXXX-…-ABCD
  const maskKey = k => { k = String(k || ''); if (!k) return ''; const tail = k.replace(/[^A-Za-z0-9]/g, '').slice(-4); return /^T1-/i.test(k) ? 'T1-XXXX-…-' + tail : '…' + tail; };
  const connectPrompt = key => { const k = normKey(key); return KEY_RE.test(k) ? '/top1-connect ' + k : ''; };
  const makePrompt = id => { const s = String(id ?? '').trim(); return STYLE_RE.test(s) ? '/top1-make ' + s : ''; };
  // claude://code/new?folder=…&q=… — '' when the folder (saved or given) or the prompt is missing/invalid
  function link(prompt, folder) {
    const f = cleanFolder(folder == null ? readLS() : folder);
    const q = String(prompt ?? '');
    if (!q.trim() || folderError(f)) return '';
    const url = 'claude://code/new?folder=' + encodeURIComponent(f) + '&q=' + encodeURIComponent(q);
    return url.length > MAX_LINK ? '' : url;
  }
  const connectLink = (key, folder) => { const p = connectPrompt(key); return p ? link(p, folder) : ''; };
  const makeLink = (styleId, folder) => { const p = makePrompt(styleId); return p ? link(p, folder) : ''; };

  // ---------------------------------------------------------------- environment
  function platform() {
    const n = (typeof navigator !== 'undefined' && navigator) || {};
    const p = String((n.userAgentData && n.userAgentData.platform) || n.platform || n.userAgent || '');
    if (/win/i.test(p)) return 'win';
    if (/mac/i.test(p)) return 'mac';
    return 'other';
  }
  function isMobile() {
    const n = (typeof navigator !== 'undefined' && navigator) || {};
    const ua = String(n.userAgent || '');
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    return /Mac/i.test(String(n.platform || '')) && (n.maxTouchPoints || 0) > 1;   // iPadOS pretends to be a Mac
  }
  const placeholder = () => platform() === 'win' ? 'เช่น C:\\Users\\ชื่อคุณ\\Desktop\\TOP1-HOLLYWOOD-ชุดเริ่มต้น' : 'เช่น /Users/ชื่อคุณ/Desktop/TOP1-HOLLYWOOD-ชุดเริ่มต้น';

  // fixed help text (no user data inside — safe for innerHTML)
  const folderHelpHtml =
    '<div class="dk-help">' +
    '<div class="dk-os"><b>Mac</b><ol>' +
    '<li>เปิด Finder แล้วหาโฟลเดอร์ชุดเริ่มต้น (เช่น TOP1-HOLLYWOOD-ชุดเริ่มต้น)</li>' +
    '<li>คลิกขวาที่โฟลเดอร์ แล้ว<b>กดปุ่ม Option ค้างไว้</b></li>' +
    '<li>เลือก <b>คัดลอก “…” เป็นชื่อพาธ</b> (Copy “…” as Pathname)</li>' +
    '<li>กลับมาวางในช่องด้านบน แล้วกด <b>บันทึก</b></li></ol></div>' +
    '<div class="dk-os"><b>Windows</b><ol>' +
    '<li>เปิด File Explorer แล้วหาโฟลเดอร์ชุดเริ่มต้น</li>' +
    '<li><b>กด Shift ค้างไว้</b> แล้วคลิกขวาที่โฟลเดอร์ (Windows 11 มีในเมนูคลิกขวาเลย)</li>' +
    '<li>เลือก <b>Copy as path</b> (คัดลอกเป็นเส้นทาง)</li>' +
    '<li>กลับมาวางในช่องด้านบน แล้วกด <b>บันทึก</b> — เครื่องหมาย " หัวท้าย เว็บลบให้เอง</li></ol></div>' +
    '<div class="mini">ต้องแตกไฟล์ .zip ก่อน แล้วเลือกโฟลเดอร์ที่แตกออกมา (ข้างในมีไฟล์ CLAUDE.md)</div>' +
    '</div>';

  // ---------------------------------------------------------------- open + "app did not open" hint
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k of Object.keys(attrs || {})) {
      const v = attrs[k]; if (v == null) continue;
      if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, String(v));
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c instanceof Node ? c : String(c)); });
    return e;
  }
  async function copyText(t) {
    if (window.T1UI && typeof window.T1UI.copy === 'function') return window.T1UI.copy(t, 'คัดลอกข้อความแล้ว');
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    try { const ta = el('textarea', { style: 'position:fixed;left:-9999px;top:0;opacity:0' }); ta.value = t; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); if (ok) return true; } catch {}
    try { window.prompt('คัดลอกข้อความนี้', t); } catch {}
    return false;
  }
  function hintNode(opts, bad) {
    const kids = [
      el('div', null, el('b', null, 'ถ้าแอปไม่เปิด: '), 'ติดตั้ง/อัปเดตแอป Claude จาก ',
        el('a', { href: 'https://claude.ai/download', target: '_blank', rel: 'noopener noreferrer' }, 'https://claude.ai/download'), ' แล้วลองใหม่'),
    ];
    if (bad) kids.unshift(el('div', { class: 'err' }, 'ยังสร้างลิงก์เปิดแอปไม่ได้ — เช็กที่อยู่โฟลเดอร์ก่อน'));
    if (opts.fallbackText) {
      const btn = el('button', { class: 'btn sm ghost', type: 'button', 'data-act': 'copy-fallback' }, 'คัดลอกข้อความ');
      btn.addEventListener('click', () => copyText(opts.fallbackText));
      kids.push(el('div', { class: 'muted', style: 'margin-top:6px' }, 'หรือเปิดแอป Claude เอง → แท็บ Code → เลือกโฟลเดอร์ชุดเริ่มต้น → วางข้อความแล้วกด Enter'),
        el('div', { class: 'row' }, btn));
    }
    return el('div', { class: 'dk-hint', role: 'status' }, kids);
  }
  function showHint(opts, bad) {
    const node = hintNode(opts, bad);
    if (opts.hintEl && opts.hintEl.nodeType === 1) { opts.hintEl.replaceChildren(node); opts.hintEl.hidden = false; return node; }
    // no slot given → a small floating card (inline styles so it works on pages without course.css)
    let box = document.getElementById('dk-float');
    if (box) box.remove();
    const close = el('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'ปิด', style: 'position:absolute;right:10px;top:10px;padding:4px 10px' }, '×');
    box = el('div', { id: 'dk-float', role: 'dialog', 'aria-label': 'แอป Claude ไม่เปิด',
      style: 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:80;width:min(520px,calc(100% - 32px));padding:16px 44px 16px 18px;border-radius:20px;background:rgba(255,255,255,.95);box-shadow:0 30px 80px rgba(16,42,94,.25),inset 0 0 0 1px rgba(16,42,94,.08);font:500 14px/1.6 Anuphan,Inter,system-ui,sans-serif;color:#0B1220' },
    close, node);
    close.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
    return node;
  }
  function clearHint(opts) {
    if (opts.hintEl && opts.hintEl.nodeType === 1) opts.hintEl.replaceChildren();
    const f = document.getElementById('dk-float'); if (f) f.remove();
  }
  // open(url, { fallbackText, hintEl, waitMs, watchMs, onDone }) — if the page still has focus after ~2 s the app probably did not open →
  // hint + copy fallback, onDone(true). The browser's first-time "Open Claude?" prompt often takes longer than 2 s to answer, so we keep
  // watching for ~60 s: when the page loses focus later (the app opened), the hint goes away and onDone(false) runs (at most once more).
  let stopWatch = null;                    // the previous open()'s watcher (a second click replaces it)
  function open(url, opts) {
    opts = opts || {};
    const u = String(url || '');
    if (stopWatch) stopWatch();
    clearHint(opts);
    if (!/^claude:\/\/code\/new\?folder=/.test(u)) { showHint(opts, true); return false; }
    let left = false, hinted = false, t1 = 0, t2 = 0;
    const done = notOpened => { if (typeof opts.onDone === 'function') { try { opts.onDone(notOpened); } catch {} } };
    const stop = () => {
      window.removeEventListener('blur', leave); window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', vis);
      clearTimeout(t1); clearTimeout(t2); if (stopWatch === stop) stopWatch = null;
    };
    function leave() {
      if (left) return;
      left = true;
      if (hinted) { stop(); clearHint(opts); done(false); }   // opened late (after the browser prompt) → take the hint back
    }
    function vis() { if (document.visibilityState === 'hidden') leave(); }
    window.addEventListener('blur', leave); window.addEventListener('pagehide', leave); document.addEventListener('visibilitychange', vis);
    stopWatch = stop;
    try { D.navigate(u); } catch {}
    t1 = setTimeout(() => {
      if (left) { stop(); done(false); return; }
      hinted = true; showHint(opts, false); done(true);
    }, opts.waitMs == null ? 2000 : +opts.waitMs);
    t2 = setTimeout(stop, opts.watchMs == null ? 60000 : Math.max(+opts.watchMs, +opts.waitMs || 0));
    return true;
  }

  const D = {
    get folder() { return readLS(); },
    set folder(v) { setFolder(v); },
    setFolder, clearFolder, validFolder, cleanFolder, folderError,
    connectPrompt, makePrompt, link, connectLink, makeLink, normKey, maskKey,
    open, folderHelpHtml, platform, isMobile, placeholder, storageKey: LS_KEY,
    // the actual jump to claude:// (one place; tests replace it)
    navigate(url) { window.location.href = url; },
  };
  window.T1Desktop = D;
})();
