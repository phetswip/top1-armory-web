// app.js — shared by every armory page (index · style · connect · admin): config + API URLs, safe DOM builder, toast/copy,
// student key (key-only students, remembered in this browser), badges, and the "ทำคอนเทนต์แบบนี้" dialog:
//   logged-in student → key comes from the account (T1Auth.me(), no typing) → step 1 once per browser: kit folder + "เชื่อมคลังแสงกับแอป Claude"
//   → step 2 "เปิดในแอป Claude" = claude://code/new?folder=…&q=/top1-make <style>  (desktop.js) · copy-text fallback · "วิธีอื่น" = Claude Code CLI.
//   not logged in → "เข้าสู่ระบบนักเรียน" / "ลงทะเบียนด้วยคีย์" + a small key-only path (key checked by the server → same desktop steps).
// account.js (window.T1Auth) and desktop.js (window.T1Desktop) are optional here: admin.html loads app.js alone.
// Static site (GitHub Pages under /top1-armory-web/): every link and asset path here is relative.

// ---------- config (web/config.js sets window.ARMORY; placeholders like "<ref>" count as "not set")
const CFG = window.ARMORY || {};
const cfgVal = v => (typeof v === 'string' && v.trim() && !/[<>]/.test(v)) ? v.trim().replace(/\/+$/, '') : '';
const FN_BASE = cfgVal(CFG.functionsBase);
const SUPA_URL = cfgVal(CFG.supabaseUrl);
const SUPA_KEY = cfgVal(CFG.supabaseKey);
const CFG_READY = /^https?:\/\/\S+$/.test(FN_BASE);
const apiUrl = p => FN_BASE + '/armory-api/' + String(p).replace(/^\/+/, '');
const KEY_PH = '<คีย์ของคุณ>';
const mcpUrl = k => (FN_BASE || 'https://<ref>.supabase.co/functions/v1') + '/armory-mcp?key=' + (k ? encodeURIComponent(k) : KEY_PH);
const cliCmd = u => `claude mcp add --transport http top1-armory "${u}"`;
const styleHref = id => 'style.html?id=' + encodeURIComponent(id || '');

