// admin.js — owner back office for คลังแสง TOP 1 (static page on GitHub Pages)
// Auth: Supabase email+password (supabase-js UMD) → access token sent as Bearer to {functionsBase}/armory-api/admin/*
//       (or, as a fallback, the admin token in header x-admin-token, kept in sessionStorage for this tab only).
// Tabs: คีย์นักเรียน · สไตล์ (incl. pack-folder upload: sign-upload → PUT to signed URL → register) · การใช้งาน · วิธีใช้
(function () {
  const $ = id => document.getElementById(id);
  const MAX_BYTES = 50 * 1024 * 1024;               // storage object limit
  const SAFE_ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
  const SIGN_BATCH = 100, CONCURRENCY = 4, RETRIES = 3;
  // sign-upload `files[].path`: 'rel' = path inside the style folder (server stores it at <id>/<path>); 'full' = '<id>/<path>'
  const SIGN_PATH_MODE = 'rel';
  const TOKEN_SS = 'top1_admin_token';

  // ---------------------------------------------------------------- state + small utils
  let sb = null, KEYS = [], STYLES = [], view = '', appReady = false, stylesLoaded = false, usageLoaded = false;
  let adminToken = (() => { try { return sessionStorage.getItem(TOKEN_SS) || ''; } catch { return ''; } })();
  const setToken = t => { adminToken = t || ''; try { t ? sessionStorage.setItem(TOKEN_SS, t) : sessionStorage.removeItem(TOKEN_SS); } catch {} };
  const say = (el, text, kind) => { el = typeof el === 'string' ? $(el) : el; el.replaceChildren(kind ? h('span', { class: kind }, text) : text); };
  const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  const pad = n => String(n).padStart(2, '0');
  const fdate = (v, time) => { if (!v) return '-'; const d = new Date(v); if (isNaN(d)) return String(v); return time ? d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('th-TH', { dateStyle: 'medium' }); };
  const toDateInput = v => { const d = new Date(v); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const endOfDay = v => new Date(v + 'T23:59:59').toISOString();      // date input (local) → ISO
  const pageUrl = p => new URL(p, location.href).href.split('#')[0];
  const connectLink = k => pageUrl('connect.html') + '#key=' + encodeURIComponent(k);
  const pubUrl = (id, f) => SUPA_URL ? `${SUPA_URL}/storage/v1/object/public/armory-public/${encodeURIComponent(id)}/${f}` : '';
  function banner(content, kind) { $('banner').replaceChildren(content ? h('div', { class: 'banner' + (kind === 'err' ? ' err' : '') }, content) : ''); }
  function show(v) {
    view = v;
    ['Login', 'Claim', 'App'].forEach(n => { $('v' + n).hidden = v !== n.toLowerCase(); });
    $('logout').hidden = v === 'login';
    if (v === 'login') $('who').textContent = '';
  }
  function tableMsg(id, text, kind) { $(id).replaceChildren(h('tr', null, h('td', { class: kind === 'err' ? 'err' : 'muted', style: 'border-top:0;padding:14px 8px' }, text))); }

  // ---------------------------------------------------------------- API
  async function authHeaders() {
    if (adminToken) return { 'x-admin-token': adminToken };
    if (!sb) return {};
    const { data } = await sb.auth.getSession();
    const t = data && data.session && data.session.access_token;
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  async function rawApi(path, body) {
    const headers = await authHeaders(), opt = { method: body ? 'POST' : 'GET', headers };
    if (body) { headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return getJSON(apiUrl('admin/' + path), opt);
  }
  async function api(path, body) {
    try { return await rawApi(path, body); }
    catch (e) {
      if ((e.status === 401 || e.status === 403) && view === 'app') { banner('สิทธิ์หมดอายุหรือถูกเปลี่ยน — กรุณาเข้าสู่ระบบใหม่', 'err'); setTimeout(route, 0); }
      throw e;
    }
  }

  // ---------------------------------------------------------------- routing: login → claim → app
  let routing = null;
  function route() { if (!routing) routing = doRoute().finally(() => { routing = null; }); return routing; }
  async function doRoute() {
    if (!CFG_READY || !SUPA_URL || !SUPA_KEY) { banner('ยังไม่ได้ตั้งค่า config.js (functionsBase / supabaseUrl / supabaseKey) — หลังบ้านยังใช้งานไม่ได้', 'err'); show('login'); return; }
    if (!sb && !adminToken) { banner('โหลดระบบล็อกอินไม่สำเร็จ (supabase-js) — เช็กอินเทอร์เน็ตแล้วรีเฟรชหน้า', 'err'); show('login'); return; }
    if (adminToken) {
      try { const me = await rawApi('me'); if (me && me.admin) { $('who').textContent = 'เข้าด้วยโทเคนแอดมิน'; return enterApp(); } say('mTok', 'โทเคนไม่ถูกต้อง', 'err'); }
      catch (e) { say('mTok', e.status === 401 || e.status === 403 ? 'โทเคนไม่ถูกต้อง' : e.message, 'err'); }
      setToken('');
    }
    const session = sb ? (await sb.auth.getSession()).data.session : null;
    if (!session) { show('login'); return; }
    let me;
    try { me = await rawApi('me'); }
    catch (e) {
      if (e.status === 401) { await sb.auth.signOut().catch(() => {}); show('login'); say('mAuth', 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่', 'err'); return; }
      show('login'); banner([`ติดต่อเซิร์ฟเวอร์ไม่ได้: ${e.message} `, h('button', { class: 'linkbtn', type: 'button', onclick: () => { banner(''); route(); } }, 'ลองใหม่')], 'err'); return;
    }
    banner('');
    if (me && me.needsLogin) { await sb.auth.signOut().catch(() => {}); show('login'); say('mAuth', 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่', 'err'); return; }
    const email = (me && me.email) || session.user.email || '';
    $('who').textContent = email;
    if (me && me.admin) return enterApp();
    $('claimEmail').textContent = email; say('mClaim', ''); show('claim');
  }

  // ---------------------------------------------------------------- login / sign-up / token / claim / logout
  let mode = 'in';
  function setMode(m) {
    mode = m; $('tIn').classList.toggle('on', m === 'in'); $('tUp').classList.toggle('on', m === 'up');
    $('bAuth').textContent = m === 'in' ? 'เข้าสู่ระบบ' : 'สมัครบัญชี'; $('pw').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    $('upHint').hidden = m !== 'up'; say('mAuth', '');
  }
  $('tIn').onclick = () => setMode('in'); $('tUp').onclick = () => setMode('up');
  const authErr = e => {
    const m = String((e && e.message) || e || '');
    if (/invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/email not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ยืนยันในอีเมลก่อน';
    if (/already (been )?registered|already exists/i.test(m)) return 'อีเมลนี้สมัครแล้ว — ไปที่แท็บ เข้าสู่ระบบ';
    if (/rate limit|too many/i.test(m)) return 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่';
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'ระบบปิดการสมัครอยู่ — เปิดได้ที่ Supabase → Authentication → Sign In / Providers';
    if (/password/i.test(m)) return 'รหัสผ่านใช้ไม่ได้: ' + m;
    return 'ไม่สำเร็จ: ' + m;
  };
  $('fAuth').addEventListener('submit', async e => {
    e.preventDefault();
    if (!sb) { say('mAuth', 'ระบบล็อกอินยังไม่พร้อม (เช็ก config.js)', 'err'); return; }
    const email = $('em').value.trim(), password = $('pw').value;
    if (!email || !password) { say('mAuth', 'ใส่อีเมลและรหัสผ่าน', 'err'); return; }
    if (mode === 'up' && password.length < 8) { say('mAuth', 'ตั้งรหัสผ่านอย่างน้อย 8 ตัว', 'err'); return; }
    const b = $('bAuth'); b.disabled = true; say('mAuth', mode === 'in' ? 'กำลังเข้าสู่ระบบ…' : 'กำลังสมัคร…');
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { say('mAuth', authErr(error), 'err'); return; }
        $('pw').value = ''; say('mAuth', ''); await route();
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: pageUrl('admin.html') } });
        if (error) { say('mAuth', authErr(error), 'err'); return; }
        $('pw').value = '';
        if (data && data.session) { say('mAuth', ''); await route(); }
        else { setMode('in'); say('mAuth', 'สมัครแล้ว — เปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบที่นี่', 'ok'); }
      }
    } catch (err) { say('mAuth', authErr(err), 'err'); }
    finally { b.disabled = false; }
  });
  $('bTok').onclick = async () => { const t = $('tok').value.trim(); if (!t) { say('mTok', 'ใส่โทเคนก่อน', 'err'); return; } setToken(t); $('tok').value = ''; say('mTok', 'กำลังตรวจ…'); await route(); };
  $('tok').addEventListener('keydown', e => { if (e.key === 'Enter') $('bTok').click(); });
  $('bClaim').onclick = async () => {
    const code = $('code').value.trim(); if (!code) { say('mClaim', 'ใส่รหัสตั้งค่าก่อน', 'err'); return; }
    const b = $('bClaim'); b.disabled = true; say('mClaim', 'กำลังยืนยัน…');
    try { await rawApi('claim', { setupCode: code }); $('code').value = ''; say('mClaim', '✓ ยืนยันแล้ว', 'ok'); await route(); }
    catch (e) { say('mClaim', e.status === 403 ? 'รหัสตั้งค่าไม่ถูกต้อง' : e.message, 'err'); if (e.status === 401) setTimeout(route, 1200); }
    finally { b.disabled = false; }
  };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('bClaim').click(); });
  async function logout() {
    setToken(''); if (sb) await sb.auth.signOut().catch(() => {});
    KEYS = []; STYLES = []; stylesLoaded = usageLoaded = false; banner(''); show('login');
  }
  $('logout').onclick = logout; $('bClaimOut').onclick = logout;

  // ---------------------------------------------------------------- app shell + tabs
  function enterApp() {
    show('app');
    if (!appReady) { appReady = true; fillGuide(); }
    loadKeys();
    const cur = document.querySelector('#tabs .chip.on'); if (cur && cur.dataset.tab !== 'keys') openTab(cur.dataset.tab);
  }
  function openTab(t) {
    document.querySelectorAll('#tabs .chip').forEach(c => { const on = c.dataset.tab === t; c.classList.toggle('on', on); c.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
    if (t === 'styles' && !stylesLoaded) loadStyles();
    if (t === 'usage' && !usageLoaded) loadUsage();
  }
  document.querySelectorAll('#tabs .chip').forEach(c => { c.setAttribute('role', 'tab'); c.onclick = () => openTab(c.dataset.tab); });

  // generic glass sheet dialog (edit key)
  function sheet(title, body, actions) {
    let m = $('admModal');
    if (!m) { m = h('div', { id: 'admModal', class: 'modal', role: 'dialog', 'aria-modal': 'true' }); m.addEventListener('click', e => { if (e.target === m) m.classList.remove('on'); }); document.body.appendChild(m); }
    m.replaceChildren(h('div', { class: 'sheet' }, h('h2', null, title), body, h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:16px' }, actions)));
    m.classList.add('on'); return () => m.classList.remove('on');
  }
  addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('admModal'); if (m) m.classList.remove('on'); } });

  // ---------------------------------------------------------------- keys
  const kf = k => ({ id: k.id, key: k.key || '', name: k.name || '', note: k.note || '', active: k.active !== false,
    exp: k.expires_at ?? k.expiresAt ?? null, created: k.created_at ?? k.createdAt ?? k.created ?? null,
    last: k.last_used_at ?? k.lastUsedAt ?? null, uses: +(k.use_count ?? k.useCount ?? 0) || 0 });
  const statusOf = k => !k.active ? 'off' : (k.exp && new Date(k.exp) < new Date() ? 'exp' : 'on');
  const ST_LABEL = { on: 'ใช้งาน', off: 'ปิดอยู่', exp: 'หมดอายุ' };
  const studentMsg = k => `คีย์คลังแสง TOP 1 HollyWood ของคุณ${k.name ? ' (' + k.name + ')' : ''}\n${k.key}\n\nเปิดลิงก์นี้เพื่อเชื่อม Claude (ใส่คีย์ให้แล้ว):\n${connectLink(k.key)}\n\nคีย์นี้ใช้ได้เฉพาะคุณ ห้ามแชร์ให้คนอื่นนะครับ`;
  const keyRows = d => (Array.isArray(d) ? d : (d.keys || d.rows || d.created || [])).map(kf);
  const copyBtns = k => [
    h('button', { class: 'btn sm ghost', type: 'button', title: 'คัดลอกคีย์', onclick: () => copy(k.key, 'คัดลอกคีย์แล้ว') }, 'คีย์'),
    h('button', { class: 'btn sm ghost', type: 'button', title: 'คัดลอกลิงก์ connector (MCP)', onclick: () => copy(mcpUrl(k.key), 'คัดลอกลิงก์ connector แล้ว') }, 'ลิงก์'),
    h('button', { class: 'btn sm ghost', type: 'button', title: 'คัดลอกข้อความพร้อมส่งนักเรียน', onclick: () => copy(studentMsg(k), 'คัดลอกข้อความส่งนักเรียนแล้ว') }, 'ข้อความ')];

  async function loadKeys() {
    if (!KEYS.length) tableMsg('kTable', 'กำลังโหลด…');
    try { KEYS = keyRows(await api('keys')); renderKeys(); }
    catch (e) { tableMsg('kTable', 'โหลดคีย์ไม่สำเร็จ: ' + e.message, 'err'); }
  }
  function renderKeys() {
    const q = $('kSearch').value.trim().toLowerCase(), f = $('kFilter').value;
    const rows = KEYS.filter(k => (!f || statusOf(k) === f) && (!q || (k.name + ' ' + k.note + ' ' + k.key).toLowerCase().includes(q)));
    const on = KEYS.filter(k => statusOf(k) === 'on').length;
    $('kCount').textContent = `(${KEYS.length} คีย์ · ใช้งาน ${on})`;
    if (!rows.length) { tableMsg('kTable', KEYS.length ? 'ไม่พบคีย์ที่ตรงกับคำค้น' : 'ยังไม่มีคีย์ — สร้างคีย์แรกด้านบน'); return; }
    $('kTable').replaceChildren(
      h('tr', null, ['นักเรียน', 'คีย์', 'สถานะ', 'หมดอายุ', 'ใช้ล่าสุด', 'ครั้ง', ''].map(t => h('th', null, t))),
      ...rows.map(k => {
        const st = statusOf(k);
        const sw = h('button', { class: 'sw' + (k.active ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': k.active ? 'true' : 'false', title: k.active ? 'ปิดคีย์นี้' : 'เปิดคีย์นี้' });
        sw.onclick = async () => {
          sw.disabled = true;
          try { await api('keys', { action: 'update', id: k.id, active: !k.active }); k.active = !k.active; toast(k.active ? 'เปิดคีย์แล้ว' : 'ปิดคีย์แล้ว'); renderKeys(); }
          catch (e) { toast('ไม่สำเร็จ: ' + e.message); sw.disabled = false; }
        };
        return h('tr', null,
          h('td', null, h('b', null, k.name || '-'), k.note ? h('div', { class: 'muted' }, k.note) : null, h('div', { class: 'mini' }, 'สร้าง ' + fdate(k.created))),
          h('td', null, h('span', { class: 'kcode' }, k.key)),
          h('td', null, h('div', { class: 'row', style: 'margin:0;flex-wrap:nowrap' }, sw, h('span', { class: 'st ' + st }, ST_LABEL[st]))),
          h('td', { class: 'muted', style: 'white-space:nowrap' }, k.exp ? fdate(k.exp) : 'ไม่หมดอายุ'),
          h('td', { class: 'muted', style: 'white-space:nowrap' }, k.last ? fdate(k.last, true) : 'ยังไม่เคยใช้'),
          h('td', null, String(k.uses)),
          h('td', null, h('div', { class: 'acts2' }, copyBtns(k),
            h('button', { class: 'btn sm ghost', type: 'button', onclick: () => editKey(k) }, 'แก้ไข'),
            h('button', { class: 'btn sm red', type: 'button', onclick: () => delKey(k) }, 'ลบ'))));
      }));
  }
  $('kSearch').oninput = renderKeys; $('kFilter').onchange = renderKeys; $('kReload').onclick = loadKeys;

  $('kCreate').onclick = async () => {
    const name = $('kName').value.trim(); if (!name) { toast('ใส่ชื่อนักเรียนก่อน'); $('kName').focus(); return; }
    const body = { action: 'create', name }, note = $('kNote').value.trim(), exp = $('kExp').value;
    if (note) body.note = note; if (exp) body.expiresAt = endOfDay(exp);
    const b = $('kCreate'); b.disabled = true;
    try {
      const r = await api('keys', body); const k = kf((r && (r.key && typeof r.key === 'object' ? r.key : r.row)) || r);
      $('kName').value = ''; $('kNote').value = ''; $('kExp').value = '';
      $('kNew').replaceChildren(h('div', { class: 'newkey' }, h('div', { class: 'mini' }, 'คีย์ใหม่ของ ' + (k.name || name)), h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'kcode' }, k.key)),
        h('div', { class: 'row' }, copyBtns(k))));
      if (k.key) copy(k.key, 'สร้างแล้ว · คัดลอกคีย์แล้ว');
      loadKeys();
    } catch (e) { toast('สร้างคีย์ไม่สำเร็จ: ' + e.message); }
    finally { b.disabled = false; }
  };
  $('kName').addEventListener('keydown', e => { if (e.key === 'Enter') $('kCreate').click(); });
  const bulkNames = () => $('kBulk').value.split('\n').map(s => s.trim()).filter(Boolean);
  $('kBulk').oninput = () => { const n = bulkNames().length; $('kBulkN').textContent = n ? `${n} รายชื่อ${n > 200 ? ' (เกิน 200 — ใช้แค่ 200 แรก)' : ''}` : ''; };
  $('kBulkGo').onclick = async () => {
    const names = bulkNames().slice(0, 200); if (!names.length) { toast('วางรายชื่อก่อน'); return; }
    if (!confirm(`สร้างคีย์ ${names.length} คีย์?`)) return;
    const b = $('kBulkGo'); b.disabled = true;
    try {
      const rows = keyRows(await api('keys', { action: 'bulk-create', names }));
      $('kBulk').value = ''; $('kBulkN').textContent = '';
      const tsv = rows.map(k => `${k.name}\t${k.key}`).join('\n');
      $('kBulkOut').replaceChildren(h('div', { class: 'newkey' },
        h('div', { class: 'row', style: 'justify-content:space-between;margin-top:0' }, h('b', null, `สร้างแล้ว ${rows.length} คีย์`),
          h('button', { class: 'btn sm', type: 'button', onclick: () => copy(tsv, 'คัดลอกทั้งหมดแล้ว (วางใน Google Sheets ได้)') }, 'คัดลอกทั้งหมด')),
        h('div', { class: 'tw', style: 'margin-top:8px' }, h('table', null, rows.map(k => h('tr', null, h('td', null, k.name), h('td', null, h('span', { class: 'kcode' }, k.key)), h('td', null, h('div', { class: 'acts2' }, copyBtns(k)))))))));
      loadKeys();
    } catch (e) { toast('สร้างไม่สำเร็จ: ' + e.message); }
    finally { b.disabled = false; }
  };
  function editKey(k) {
    const nm = h('input', { type: 'text', value: k.name, maxlength: 120 }), nt = h('textarea', { maxlength: 300, style: 'min-height:70px' }); nt.value = k.note;
    const dt = h('input', { type: 'date', value: k.exp ? toDateInput(k.exp) : '' });
    const save = h('button', { class: 'btn', type: 'button' }, 'บันทึก');
    const close = sheet('แก้ไขคีย์', h('div', null, h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { class: 'kcode' }, k.key)),
      h('label', null, 'ชื่อนักเรียน'), nm, h('label', null, 'โน้ต'), nt, h('label', null, 'หมดอายุ (เว้นว่าง = ไม่หมดอายุ)'), dt),
      [h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'ยกเลิก'), save]);
    save.onclick = async () => {
      save.disabled = true;
      try { await api('keys', { action: 'update', id: k.id, name: nm.value.trim(), note: nt.value.trim(), expiresAt: dt.value ? endOfDay(dt.value) : null }); close(); toast('บันทึกแล้ว'); loadKeys(); }
      catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message); save.disabled = false; }
    };
  }
  async function delKey(k) {
    if (!confirm(`ลบคีย์ของ "${k.name || k.key}" ถาวร?\nนักเรียนคนนี้จะเชื่อมคลังแสงไม่ได้อีก (ถ้าแค่พักไว้ ให้ปิดสวิตช์แทน)`)) return;
    try { await api('keys', { action: 'delete', id: k.id }); toast('ลบคีย์แล้ว'); KEYS = KEYS.filter(x => x !== k); renderKeys(); }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message); }
  }

  // ---------------------------------------------------------------- styles
  const sf = s => ({ id: s.id, title: s.title || s.id, category: s.category || '', published: s.published !== false,
    sort: +(s.sort_order ?? s.sortOrder ?? 0) || 0, updated: s.updated_at ?? s.updatedAt ?? s.updated ?? null,
    files: Array.isArray(s.files) ? s.files.length : (Number.isFinite(+s.fileCount) ? +s.fileCount : null), tr: !!(s.has_transcript ?? s.hasTranscript ?? (s.hasData && s.hasData.transcript)),
    bt: !!(s.has_beats ?? s.hasBeats ?? (s.hasData && s.hasData.beats)), thumb: s.thumb || pubUrl(s.id, 'thumb.jpg'), duration: s.duration });
  const sortStyles = () => STYLES.sort((a, b) => a.sort - b.sort || String(a.title).localeCompare(String(b.title), 'th'));
  async function loadStyles() {
    stylesLoaded = true; if (!STYLES.length) tableMsg('sTable', 'กำลังโหลด…');
    try { const d = await api('styles'); STYLES = (Array.isArray(d) ? d : (d.styles || d.rows || [])).filter(s => s && s.id).map(sf); sortStyles(); renderStyles(); }
    catch (e) { stylesLoaded = false; tableMsg('sTable', 'โหลดสไตล์ไม่สำเร็จ: ' + e.message, 'err'); }
  }
  function renderStyles() {
    $('sCount').textContent = `(${STYLES.length} สไตล์ · แสดง ${STYLES.filter(s => s.published).length})`;
    if (!STYLES.length) { tableMsg('sTable', 'ยังไม่มีสไตล์ — อัปโหลดโฟลเดอร์แพ็คด้านบน'); return; }
    $('sTable').replaceChildren(
      h('tr', null, ['', 'สไตล์', 'แสดง', 'ลำดับ', 'ข้อมูล', 'อัปเดต', ''].map(t => h('th', null, t))),
      ...STYLES.map(s => {
        const img = h('img', { class: 'thumbs', src: s.thumb, alt: '', loading: 'lazy' }); img.onerror = () => { img.removeAttribute('src'); };
        const sw = h('button', { class: 'sw' + (s.published ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': s.published ? 'true' : 'false', title: s.published ? 'ซ่อนจากหน้าคลัง (ภาพปก/คลิปตัวอย่างยังเปิดได้ถ้ามีลิงก์ตรง)' : 'แสดงในหน้าคลัง' });
        sw.onclick = async () => {
          sw.disabled = true;
          try { await api('styles', { action: 'publish', id: s.id, published: !s.published }); s.published = !s.published; toast(s.published ? 'แสดงในหน้าคลังแล้ว' : 'ซ่อนจากหน้าคลังแล้ว'); renderStyles(); }
          catch (e) { toast('ไม่สำเร็จ: ' + e.message); sw.disabled = false; }
        };
        const so = h('input', { type: 'number', class: 'num-in', value: String(s.sort), step: '1', 'aria-label': 'ลำดับ' });
        so.onchange = async () => {
          const v = Math.round(+so.value || 0);
          try { await api('styles', { action: 'sort', id: s.id, sort_order: v }); s.sort = v; toast('บันทึกลำดับแล้ว'); sortStyles(); renderStyles(); }
          catch (e) { toast('ไม่สำเร็จ: ' + e.message); so.value = String(s.sort); }
        };
        const info = [s.files != null ? s.files + ' ไฟล์' : null, s.tr ? 'ถอดเสียง ✓' : 'ไม่มีถอดเสียง', s.bt ? 'ลำดับฉาก ✓' : 'ไม่มีลำดับฉาก', s.duration ? Math.round(+s.duration) + ' วิ' : null].filter(Boolean).join(' · ');
        return h('tr', null,
          h('td', null, img),
          h('td', null, h('b', null, s.title), h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { class: 'kcode' }, s.id)), s.category ? h('div', { class: 'muted' }, s.category) : null),
          h('td', null, sw), h('td', null, so),
          h('td', { class: 'muted', style: 'min-width:140px' }, info),
          h('td', { class: 'muted', style: 'white-space:nowrap' }, fdate(s.updated, true)),
          h('td', null, h('div', { class: 'acts2' },
            h('a', { class: 'btn sm ghost', href: styleHref(s.id), target: '_blank', rel: 'noopener' }, 'ดูหน้า'),
            h('button', { class: 'btn sm red', type: 'button', onclick: () => delStyle(s) }, 'ลบ'))));
      }));
  }
  $('sReload').onclick = loadStyles;
  async function delStyle(s) {
    const typed = prompt(`ลบสไตล์ "${s.title}" ถาวร — ลบข้อมูลและไฟล์ทั้งหมดในคลัง กู้คืนไม่ได้\n(ถ้าแค่ไม่อยากให้เห็น ให้ปิดสวิตช์ “แสดง” แทน)\n\nพิมพ์รหัสสไตล์  ${s.id}  เพื่อยืนยัน`);
    if (typed == null) return;
    if (typed.trim() !== s.id) { toast('รหัสไม่ตรง — ยกเลิกการลบ'); return; }
    try { await api('styles', { action: 'delete', id: s.id }); toast('ลบสไตล์แล้ว'); STYLES = STYLES.filter(x => x !== s); renderStyles(); }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message); }
  }

  // ---------------------------------------------------------------- pack-folder upload (sign-upload → PUT → register)
  const UP = { running: false, stop: false, xhrs: new Set() };
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', json: 'application/json', md: 'text/markdown', txt: 'text/plain', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
    html: 'text/html', csv: 'text/csv', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf', srt: 'text/plain', vtt: 'text/vtt' };
  const mimeOf = (rel, file) => { const ext = (rel.split('.').pop() || '').toLowerCase(); return MIME[ext] || file.type || 'application/octet-stream'; };
  const junk = p => p.split('/').some(seg => !seg || seg.startsWith('.') || seg === '__MACOSX' || /^(thumbs\.db|desktop\.ini)$/i.test(seg));
  const log = (text, kind) => { const box = $('upLog'); box.append(h('div', kind ? { class: kind } : null, text)); box.scrollTop = box.scrollHeight; };
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  addEventListener('beforeunload', e => { if (UP.running) { e.preventDefault(); e.returnValue = ''; } });
  $('upStop').onclick = () => { if (!UP.running) return; UP.stop = true; UP.xhrs.forEach(x => { try { x.abort(); } catch {} }); log('กำลังหยุด…', 'err'); };
  $('upDir').onchange = e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) runUpload(files); };

  async function runUpload(files) {
    if (UP.running) { toast('กำลังอัปโหลดอยู่ — รอให้เสร็จก่อน'); return; }
    const all = files.map(f => ({ file: f, path: String(f.webkitRelativePath || f.name).replace(/\\/g, '/') })).filter(x => !junk(x.path));
    // a pack = a folder holding pack.json; take the shallowest ones (a pack.json deeper inside a pack is just one of its files)
    const roots = all.filter(x => x.path.split('/').pop() === 'pack.json').map(x => x.path.slice(0, -'pack.json'.length).replace(/\/$/, ''))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    const packs = [];
    for (const r of roots) if (!packs.some(p => p === '' || r === p || r.startsWith(p + '/'))) packs.push(r);
    UP.running = true; UP.stop = false; $('upBox').hidden = false; $('upLog').replaceChildren(); $('upBar').style.width = '0%'; $('upStat').textContent = '';
    $('upStop').hidden = false;
    try {
      if (!packs.length) { $('upTitle').textContent = 'ไม่พบแพ็ค'; log('ไม่พบ pack.json ในโฟลเดอร์ที่เลือก — เลือกโฟลเดอร์ของแพ็คที่มี pack.json อยู่ข้างใน (การเลือกโฟลเดอร์ใช้ได้บนคอมเท่านั้น)', 'err'); return; }
      let okN = 0;
      for (let i = 0; i < packs.length; i++) {
        if (UP.stop) break;
        const root = packs[i];
        const entries = all.filter(x => root === '' || x.path.startsWith(root + '/')).map(x => ({ file: x.file, rel: root ? x.path.slice(root.length + 1) : x.path }));
        $('upTitle').textContent = `แพ็ค ${i + 1}/${packs.length}: ${root.split('/').pop() || 'แพ็ค'}`;
        try { await uploadPack(root, entries); okN++; }
        catch (e) { log(`✗ ${root.split('/').pop() || 'แพ็ค'}: ${e.aborted ? 'หยุดแล้ว' : e.message}`, 'err'); if (UP.stop) break; }
      }
      $('upTitle').textContent = UP.stop ? `หยุดแล้ว (สำเร็จ ${okN}/${packs.length} แพ็ค)` : `เสร็จแล้ว — สำเร็จ ${okN}/${packs.length} แพ็ค`;
      if (okN) loadStyles();
    } finally { UP.running = false; UP.stop = false; $('upStop').hidden = true; }
  }

  async function uploadPack(root, entries) {
    const folder = root.split('/').pop();
    const pj = entries.find(e => e.rel === 'pack.json');
    let pack; try { pack = JSON.parse(await pj.file.text()); } catch { throw new Error('อ่าน pack.json ไม่ได้ (JSON ผิดรูปแบบ)'); }
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('pack.json ต้องเป็น object');
    const id = String(pack.id || folder || '').trim();
    if (!SAFE_ID.test(id)) throw new Error(`รหัสสไตล์ "${id}" ใช้ไม่ได้ — ใช้ได้แค่ a-z 0-9 และ - (2–61 ตัว)`);
    if (!String(pack.title || '').trim()) throw new Error('pack.json ไม่มี title');
    pack.id = id; pack.updated = new Date().toISOString();
    const big = entries.filter(e => e.file.size > MAX_BYTES);
    if (big.length) throw new Error('ไฟล์ใหญ่เกิน 50 MB: ' + big.map(e => `${e.rel} (${mb(e.file.size)})`).join(', ') + ' — ย่อก่อน (เช่น ffmpeg -i ref.mp4 -vf scale=-2:1280 -crf 28 ref_small.mp4 แล้วเปลี่ยนชื่อเป็น ref.mp4) หรือใช้เครื่องมืออัปโหลดในเครื่อง');
    const refN = pack.ref_video || 'ref.mp4', thN = pack.thumb || 'thumb.jpg', shN = pack.sheet || 'sheet.jpg';
    // same placement as tools/upload_to_cloud.mjs: armory-private = every pack file · armory-public = thumb / ref video / sheet (same names, for the gallery)
    const jobs = entries.map(e => ({ bucket: 'armory-private', rel: e.rel, file: e.file, sent: 0 }));
    for (const [src, what] of [[thN, 'การ์ดจะไม่มีภาพปก'], [refN, 'การ์ดจะไม่มีคลิปตัวอย่าง'], [shN, 'ไม่มีภาพรวมทั้งคลิป']]) {
      const e = entries.find(x => x.rel === src);
      if (!e) { log(`! ${id}: ไม่มี ${src} — ${what}`, 'err'); continue; }
      if (src.includes('/')) { log(`! ${id}: ${src} อยู่ในโฟลเดอร์ย่อย — ไฟล์ตัวอย่างหน้าเว็บต้องอยู่ชั้นนอกสุดของแพ็ค`, 'err'); continue; }
      jobs.push({ bucket: 'armory-public', rel: src, file: e.file, sent: 0 });
    }
    const total = jobs.reduce((a, j) => a + j.file.size, 0) || 1;
    let done = 0, raf = 0;
    const paint = () => { raf = 0; const sent = jobs.reduce((a, j) => a + j.sent, 0); $('upBar').style.width = Math.min(100, sent / total * 100).toFixed(1) + '%'; $('upStat').textContent = `${id} · ไฟล์ ${done}/${jobs.length} · ${mb(sent)} / ${mb(total)}`; };
    const tick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    log(`${id}: ${jobs.length} ไฟล์ (${mb(total)}) — กำลังอัปโหลด…`); paint();
    for (let i = 0; i < jobs.length; i += SIGN_BATCH) {
      if (UP.stop) throw Object.assign(new Error('หยุดแล้ว'), { aborted: true });
      const batch = jobs.slice(i, i + SIGN_BATCH);
      const r = await api('styles', { action: 'sign-upload', id, files: batch.map(j => ({ bucket: j.bucket, path: SIGN_PATH_MODE === 'full' ? `${id}/${j.rel}` : j.rel })) });
      const list = Array.isArray(r) ? r : (r.uploads || r.urls || r.files || r.signed || r.items || []);
      batch.forEach((j, k) => { j.url = signedUrlFor(list, j, k, id); });
      await pool(batch, CONCURRENCY, async j => { await putWithRetry(j, tick); done++; tick(); });
    }
    const files = jobs.filter(j => j.bucket === 'armory-private').map(j => j.rel);
    await api('styles', { action: 'register', pack, files, hasTranscript: files.includes(pack.transcript || 'transcript.json'), hasBeats: files.includes(pack.beats || 'beats.json') });
    paint();
    const box = $('upLog');
    box.append(h('div', null, h('span', { class: 'ok' }, `✓ ${id} ขึ้นคลังแล้ว`), ` (${jobs.length} ไฟล์ · ${mb(total)}) `, h('a', { class: 'linkbtn', href: styleHref(id), target: '_blank', rel: 'noopener' }, 'ดูหน้า')));
    box.scrollTop = box.scrollHeight;
  }
  // pick the signed URL for job j from the sign-upload reply (match by bucket+path, else by position)
  function signedUrlFor(list, j, k, id) {
    const full = `${id}/${j.rel}`;
    const it = list.find(x => x && x.path && (x.path === full || x.path === j.rel) && (!x.bucket || x.bucket === j.bucket)) || list[k];
    if (!it) throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งลิงก์อัปโหลดสำหรับ ' + j.rel);
    if (it.error) throw new Error(`${j.rel}: ${typeof it.error === 'string' ? it.error : it.error.message || 'ขอลิงก์อัปโหลดไม่สำเร็จ'}`);
    let u = it.signedUrl || it.signed_url || it.signedURL || it.url || '';
    if (!u && it.token) u = `${SUPA_URL}/storage/v1/object/upload/sign/${j.bucket}/${encPath(full)}?token=${encodeURIComponent(it.token)}`;
    if (u.startsWith('/object/')) u = SUPA_URL + '/storage/v1' + u;
    else if (u.startsWith('/storage/v1/')) u = SUPA_URL + u;
    if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(u)) throw new Error('ลิงก์อัปโหลดไม่ถูกต้องสำหรับ ' + j.rel);
    return u;
  }
  async function pool(items, n, fn) {
    let i = 0, err = null;
    const worker = async () => { while (!err && !UP.stop && i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { err = err || e; } } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    if (err) throw err;
    if (UP.stop) throw Object.assign(new Error('หยุดแล้ว'), { aborted: true });
  }
  async function putWithRetry(j, tick) {
    for (let a = 1; ; a++) {
      try { await putFile(j, tick); return; }
      catch (e) {
        j.sent = 0; tick();
        if (e.aborted || UP.stop) throw e;
        const retryable = !e.status || e.status === 429 || e.status >= 500;
        if (!retryable || a >= RETRIES) throw new Error(`อัปโหลด ${j.rel} ไม่สำเร็จ: ${e.message}`);
        await new Promise(r => setTimeout(r, 900 * a));
      }
    }
  }
  function putFile(j, tick) {
    return new Promise((ok, bad) => {
      const x = new XMLHttpRequest(); UP.xhrs.add(x);
      const fail = (msg, extra) => { UP.xhrs.delete(x); bad(Object.assign(new Error(msg), extra || {})); };
      x.open('PUT', j.url);
      x.setRequestHeader('content-type', mimeOf(j.rel, j.file));
      x.setRequestHeader('x-upsert', 'true');
      x.setRequestHeader('cache-control', 'max-age=3600');
      if (SUPA_KEY) x.setRequestHeader('apikey', SUPA_KEY);
      x.upload.onprogress = e => { j.sent = e.loaded; tick(); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { UP.xhrs.delete(x); j.sent = j.file.size; ok(); return; }
        let m = ''; try { const d = JSON.parse(x.responseText); m = d.message || d.error || ''; } catch {}
        fail(m || ('HTTP ' + x.status), { status: x.status });
      };
      x.onerror = () => fail('เครือข่ายขัดข้อง', { status: 0 });
      x.onabort = () => fail('หยุดแล้ว', { aborted: true });
      x.send(j.file);
    });
  }

  // ---------------------------------------------------------------- usage (rendered generically: arrays → tables, {name: count} maps → 2-column tables)
  const U_TITLES = { byKey: 'ตามนักเรียน (คีย์)', perKey: 'ตามนักเรียน (คีย์)', keys: 'ตามนักเรียน (คีย์)', by_key: 'ตามนักเรียน (คีย์)',
    byTool: 'ตามเครื่องมือ', perTool: 'ตามเครื่องมือ', tools: 'ตามเครื่องมือ', by_tool: 'ตามเครื่องมือ',
    byStyle: 'ตามสไตล์', perStyle: 'ตามสไตล์', styles: 'ตามสไตล์', by_style: 'ตามสไตล์',
    byDay: 'รายวัน', daily: 'รายวัน', days_list: 'รายวัน', by_day: 'รายวัน', recent: 'ล่าสุด', rows: 'รายละเอียด (นักเรียน × เครื่องมือ × สไตล์)' };
  const U_ORDER = ['byKey', 'perKey', 'by_key', 'byTool', 'perTool', 'by_tool', 'byStyle', 'perStyle', 'by_style', 'byDay', 'daily', 'by_day', 'recent', 'rows'];
  const U_COLS = { key: 'คีย์', key_id: 'นักเรียน', keyId: 'นักเรียน', name: 'นักเรียน', key_name: 'นักเรียน', tool: 'เครื่องมือ', style_id: 'สไตล์', styleId: 'สไตล์', style: 'สไตล์',
    count: 'ครั้ง', calls: 'ครั้ง', n: 'ครั้ง', uses: 'ครั้ง', total: 'ครั้ง', day: 'วัน', date: 'วัน', at: 'เวลา', last_at: 'ล่าสุด', lastAt: 'ล่าสุด', last: 'ล่าสุด', first_at: 'ครั้งแรก' };
  const U_SCALARS = { total: 'รวม', days: 'ช่วง (วัน)', since: 'ตั้งแต่', keys_active: 'คีย์ที่ใช้งาน', active_keys: 'คีย์ที่ใช้งาน' };
  const isTimeCol = c => /(^at$|_at$|At$|^last$|^since$)/.test(c);
  const keyName = id => { const k = KEYS.find(x => x.id === id || x.key === id); return k ? (k.name || k.key) : null; };
  function cellVal(col, v, row) {
    if ((col === 'name' || col === 'key_name') && row && (row.key_id || row.keyId) && keyName(row.key_id || row.keyId)) return keyName(row.key_id || row.keyId);
    if (v == null || v === '') return (col === 'name' || col === 'key_name') ? 'คีย์ที่ถูกลบแล้ว' : '-';
    if ((col === 'key_id' || col === 'keyId') && keyName(v)) return keyName(v);
    if (col === 'key_id' || col === 'keyId') return row && (row.name || row.key_name) ? (row.name || row.key_name) : String(v).slice(0, 8) + '…';
    if (isTimeCol(col)) return fdate(v, true);
    if (typeof v === 'number') return v.toLocaleString('th-TH');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  async function loadUsage() {
    usageLoaded = true; const days = $('uDays').value; $('uOut').replaceChildren(h('div', { class: 'muted' }, 'กำลังโหลด…'));
    try {
      if (!KEYS.length) { try { KEYS = keyRows(await api('keys')); } catch {} }
      renderUsage(await api('usage?days=' + encodeURIComponent(days)));
    } catch (e) { usageLoaded = false; $('uOut').replaceChildren(h('div', { class: 'err' }, 'โหลดการใช้งานไม่สำเร็จ: ' + e.message)); }
  }
  function renderUsage(d) {
    const out = [], chips = [];
    const table = (title, cols, rows) => out.push(h('div', { style: 'margin-top:16px' }, h('h3', { style: 'font:700 16px Anuphan;margin:0 0 6px' }, title),
      h('div', { class: 'tw' }, h('table', { style: 'min-width:0' }, h('tr', null, cols.map(c => h('th', null, U_COLS[c] || c))), rows.map(r => h('tr', null, cols.map(c => h('td', null, cellVal(c, r[c], r)))))))));
    const countOf = r => +(r.count ?? r.calls ?? r.n ?? r.uses ?? r.total ?? 0) || 0;
    const rank = k => { const i = U_ORDER.indexOf(k); return i < 0 ? 50 : i; };
    const walk = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj || {}).sort((a, b) => rank(a[0]) - rank(b[0]))) {
        const title = U_TITLES[k] || (prefix ? prefix + ' · ' : '') + k;
        if (Array.isArray(v)) {
          const rows = v.filter(r => r && typeof r === 'object' && !Array.isArray(r));
          if (!rows.length) { if (!v.length) out.push(h('div', { class: 'muted', style: 'margin-top:12px' }, title + ': ยังไม่มีข้อมูล')); continue; }
          let cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
          if ((cols.includes('name') || cols.includes('key_name')) && (cols.includes('key_id') || cols.includes('keyId'))) cols = cols.filter(c => c !== 'key_id' && c !== 'keyId');
          cols = cols.filter(c => c !== 'id').slice(0, 7);
          table(title, cols, rows.slice().sort((a, b) => countOf(b) - countOf(a)));
        } else if (v && typeof v === 'object') {
          const ents = Object.entries(v);
          if (ents.length && ents.every(([, x]) => typeof x === 'number')) {
            const lab = k === 'byKey' || k === 'keys' || k === 'perKey' ? (x => keyName(x) || x) : (x => x);
            out.push(h('div', { style: 'margin-top:16px' }, h('h3', { style: 'font:700 16px Anuphan;margin:0 0 6px' }, title),
              h('div', { class: 'tw' }, h('table', { style: 'min-width:0' }, h('tr', null, h('th', null, 'รายการ'), h('th', null, 'ครั้ง')),
                ents.sort((a, b) => b[1] - a[1]).map(([name, n]) => h('tr', null, h('td', null, lab(name)), h('td', null, n.toLocaleString('th-TH'))))))));
          } else walk(v, title);
        } else if (v != null) chips.push(h('span', { class: 'bdg' }, h('b', null, U_SCALARS[k] || k), ' ' + (isTimeCol(k) ? fdate(v, true) : typeof v === 'number' ? v.toLocaleString('th-TH') : String(v))));
      }
    };
    walk(Array.isArray(d) ? { rows: d } : d, '');
    $('uOut').replaceChildren(...(chips.length ? [h('div', null, chips)] : []), ...(out.length ? out : [h('div', { class: 'muted' }, 'ยังไม่มีการใช้งานในช่วงนี้')]));
  }
  $('uDays').onchange = loadUsage; $('uReload').onclick = loadUsage;

  // ---------------------------------------------------------------- guide (live URLs for this deployment)
  function fillGuide() {
    const fn = FN_BASE || 'https://<ref>.supabase.co/functions/v1';
    $('gGallery').textContent = pageUrl('./'); $('gConn').textContent = pageUrl('connect.html'); $('gMcp').textContent = mcpUrl('');
    $('gConnect').setAttribute('href', 'connect.html');
    const c1 = `curl -X POST "${fn}/armory-api/admin/keys" \\\n  -H "x-admin-token: <โทเคนเว็บคอร์ส>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"create","name":"ชื่อนักเรียน / เลขออเดอร์","note":"จากเว็บคอร์ส"}'`;
    $('gCurl1').textContent = c1;
    $('gCurl2').textContent = `curl -X POST "${fn}/armory-api/admin/keys" \\\n  -H "x-admin-token: <โทเคนเว็บคอร์ส>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"update","id":"<id ของคีย์>","active":false}'`;
    $('gCurl3').textContent = `curl "${fn}/armory-api/admin/keys" \\\n  -H "x-admin-token: <โทเคนเว็บคอร์ส>"`;
    $('gCp1').onclick = () => copy(c1, 'คัดลอกคำสั่งแล้ว');
  }

  // ---------------------------------------------------------------- boot
  if (CFG_READY && SUPA_URL && SUPA_KEY && window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'top1-armory-admin' } });
    // never call supabase from inside the callback (supabase-js lock) — defer
    sb.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_IN' && view !== 'app') setTimeout(route, 0);
      if (ev === 'SIGNED_OUT' && !adminToken && view !== 'login') setTimeout(() => show('login'), 0);
    });
  }
  setMode('in');
  route();
})();
