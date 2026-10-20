// app.js — shared by every page: config + API URLs, safe DOM builder, toast/copy, student key (localStorage),
// the "ทำคอนเทนต์แบบนี้" dialog (key check → connector URL → steps for claude.ai / Claude Code → ready message), badges.
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

// ---------- student key (remembered in this browser only)
const LS = {
  get k() { try { return localStorage.getItem('top1_key') || ''; } catch { return ''; } },
  set k(v) { try { v ? localStorage.setItem('top1_key', v) : localStorage.removeItem('top1_key'); } catch {} },
  get linked() { try { return localStorage.getItem('top1_linked') === '1'; } catch { return false; } },
  set linked(v) { try { localStorage.setItem('top1_linked', v ? '1' : '0'); } catch {} },
};
// keys look like T1-XXXX-XXXX-XXXX; tolerate spaces and lower case when pasted
const normKey = s => { s = String(s || '').trim().replace(/\s+/g, ''); return /^t1-/i.test(s) ? s.toUpperCase() : s; };

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

// ---------- the ready-made message a student sends to Claude
const promptFor = s => `ใช้คลังแสง TOP 1 ทำโฆษณาแบบสไตล์ ${s.id} ให้แบรนด์ฉัน\n(สไตล์: ${s.title || s.id})\n` +
  `1) เปิด get_style แล้วศึกษาคลิปตัวอย่างด้วย get_contact_sheet, get_transcript, get_beats, get_audio_map (ดู get_frames ช่วงที่มีลูกเล่นสำคัญ)\n` +
  `2) สรุปสไตล์นี้ให้ฉันฟังสั้นๆ\n3) ถามข้อมูลแบรนด์ของฉันทีละข้อตามคำถามของสไตล์ แล้วทำ make_brief\n4) เสนอนำร่อง 10–15 วิแรกให้ฉันอนุมัติก่อนทำเต็ม`;