// ---------- this browser remembers: the key of a key-only student, and that the starter-kit folder was connected once
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
const LS = {
  get k() { return lsGet('top1_key'); },
  set k(v) { lsSet('top1_key', v); },
  // folder path that "/top1-connect" was launched for (step 1 done on this browser) — '' = not yet
  get kitLinked() { return lsGet('top1_kit_linked'); },
  set kitLinked(v) { lsSet('top1_kit_linked', v); },
};
// keys look like T1-XXXX-XXXX-XXXX (Crockford base32): tolerate spaces, lower case and O/I/L look-alikes like the server does
const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function normKey(raw) {
  const k = String(raw ?? '').trim().slice(0, 200);
  const m = /^t1[-\s]*(.+)$/i.exec(k);
  if (m) {
    const body = m[1].toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (body.length === 12 && [...body].every(ch => KEY_ALPHABET.includes(ch))) return `T1-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
  }
  return k.replace(/\s+/g, '');
}
// never show a full key on screen (same format as the kit's /top1-connect skill): T1-XXXX-…-ABCD
const maskKey = k => { k = String(k || ''); if (!k) return ''; const tail = k.replace(/[^A-Za-z0-9]/g, '').slice(-4); return /^T1-/i.test(k) ? 'T1-XXXX-…-' + tail : '…' + tail; };

// ---------- tiny helpers
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// only http(s) or relative URLs reach href/src (no javascript:/data: from API data)
const safeUrl = u => { u = String(u ?? '').trim(); if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return ''; return u; };
// h('div', {class, text, style, vars, onclick, href, ...}, ...children) — builds DOM without innerHTML (text is always text)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'vars') for (const n of Object.keys(v)) el.style.setProperty(n, v[n]);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'href' || k === 'src' || k === 'poster') { const u = safeUrl(v); if (u) el.setAttribute(k, u); }
    else if (k === 'value') el.value = v;
    else if (v === true) { el.setAttribute(k, ''); if (k in el) try { el[k] = true; } catch {} }
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
function toast(t) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1700); }
async function copy(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg || 'คัดลอกแล้ว'); return; } catch {}
  try { const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0;opacity:0' }); ta.value = t; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); if (ok) { toast(msg || 'คัดลอกแล้ว'); return; } } catch {}
  prompt('คัดลอกข้อความนี้', t);
}
// fetch JSON; non-2xx → Error with .status and the server's message
async function getJSON(url, opt) {
  let r; try { r = await fetch(url, opt); } catch { const e = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ตแล้วลองใหม่'); e.status = 0; throw e; }
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) { const m = d && (typeof d.error === 'string' ? d.error : d.error?.message || d.message); const e = new Error(m || ('เซิร์ฟเวอร์ตอบกลับ ' + r.status)); e.status = r.status; e.data = d; throw e; }
  return d ?? {};
}
// POST {key} → { ok, name?, reason? }
async function checkKey(k) {
  if (!CFG_READY) return { ok: false, reason: 'config' };
  try { return await getJSON(apiUrl('public/key-check'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) }); }
  catch (e) { return { ok: false, reason: e.status === 429 ? 'rate' : e.status === 0 ? 'network' : 'error' }; }
}
const keyReason = r => (r && r.ok === false && typeof r.message === 'string' && r.message && !['config', 'rate', 'network', 'error'].includes(r.reason)) ? r.message : ({ config: 'เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js)', rate: 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่', network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ตแล้วลองใหม่',
  missing: 'ใส่คีย์ก่อน', expired: 'คีย์นี้หมดอายุแล้ว — ติดต่อทีมงาน TOP 1 HollyWood', inactive: 'คีย์นี้ถูกปิดใช้งาน — ติดต่อทีมงาน TOP 1 HollyWood', revoked: 'คีย์นี้ถูกปิดใช้งาน — ติดต่อทีมงาน TOP 1 HollyWood' }[r && r.reason] || 'คีย์ไม่ถูกต้อง หรือถูกยกเลิกแล้ว');

// ---------- student account (account.js) → which key this page may use
const keyLive = k => !!(k && k.key && k.active !== false && !(k.expires_at && Date.parse(k.expires_at) <= Date.now()));
// → { state: 'student' (key, name) | 'anon' | 'needs-key' (email) | 'blocked' (message) | 'error' (message) }
async function accountState() {
  const A = window.T1Auth;
  if (!A || !A.sb) return { state: 'anon' };
  let s = null; try { s = await A.session(); } catch {}
  if (!s) return { state: 'anon' };
  const email = (s.user && s.user.email) || '';
  try {
    const me = await A.me();
    if (!me) return { state: 'anon' };
    if (me.needsKey || !me.student) return { state: 'needs-key', email };
    if (!keyLive(me.key)) return { state: 'blocked', message: me.key && me.key.expires_at && Date.parse(me.key.expires_at) <= Date.now() ? 'คีย์ของบัญชีนี้หมดอายุแล้ว' : 'คีย์ของบัญชีนี้ยังใช้ไม่ได้' };
    return { state: 'student', key: normKey(me.key.key), name: String(me.student.name || '').trim() || (A.displayName ? A.displayName(s.user) : '') };
  } catch (e) {
    if (e && (e.status === 401 || e.reason === 'login')) { try { await A.signOut(); } catch {} return { state: 'anon' }; }   // stale session → sign out quietly
    if (e && (e.status === 403 || /^(inactive|key-inactive|key-expired|not-student)$/.test(e.reason || ''))) return { state: 'blocked', message: e.message || 'บัญชีนี้ยังใช้คลังแสงไม่ได้' };
    return { state: 'error', message: (e && e.message) || 'เช็กบัญชีไม่สำเร็จ — ลองใหม่อีกครั้ง' };
  }
}
// the key that unlocks the full playbook on style.html: the account's key first, then the key remembered in this browser
async function pageKey() { const a = await accountState(); return a.state === 'student' ? a.key : LS.k; }
const loginUrl = next => window.T1Auth && T1Auth.loginHref ? T1Auth.loginHref(next) : 'login.html?next=' + encodeURIComponent(next);
const registerUrl = next => 'login.html?tab=register&next=' + encodeURIComponent(window.T1Auth && T1Auth.safeNext ? T1Auth.safeNext(next) : next);
const isPhone = () => !!(window.T1Desktop && T1Desktop.isMobile && T1Desktop.isMobile());
// owner-set contact (config.js contactUrl, https only) → a button next to "ติดต่อทีมงาน" messages; null when not set
const CONTACT_URL = (() => { const u = String(CFG.contactUrl || '').trim(); return /^https:\/\/[^\s<>"'`]+$/i.test(u) ? u : ''; })();
const contactBtn = (cls = 'btn sm ghost') => CONTACT_URL ? h('a', { class: cls, href: CONTACT_URL, target: '_blank', rel: 'noopener noreferrer', 'data-act': 'contact' },
  (typeof CFG.contactLabel === 'string' && CFG.contactLabel.trim() && !/[<>]/.test(CFG.contactLabel)) ? CFG.contactLabel.trim().slice(0, 40) : 'ติดต่อทีมงาน') : null;

