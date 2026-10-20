// account.js — student session shared by the course pages (login / course / lesson) and the account slot in any nav.
// Needs config.js (window.ARMORY) and vendor/supabase.js (supabase-js 2.45.4 UMD, same-origin copy → window.supabase) loaded before it.
// Exposes window.T1Auth = { sb, session(), me(), requireStudent(next), signOut(), mountNav(slotEl), api(), ... }
//     and window.T1UI   = { h, esc, safeUrl, toast, copy, fmtSize, fmtDate, normKey, maskKey, isEmail }.
// Everything lives inside this IIFE: app.js declares top-level consts (h, esc, toast, copy, CFG …) on pages that load both.
(function () {
  'use strict';
  // ---------------------------------------------------------------- config (placeholders such as "<ref>" count as "not set")
  const CFG = window.ARMORY || {};
  const val = v => (typeof v === 'string' && v.trim() && !/[<>]/.test(v)) ? v.trim().replace(/\/+$/, '') : '';
  const FN = val(CFG.functionsBase), SURL = val(CFG.supabaseUrl), SKEY = val(CFG.supabaseKey);
  const READY = /^https?:\/\/\S+$/.test(FN) && /^https?:\/\/\S+$/.test(SURL) && !!SKEY;
  const COURSE = FN + '/course-api/';
  const STORAGE_KEY = 'top1-course-auth';
  // owner-set contact (config.js contactUrl = LINE OA / Facebook page link, https only) → a button next to every "ติดต่อทีมงาน" message
  const CONTACT_URL = (() => { const u = String(CFG.contactUrl || '').trim(); return /^https:\/\/[^\s<>"'`]+$/i.test(u) ? u : ''; })();
  const CONTACT_LABEL = (() => { const t = String(CFG.contactLabel || '').trim(); return t && !/[<>]/.test(t) ? t.slice(0, 40) : 'ติดต่อทีมงาน'; })();
  // A session is taken from the address bar ONLY on the password-reset page (login.html?reset=1), and only through PKCE:
  // the reset link works in the browser that asked for it (code verifier in this browser's storage), so a forwarded or
  // planted link (#access_token=… of someone else's account) can never replace the session already in this browser.
  const RESET_PAGE = /(?:^|\/)login\.html$/i.test(location.pathname) && new URLSearchParams(location.search).get('reset') === '1';
  // the password-recovery link lands as login.html?reset=1#access_token=…|#error=…; keep the harmless params (error*, key) before
  // supabase-js cleans the hash — tokens are never copied anywhere
  const AUTH_HASH = /(?:^#|&)(?:access_token|refresh_token|provider_token|provider_refresh_token|token_type|expires_in|expires_at|type|code|error|error_code|error_description)=/;
  const INITIAL_HASH = (() => {
    try {
      const src = new URLSearchParams(String(location.hash || '').replace(/^#/, '')), out = new URLSearchParams();
      ['error', 'error_code', 'error_description', 'key'].forEach(k => { const v = src.get(k); if (v) out.set(k, v); });
      const s = out.toString(); return s ? '#' + s : '';
    } catch { return ''; }
  })();

  // ---------------------------------------------------------------- tiny UI helpers (same behaviour as app.js, private copies)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // only http(s) or plain relative URLs reach href/src (no javascript:/data:/claude: from data)
  const safeUrl = u => { u = String(u ?? '').trim(); if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//') || u.includes('\\')) return ''; return u; };
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'href' || k === 'src' || k === 'poster') { const u = safeUrl(v); if (u) el.setAttribute(k, u); }
      else if (k === 'value') el.value = v;
      else if (v === true) { el.setAttribute(k, ''); if (k in el) try { el[k] = true; } catch {} }
      else el.setAttribute(k, String(v));
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  function toast(t) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1900);
  }
  async function copy(t, msg) {
    try { await navigator.clipboard.writeText(t); toast(msg || 'คัดลอกแล้ว'); return true; } catch {}
    try {
      const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0;opacity:0' }); ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); if (ok) { toast(msg || 'คัดลอกแล้ว'); return true; }
    } catch {}
    try { window.prompt('คัดลอกข้อความนี้', t); } catch {}
    return false;
  }
  const fmtSize = n => { n = +n; if (!isFinite(n) || n <= 0) return ''; if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'; if (n < 1024 ** 3) return (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0) + ' MB'; return (n / 1024 ** 3).toFixed(1) + ' GB'; };
  const fmtDate = v => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; try { return d.toLocaleDateString('th-TH', { dateStyle: 'medium' }); } catch { return d.toISOString().slice(0, 10); } };
  // student keys look like T1-XXXX-XXXX-XXXX (Crockford base32); tolerate spaces, lower case and O/I/L look-alikes like the server does
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
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

  // ---------------------------------------------------------------- Thai messages for API reasons
  const REASON_TH = {
    config: 'เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js) — แจ้งทีมงาน',
    nosdk: 'โหลดระบบเข้าสู่ระบบไม่สำเร็จ — รีเฟรชหน้าอีกครั้ง',
    network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ตแล้วลองใหม่',
    rate: 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่',
    'rate-limited': 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่',
    'key-invalid': 'คีย์ไม่ถูกต้อง — เช็กว่าคัดลอกครบทุกตัว (หน้าตาแบบ T1-XXXX-XXXX-XXXX)',
    invalid: 'คีย์ไม่ถูกต้อง — เช็กว่าคัดลอกครบทุกตัว (หน้าตาแบบ T1-XXXX-XXXX-XXXX)',
    missing: 'ใส่คีย์ก่อน',
    'key-used': 'คีย์นี้ผูกกับบัญชีอื่นแล้ว (1 คีย์ ใช้ได้ 1 บัญชี) — ถ้าเคยลงทะเบียนแล้ว ให้เข้าสู่ระบบด้วยอีเมลเดิม',
    'key-inactive': 'คีย์นี้ถูกปิดใช้งาน — ติดต่อทีมงาน TOP 1 HollyWood',
    'key-expired': 'คีย์นี้หมดอายุแล้ว — ติดต่อทีมงาน TOP 1 HollyWood',
    expired: 'คีย์นี้หมดอายุแล้ว — ติดต่อทีมงาน TOP 1 HollyWood',
    'email-exists': 'อีเมลนี้มีบัญชีอยู่แล้ว — ไปที่แท็บ "เข้าสู่ระบบ" หรือกด "ลืมรหัสผ่าน"',
    'weak-password': 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว',
    'bad-email': 'อีเมลไม่ถูกต้อง — เช็กตัวสะกดอีกครั้ง',
    login: 'กรุณาเข้าสู่ระบบก่อน',
    'not-student': 'บัญชีนี้ยังไม่ได้ผูกคีย์คอร์ส',
    inactive: 'บัญชีนักเรียนนี้ถูกปิดใช้งาน — ติดต่อทีมงาน TOP 1 HollyWood',
    forbidden: 'บัญชีนี้ยังเปิดดูส่วนนี้ไม่ได้',
    'not-found': 'ไม่พบข้อมูลที่ต้องการ (อาจถูกปิดหรือย้ายแล้ว)',
    'bad-response': 'เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ — ลองใหม่อีกครั้ง',
    error: 'มีบางอย่างผิดพลาด — ลองใหม่อีกครั้ง',
  };
  const hasThai = s => typeof s === 'string' && /[฀-๿]/.test(s);
  // prefer the server's Thai message; fall back to our own wording (never show raw English errors to students)
  const reasonText = (reason, serverMsg) => (hasThai(serverMsg) && !['network', 'config', 'nosdk'].includes(reason)) ? serverMsg : (REASON_TH[reason] || REASON_TH.error);
  function fail(reason, status, serverMsg) { const e = new Error(reasonText(reason, serverMsg)); e.reason = reason; e.status = status; return e; }

  // supabase-js auth errors → simple Thai
  const MAIL_DOWN = 'ตอนนี้ระบบส่งอีเมลไม่ได้ — ติดต่อทีมงานให้ตั้งรหัสผ่านใหม่ให้';
  function authErrorText(err) {
    if (!err) return '';
    const m = String(err.message || err.error_description || err || ''), st = +err.status || 0, code = String(err.code || err.error_code || '');
    // Supabase's built-in mailer only sends to the project's team → GoTrue answers email_address_not_authorized; SMTP down → "Error sending … email"
    if (code === 'email_address_not_authorized' || /not authori[sz]ed|email_address_not_authorized|smtp|error sending|sending (recovery|reset|confirmation|magic link) email/i.test(m)) return MAIL_DOWN;
    if (/invalid login credentials|invalid_grant/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/email not confirmed/i.test(m)) return 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล — ติดต่อทีมงานให้เปิดใช้งาน';
    if (st === 429 || /rate limit|too many|over_email_send_rate/i.test(m)) return 'ทำรายการบ่อยเกินไป รอสักครู่แล้วลองใหม่ (ถ้ารีบ ติดต่อทีมงานให้ตั้งรหัสผ่านใหม่ให้)';
    if (/same.*password|different from the old/i.test(m)) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม';
    if (/password/i.test(m) && /(at least|short|weak|characters)/i.test(m)) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว';
    if (/session.*missing|auth session|jwt|expired|otp/i.test(m)) return 'ลิงก์หรือเซสชันหมดอายุแล้ว — ขอลิงก์ตั้งรหัสใหม่อีกครั้ง';
    if (/fetch|network|load failed|timeout/i.test(m) || err.name === 'AuthRetryableFetchError') return REASON_TH.network;
    if (/email/i.test(m) && /invalid/i.test(m)) return REASON_TH['bad-email'];
    return 'ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง';
  }

  // ---------------------------------------------------------------- supabase client (session kept in localStorage)
  let sb = null;
  if (READY && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      sb = window.supabase.createClient(SURL, SKEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: RESET_PAGE, flowType: 'pkce', storageKey: STORAGE_KEY },
      });
    } catch { sb = null; }
  }
  const problem = () => !READY ? 'config' : !sb ? 'nosdk' : '';

  async function session() {
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return (data && data.session) || null; } catch { return null; }
  }

  // course-api call: JSON in/out, Bearer = the student's access token. Throws Error{reason,status,message(Thai)}.
  async function api(path, opt = {}) {
    if (!READY) throw fail('config', 0);
    const hasBody = opt.body !== undefined;
    const headers = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (opt.auth !== false) {
      const s = await session();
      if (!s || !s.access_token) throw fail('login', 401);
      headers.Authorization = 'Bearer ' + s.access_token;
    }
    let r;
    try { r = await fetch(COURSE + String(path).replace(/^\/+/, ''), { method: opt.method || (hasBody ? 'POST' : 'GET'), headers, body: hasBody ? JSON.stringify(opt.body) : undefined }); }
    catch { throw fail('network', 0); }
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok || !d || typeof d !== 'object' || d.ok === false) {
      const reason = (d && typeof d.reason === 'string' && d.reason) ||
        (r.status === 401 ? 'login' : r.status === 403 ? 'forbidden' : r.status === 404 ? 'not-found' : r.status === 429 ? 'rate' : r.ok ? 'bad-response' : 'error');
      const e = fail(reason, r.status, d && d.message); e.data = d && typeof d === 'object' ? d : null;   // e.g. { admin } on a 403
      throw e;
    }
    return d;
  }
  // armory-api public key check (same endpoint the gallery uses) → { ok, name?, reason?, message }
  async function keyCheck(key) {
    if (!READY) return { ok: false, reason: 'config', message: REASON_TH.config };
    let r;
    try { r = await fetch(FN + '/armory-api/public/key-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }); }
    catch { return { ok: false, reason: 'network', message: REASON_TH.network }; }
    let d = null; try { d = await r.json(); } catch {}
    if (r.ok && d && d.ok) return { ok: true, name: typeof d.name === 'string' ? d.name : '' };
    const reason = (d && d.reason) || (r.status === 429 ? 'rate' : 'error');
    return { ok: false, reason, message: reasonText(reason, d && d.message) };
  }

  // student/me (cached for this page; force = reload)
  let meP = null;
  function me(force) {
    if (force || !meP) {
      meP = (async () => { const s = await session(); if (!s) return null; return api('student/me'); })();
      meP.catch(() => { meP = null; });
    }
    return meP;
  }

  // ---------------------------------------------------------------- navigation helpers
  // the current page as a relative link (lesson.html?id=M00-L01) — used as ?next=
  function here() {
    const f = location.pathname.split('/').pop() || '';
    const hash = AUTH_HASH.test(location.hash) ? '' : location.hash;          // never carry auth tokens into a ?next= link
    return (f || './') + location.search + hash;
  }
  // ?next= must stay on this site: a page of this folder (name.html or ./) with an optional query/hash; never login.html itself
  const NEXT_RE = /^(?:\.\/(?:[A-Za-z0-9][\w-]*\.html)?|[A-Za-z0-9][\w-]*\.html)(?:\?[^\s#\\]*)?(?:#[^\s\\]*)?$/;
  function safeNext(raw, fallback) {
    const fb = fallback || 'course.html';
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 400 || !NEXT_RE.test(s) || /access_token|refresh_token/i.test(s)) return fb;
    if (/^(?:\.\/)?login\.html/i.test(s)) return fb;
    try {
      const u = new URL(s, location.href), base = new URL('./', location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(base.pathname)) return fb;
    } catch { return fb; }
    return s;
  }
  const loginHref = next => 'login.html?next=' + encodeURIComponent(safeNext(next || here()));

  async function requireStudent(next) {
    const p = problem(); if (p) throw fail(p, 0);
    const s = await session();
    if (!s) { A.go(loginHref(next)); return null; }
    try { return await me(); }
    catch (e) {
      if (e.status === 401 || e.reason === 'login') { await signOut(); A.go(loginHref(next)); return null; }
      throw e;
    }
  }

  async function signOut() {
    meP = null;
    if (!sb) return;
    let failed = false;
    try { const r = await sb.auth.signOut(); failed = !!(r && r.error); } catch { failed = true; }
    if (failed) { try { localStorage.removeItem(STORAGE_KEY); } catch {} }   // offline: still forget the session on this device
  }

  // ---------------------------------------------------------------- account slot: [data-account-slot] in any nav
  const slots = new Set();
  let subscribed = false;
  const pageName = () => (location.pathname.split('/').pop() || '').toLowerCase();
  function displayName(user) {
    const md = (user && user.user_metadata) || {};
    const n = String(md.name || md.full_name || '').trim();
    if (n) return n;
    const em = String((user && user.email) || '');
    return em ? em.split('@')[0] : 'นักเรียน';
  }
  function paintSlot(el, s) {
    el.removeAttribute('aria-busy');
    const page = pageName();
    if (!s) {
      // every armory page shows the way into the course: "เข้าเรียน" → log in → คอร์สของฉัน
      el.replaceChildren(page === 'login.html'
        ? h('a', { class: 'btn ghost sm', href: './#armory' }, 'ดูคลังสไตล์')
        : h('a', { class: 'btn sm', href: loginHref('course.html'), 'data-act': 'learn' }, 'เข้าเรียน'));
      return;
    }
    const user = s.user || {};
    const out = h('button', { class: 'btn ghost sm', type: 'button', 'data-act': 'logout' }, 'ออกจากระบบ');
    out.addEventListener('click', async () => {
      out.disabled = true;
      await signOut();
      if (document.body && document.body.getAttribute('data-auth') === 'required') { A.go('login.html'); return; }
      paintAll(null); toast('ออกจากระบบแล้ว');
    });
    el.replaceChildren(...[
      page === 'course.html' ? null : h('a', { class: 'btn sm', href: 'course.html' }, 'คอร์สของฉัน'),
      h('span', { class: 'who', title: user.email || '' }, displayName(user)),
      out].filter(Boolean));
  }
  function paintAll(s) { slots.forEach(el => { if (el.isConnected) paintSlot(el, s); else slots.delete(el); }); }
  async function mountNav(slot) {
    let els = slot == null ? [...document.querySelectorAll('[data-account-slot]')]
      : typeof slot === 'string' ? [...document.querySelectorAll(slot)] : [slot];
    els = els.filter(el => el && el.nodeType === 1);
    els.forEach(el => { slots.add(el); el.classList.add('acct'); el.setAttribute('aria-busy', 'true'); });
    if (sb && !subscribed) {
      subscribed = true;
      try {
        sb.auth.onAuthStateChange((ev, s) => {
          if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') { meP = null; setTimeout(() => paintAll(s || null), 0); }
        });
      } catch {}
    }
    const s = await session();
    els.forEach(el => paintSlot(el, s));
    return s;
  }

  // ---------------------------------------------------------------- contact button (config.js contactUrl) — null when the owner has not set one
  function contactLink(cls) {
    return CONTACT_URL ? h('a', { class: cls || 'btn sm ghost', href: CONTACT_URL, target: '_blank', rel: 'noopener noreferrer', 'data-act': 'contact' }, CONTACT_LABEL) : null;
  }
  // static pages: <span data-contact></span> next to a "ติดต่อทีมงาน" sentence gets the button (stays empty without a contactUrl)
  try { document.querySelectorAll('[data-contact]').forEach(el => { const a = contactLink(el.getAttribute('data-contact') || 'linkbtn'); if (a) el.replaceChildren(' ', a); }); } catch {}

  // ---------------------------------------------------------------- export
  const A = {
    sb, ready: READY, problem, functionsBase: FN, courseBase: COURSE, storageKey: STORAGE_KEY, initialHash: INITIAL_HASH, resetPage: RESET_PAGE, contactUrl: CONTACT_URL,
    session, me, requireStudent, signOut, mountNav, api, keyCheck, reasonText, authErrorText, safeNext, loginHref, here, displayName,
    // every page redirect goes through here (one place to change; tests replace it)
    go(url, push) { if (push) location.assign(url); else location.replace(url); },
  };
  window.T1Auth = A;
  window.T1UI = { h, esc, safeUrl, toast, copy, fmtSize, fmtDate, normKey, maskKey, isEmail, contactLink };
})();
