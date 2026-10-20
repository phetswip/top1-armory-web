// admin-course.js — back-office tabs นักเรียน · บทเรียน · ไฟล์คอร์ส (course-api admin routes).
// Loaded after app.js (h, toast, copy …) and admin.js (window.T1Admin: courseApi with the admin's auth headers, errText, sheet,
// keys cache, students cache shared with the keys tab).
// Uploads (videos / attachments / course files): course-api sign-upload → supabase.storage.from('course-private')
//   .uploadToSignedUrl(path, token, file) → set-video | add-attachment | create. supabase-js gives no progress callback →
//   an indeterminate bar + file size + elapsed time, and the tab asks before closing while an upload runs.
// Everything from the server reaches the page as text (h() never parses HTML); the markdown preview escapes first.
(function () {
  'use strict';
  const A = window.T1Admin;
  if (!A || typeof h !== 'function') return;
  const $ = id => document.getElementById(id);
  const capi = A.courseApi, errText = A.errText, say = A.say;
  const BUCKET = 'course-private';
  const MAX_UPLOAD = 5 * 1024 * 1024 * 1024;           // = course-private bucket limit (5 GB)
  const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm'];
  const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9-]{1,60}$/;
  const MODULE_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,40}$/;
  const VIDEO_LABEL = { youtube: 'YouTube', vimeo: 'Vimeo', storage: 'ไฟล์ที่อัปโหลด', url: 'ลิงก์วิดีโอ' };

  // ---------------------------------------------------------------- small helpers
  const fsize = n => { n = +n; if (!isFinite(n) || n <= 0) return '-'; if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; };
  const extOf = name => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0'); return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`; };
  // same mask as the student pages and the kit's /top1-connect skill: T1-XXXX-…-ABCD
  const maskKey = k => { k = String(k || ''); if (!k) return ''; const tail = k.replace(/[^A-Za-z0-9]/g, '').slice(-4); return /^T1-/i.test(k) ? 'T1-XXXX-…-' + tail : '…' + tail; };
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(String(s || '').trim());
  const lessonHref = id => 'lesson.html?id=' + encodeURIComponent(id);
  // local preview only (tools/mock-server.mjs on 127.0.0.1 over plain http): same-origin http links count as safe too — never true on the real https site
  const LOCAL = location.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  const localUrl = u => LOCAL && String(u || '').startsWith(location.origin + '/') && !/[\s"'<>]/.test(String(u));
  const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) || localUrl(u);
  const bySort = (a, b) => (a.sort_order - b.sort_order) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const btn = (text, onclick, cls = 'btn sm ghost', extra = {}) => h('button', { class: cls, type: 'button', onclick, ...extra }, text);
  // on/off switch (same look as the keys/styles tabs): act(next) does the request + re-render; errors → toast
  function switchBtn(on, label, act) {
    const b = h('button', { class: 'sw' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, title: label });
    b.onclick = async () => { b.disabled = true; try { await act(!on); } catch (e) { toast('ไม่สำเร็จ: ' + errText(e)); b.disabled = false; } };
    return b;
  }
  function genPw() {
    const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint32Array(10);
    try { crypto.getRandomValues(a); } catch { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 1e9); }
    return Array.from(a, n => abc[n % abc.length]).join('');
  }
  const pwProblem = p => !p ? 'ใส่รหัสผ่านก่อน' : p.length < 8 ? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว' : p.length > 72 ? 'รหัสผ่านยาวเกินไป (ไม่เกิน 72 ตัว)' : '';
  const loginUrl = () => A.pageUrl('login.html');
  const accessMsg = (email, pw, key) => `ข้อมูลเข้าเรียน TOP 1 HollyWood\nเว็บ: ${loginUrl()}\nอีเมล: ${email}\nรหัสผ่าน: ${pw}` +
    (key ? `\nคีย์ (ใช้เชื่อมคลังแสงกับแอป Claude): ${key}` : '') + '\n\nถ้าลืมรหัสผ่าน ติดต่อทีมงาน · ห้ามแชร์ให้คนอื่นนะครับ';

  // ---------------------------------------------------------------- tiny SAFE markdown → HTML (same rules as lesson.js)
  // Everything is escaped first; only the tags written below can come out. Links: http(s) only, new tab, rel=noopener.
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINK_OK = /^https?:\/\/[^\s<>"'`]+$/i;
  const anchor = (url, labelHtml) => '<a href="' + escH(url) + '" target="_blank" rel="noopener noreferrer">' + labelHtml + '</a>';
  const emph = s => s
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?!\*)/g, '$1<em>$2</em>');
  function inline(raw) {
    const slots = [];
    const keep = html => '\u0000' + (slots.push(html) - 1) + '\u0000';
    let s = String(raw ?? '').replace(/\u0000/g, '');
    s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('<code>' + escH(c) + '</code>'));
    s = s.replace(/\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,2000})\s*\)/g, (_, label, url) => LINK_OK.test(url) ? keep(anchor(url, emph(escH(label)))) : label);
    s = s.replace(/\bhttps?:\/\/[^\s<>"'`\u0000]+/gi, url => {
      const t = /[.,;:!?)\]]+$/.exec(url); const tail = t ? t[0] : ''; if (tail) url = url.slice(0, -tail.length);
      return (LINK_OK.test(url) ? keep(anchor(url, escH(url))) : url) + tail;
    });
    s = emph(escH(s));
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i] || '');
  }
  function renderMd(src) {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n');
    const out = [];
    let para = [], list = null, quote = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const flushList = () => {
      if (!list) return;
      const open = list.t === 'ol' && list.start > 1 ? '<ol start="' + list.start + '">' : '<' + list.t + '>';
      out.push(open + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + '</' + list.t + '>'); list = null;
    };
    const flushQuote = () => { if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; } };
    const flush = () => { flushPara(); flushList(); flushQuote(); };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m = /^\s*(```|~~~)/.exec(line);
      if (m) {
        flush(); const fence = m[1], buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
        out.push('<pre><code>' + escH(buf.join('\n')) + '</code></pre>'); continue;
      }
      if (!line.trim()) { flush(); continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line))) { flush(); const lv = Math.min(4, m[1].length + 1); out.push(`<h${lv}>` + inline(m[2]) + `</h${lv}>`); continue; }
      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
      if ((m = /^\s*[-*+•]\s+(.*)$/.exec(line))) { flushPara(); flushQuote(); if (!list || list.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\s*(\d{1,4})[.)]\s+(.*)$/.exec(line))) { flushPara(); flushQuote(); if (!list || list.t !== 'ol') { flushList(); list = { t: 'ol', start: +m[1] || 1, items: [] }; } list.items.push(m[2]); continue; }
      if ((m = /^\s*>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
      if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushList(); flushQuote(); para.push(line.trim());
    }
    flush();
    return out.join('\n');
  }

  // ---------------------------------------------------------------- uploads (sign → uploadToSignedUrl → finish)
  let uploading = 0;
  addEventListener('beforeunload', e => { if (uploading > 0) { e.preventDefault(); e.returnValue = ''; } });
  function uploadErr(e) {
    const m = String((e && (e.message || e.error)) || e || ''), st = String((e && (e.statusCode || e.status)) || '');
    if (st === '413' || /exceed|too large|maximum allowed size|payload/i.test(m)) return 'ไฟล์ใหญ่เกินขีดจำกัดของระบบ — ต้องตั้งขนาดอัปโหลดสูงสุดใน Supabase (Storage → Settings) เป็น 5 GB ก่อน';
    if (/expired|signature|jwt|invalid token|unauthori[sz]ed/i.test(m) || st === '401' || st === '403') return 'ลิงก์อัปโหลดหมดอายุหรือใช้ไม่ได้ — เลือกไฟล์ใหม่อีกครั้ง';
    if (/fetch|network|load failed|timeout|aborted/i.test(m)) return 'อินเทอร์เน็ตหลุดระหว่างอัปโหลด — เลือกไฟล์ใหม่อีกครั้ง';
    if (/[฀-๿]/.test(m)) return m;
    return 'ส่งไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง' + (m ? ` (${m.slice(0, 120)})` : '');
  }
  // supabase-js sends a File as multipart: the part's type becomes the stored content type → give known video/zip files a type
  const GUESS_TYPE = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', zip: 'application/zip', pdf: 'application/pdf' };
  const typed = file => { const t = !file.type && GUESS_TYPE[extOf(file.name)]; try { return t ? new File([file], file.name, { type: t }) : file; } catch { return file; } };
  async function putFile(sign, file) {
    const sb = A.sb();
    if (!sb || !sb.storage || typeof sb.storage.from !== 'function') throw new Error('ระบบอัปโหลดยังไม่พร้อม — รีเฟรชหน้าแล้วลองใหม่');
    let res;
    // cacheControl given explicitly: supabase-js 2.45.4 does not default it for signed uploads
    try { res = await sb.storage.from(BUCKET).uploadToSignedUrl(sign.path, sign.token, typed(file), { cacheControl: '3600', contentType: file.type || 'application/octet-stream' }); }
    catch (e) { throw new Error(uploadErr(e)); }
    if (res && res.error) throw new Error(uploadErr(res.error));
  }
  // progress card inside `host` (kept as a node so a re-render of the editor can re-attach it while the upload runs)
  function progress(host, file, title) {
    const t0 = Date.now();
    const stepEl = h('div', { class: 'mini' }), stat = h('div', { class: 'mini' });
    host.replaceChildren(h('div', { class: 'upbox', role: 'status' },
      h('div', { class: 'row', style: 'margin:0;justify-content:space-between' }, h('b', null, title), h('span', { class: 'mini' }, fsize(file.size))),
      h('div', { class: 'prog busy' }, h('i')), stepEl, stat,
      h('div', { class: 'upwarn' }, 'ห้ามปิดหรือรีเฟรชแท็บนี้จนกว่าจะขึ้นว่าเสร็จ (ไฟล์ใหญ่อาจใช้หลายนาที)')));
    const paint = () => { stat.textContent = `${file.name} · ${fsize(file.size)} · ผ่านไป ${clock(Date.now() - t0)} นาที`; };
    paint();
    const timer = setInterval(paint, 1000);
    uploading++;
    let closed = false;
    return {
      step(t) { stepEl.textContent = t; },
      done(text, kind) {
        if (closed) return; closed = true; uploading--; clearInterval(timer);
        host.replaceChildren(h('div', { class: kind === 'err' ? 'err' : 'ok', style: 'margin-top:10px' }, text));
      },
    };
  }
  // → finish()'s reply, or null when something failed (the message stays in `host`)
  async function runUpload(host, file, title, sign, finish) {
    const p = progress(host, file, title);
    try {
      p.step('1/3 กำลังขอลิงก์อัปโหลด…');
      const s = await sign();
      if (!s || !s.path || !s.token) throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งลิงก์อัปโหลดมา — ลองใหม่อีกครั้ง');
      p.step('2/3 กำลังส่งไฟล์ขึ้นระบบ…');
      await putFile(s, file);
      p.step('3/3 กำลังบันทึก…');
      const r = await finish(s);
      p.done(`✓ อัปโหลด ${file.name} เสร็จแล้ว`, 'ok');
      return r || {};
    } catch (e) {
      p.done('อัปโหลดไม่สำเร็จ: ' + errText(e), 'err');
      return null;
    }
  }
  const sizeProblem = file => !file ? 'ยังไม่ได้เลือกไฟล์' : !file.size ? 'ไฟล์นี้ว่างเปล่า (0 ไบต์)' : file.size > MAX_UPLOAD ? `ไฟล์ใหญ่เกิน 5 GB (${fsize(file.size)}) — ย่อไฟล์ก่อน` : '';
  const pickedFiles = input => { const list = Array.from(input.files || []); try { input.value = ''; } catch {} return list; };

  // ================================================================ นักเรียน
  const ST = { loaded: false };
  const CSx = () => A.students();
  const keyBad = s => s.key && (!s.key.active || s.key.expired);
  async function loadStudents() {
    ST.loaded = true;
    if (!CSx().list) A.tableMsg('stTable', 'กำลังโหลด…');
    try { const d = await capi('admin/students'); A.setStudents(d.students, d.total); }
    catch (e) { ST.loaded = false; A.tableMsg('stTable', 'โหลดรายชื่อนักเรียนไม่สำเร็จ: ' + errText(e), 'err'); }
  }
  function patchStudent(srv) {
    if (!srv || !srv.id) return;
    const cs = CSx();
    A.setStudents((cs.list || []).map(x => x.id === srv.id ? { ...x, ...srv } : x), cs.total);
  }
  function renderStudents() {
    const cs = CSx(); if (!cs.list) return;
    const all = cs.list, total = cs.total || 0;
    const q = $('stSearch').value.trim().toLowerCase(), f = $('stFilter').value;
    const match = s => (!f || (f === 'on' ? s.active : f === 'off' ? !s.active : f === 'nokey' ? !s.key : f === 'badkey' ? keyBad(s) : true)) &&
      (!q || [s.name, s.email, s.key && s.key.key].join(' ').toLowerCase().includes(q));
    const rows = all.filter(match);
    $('stCount').textContent = `(${all.length} คน · เปิดเรียน ${all.filter(s => s.active).length})`;
    if (!rows.length) { A.tableMsg('stTable', all.length ? 'ไม่พบนักเรียนที่ตรงกับคำค้น' : 'ยังไม่มีนักเรียน — ส่งคีย์ + ลิงก์ลงทะเบียนให้นักเรียน หรือกด “เพิ่มนักเรียนเอง”'); return; }
    $('stTable').replaceChildren(
      h('tr', null, ['นักเรียน', 'คีย์', 'การเรียน', 'ลงทะเบียน', 'เข้าล่าสุด', 'ความคืบหน้า', ''].map(t => h('th', null, t))),
      ...rows.map(s => {
        const pct = total ? Math.min(100, Math.round((+s.done || 0) / total * 100)) : 0;
        const keyCell = s.key
          ? [h('div', { class: 'row', style: 'margin:0;flex-wrap:nowrap' }, h('span', { class: 'kcode', title: 'คีย์ (ซ่อนบางส่วน)' }, maskKey(s.key.key)),
            btn('คัดลอก', () => copy(s.key.key, 'คัดลอกคีย์แล้ว'), 'btn sm ghost', { title: 'คัดลอกคีย์เต็ม' })),
          !s.key.active ? h('span', { class: 'st off' }, 'คีย์ถูกปิด') : s.key.expired ? h('span', { class: 'st exp' }, 'คีย์หมดอายุ') : null]
          : h('span', { class: 'st off', title: 'นักเรียนใส่คีย์เองได้ที่หน้าคอร์สของฉัน' }, 'ไม่มีคีย์');
        return h('tr', null,
          h('td', null, h('b', null, s.name || '(ไม่มีชื่อ)'), h('div', { class: 'muted' }, s.email || '-')),
          h('td', null, keyCell),
          h('td', null, h('div', { class: 'row', style: 'margin:0;flex-wrap:nowrap' },
            switchBtn(s.active, s.active ? 'ปิดการเรียนของนักเรียนคนนี้' : 'เปิดการเรียนให้นักเรียนคนนี้', async v => {
              const r = await capi('admin/students', { action: 'update', id: s.id, active: v });
              patchStudent(r.student || { id: s.id, active: v }); toast(v ? 'เปิดการเรียนแล้ว' : 'ปิดการเรียนแล้ว');
            }),
            h('span', { class: 'st ' + (s.active ? 'on' : 'off') }, s.active ? 'เปิดเรียน' : 'ปิดอยู่'))),
          h('td', { class: 'muted nowrap' }, A.fdate(s.created_at)),
          h('td', { class: 'muted nowrap' }, s.last_seen_at ? A.fdate(s.last_seen_at, true) : 'ยังไม่เคยเข้า'),
          h('td', { class: 'nowrap' }, `${+s.done || 0}/${total}`, h('span', { class: 'mbar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` }))),
          h('td', null, h('div', { class: 'acts2' },
            btn('แก้ชื่อ', () => editName(s)),
            btn('ตั้งรหัสผ่านใหม่', () => setPassword(s)),
            s.key ? btn('ถอดคีย์', () => unlinkKey(s)) : null,
            btn('ลบ', () => delStudent(s), 'btn sm red'))));
      }));
  }
  $('stSearch').oninput = renderStudents; $('stFilter').onchange = renderStudents; $('stReload').onclick = loadStudents;
  $('stCpReg').onclick = () => copy(A.registerLink(''), 'คัดลอกลิงก์ลงทะเบียนแล้ว');
  $('stAdd').onclick = () => addStudent();

  function editName(s) {
    const nm = h('input', { type: 'text', value: s.name || '', maxlength: 80 }), msg = h('div', { class: 'msg' });
    const save = h('button', { class: 'btn', type: 'button' }, 'บันทึก');
    const close = A.sheet('แก้ชื่อนักเรียน', h('div', null, h('div', { class: 'muted' }, s.email || ''), h('label', null, 'ชื่อที่แสดง'), nm, msg),
      [btn('ยกเลิก', () => close(), 'btn ghost'), save]);
    save.onclick = async () => {
      save.disabled = true; say(msg, 'กำลังบันทึก…');
      try { const r = await capi('admin/students', { action: 'update', id: s.id, name: nm.value.trim() }); close(); patchStudent(r.student || { id: s.id, name: nm.value.trim() }); toast('บันทึกชื่อแล้ว'); }
      catch (e) { say(msg, errText(e), 'err'); save.disabled = false; }
    };
  }
  function setPassword(s) {
    const p1 = h('input', { type: 'password', maxlength: 72, autocomplete: 'new-password', placeholder: 'อย่างน้อย 8 ตัว' });
    const p2 = h('input', { type: 'password', maxlength: 72, autocomplete: 'new-password', placeholder: 'พิมพ์ซ้ำอีกครั้ง' });
    const show = h('input', { type: 'checkbox' }); show.onchange = () => { p1.type = p2.type = show.checked ? 'text' : 'password'; };
    const msg = h('div', { class: 'msg' }), out = h('div');
    const save = h('button', { class: 'btn', type: 'button' }, 'ตั้งรหัสผ่านใหม่');
    const close = A.sheet('ตั้งรหัสผ่านใหม่ให้นักเรียน', h('div', null,
      h('div', { class: 'muted' }, `${s.name || ''} ${s.email ? '· ' + s.email : ''}`),
      h('div', { class: 'mini', style: 'margin-top:4px' }, 'ใช้ตอนนักเรียนลืมรหัสผ่าน — ตั้งแล้วส่งรหัสใหม่ให้นักเรียนทางแชทส่วนตัว'),
      h('label', null, 'รหัสผ่านใหม่'), p1, h('label', null, 'ยืนยันรหัสผ่านใหม่'), p2,
      h('label', { class: 'chk' }, show, ' แสดงรหัส'), msg, out),
      [btn('ปิด', () => close(), 'btn ghost'), save]);
    save.onclick = async () => {
      const pw = p1.value, bad = pwProblem(pw);
      if (bad) { say(msg, bad, 'err'); return; }
      if (pw !== p2.value) { say(msg, 'รหัสผ่านสองช่องไม่ตรงกัน', 'err'); return; }
      save.disabled = true; say(msg, 'กำลังบันทึก…');
      try {
        await capi('admin/students', { action: 'set-password', id: s.id, password: pw });
        say(msg, '✓ ตั้งรหัสผ่านใหม่แล้ว', 'ok'); p1.value = p2.value = ''; save.hidden = true;
        out.replaceChildren(h('div', { class: 'done-box' }, h('div', { class: 'mini' }, 'ส่งข้อความนี้ให้นักเรียน (มีรหัสผ่าน — ส่งทางแชทส่วนตัวเท่านั้น)'),
          h('div', { class: 'row' }, btn('คัดลอกข้อความส่งนักเรียน', () => copy(accessMsg(s.email || '', pw, ''), 'คัดลอกแล้ว'), 'btn sm'))));
      } catch (e) { say(msg, errText(e), 'err'); save.disabled = false; }
    };
    setTimeout(() => { try { p1.focus(); } catch {} }, 60);
  }
  // the server turns the key off too unless keepKey:true; an older course-api (no keyDisabled in the reply) → turn it off here
  async function keyOffFallback(s, r) {
    if (!s.key || (r && r.keyDisabled === true)) return;
    try { await A.keysApi({ action: 'update', id: s.key.id, active: false }); } catch (e) { toast('ทำรายการแล้ว แต่ปิดคีย์ไม่สำเร็จ: ' + errText(e)); }
  }
  function unlinkKey(s) {
    if (!s.key) return;
    const msg = h('div', { class: 'msg' });
    const off = h('button', { class: 'btn red', type: 'button' }, 'ถอดและปิดคีย์');
    const move = h('button', { class: 'btn ghost', type: 'button' }, 'ย้ายคีย์ไปบัญชีอื่น');
    const close = A.sheet('ถอดคีย์', h('div', null,
      h('div', { class: 'muted' }, `ถอดคีย์ ${maskKey(s.key.key)} ออกจาก "${s.name || s.email || ''}" — นักเรียนจะเข้าเรียนไม่ได้จนกว่าจะได้คีย์ใหม่`),
      h('ul', { class: 'ol', style: 'margin:10px 0 0' },
        h('li', null, h('b', null, 'ถอดและปิดคีย์'), ' (แนะนำ) — คีย์นี้ใช้ไม่ได้อีก ทั้งเข้าเรียนและเชื่อมคลังแสง'),
        h('li', null, h('b', null, 'ย้ายคีย์ไปบัญชีอื่น'), ' — คีย์ยังเปิดอยู่และว่าง (ใช้ตอนนักเรียนสมัครผิดบัญชี) · ระวัง: นักเรียนคนเดิมใส่คีย์เดิมกลับเข้าไปได้')),
      msg),
      [btn('ยกเลิก', () => close(), 'btn ghost'), move, off]);
    const run = async keepKey => {
      off.disabled = move.disabled = true; say(msg, 'กำลังถอดคีย์…');
      try {
        const r = await capi('admin/students', keepKey ? { action: 'unlink-key', id: s.id, keepKey: true } : { action: 'unlink-key', id: s.id });
        if (!keepKey) await keyOffFallback(s, r);
        close(); patchStudent(r.student || { id: s.id, key: null }); A.reloadKeys();
        toast(keepKey ? 'ถอดคีย์แล้ว — คีย์ยังเปิดอยู่ ใช้กับบัญชีอื่นได้' : 'ถอดคีย์และปิดคีย์แล้ว');
      } catch (e) { say(msg, 'ถอดคีย์ไม่สำเร็จ: ' + errText(e), 'err'); off.disabled = move.disabled = false; }
    };
    off.onclick = () => run(false); move.onclick = () => run(true);
  }
  function delStudent(s) {
    const alsoKey = h('input', { type: 'checkbox', checked: true }), msg = h('div', { class: 'msg' });
    const go = h('button', { class: 'btn red', type: 'button' }, 'ลบนักเรียน');
    const close = A.sheet('ลบนักเรียน', h('div', null,
      h('div', { class: 'muted' }, `ลบ "${s.name || s.email || ''}" ออกจากคอร์ส — บัญชีเข้าสู่ระบบและความคืบหน้าจะถูกลบถาวร กู้คืนไม่ได้ (ถ้าแค่พักไว้ ให้ปิดสวิตช์แทน)`),
      s.key ? h('label', { class: 'chk' }, alsoKey, ` ปิดคีย์ ${maskKey(s.key.key)} ด้วย (แนะนำ — ถ้าไม่ปิด คีย์นี้ใช้ลงทะเบียนบัญชีใหม่ได้ทันที)`) : null,
      h('div', { class: 'mini', style: 'margin-top:8px' }, 'บัญชีแอดมินจะไม่ถูกลบบัญชีเข้าสู่ระบบ — ลบแค่ชื่อออกจากรายชื่อนักเรียน'), msg),
      [btn('ยกเลิก', () => close(), 'btn ghost'), go]);
    go.onclick = async () => {
      go.disabled = true; say(msg, 'กำลังลบ…');
      try {
        const keep = !!s.key && !alsoKey.checked;
        const r = await capi('admin/students', keep ? { action: 'delete', id: s.id, keepKey: true } : { action: 'delete', id: s.id });
        if (s.key && !keep) await keyOffFallback(s, r);
        if (s.key) A.reloadKeys();
        close();
        const cs = CSx(); A.setStudents((cs.list || []).filter(x => x.id !== s.id), cs.total);
        toast(r && typeof r.message === 'string' && r.message ? r.message : 'ลบนักเรียนแล้ว');
      } catch (e) { say(msg, errText(e), 'err'); go.disabled = false; }
    };
  }
  function freeKeys() {
    const cs = CSx(); if (!cs.list) return null;
    const bound = new Set(cs.list.filter(s => s.key && s.key.id).map(s => s.key.id));
    return A.keys().filter(k => A.statusOf(k) === 'on' && !bound.has(k.id));
  }
  function addStudent() {
    const nm = h('input', { type: 'text', maxlength: 80, placeholder: 'เช่น สมชาย ใจดี' });
    const em = h('input', { type: 'email', maxlength: 254, placeholder: 'student@example.com', autocomplete: 'off' });
    const pw = h('input', { type: 'text', maxlength: 72, placeholder: 'อย่างน้อย 8 ตัว', autocomplete: 'off', spellcheck: 'false', style: 'flex:1;min-width:160px' });
    const free = freeKeys();
    const rNew = h('input', { type: 'radio', name: 'stKeyMode', value: 'new', checked: true });
    const rPick = h('input', { type: 'radio', name: 'stKeyMode', value: 'pick', disabled: !(free && free.length) });
    const sel = h('select', { disabled: true, 'aria-label': 'คีย์ที่ยังว่าง' },
      free && free.length ? free.map(k => h('option', { value: k.id }, `${k.name || '(ไม่มีชื่อ)'} · ${maskKey(k.key)}`)) : h('option', { value: '' }, free ? 'ไม่มีคีย์ว่าง' : 'ยังโหลดรายชื่อไม่เสร็จ'));
    rNew.onchange = rPick.onchange = () => { sel.disabled = !rPick.checked; };
    const msg = h('div', { class: 'msg' }), out = h('div');
    const save = h('button', { class: 'btn', type: 'button' }, 'เพิ่มนักเรียน');
    const close = A.sheet('เพิ่มนักเรียนเอง', h('div', null,
      h('div', { class: 'muted' }, 'สร้างบัญชีให้นักเรียนแทนการให้ลงทะเบียนเอง — แล้วส่งอีเมล + รหัสผ่านให้นักเรียน'),
      h('label', null, 'ชื่อนักเรียน'), nm, h('label', null, 'อีเมล (ใช้เข้าสู่ระบบ)'), em,
      h('label', null, 'รหัสผ่าน'), h('div', { class: 'row', style: 'margin:0' }, pw, btn('สุ่มรหัส', () => { pw.value = genPw(); })),
      h('label', null, 'คีย์คอร์ส'),
      h('div', { class: 'pick' }, h('label', null, rNew, ' สร้างคีย์ใหม่ให้อัตโนมัติ'), h('label', null, rPick, ' เลือกคีย์ที่ยังว่าง')), sel, msg, out),
      [btn('ปิด', () => close(), 'btn ghost'), save]);
    save.onclick = async () => {
      const email = em.value.trim().toLowerCase(), password = pw.value, name = nm.value.trim();
      if (!isEmail(email)) { say(msg, 'อีเมลไม่ถูกต้อง', 'err'); return; }
      const bad = pwProblem(password); if (bad) { say(msg, bad, 'err'); return; }
      const body = { action: 'create', email, password, name };
      if (rPick.checked) { if (!sel.value) { say(msg, 'เลือกคีย์ที่ยังว่างก่อน', 'err'); return; } body.keyId = sel.value; }
      else body.createKey = true;
      save.disabled = true; say(msg, 'กำลังสร้างบัญชี…');
      try {
        const r = await capi('admin/students', body);
        const st = r.student || null, key = st && st.key ? st.key.key : '';
        say(msg, '✓ เพิ่มนักเรียนแล้ว', 'ok'); save.hidden = true;
        out.replaceChildren(h('div', { class: 'done-box' },
          h('div', null, h('b', null, name || email), key ? ' · ' : '', key ? h('span', { class: 'kcode' }, key) : null),
          h('div', { class: 'mini', style: 'margin-top:6px' }, 'ส่งข้อความนี้ให้นักเรียนทางแชทส่วนตัว (มีรหัสผ่าน)'),
          h('div', { class: 'row' }, btn('คัดลอกข้อความส่งนักเรียน', () => copy(accessMsg(email, password, key), 'คัดลอกแล้ว'), 'btn sm'))));
        const cs = CSx();
        if (st) A.setStudents([st, ...(cs.list || []).filter(x => x.id !== st.id)], cs.total); else A.reloadStudents();
        A.reloadKeys();
      } catch (e) { say(msg, errText(e), 'err'); save.disabled = false; }
    };
    setTimeout(() => { try { nm.focus(); } catch {} }, 60);
  }

  // ================================================================ บทเรียน
  const C = { modules: [], loaded: false, edit: null };       // edit = { lesson, isNew, dirty, f: fields }
  const BUSY = new Set();                                     // `${lessonId}:video` | `${lessonId}:att` while uploading
  const HOSTS = new Map();                                    // progress card holders, per lesson + kind (survive re-renders)
  const hostFor = k => { let el = HOSTS.get(k); if (!el) { el = h('div'); HOSTS.set(k, el); } return el; };
  const normLesson = l => ({ ...l, sort_order: +l.sort_order || 0, published: l.published !== false, free_preview: !!l.free_preview,
    attachments: Array.isArray(l.attachments) ? l.attachments.filter(a => a && typeof a.path === 'string') : [],
    has_video: l.has_video != null ? !!l.has_video : (!!l.video_kind && l.video_kind !== 'none' && !!String(l.video_ref || '').trim()) });
  const normMod = m => ({ ...m, sort_order: +m.sort_order || 0, published: m.published !== false, lessons: (Array.isArray(m.lessons) ? m.lessons : []).map(normLesson) });
  const sortAll = () => { C.modules.sort(bySort); C.modules.forEach(m => m.lessons.sort(bySort)); };
  const allLessons = () => C.modules.flatMap(m => m.lessons);
  function findLesson(id) { for (const m of C.modules) { const l = m.lessons.find(x => x.id === id); if (l) return { m, l }; } return null; }
  // server lesson → local copy (same object stays referenced by the editor; moves between modules when module_id changed)
  function applyLesson(srv) {
    if (!srv || !srv.id) return null;
    const n = normLesson(srv), f = findLesson(n.id);
    if (f) {
      Object.assign(f.l, n);
      if (f.m.id !== n.module_id) { f.m.lessons = f.m.lessons.filter(x => x !== f.l); const to = C.modules.find(m => m.id === n.module_id); if (to) to.lessons.push(f.l); }
      sortAll(); return f.l;
    }
    const to = C.modules.find(m => m.id === n.module_id); if (to) to.lessons.push(n);
    sortAll(); return n;
  }
  async function loadCourse() {
    C.loaded = true;
    if (!C.modules.length) $('lsList').replaceChildren(h('div', { class: 'panel muted' }, 'กำลังโหลด…'));
    try { const d = await capi('admin/course'); C.modules = (Array.isArray(d.modules) ? d.modules : []).map(normMod); sortAll(); renderCourse(); if (C.edit) refreshEditor(); }
    catch (e) { C.loaded = false; $('lsList').replaceChildren(h('div', { class: 'panel err' }, 'โหลดบทเรียนไม่สำเร็จ: ' + errText(e))); }
  }
  const lsFiltering = () => !!($('lsSearch').value.trim() || $('lsFilter').value);
  function lessonMatch(l) {
    const q = $('lsSearch').value.trim().toLowerCase(), f = $('lsFilter').value;
    if (f === 'novideo' && l.has_video) return false;
    if (f === 'hidden' && l.published) return false;
    if (f === 'free' && !l.free_preview) return false;
    return !q || (l.id + ' ' + (l.title || '')).toLowerCase().includes(q);
  }
  function renderCourse() {
    const all = allLessons(), vids = all.filter(l => l.has_video).length, pub = all.filter(l => l.published).length;
    $('lsCount').textContent = `(${C.modules.length} โมดูล · ${all.length} บท · มีวิดีโอ ${vids} · เผยแพร่ ${pub})`;
    if (!C.modules.length) { $('lsList').replaceChildren(h('div', { class: 'panel muted' }, 'ยังไม่มีบทเรียน — กด “+ เพิ่มโมดูล” แล้วเพิ่มบทเรียน')); return; }
    const filtering = lsFiltering();
    const panels = C.modules.map((m, i) => modPanel(m, i, filtering)).filter(Boolean);
    $('lsList').replaceChildren(...(panels.length ? panels : [h('div', { class: 'panel muted' }, 'ไม่พบบทเรียนที่ตรงกับตัวกรอง')]));
  }
  $('lsSearch').oninput = renderCourse; $('lsFilter').onchange = renderCourse; $('lsReload').onclick = loadCourse;
  $('lsAddMod').onclick = () => editModule(null);

  function modPanel(m, i, filtering) {
    const shown = m.lessons.filter(lessonMatch);
    if (filtering && !shown.length) return null;
    const vids = m.lessons.filter(l => l.has_video).length;
    const head = h('div', { class: 'modhead' },
      h('span', { class: 'mod-id' }, m.id),
      h('div', { class: 'mh-t' }, h('b', null, m.title || m.id),
        h('div', { class: 'mini' }, `${m.lessons.length} บท · มีวิดีโอ ${vids}/${m.lessons.length}${m.published ? '' : ' · ซ่อนทั้งโมดูลอยู่'}`)),
      h('div', { class: 'acts2', style: 'align-items:center' },
        h('span', { class: 'swl' }, switchBtn(m.published, m.published ? 'ซ่อนทั้งโมดูลจากนักเรียน' : 'แสดงโมดูลนี้ให้นักเรียน', async v => {
          const r = await capi('admin/course', { action: 'module-upsert', module: { id: m.id, published: v } });
          m.published = r.module ? r.module.published !== false : v; toast(v ? 'แสดงโมดูลแล้ว' : 'ซ่อนโมดูลแล้ว'); renderCourse();
        }), 'เผยแพร่'),
        btn('↑', () => moveModule(m, -1), 'btn sm ghost arw', { title: 'เลื่อนโมดูลขึ้น', 'aria-label': 'เลื่อนโมดูลขึ้น', disabled: filtering || i === 0 }),
        btn('↓', () => moveModule(m, 1), 'btn sm ghost arw', { title: 'เลื่อนโมดูลลง', 'aria-label': 'เลื่อนโมดูลลง', disabled: filtering || i === C.modules.length - 1 }),
        btn('แก้ไข', () => editModule(m)),
        btn('+ บทเรียน', () => openEditor(null, m.id)),
        m.lessons.length ? null : btn('ลบโมดูล', () => delModule(m), 'btn sm red')));
    const sum = m.summary ? h('div', { class: 'muted', style: 'margin-bottom:6px' }, m.summary) : null;
    if (!shown.length) return h('div', { class: 'panel' }, head, sum, h('div', { class: 'muted' }, 'ยังไม่มีบทเรียนในโมดูลนี้ — กด “+ บทเรียน”'));
    return h('div', { class: 'panel' }, head, sum, h('div', { class: 'tw' }, h('table', null,
      h('tr', null, ['รหัส', 'บทเรียน', 'ความยาว', 'วิดีโอ', 'เผยแพร่', 'ดูฟรี', 'ลำดับ', ''].map(t => h('th', null, t))),
      shown.map(l => {
        const idx = m.lessons.indexOf(l);
        return h('tr', null,
          h('td', null, h('span', { class: 'kcode' }, l.id)),
          h('td', null, h('b', null, l.title || '(ไม่มีชื่อ)'), l.goal ? h('div', { class: 'muted clamp2' }, l.goal) : null),
          h('td', { class: 'muted nowrap' }, l.duration_min != null ? l.duration_min + ' นาที' : '-'),
          h('td', null, l.has_video ? h('span', { class: 'st on' }, VIDEO_LABEL[l.video_kind] || 'มีวิดีโอ') : h('span', { class: 'st exp' }, 'ยังไม่มี'),
            l.attachments.length ? h('div', { class: 'mini' }, `ไฟล์แนบ ${l.attachments.length}`) : null),
          h('td', null, switchBtn(l.published, l.published ? 'ซ่อนบทนี้จากนักเรียน' : 'เผยแพร่บทนี้ให้นักเรียน', async v => {
            const r = await capi('admin/course', { action: 'lesson-upsert', lesson: { id: l.id, published: v } });
            applyLesson(r.lesson || { ...l, published: v }); toast(v ? 'เผยแพร่บทนี้แล้ว' : 'ซ่อนบทนี้แล้ว'); renderCourse();
          })),
          h('td', null, switchBtn(l.free_preview, l.free_preview ? 'ปิดดูฟรี' : 'ให้คนที่ยังไม่สมัครดูบทนี้ได้ฟรี', async v => {
            const r = await capi('admin/course', { action: 'lesson-upsert', lesson: { id: l.id, free_preview: v } });
            applyLesson(r.lesson || { ...l, free_preview: v }); toast(v ? 'เปิดดูฟรีแล้ว' : 'ปิดดูฟรีแล้ว'); renderCourse();
          })),
          h('td', null, h('div', { class: 'acts2', style: 'flex-wrap:nowrap' },
            btn('↑', () => moveLesson(m, l, -1), 'btn sm ghost arw', { title: 'เลื่อนขึ้น', 'aria-label': 'เลื่อนบทขึ้น', disabled: filtering || idx === 0 }),
            btn('↓', () => moveLesson(m, l, 1), 'btn sm ghost arw', { title: 'เลื่อนลง', 'aria-label': 'เลื่อนบทลง', disabled: filtering || idx === m.lessons.length - 1 }))),
          h('td', null, h('div', { class: 'acts2' },
            btn('แก้ไข', () => openEditor(l.id)),
            h('a', { class: 'btn sm ghost', href: lessonHref(l.id), target: '_blank', rel: 'noopener', title: 'เปิดหน้าบทเรียนแบบที่นักเรียนเห็น' }, 'ดู'))));
      }))));
  }
  // order: swap with the neighbour, renumber the whole list (lessons 1..n, modules 0..n-1), send only what changed
  async function moveLesson(m, l, dir) {
    const arr = m.lessons.slice(), i = arr.indexOf(l), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const items = []; arr.forEach((x, k) => { if (x.sort_order !== k + 1) items.push({ id: x.id, module_id: m.id, sort_order: k + 1 }); });
    if (!items.length) return;
    try { await capi('admin/course', { action: 'reorder', items }); arr.forEach((x, k) => { x.sort_order = k + 1; }); m.lessons = arr; renderCourse(); }
    catch (e) { toast('เลื่อนลำดับไม่สำเร็จ: ' + errText(e)); }
  }
  async function moveModule(m, dir) {
    const arr = C.modules.slice(), i = arr.indexOf(m), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const items = []; arr.forEach((x, k) => { if (x.sort_order !== k) items.push({ type: 'module', id: x.id, sort_order: k }); });
    if (!items.length) return;
    try { await capi('admin/course', { action: 'reorder', items }); arr.forEach((x, k) => { x.sort_order = k; }); C.modules = arr; renderCourse(); }
    catch (e) { toast('เลื่อนลำดับไม่สำเร็จ: ' + errText(e)); }
  }
  function editModule(m) {
    const isNew = !m;
    const nextNo = C.modules.reduce((a, x) => { const r = /^M(\d{1,3})$/i.exec(x.id); return r ? Math.max(a, +r[1]) : a; }, -1) + 1;
    const idIn = h('input', { type: 'text', value: isNew ? 'M' + String(nextNo).padStart(2, '0') : m.id, maxlength: 41, readonly: !isNew, spellcheck: 'false' });
    const ti = h('input', { type: 'text', value: isNew ? '' : (m.title || ''), maxlength: 200, placeholder: 'เช่น ทำโฆษณาสไตล์ Apple' });
    const su = h('textarea', { maxlength: 2000, style: 'min-height:70px', placeholder: 'จบโมดูลนี้แล้วทำอะไรได้ (ไม่ใส่ก็ได้)' }); su.value = isNew ? '' : (m.summary || '');
    const msg = h('div', { class: 'msg' }), save = h('button', { class: 'btn', type: 'button' }, isNew ? 'สร้างโมดูล' : 'บันทึก');
    const close = A.sheet(isNew ? 'เพิ่มโมดูล' : 'แก้ไขโมดูล ' + m.id, h('div', null,
      h('label', null, 'รหัสโมดูล' + (isNew ? ' (ตัวอักษรอังกฤษ ตัวเลข และ - เช่น M10)' : '')), idIn,
      h('label', null, 'ชื่อโมดูล'), ti, h('label', null, 'สรุปสั้นๆ'), su, msg),
      [btn('ยกเลิก', () => close(), 'btn ghost'), save]);
    save.onclick = async () => {
      const id = idIn.value.trim(), title = ti.value.trim();
      if (!MODULE_ID.test(id)) { say(msg, 'รหัสโมดูลใช้ได้แค่ A-Z a-z 0-9 และ - (เช่น M10)', 'err'); return; }
      if (isNew && C.modules.some(x => x.id === id)) { say(msg, 'มีโมดูลรหัสนี้แล้ว — เปลี่ยนรหัสใหม่', 'err'); return; }
      if (!title) { say(msg, 'ใส่ชื่อโมดูลก่อน', 'err'); return; }
      const module = { id, title, summary: su.value.trim() };
      if (isNew) { module.sort_order = C.modules.reduce((a, x) => Math.max(a, x.sort_order), -1) + 1; module.published = true; }
      save.disabled = true; say(msg, 'กำลังบันทึก…');
      try {
        const r = await capi('admin/course', { action: 'module-upsert', module });
        const srv = r.module || module;
        if (isNew) C.modules.push(normMod({ ...srv, lessons: [] })); else Object.assign(m, { title: srv.title, summary: srv.summary || '', published: srv.published !== false });
        sortAll(); close(); toast(isNew ? 'สร้างโมดูลแล้ว — เพิ่มบทเรียนได้เลย' : 'บันทึกแล้ว'); renderCourse();
      } catch (e) { say(msg, errText(e), 'err'); save.disabled = false; }
    };
  }
  async function delModule(m) {
    if (m.lessons.length) { toast('ลบไม่ได้ — ย้ายหรือลบบทเรียนในโมดูลนี้ก่อน'); return; }
    if (!confirm(`ลบโมดูล ${m.id} "${m.title || ''}"?`)) return;
    try { await capi('admin/course', { action: 'module-delete', id: m.id }); C.modules = C.modules.filter(x => x !== m); toast('ลบโมดูลแล้ว'); renderCourse(); }
    catch (e) { toast('ลบโมดูลไม่สำเร็จ: ' + errText(e)); }
  }

  // ---------------------------------------------------------------- lesson editor (inline view inside the บทเรียน tab)
  function suggestLessonId(mid) {
    const m = C.modules.find(x => x.id === mid), pre = mid + '-L';
    const n = (m ? m.lessons : []).reduce((a, l) => { const r = l.id.startsWith(pre) ? /^(\d{1,3})$/.exec(l.id.slice(pre.length)) : null; return r ? Math.max(a, +r[1]) : a; }, 0);
    let id = pre + String(n + 1).padStart(2, '0'), k = n + 1;
    while (findLesson(id) && k < 999) id = pre + String(++k).padStart(2, '0');
    return LESSON_ID.test(id) ? id : '';
  }
  function openEditor(id, moduleId) {
    if (C.edit && C.edit.dirty && !confirm('ยังไม่ได้บันทึกการแก้ไข — ออกโดยไม่บันทึก?')) return;
    if (id) {
      const f = findLesson(id); if (!f) { toast('ไม่พบบทเรียนนี้ — กดรีเฟรช'); return; }
      C.edit = { lesson: f.l, isNew: false, dirty: false };
      for (const k of [id + ':video', id + ':att']) if (!BUSY.has(k)) HOSTS.delete(k);   // old "done/failed" notes go away
    } else {
      C.edit = { isNew: true, dirty: false, lesson: { id: suggestLessonId(moduleId), module_id: moduleId, title: '', goal: '', summary: '', deliverable: '', duration_min: null, body_md: '',
        published: false, free_preview: false, attachments: [], video_kind: 'none', video_ref: '', video: null, has_video: false, sort_order: 0 } };
    }
    $('lsListView').hidden = true; $('lsEdit').hidden = false;
    renderEditor();
    try { window.scrollTo(0, 0); } catch {}
  }
  function closeEditor(force) {
    if (!force && C.edit && C.edit.dirty && !confirm('ยังไม่ได้บันทึกการแก้ไข — ออกโดยไม่บันทึก?')) return;
    C.edit = null; $('lsEdit').hidden = true; $('lsEdit').replaceChildren(); $('lsListView').hidden = false; renderCourse();
  }
  function renderEditor() {
    const E = C.edit; if (!E) return;
    const L = E.lesson, f = E.f = {};
    f.id = h('input', { type: 'text', value: L.id, maxlength: 61, readonly: !E.isNew, spellcheck: 'false', 'aria-label': 'รหัสบทเรียน' });
    f.mod = h('select', { 'aria-label': 'โมดูล' }, C.modules.map(m => h('option', { value: m.id, selected: m.id === L.module_id }, `${m.id} · ${m.title || ''}`)));
    f.title = h('input', { type: 'text', value: L.title || '', maxlength: 300, placeholder: 'ชื่อบทเรียนที่นักเรียนเห็น' });
    f.goal = h('textarea', { maxlength: 2000, style: 'min-height:64px', placeholder: 'เรียนจบแล้วทำอะไรได้' }); f.goal.value = L.goal || '';
    f.summary = h('textarea', { maxlength: 2000, style: 'min-height:64px', placeholder: 'สรุปสั้นๆ (ไม่ใส่ก็ได้)' }); f.summary.value = L.summary || '';
    f.deliv = h('input', { type: 'text', value: L.deliverable || '', maxlength: 2000, placeholder: 'เช่น คลิป 15 วินาที (ไม่มีก็เว้นว่าง)' });
    f.min = h('input', { type: 'number', min: '0', max: '600', step: '1', value: L.duration_min != null ? String(L.duration_min) : '', placeholder: 'เช่น 8' });
    f.pub = h('input', { type: 'checkbox', checked: !!L.published });
    f.free = h('input', { type: 'checkbox', checked: !!L.free_preview });
    f.body = h('textarea', { maxlength: 200000, style: 'min-height:260px;font:500 14px/1.6 ui-monospace,Menlo,monospace', placeholder: '# หัวข้อ\n- รายการ\n**ตัวหนา** · `โค้ด` · [ข้อความลิงก์](ลิงก์ที่ขึ้นต้นด้วย https)' });
    f.body.value = L.body_md || '';
    f.prev = h('div', { class: 'mdbox mdx', 'aria-live': 'polite' });
    const paintPrev = () => { const v = f.body.value.trim(); if (v) f.prev.innerHTML = renderMd(v); else f.prev.replaceChildren(h('span', { class: 'mini' }, 'ตัวอย่างโน้ตจะขึ้นตรงนี้')); };
    let pt = 0; f.body.addEventListener('input', () => { clearTimeout(pt); pt = setTimeout(paintPrev, 150); });
    paintPrev();
    f.msg = h('div', { class: 'msg' });
    f.save = h('button', { class: 'btn', type: 'button' }, E.isNew ? 'สร้างบทเรียน' : 'บันทึก');
    f.save.onclick = () => saveLesson();
    f.del = E.isNew ? null : btn('ลบบทเรียนนี้', () => delLesson(), 'btn sm red');
    const form = h('div', { class: 'panel' },
      h('h2', null, E.isNew ? 'บทเรียนใหม่' : 'ข้อมูลบทเรียน'),
      h('div', { class: 'grid2', style: 'gap:0 16px' },
        h('div', null, h('label', null, 'รหัสบทเรียน' + (E.isNew ? ' (เช่น M03-L07 เปลี่ยนทีหลังไม่ได้)' : '')), f.id),
        h('div', null, h('label', null, 'อยู่ในโมดูล'), f.mod)),
      h('label', null, 'ชื่อบทเรียน'), f.title,
      h('label', null, 'เป้าหมาย'), f.goal,
      h('label', null, 'สรุป'), f.summary,
      h('div', { class: 'grid2', style: 'gap:0 16px' },
        h('div', null, h('label', null, 'ชิ้นงานที่ได้'), f.deliv),
        h('div', null, h('label', null, 'ความยาว (นาที)'), f.min)),
      h('div', { class: 'row', style: 'gap:4px 18px' },
        h('label', { class: 'chk' }, f.pub, ' เผยแพร่ให้นักเรียนเห็น'),
        h('label', { class: 'chk' }, f.free, ' ดูฟรี (คนที่ยังไม่สมัครก็ดูได้)')),
      h('label', null, 'โน้ตสำหรับนักเรียน (Markdown)'),
      h('div', { class: 'grid2', style: 'gap:10px 16px;align-items:start' },
        h('div', null, f.body, h('div', { class: 'mini', style: 'margin-top:4px' }, '# หัวข้อ · - รายการ · **ตัวหนา** · `โค้ด` · [ข้อความ](ลิงก์ https) — นักเรียนเห็นใต้วิดีโอ')),
        h('div', null, h('div', { class: 'mini' }, 'ตัวอย่างที่นักเรียนเห็น'), f.prev)),
      h('div', { class: 'row', style: 'justify-content:space-between;margin-top:16px' },
        h('div', { class: 'row', style: 'margin:0' }, f.save, btn('ยกเลิก', () => closeEditor(), 'btn ghost')), f.del),
      f.msg);
    const markDirty = () => { if (C.edit === E) E.dirty = true; };
    form.addEventListener('input', markDirty); form.addEventListener('change', markDirty);
    $('lsEdit').replaceChildren(edBar(), form, h('div', { id: 'edMedia' }));
    renderMedia();
  }
  function edBar() {
    const E = C.edit, L = E.lesson;
    return h('div', { class: 'edbar', id: 'edBar' },
      btn('← กลับรายการบทเรียน', () => closeEditor(), 'btn sm ghost'),
      E.isNew ? h('span', { class: 'mini' }, 'บันทึกก่อน แล้วค่อยอัปโหลดวิดีโอ') :
        h('div', { class: 'row', style: 'margin:0' }, h('span', { class: 'mini hide-xs' }, 'ต้องผูกคีย์กับบัญชีนี้ก่อนถึงเปิดบทที่ไม่ฟรีได้'),
          h('a', { class: 'btn sm ghost', href: lessonHref(L.id), target: '_blank', rel: 'noopener' }, 'ดูหน้านักเรียน ↗')));
  }
  async function saveLesson() {
    const E = C.edit; if (!E) return;
    const f = E.f, id = f.id.value.trim();
    if (E.isNew && !LESSON_ID.test(id)) { say(f.msg, 'รหัสบทเรียนใช้ได้แค่ A-Z a-z 0-9 และ - (2–61 ตัว) เช่น M03-L07', 'err'); return; }
    if (E.isNew && findLesson(id)) { say(f.msg, 'มีบทเรียนรหัสนี้แล้ว — เปลี่ยนรหัสใหม่', 'err'); return; }
    const title = f.title.value.trim();
    if (!title) { say(f.msg, 'ใส่ชื่อบทเรียนก่อน', 'err'); f.title.focus(); return; }
    const raw = f.min.value.trim(); let duration_min = null;
    if (raw) { const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n > 600) { say(f.msg, 'ความยาวต้องเป็นตัวเลข 0–600 นาที', 'err'); return; } duration_min = Math.round(n); }
    const module_id = f.mod.value;
    if (!module_id) { say(f.msg, 'เลือกโมดูลก่อน', 'err'); return; }
    const lesson = { id, module_id, title, goal: f.goal.value.trim(), summary: f.summary.value.trim(), deliverable: f.deliv.value.trim(), duration_min,
      body_md: f.body.value, published: f.pub.checked, free_preview: f.free.checked };
    if (E.isNew || module_id !== E.lesson.module_id) {           // new / moved → goes to the end of its module
      const m = C.modules.find(x => x.id === module_id);
      lesson.sort_order = (m ? m.lessons.filter(x => x.id !== id).reduce((a, x) => Math.max(a, x.sort_order), 0) : 0) + 1;
    }
    f.save.disabled = true; say(f.msg, 'กำลังบันทึก…');
    try {
      const r = await capi('admin/course', { action: 'lesson-upsert', lesson });
      const wasNew = E.isNew, local = applyLesson(r.lesson || lesson);
      if (C.edit !== E) return;
      E.lesson = local || E.lesson; E.isNew = false; E.dirty = false;
      say(f.msg, '✓ บันทึกแล้ว', 'ok'); f.save.disabled = false;
      toast(wasNew ? 'สร้างบทเรียนแล้ว — อัปโหลดวิดีโอได้เลย' : 'บันทึกแล้ว');
      if (wasNew) renderEditor();                                // id becomes read-only, video + attachments unlock
    } catch (e) { say(f.msg, errText(e), 'err'); f.save.disabled = false; }
  }
  async function delLesson() {
    const E = C.edit; if (!E || E.isNew) return;
    const L = E.lesson;
    const typed = prompt(`ลบบทเรียน ${L.id} "${L.title}" ถาวร — วิดีโอที่อัปโหลด ไฟล์แนบ และความคืบหน้าของนักเรียนในบทนี้จะหายทั้งหมด กู้คืนไม่ได้\n(ถ้าแค่ไม่อยากให้เห็น ให้ปิด “เผยแพร่” แทน)\n\nพิมพ์รหัสบทเรียน  ${L.id}  เพื่อยืนยัน`);
    if (typed == null) return;
    if (typed.trim() !== L.id) { toast('รหัสไม่ตรง — ยกเลิกการลบ'); return; }
    try {
      await capi('admin/course', { action: 'lesson-delete', id: L.id });
      C.modules.forEach(m => { m.lessons = m.lessons.filter(x => x.id !== L.id); });
      toast('ลบบทเรียนแล้ว'); closeEditor(true);
    } catch (e) { toast('ลบไม่สำเร็จ: ' + errText(e)); }
  }
  // after a media change: the editor shows the fresh copy of its lesson (the text form is left alone)
  function refreshEditor() {
    const E = C.edit; if (!E || E.isNew) return;
    const f = findLesson(E.lesson.id);
    if (!f) { closeEditor(true); return; }
    E.lesson = f.l; renderMedia();
  }
  function renderMedia() {
    const E = C.edit, box = $('edMedia'); if (!E || !box) return;
    if (E.isNew) {
      box.replaceChildren(h('div', { class: 'panel' }, h('h2', null, 'วิดีโอและไฟล์แนบ'),
        h('div', { class: 'muted' }, 'กด “สร้างบทเรียน” ก่อน แล้วค่อยอัปโหลดวิดีโอและไฟล์แนบ')));
      return;
    }
    box.replaceChildren(videoPanel(E.lesson), attachPanel(E.lesson));
  }
  function videoPanel(L) {
    const k = L.id + ':video', busy = BUSY.has(k), msg = h('div', { class: 'msg' });
    const isFile = L.video_kind === 'storage';
    const openUrl = isFile ? (L.video && L.video.url) : L.video_ref;
    const cur = L.has_video
      ? h('div', { class: 'row' }, h('span', { class: 'st on' }, VIDEO_LABEL[L.video_kind] || 'มีวิดีโอ'),
        !isFile && L.video_ref ? h('span', { class: 'mini', style: 'overflow-wrap:anywhere' }, L.video_ref) : null,
        isHttps(openUrl) ? h('a', { class: 'linkbtn', href: openUrl, target: '_blank', rel: 'noopener' }, 'เปิดดูวิดีโอ ↗') : null)
      : h('div', { class: 'row' }, h('span', { class: 'st exp' }, 'ยังไม่มีวิดีโอ'), h('span', { class: 'mini' }, 'นักเรียนจะเห็นคำว่า “เร็วๆ นี้”'));
    const preview = isFile && L.video && isHttps(L.video.url) ? h('video', { class: 'edvid', src: L.video.url, controls: true, preload: 'metadata', playsinline: true }) : null;
    const link = h('input', { type: 'text', value: L.video_kind === 'youtube' || L.video_kind === 'vimeo' || L.video_kind === 'url' ? (L.video_ref || '') : '',
      placeholder: 'วางลิงก์ YouTube / Vimeo หรือลิงก์ไฟล์ .mp4 (https)', disabled: busy, spellcheck: 'false', 'aria-label': 'ลิงก์วิดีโอ', style: 'flex:1;min-width:180px' });
    const useLink = btn('ใช้ลิงก์นี้', () => setVideoLink(L, link.value, useLink, msg), 'btn sm', { disabled: busy });
    link.addEventListener('keydown', e => { if (e.key === 'Enter') useLink.click(); });
    const fileIn = h('input', { type: 'file', class: 'vh', id: 'edVidFile', accept: 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.m4v,.mov,.webm', disabled: busy });
    fileIn.onchange = () => { const file = pickedFiles(fileIn)[0]; if (file) uploadVideo(L, file, msg); };
    return h('div', { class: 'panel' },
      h('h2', null, 'วิดีโอ'), cur, preview,
      h('label', null, 'แบบที่ 1 — วางลิงก์ (YouTube แบบไม่เป็นสาธารณะ / Vimeo / ลิงก์ไฟล์ .mp4 โดยตรง)'),
      h('div', { class: 'mini' }, 'ลิงก์แชร์ของ Google Drive / Facebook / TikTok / Dropbox และเพลย์ลิสต์ YouTube ใช้ไม่ได้ — นักเรียนจะเห็นจอดำ'),
      h('div', { class: 'row', style: 'margin:0' }, link, useLink),
      h('label', null, 'แบบที่ 2 — อัปโหลดไฟล์วิดีโอ'),
      h('label', { class: 'drop', for: 'edVidFile', 'aria-disabled': busy ? 'true' : 'false' },
        h('b', null, busy ? 'กำลังอัปโหลดอยู่…' : 'เลือกไฟล์วิดีโอ'), h('span', { class: 'mini' }, 'mp4 · mov · m4v · webm ไม่เกิน 5 GB · ระหว่างอัปโหลดห้ามปิดแท็บ')),
      fileIn, hostFor(k), msg,
      L.has_video ? h('div', { class: 'row', style: 'margin-top:12px' }, btn('เอาวิดีโอออก', () => clearVideo(L, msg), 'btn sm red', { disabled: busy })) : null);
  }
  async function setVideoLink(L, ref, b, msg) {
    ref = String(ref || '').trim();
    if (!ref) { say(msg, 'วางลิงก์วิดีโอก่อน', 'err'); return; }
    if (L.video_kind === 'storage' && !confirm('ไฟล์วิดีโอที่อัปโหลดไว้จะถูกลบ แล้วใช้ลิงก์นี้แทน — ตกลงไหม?')) return;
    b.disabled = true; say(msg, 'กำลังบันทึก…');
    try {
      const r = await capi('admin/course', { action: 'set-video', lessonId: L.id, video_ref: ref });
      applyLesson(r.lesson); toast('ตั้งวิดีโอแล้ว'); refreshEditor();
    } catch (e) { say(msg, errText(e), 'err'); b.disabled = false; }
  }
  async function clearVideo(L, msg) {
    if (!confirm(L.video_kind === 'storage' ? 'เอาวิดีโอออกจากบทนี้? ไฟล์ที่อัปโหลดไว้จะถูกลบถาวร' : 'เอาวิดีโอออกจากบทนี้?')) return;
    say(msg, 'กำลังบันทึก…');
    try { const r = await capi('admin/course', { action: 'set-video', lessonId: L.id, video_kind: 'none', video_ref: '' }); applyLesson(r.lesson); toast('เอาวิดีโอออกแล้ว'); refreshEditor(); }
    catch (e) { say(msg, errText(e), 'err'); }
  }
  async function uploadVideo(L, file, msg) {
    const k = L.id + ':video';
    if (BUSY.has(k)) return;
    if (!VIDEO_EXT.includes(extOf(file.name))) { say(msg, 'รองรับเฉพาะไฟล์วิดีโอ .mp4 .mov .m4v .webm', 'err'); return; }
    const bad = sizeProblem(file);
    if (bad) { say(msg, bad + (file.size > MAX_UPLOAD ? ' หรืออัปขึ้น YouTube แบบไม่เป็นสาธารณะแล้ววางลิงก์แทน' : ''), 'err'); return; }
    if (L.video_kind === 'storage' && !confirm('บทนี้มีไฟล์วิดีโออยู่แล้ว — อัปโหลดไฟล์ใหม่แทนที่ไฟล์เดิม?')) return;
    say(msg, '');
    BUSY.add(k); refreshEditor();
    const host = hostFor(k);
    const r = await runUpload(host, file, 'อัปโหลดวิดีโอ ' + L.id,
      () => capi('admin/course', { action: 'sign-upload', lessonId: L.id, kind: 'video', filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
      s => capi('admin/course', { action: 'set-video', lessonId: L.id, video_kind: 'storage', video_ref: s.path }));
    BUSY.delete(k);
    if (r && r.lesson) { applyLesson(r.lesson); toast(`อัปโหลดวิดีโอ ${L.id} เสร็จแล้ว`); }
    refreshEditor();
    if (!C.edit) renderCourse();
  }
  function attachPanel(L) {
    const k = L.id + ':att', busy = BUSY.has(k), msg = h('div', { class: 'msg' });
    const fileIn = h('input', { type: 'file', class: 'vh', id: 'edAttFile', multiple: true, disabled: busy });
    fileIn.onchange = () => { const files = pickedFiles(fileIn); if (files.length) uploadAttachments(L, files, msg); };
    const list = L.attachments.length
      ? h('ul', { class: 'attl' }, L.attachments.map(a => h('li', null,
        h('span', { class: 'an' }, a.name || a.path.split('/').pop()), h('span', { class: 'mini nowrap' }, fsize(a.size)),
        btn('ลบ', () => removeAttachment(L, a, msg), 'btn sm red', { disabled: busy }))))
      : h('div', { class: 'muted' }, 'ยังไม่มีไฟล์แนบ');
    return h('div', { class: 'panel' },
      h('h2', null, 'ไฟล์แนบของบทนี้ ', h('span', { class: 'muted' }, `(${L.attachments.length})`)),
      h('div', { class: 'muted' }, 'เช่น ไฟล์ตัวอย่าง เทมเพลต PDF — นักเรียนดาวน์โหลดได้ในหน้าบทเรียน'),
      list,
      h('label', { class: 'drop', for: 'edAttFile', style: 'margin-top:12px', 'aria-disabled': busy ? 'true' : 'false' },
        h('b', null, busy ? 'กำลังอัปโหลดอยู่…' : 'เลือกไฟล์แนบ (เลือกหลายไฟล์ได้)'), h('span', { class: 'mini' }, 'ไฟล์ละไม่เกิน 5 GB')),
      fileIn, hostFor(k), msg);
  }
  async function uploadAttachments(L, files, msg) {
    const k = L.id + ':att';
    if (BUSY.has(k)) return;
    const bad = files.map(f => sizeProblem(f) ? `${f.name}: ${sizeProblem(f)}` : '').filter(Boolean);
    if (bad.length) { say(msg, bad.join(' · '), 'err'); return; }
    say(msg, '');
    BUSY.add(k); refreshEditor();
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const r = await runUpload(hostFor(k), file, `ไฟล์แนบ ${i + 1}/${files.length}`,
        () => capi('admin/course', { action: 'sign-upload', lessonId: L.id, kind: 'attachment', filename: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
        s => capi('admin/course', { action: 'add-attachment', lessonId: L.id, name: file.name, path: s.path, size: file.size }));
      if (!r) break;
      if (r.lesson) applyLesson(r.lesson);
      ok++;
    }
    BUSY.delete(k);
    if (ok) toast(`แนบไฟล์แล้ว ${ok}/${files.length} ไฟล์`);
    refreshEditor();
  }
  async function removeAttachment(L, a, msg) {
    if (!confirm(`ลบไฟล์แนบ "${a.name || a.path.split('/').pop()}"? ไฟล์จะถูกลบถาวร`)) return;
    say(msg, 'กำลังลบ…');
    try { const r = await capi('admin/course', { action: 'remove-attachment', lessonId: L.id, path: a.path }); applyLesson(r.lesson); toast('ลบไฟล์แนบแล้ว'); refreshEditor(); }
    catch (e) { say(msg, errText(e), 'err'); }
  }

  // ================================================================ ไฟล์คอร์ส
  const F = { list: [], loaded: false, busy: false };
  const normFile = f => ({ ...f, sort_order: +f.sort_order || 0, published: f.published !== false });
  async function loadFiles() {
    F.loaded = true;
    if (!F.list.length) A.tableMsg('cfTable', 'กำลังโหลด…');
    try { const d = await capi('admin/files'); F.list = (Array.isArray(d.files) ? d.files : []).map(normFile); renderFiles(); }
    catch (e) { F.loaded = false; A.tableMsg('cfTable', 'โหลดไฟล์คอร์สไม่สำเร็จ: ' + errText(e), 'err'); }
  }
  function renderFiles() {
    F.list.sort((a, b) => a.sort_order - b.sort_order || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    $('cfCount').textContent = `(${F.list.length} ไฟล์ · แสดง ${F.list.filter(f => f.published).length})`;
    if (!F.list.length) { A.tableMsg('cfTable', 'ยังไม่มีไฟล์ — อัปโหลด zip ชุดเริ่มต้นด้านบน'); return; }
    $('cfTable').replaceChildren(
      h('tr', null, ['ไฟล์', 'ขนาด', 'แสดง', 'ลำดับ', 'เพิ่มเมื่อ', ''].map(t => h('th', null, t))),
      ...F.list.map(f => {
        const so = h('input', { type: 'number', class: 'num-in', value: String(f.sort_order), step: '1', 'aria-label': 'ลำดับ' });
        so.onchange = async () => {
          const v = Math.round(+so.value || 0);
          try { const r = await capi('admin/files', { action: 'update', id: f.id, sort_order: v }); Object.assign(f, normFile(r.file || { ...f, sort_order: v })); toast('บันทึกลำดับแล้ว'); renderFiles(); }
          catch (e) { toast('ไม่สำเร็จ: ' + errText(e)); so.value = String(f.sort_order); }
        };
        return h('tr', null,
          h('td', null, h('b', null, f.title || '(ไม่มีชื่อ)'), f.description ? h('div', { class: 'muted clamp2' }, f.description) : null,
            h('div', { class: 'mini', style: 'overflow-wrap:anywhere' }, String(f.path || '').split('/').pop())),
          h('td', { class: 'muted nowrap' }, fsize(f.size)),
          h('td', null, switchBtn(f.published, f.published ? 'ซ่อนไฟล์นี้จากนักเรียน' : 'แสดงไฟล์นี้ให้นักเรียน', async v => {
            const r = await capi('admin/files', { action: 'update', id: f.id, published: v });
            Object.assign(f, normFile(r.file || { ...f, published: v })); toast(v ? 'แสดงไฟล์แล้ว' : 'ซ่อนไฟล์แล้ว'); renderFiles();
          })),
          h('td', null, so),
          h('td', { class: 'muted nowrap' }, A.fdate(f.created_at)),
          h('td', null, h('div', { class: 'acts2' },
            isHttps(f.url) ? h('a', { class: 'btn sm ghost', href: f.url, target: '_blank', rel: 'noopener' }, 'ดาวน์โหลด') : null,
            btn('แก้ไข', () => editFile(f)),
            btn('ลบ', () => delFile(f), 'btn sm red'))));
      }));
  }
  $('cfReload').onclick = loadFiles;
  $('cfFile').onchange = () => { const file = pickedFiles($('cfFile'))[0]; if (file) uploadCourseFile(file); };
  async function uploadCourseFile(file) {
    if (F.busy) { toast('กำลังอัปโหลดอยู่ — รอให้เสร็จก่อน'); return; }
    const bad = sizeProblem(file);
    if (bad) { $('cfProg').replaceChildren(h('div', { class: 'err', style: 'margin-top:10px' }, bad)); return; }
    const title = $('cfTitle').value.trim() || file.name.replace(/\.[^.]+$/, '') || file.name;
    const description = $('cfDesc').value.trim();
    const sort_order = F.list.reduce((a, x) => Math.max(a, x.sort_order), -1) + 1;
    F.busy = true; $('cfFile').disabled = true;
    const r = await runUpload($('cfProg'), file, 'อัปโหลด ' + title,
      () => capi('admin/files', { action: 'sign-upload', filename: file.name, size: file.size }),
      s => capi('admin/files', { action: 'create', title, description, path: s.path, size: file.size, published: true, sort_order }));
    F.busy = false; $('cfFile').disabled = false;
    if (r) { $('cfTitle').value = ''; $('cfDesc').value = ''; if (r.file) { F.list.push(normFile(r.file)); renderFiles(); } loadFiles(); }
  }
  function editFile(f) {
    const ti = h('input', { type: 'text', value: f.title || '', maxlength: 200 });
    const de = h('textarea', { maxlength: 2000, style: 'min-height:80px' }); de.value = f.description || '';
    const msg = h('div', { class: 'msg' }), save = h('button', { class: 'btn', type: 'button' }, 'บันทึก');
    const close = A.sheet('แก้ไขไฟล์คอร์ส', h('div', null, h('label', null, 'ชื่อที่นักเรียนเห็น'), ti, h('label', null, 'คำอธิบาย'), de, msg),
      [btn('ยกเลิก', () => close(), 'btn ghost'), save]);
    save.onclick = async () => {
      const title = ti.value.trim(); if (!title) { say(msg, 'ใส่ชื่อไฟล์ก่อน', 'err'); return; }
      save.disabled = true; say(msg, 'กำลังบันทึก…');
      try { const r = await capi('admin/files', { action: 'update', id: f.id, title, description: de.value.trim() }); Object.assign(f, normFile(r.file || { ...f, title, description: de.value.trim() })); close(); toast('บันทึกแล้ว'); renderFiles(); }
      catch (e) { say(msg, errText(e), 'err'); save.disabled = false; }
    };
  }
  async function delFile(f) {
    if (!confirm(`ลบไฟล์ "${f.title}" ถาวร? นักเรียนจะดาวน์โหลดไม่ได้อีก (ถ้าแค่พักไว้ ให้ปิดสวิตช์ “แสดง” แทน)`)) return;
    try { await capi('admin/files', { action: 'delete', id: f.id }); F.list = F.list.filter(x => x !== f); toast('ลบไฟล์แล้ว'); renderFiles(); }
    catch (e) { toast('ลบไม่สำเร็จ: ' + errText(e)); }
  }

  // ================================================================ register with admin.js
  Object.assign(A.tabs, {
    students: { open() { if (!ST.loaded) loadStudents(); else renderStudents(); }, render: renderStudents, reset() { ST.loaded = false; } },
    lessons: { open() { if (!C.loaded) loadCourse(); }, reset() { C.loaded = false; C.modules = []; C.edit = null; $('lsEdit').hidden = true; $('lsEdit').replaceChildren(); $('lsListView').hidden = false; } },
    files: { open() { if (!F.loaded) loadFiles(); }, reset() { F.loaded = false; F.list = []; } },
  });
  // the app may already be on one of these tabs (scripts can finish loading after the first route)
  const cur = document.querySelector('#tabs .chip.on'), vApp = $('vApp');
  if (cur && vApp && !vApp.hidden && A.tabs[cur.dataset.tab]) A.tabs[cur.dataset.tab].open();
  window.T1AdminCourse = { renderMd };
})();