// ---------- building blocks shared by the dialog and connect.html (p = id prefix so both can live on one page)
const mkMsg = id => h('div', { class: 'msg', id, 'aria-live': 'polite' });
const mkSay = (el, cls, ...t) => el.replaceChildren(cls ? h('span', { class: cls }, ...t) : t.join(''));
// small "มีแค่คีย์?" form: key → armory-api key-check → onOk(key, name); the key is remembered only after the server accepts it
function keyOnlyForm(p, onOk, { open = false, title = 'มีแค่คีย์ ยังไม่มีบัญชี? ใช้คีย์ตรงนี้' } = {}) {
  const kin = h('input', { type: 'text', id: p + 'Key', placeholder: 'T1-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', 'aria-label': 'คีย์นักเรียน', style: 'flex:1;min-width:180px' });
  const btn = h('button', { class: 'btn sm', id: p + 'KeyGo', type: 'button' }, 'ใช้คีย์นี้');
  const msg = h('div', { class: 'msg', id: p + 'KeyMsg', 'aria-live': 'polite' });
  const go = async () => {
    const v = normKey(kin.value); kin.value = v;
    if (!v) { mkSay(msg, 'err', 'ใส่คีย์ก่อน'); kin.focus(); return; }
    btn.disabled = true; mkSay(msg, '', 'กำลังตรวจคีย์…');
    const r = await checkKey(v); btn.disabled = false;
    if (normKey(kin.value) !== v) return;                                  // typed something else meanwhile
    if (r && r.ok) { LS.k = v; onOk(v, r.name || ''); }
    else { mkSay(msg, 'err', keyReason(r)); const c = /^(inactive|expired|revoked)$/.test((r && r.reason) || '') ? contactBtn('linkbtn') : null; if (c) msg.append(' ', c); }
  };
  btn.addEventListener('click', go);
  kin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  return h('details', { class: 'help key-only', id: p + 'KeyOnly', open },
    h('summary', null, title),
    h('div', { class: 'muted', style: 'margin-top:6px' }, 'คีย์ได้จากคอร์ส TOP 1 HollyWood · 1 คน 1 คีย์ ห้ามแชร์'),
    h('div', { class: 'row' }, kin, btn), msg);
}
// what to show when there is no usable key yet (anon / needs-key / blocked / error) + the key-only path
function keyGate(acc, { p, next, onKey, retry }) {
  const st = acc.state;
  const out = [];
  if (st === 'needs-key') out.push(h('div', { class: 'step gate' },
    h('h3', null, 'บัญชีนี้ยังไม่ได้ผูกคีย์คอร์ส'),
    h('div', { class: 'muted' }, `บัญชี ${acc.email || 'นี้'} ต้องผูกคีย์ครั้งเดียวที่หน้า "คอร์สของฉัน" แล้วกลับมากดปุ่มนี้อีกครั้ง`),
    h('div', { class: 'row' }, h('a', { class: 'btn', id: p + 'LinkKey', href: 'course.html' }, 'ไปผูกคีย์'))));
  else if (st === 'blocked') out.push(h('div', { class: 'step gate' },
    h('h3', null, 'ยังใช้คลังแสงไม่ได้'),
    h('div', { class: 'err' }, acc.message || 'คีย์ของบัญชีนี้ยังใช้ไม่ได้'),
    h('div', { class: 'muted', style: 'margin-top:6px' }, 'ได้คีย์ใหม่จากทีมงานแล้ว? ผูกที่หน้า "คอร์สของฉัน" · ยังไม่มี? ติดต่อทีมงาน TOP 1 HollyWood'),
    h('div', { class: 'row' }, h('a', { class: 'btn ghost', id: p + 'Course', href: 'course.html' }, 'ไปที่คอร์สของฉัน'), contactBtn())));
  else if (st === 'error') out.push(h('div', { class: 'step gate' },
    h('h3', null, 'เช็กบัญชีไม่สำเร็จ'),
    h('div', { class: 'err' }, acc.message || 'ลองใหม่อีกครั้ง'),
    retry ? h('div', { class: 'row' }, h('button', { class: 'btn', id: p + 'Retry', type: 'button', onclick: retry }, 'ลองใหม่')) : null));
  else out.push(h('div', { class: 'step gate' },
    h('h3', null, 'เข้าสู่ระบบนักเรียนก่อน'),
    h('div', { class: 'muted' }, 'เข้าระบบแล้ว เว็บใส่คีย์ให้เอง ไม่ต้องพิมพ์'),
    h('div', { class: 'row gate-acts' },
      h('a', { class: 'btn lg', id: p + 'Login', href: loginUrl(next) }, 'เข้าสู่ระบบนักเรียน'),
      h('a', { class: 'btn ghost', id: p + 'Register', href: registerUrl(next) }, 'ยังไม่มีบัญชี? ลงทะเบียนด้วยคีย์'))));
  out.push(keyOnlyForm(p, onKey, st === 'blocked' ? { title: 'มีคีย์ใหม่? ใช้คีย์ตรงนี้' } : st === 'needs-key' ? { title: 'หรือใช้คีย์ตรงนี้เลย (ไม่ต้องผูกบัญชี)' } : {}));
  return out;
}
// who + which key (masked) — key-only students can forget the remembered key
function keyLine(p, ctx, onForget) {
  return h('div', { class: 'mk-who', id: p + 'Who' },
    h('span', { class: 'ok' }, '✓ พร้อมแล้ว'),
    h('span', null, ctx.via === 'account' ? (ctx.name ? ` — คุณ${ctx.name}` : ' — บัญชีนักเรียน') : ' — ใช้คีย์ที่จำไว้ในเครื่องนี้'),
    h('span', { class: 'kcode', id: p + 'KeyMasked' }, maskKey(ctx.key)),
    ctx.via === 'key' && onForget ? h('button', { class: 'linkbtn', type: 'button', id: p + 'Forget', onclick: onForget }, 'ลบคีย์ออกจากเครื่องนี้') : null);
}
// phones cannot run the Claude desktop app → explain + let them send this page to their computer
function phoneNote(p, pageUrl) {
  return h('div', { class: 'banner mk-phone', id: p + 'Phone' },
    h('b', null, 'แอป Claude ใช้บนคอมพิวเตอร์ (Mac / Windows)'),
    h('div', null, 'เปิดหน้านี้บนคอมที่ติดตั้งแอป Claude แล้วกดปุ่มนี้อีกครั้ง — แอปจะเปิดบนคอม ไม่ใช่บนมือถือ'),
    h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', id: p + 'CopyPage', onclick: () => copy(pageUrl, 'คัดลอกลิงก์แล้ว — ส่งไปเปิดบนคอม') }, 'คัดลอกลิงก์หน้านี้')));
}
// step "ตั้งค่าครั้งแรก": kit folder (+ help) and "เชื่อมคลังแสงกับแอป Claude" (= /top1-connect <KEY> in the desktop app)
// done once on this browser (LS.kitLinked = that folder) → a one-line summary with "ตั้งค่าใหม่", unless opts.always
function kitSetupStep(p, key, { num = '1', always = false, onChange } = {}) {
  const D = window.T1Desktop;
  const done = () => !!D.folder && D.validFolder(D.folder) && LS.kitLinked === D.folder;
  if (!always && done()) {
    return h('div', { class: 'step done', id: p + 'Setup' },
      h('h3', null, h('span', { class: 'num' }, '✓'), 'ตั้งค่าเครื่องนี้แล้ว'),
      h('span', { class: 'mini path', id: p + 'FolderShown' }, D.folder),
      h('div', { class: 'row', style: 'margin-top:4px' }, h('button', { class: 'linkbtn', type: 'button', id: p + 'Redo', onclick: () => { LS.kitLinked = ''; onChange && onChange(); } }, 'ตั้งค่าใหม่ (ย้ายโฟลเดอร์ / เปลี่ยนคอม)')));
  }
  const fin = h('input', { type: 'text', id: p + 'Folder', value: D.folder, placeholder: D.placeholder(), autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'ที่อยู่โฟลเดอร์ชุดเริ่มต้น', style: 'flex:1;min-width:200px' });
  const fsave = h('button', { class: 'btn sm', type: 'button', id: p + 'FolderSave' }, 'บันทึก');
  const fmsg = mkMsg(p + 'FolderMsg');
  const help = h('details', { class: 'help', open: !D.folder }, h('summary', null, 'หาที่อยู่โฟลเดอร์ยังไง?'));
  const helpBody = document.createElement('div'); helpBody.innerHTML = D.folderHelpHtml; help.append(helpBody);   // fixed text from desktop.js (no user data)
  const savedLine = f => [h('span', { class: 'ok' }, '✓ บันทึกแล้ว'), ' เครื่องนี้จำไว้ให้ ', h('span', { class: 'mini path' }, f)];
  if (D.folder) fmsg.replaceChildren(...savedLine(D.folder));
  const save = () => {
    const raw = fin.value, v = D.setFolder(raw);
    if (!v) { mkSay(fmsg, 'err', D.folderError(D.cleanFolder(raw))); help.open = true; fin.focus(); return ''; }
    fin.value = v; fmsg.replaceChildren(...savedLine(v));
    return v;
  };
  fsave.addEventListener('click', save);
  fin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  // typed a path but did not press บันทึก → save it now; '' = no usable folder
  const ensureFolder = () => (D.cleanFolder(fin.value) !== D.folder ? save() : D.folder) || '';

  const go = h('button', { class: 'btn', type: 'button', id: p + 'Connect' }, 'เชื่อมคลังแสงกับแอป Claude');
  const gmsg = mkMsg(p + 'ConnectMsg');
  const hint = h('div', { id: p + 'ConnectHint' });
  go.addEventListener('click', () => {
    const f = ensureFolder();
    if (!f || !D.validFolder(f)) { mkSay(gmsg, 'err', 'วางที่อยู่โฟลเดอร์ชุดเริ่มต้นก่อน (ข้อ ก.)'); help.open = true; fin.focus(); return; }
    const url = D.connectLink(key);
    if (!url) { mkSay(gmsg, 'err', 'สร้างลิงก์ไม่สำเร็จ — เช็กที่อยู่โฟลเดอร์อีกครั้ง'); return; }
    mkSay(gmsg, '', 'กำลังเปิดแอป Claude… ถ้าเบราว์เซอร์ถาม ให้กด "เปิด"');
    // onDone: true at ~2 s (hint shown), then false if the app still opens (after the browser's "Open Claude?" prompt)
    D.open(url, { fallbackText: D.connectPrompt(key), hintEl: hint, onDone: notOpened => {
      if (notOpened) return;
      LS.kitLinked = D.folder;
      mkSay(gmsg, 'ok', '✓ แอปเปิดแล้ว — กด Enter ในแอป รอจนขึ้นว่า "เชื่อมเสร็จแล้ว" แล้วปิดแชทนั้น');
    } });
  });
  const skip = h('button', { class: 'linkbtn', type: 'button', id: p + 'Skip' }, 'เคยเชื่อมในโฟลเดอร์นี้แล้ว ข้ามได้');
  skip.addEventListener('click', () => {
    const f = ensureFolder();
    if (!f) { mkSay(gmsg, 'err', 'วางที่อยู่โฟลเดอร์ชุดเริ่มต้นก่อน (ข้อ ก.)'); fin.focus(); return; }
    LS.kitLinked = f; onChange && onChange();
  });
  return h('div', { class: 'step', id: p + 'Setup' },
    h('h3', null, h('span', { class: 'num' }, num), 'ตั้งค่าครั้งแรก ', h('span', { class: 'mini' }, '(ทำครั้งเดียวต่อเครื่อง)')),
    h('div', { class: 'kitnote', id: p + 'KitNote' }, 'ยังไม่มีชุดเริ่มต้น? ดาวน์โหลดที่ ', h('a', { class: 'linkbtn', href: 'course.html#files' }, 'คอร์สของฉัน → ไฟล์ประกอบคอร์ส'), ' แล้วแตกไฟล์ (.zip) ก่อน'),
    h('div', { class: 'sub', style: 'margin-top:12px' }, 'ก. วางที่อยู่โฟลเดอร์ชุดเริ่มต้น'),
    h('div', { class: 'muted' }, 'โฟลเดอร์ที่แตกไฟล์ .zip แล้ว (ข้างในมี CLAUDE.md)'),
    h('div', { class: 'row' }, fin, fsave), fmsg, help,
    h('div', { class: 'sub', style: 'margin-top:14px' }, 'ข. เชื่อมคลังแสงกับแอป Claude'),
    h('div', { class: 'row', style: 'margin-top:4px' }, go),
    h('div', { class: 'muted', style: 'margin-top:8px' }, 'แอป Claude จะเปิดพร้อมข้อความที่พิมพ์ไว้ให้ — กด ', h('span', { class: 'kbd' }, 'Enter'), ' แล้วรอจนขึ้นว่า "เชื่อมเสร็จแล้ว"'),
    h('div', { class: 'mini', style: 'margin-top:2px' }, 'ครั้งแรกแอปจะถามว่าไว้ใจโฟลเดอร์นี้ไหม ให้กดอนุญาต (Trust)'),
    gmsg, hint,
    always ? null : h('div', { class: 'row', style: 'margin-top:6px' }, skip));
}
// "วิธีอื่น": Claude Code in a Terminal — only ever built with a key the server accepted (account key or key-check ok)
function cliAlt(p, key, styleId) {
  const shown = cliCmd(mcpUrl('').replace(KEY_PH, maskKey(key)));
  return h('details', { class: 'help alt', id: p + 'Alt' },
    h('summary', null, 'วิธีอื่น: Claude Code ใน Terminal'),
    h('div', { class: 'muted', style: 'margin-top:6px' }, 'สำหรับคนใช้ Terminal เป็น: เปิด Terminal ในโฟลเดอร์ชุดเริ่มต้น วางคำสั่งนี้ครั้งเดียว แล้วพิมพ์ ',
      h('span', { class: 'kbd' }, 'claude'), styleId ? [' ตามด้วย ', h('span', { class: 'kbd' }, '/top1-make ' + styleId)] : ''),
    h('div', { class: 'code', id: p + 'Cli' }, shown),
    h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', id: p + 'CliCopy', onclick: () => copy(cliCmd(mcpUrl(key)), 'คัดลอกคำสั่งแล้ว') }, 'คัดลอกคำสั่ง')),
    h('div', { class: 'mini' }, 'คำสั่งนี้มีคีย์ของคุณอยู่ข้างใน ห้ามส่งต่อให้คนอื่น'));
}

// ---------- "ทำคอนเทนต์แบบนี้" dialog
let mkSeq = 0;
function closeMake() { mkSeq++; const m = document.getElementById('mk'); if (m) m.classList.remove('on'); }
addEventListener('keydown', e => { if (e.key === 'Escape') closeMake(); });
function openMake(s) {
  if (!s || !s.id) return;
  let m = document.getElementById('mk');
  if (!m) { m = h('div', { id: 'mk', class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ทำคอนเทนต์แบบนี้' }); m.addEventListener('click', e => { if (e.target === m) closeMake(); }); document.body.appendChild(m); }
  const seq = ++mkSeq;
  const live = () => seq === mkSeq && m.classList.contains('on');
  const next = styleHref(s.id) + '#make';                                    // back to this style with the dialog open again
  const pageUrl = (() => { try { return new URL(styleHref(s.id), location.href).href; } catch { return styleHref(s.id); } })();
  const body = h('div', { class: 'mk-body', id: 'mkBody', 'aria-live': 'polite' },
    h('div', { class: 'loading', style: 'margin-top:14px' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'muted' }, 'กำลังเช็กบัญชีของคุณ…')));
  m.replaceChildren(h('div', { class: 'sheet mk' },
    h('h2', null, 'ทำคอนเทนต์แบบนี้'), h('div', { class: 'muted' }, s.title || s.id),
    body,
    h('div', { class: 'row mk-foot' },
      h('a', { class: 'linkbtn', href: 'connect.html' }, 'คู่มือเชื่อมแอป Claude'),
      h('button', { class: 'btn ghost sm', id: 'cl', type: 'button', onclick: closeMake }, 'ปิด'))));
  m.classList.add('on');
  const focusFirst = sel => setTimeout(() => { const el = body.querySelector(sel); if (el && live()) try { el.focus(); } catch {} }, 60);

  // a key the server accepted → the desktop steps
  function paint(ctx) {
    if (!live()) return;
    const D = window.T1Desktop;
    const parts = [keyLine('mk', ctx, () => { LS.k = ''; start(); })];
    if (!D) parts.push(h('div', { class: 'err', style: 'margin-top:12px' }, 'โหลดส่วนเปิดแอปไม่สำเร็จ — รีเฟรชหน้านี้อีกครั้ง'));
    else if (isPhone()) parts.push(phoneNote('mk', pageUrl));
    else {
      const setup = kitSetupStep('mk', ctx.key, { onChange: () => paint(ctx) });
      const goMsg = mkMsg('goMsg'), goHint = h('div', { id: 'goHint' });
      const mkPrompt = D.makePrompt(s.id) || '/top1-make ' + s.id;
      const go = h('button', { class: 'btn lg', id: 'go', type: 'button' }, 'เปิดในแอป Claude', h('span', { class: 'ar' }, '→'));
      go.addEventListener('click', () => {
        if (!D.validFolder(D.folder)) {
          mkSay(goMsg, 'err', 'ทำขั้นที่ 1 ก่อน — วางที่อยู่โฟลเดอร์ชุดเริ่มต้น แล้วกดบันทึก');
          const f = document.getElementById('mkFolder'); if (f) f.focus();
          return;
        }
        const url = D.makeLink(s.id);
        if (!url) { mkSay(goMsg, 'err', 'เปิดสไตล์นี้ในแอปไม่ได้ — กด "คัดลอกข้อความ" แล้ววางในแอป Claude แทน'); return; }
        mkSay(goMsg, '', 'กำลังเปิดแอป Claude… ถ้าเบราว์เซอร์ถาม ให้กด "เปิด"');
        D.open(url, { fallbackText: mkPrompt, hintEl: goHint });
      });
      parts.push(setup,
        h('div', { class: 'step mk-go' },
          h('h3', null, h('span', { class: 'num' }, '2'), 'เปิดในแอป Claude'),
          h('div', { class: 'row', style: 'margin-top:0' }, go,
            h('button', { class: 'btn ghost', id: 'c3', type: 'button', onclick: () => copy(mkPrompt, 'คัดลอกข้อความแล้ว — วางในแอป Claude แท็บ Code') }, 'คัดลอกข้อความ')),
          h('div', { class: 'muted', style: 'margin-top:8px' }, 'แอปจะเปิดที่โฟลเดอร์ชุดเริ่มต้น พร้อมข้อความ ', h('span', { class: 'kbd' }, mkPrompt),
            ' — กด ', h('span', { class: 'kbd' }, 'Enter'), ' แล้ว Claude จะถามว่าอยากปรับอะไร และจำสไตล์ของคุณไว้ใช้ครั้งหน้า'),
          goMsg, goHint),
        cliAlt('mk', ctx.key, s.id));
    }
    body.replaceChildren(...parts);
    focusFirst(isPhone() ? '#mkCopyPage' : D && D.validFolder(D.folder) && LS.kitLinked === D.folder ? '#go' : '#mkFolder');
  }
  // no usable key yet → log in / register / key-only
  function gate(acc) {
    if (!live()) return;
    body.replaceChildren(...keyGate(acc, { p: 'mk', next, onKey: (key, name) => paint({ key, via: 'key', name }), retry: start }));
    focusFirst(acc.state === 'anon' ? '#mkLogin' : '#mkKey');
  }
  async function start() {
    const acc = await accountState();
    if (!live()) return;
    if (acc.state === 'student') return paint({ key: acc.key, via: 'account', name: acc.name });
    const saved = LS.k;                                                        // key-only student from an earlier visit → re-check it
    if (saved) { const r = await checkKey(saved); if (!live()) return; if (r && r.ok) return paint({ key: normKey(saved), via: 'key', name: r.name || '' }); }
    gate(acc);
  }
  start();
}

// ---------- badges: difficulty · credits · time (+ what to prepare) → DOM nodes
function badges(m, withNeeds = true) {
  if (!m) return [];
  const lv = Math.max(1, Math.min(3, +m.difficulty || 2));
  const out = [h('span', { class: 'bdg' }, h('b', null, 'ความยาก'), ' ' + '●'.repeat(lv) + '○'.repeat(3 - lv)),
    h('span', { class: 'bdg' }, h('b', null, 'เครดิต'), ' ~' + (m.credits ?? '-')),
    h('span', { class: 'bdg' }, h('b', null, 'เวลา'), ' ' + (m.time ?? '-'))];
  if (withNeeds && Array.isArray(m.needs) && m.needs.length) out.push(h('div', { class: 'needs' }, h('b', null, 'ต้องเตรียม:'), ' ' + m.needs.join(' · ')));
  return out;
}