// ---------- "ทำคอนเทนต์แบบนี้" dialog
function closeMake() { const m = document.getElementById('mk'); if (m) m.classList.remove('on'); }
addEventListener('keydown', e => { if (e.key === 'Escape') closeMake(); });
function openMake(s) {
  if (!s) return;
  let m = document.getElementById('mk');
  if (!m) { m = h('div', { id: 'mk', class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'ทำคอนเทนต์แบบนี้' }); m.addEventListener('click', e => { if (e.target === m) closeMake(); }); document.body.appendChild(m); }
  const pr = promptFor(s);
  // `key` = the key the server accepted in THIS dialog (empty until verified) — the only key that reaches the link / copy buttons
  let key = '';
  const saved = LS.k;
  const kin = h('input', { type: 'text', id: 'kk', placeholder: 'วางคีย์ที่ได้จากคอร์ส เช่น T1-XXXX-XXXX-XXXX', value: saved, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' });
  const kmsg = h('div', { class: 'muted', id: 'km' }, saved ? 'กำลังตรวจคีย์ที่บันทึกไว้ในเครื่องนี้…' : 'คีย์ได้จากคอร์ส TOP 1 HollyWood — 1 คน 1 คีย์ ห้ามแชร์');
  const cu = h('div', { class: 'code', id: 'cu' }, mcpUrl(''));
  const cc = h('div', { class: 'code', id: 'cc' }, cliCmd(mcpUrl('')));
  const paintUrl = () => { cu.textContent = mcpUrl(key); cc.textContent = cliCmd(mcpUrl(key)); };
  const needKey = () => { if (!key) { toast('ใส่คีย์แล้วกดยืนยันก่อน'); kin.focus(); return true; } return false; };
  const kbtn = h('button', { class: 'btn sm', id: 'kc', type: 'button' }, 'ยืนยัน');
  const verify = async () => {
    const v = normKey(kin.value); kin.value = v;
    key = ''; paintUrl();
    if (!v) { kmsg.replaceChildren(h('span', { class: 'err' }, 'ใส่คีย์ก่อน')); return; }
    kbtn.disabled = true; kmsg.replaceChildren('กำลังตรวจคีย์…');
    const r = await checkKey(v); kbtn.disabled = false;
    if (normKey(kin.value) !== v) return;                          // typed something else meanwhile
    if (r && r.ok) {
      LS.k = v; key = v; paintUrl();
      kmsg.replaceChildren(h('span', { class: 'ok' }, '✓ ใช้ได้' + (r.name ? ' — ' + r.name : '')));
    } else kmsg.replaceChildren(h('span', { class: 'err' }, keyReason(r)));
  };
  kbtn.onclick = verify; kin.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
  kin.addEventListener('input', () => { if (key && normKey(kin.value) !== key) { key = ''; paintUrl(); } });
  const lk = h('input', { type: 'checkbox', id: 'lk', checked: LS.linked }); lk.onchange = () => LS.linked = lk.checked;
  const ol = (...items) => h('ol', { class: 'ol', style: 'font-size:14px;line-height:1.7' }, items.map(x => h('li', null, x)));
  m.replaceChildren(h('div', { class: 'sheet' },
    h('h2', null, 'ทำคอนเทนต์แบบนี้'), h('div', { class: 'muted' }, s.title || s.id),
    h('div', { class: 'step' }, h('h3', null, h('span', { class: 'num' }, '1'), 'คีย์นักเรียน'),
      h('div', { class: 'row' }, kin, kbtn), kmsg),
    h('div', { class: 'step' }, h('h3', null, h('span', { class: 'num' }, '2'), 'เชื่อม Claude กับคลังแสง ', h('span', { class: 'muted' }, '(ทำครั้งเดียว)')),
      h('div', { class: 'muted' }, h('b', null, 'claude.ai / แอป Claude')),
      ol('เปิด Settings (การตั้งค่า) → Connectors → Add custom connector', 'ตั้งชื่อ TOP 1 คลังแสง แล้ววางลิงก์ด้านล่างในช่อง URL → กด Add', 'ในแชทใหม่ กดปุ่มเครื่องมือ แล้วเปิดใช้ TOP 1 คลังแสง'),
      cu,
      h('div', { class: 'muted', style: 'margin-top:10px' }, h('b', null, 'Claude Code'), ' — ทำคลิปจริง: เปิด Terminal ในโฟลเดอร์ชุดเริ่มต้น TOP 1 แล้ววางคำสั่งนี้ครั้งเดียว (พิมพ์ /mcp เพื่อตรวจว่าเชื่อมแล้ว · ห้ามส่งคีย์ให้คนอื่น)'),
      cc,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm ghost', id: 'c1', type: 'button', onclick: () => { if (!needKey()) copy(mcpUrl(key), 'คัดลอกลิงก์แล้ว'); } }, 'คัดลอกลิงก์'),
        h('button', { class: 'btn sm ghost', id: 'c2', type: 'button', onclick: () => { if (!needKey()) copy(cliCmd(mcpUrl(key)), 'คัดลอกคำสั่งแล้ว'); } }, 'คัดลอกคำสั่ง'),
        h('label', { style: 'margin:6px 0 0;display:flex;gap:6px;align-items:center;font-weight:500' }, lk, ' เชื่อมแล้ว'))),
    h('div', { class: 'step' }, h('h3', null, h('span', { class: 'num' }, '3'), 'เริ่มทำ — ส่งข้อความนี้ให้ Claude'),
      h('div', { class: 'code' }, pr),
      h('div', { class: 'row' },
        h('button', { class: 'btn', id: 'go', type: 'button', onclick: () => { copy(pr); window.open('https://claude.ai/new?q=' + encodeURIComponent(pr), '_blank', 'noopener'); } }, 'เปิด Claude พร้อมข้อความ'),
        h('button', { class: 'btn ghost', id: 'c3', type: 'button', onclick: () => copy(pr, 'คัดลอกข้อความแล้ว') }, 'คัดลอกข้อความ')),
      h('div', { class: 'muted', style: 'margin-top:8px' }, 'Claude จะดูคลิปตัวอย่างทีละเฟรม ถอดเสียง จับจังหวะ แล้วถามข้อมูลแบรนด์ของคุณก่อนเริ่ม · การประกอบเป็นวิดีโอจริงทำใน Claude บนคอม + ชุดเริ่มต้น TOP 1')),
    h('div', { class: 'row', style: 'justify-content:space-between;margin-top:14px' },
      h('a', { class: 'linkbtn', href: 'connect.html' }, 'วิธีเชื่อมแบบละเอียด →'),
      h('button', { class: 'btn ghost sm', id: 'cl', type: 'button', onclick: closeMake }, 'ปิด'))));
  m.classList.add('on');
  if (saved) verify();                                            // re-check the remembered key (it may be revoked / expired now)
  else setTimeout(() => kin.focus(), 60);
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
