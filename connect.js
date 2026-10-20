// connect.js — connect.html "เชื่อมแอป Claude": the one-time setup page (same steps as course.html#connect).
//   logged-in student → key from the account (T1Auth.me(), never typed) · otherwise log in / register, or the key-only path
//   (key checked by armory-api public/key-check, then remembered in this browser) → kit folder → "เชื่อมคลังแสงกับแอป Claude"
//   (claude://code/new?folder=…&q=/top1-connect <KEY>) → go make content. "วิธีอื่น": Claude Code CLI + claude.ai connector URL.
// Uses app.js (h, LS, checkKey, keyReason, accountState, keyGate, keyLine, kitSetupStep, cliAlt, phoneNote, maskKey, mcpUrl, copy)
// plus account.js (T1Auth) and desktop.js (T1Desktop).
(function () {
  const $ = id => document.getElementById(id);
  const APP = $('app');
  if (!APP) return;
  if (window.T1Auth) T1Auth.mountNav();
  if (!CFG_READY) $('cfg').replaceChildren(h('div', { class: 'banner' }, 'เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js) — ตอนนี้ตรวจคีย์ไม่ได้ชั่วคราว'));
  const pageUrl = location.href.split('#')[0];
  let run = 0;

  // the owner can hand out connect.html#key=T1-… ; the hash never reaches a server and leaves the address bar right away
  const hashKey = normKey(new URLSearchParams(location.hash.slice(1)).get('key') || '');
  if (hashKey) { try { history.replaceState(null, '', location.pathname + location.search); } catch {} }

  // ---------------------------------------------------------------- a key the server accepted → setup steps
  function paint(ctx) {
    const D = window.T1Desktop;
    const kmsg = h('div', { class: 'msg', id: 'keyMsg', 'aria-live': 'polite' });
    const test = h('button', { class: 'btn sm ghost', type: 'button', id: 'keyTest' }, 'ทดสอบคีย์');
    test.addEventListener('click', async () => {
      test.disabled = true; kmsg.replaceChildren('กำลังตรวจคีย์กับเซิร์ฟเวอร์…');
      const r = await checkKey(ctx.key); test.disabled = false;
      kmsg.replaceChildren(r && r.ok ? h('span', { class: 'ok' }, '✓ คีย์ใช้งานได้' + (r.name ? ' — ' + r.name : '')) : h('span', { class: 'err' }, keyReason(r)));
    });
    const keyPanel = h('div', { class: 'panel', id: 'keyPanel' }, h('h2', null, 'คีย์ของคุณ'),
      keyLine('cn', ctx, () => { LS.k = ''; start(); }),
      h('div', { class: 'row' }, test), kmsg);
    if (!D) { APP.replaceChildren(keyPanel, h('div', { class: 'panel' }, h('div', { class: 'err' }, 'โหลดส่วนเปิดแอปไม่สำเร็จ — รีเฟรชหน้านี้อีกครั้ง'))); return; }
    if (D.isMobile()) { APP.replaceChildren(keyPanel, h('div', { class: 'panel' }, phoneNote('cn', pageUrl))); return; }

    const linked = D.folder && D.validFolder(D.folder) && LS.kitLinked === D.folder;
    const steps = h('div', { class: 'panel link-card', id: 'connect' },
      h('h2', null, 'ตั้งค่าแอป Claude'),
      linked ? h('div', { class: 'ok', id: 'cnLinked', style: 'margin-top:4px' }, '✓ เครื่องนี้เคยกดเชื่อมแล้ว — กดเชื่อมซ้ำได้ถ้าย้ายโฟลเดอร์หรือเปลี่ยนคีย์') : null,
      kitSetupStep('cn', ctx.key, { always: true, num: '1' }),
      h('div', { class: 'step' },
        h('h3', null, h('span', { class: 'num' }, '2'), 'เริ่มทำคอนเทนต์'),
        h('div', { class: 'muted' }, 'ปิดแชทที่เชื่อมเสร็จ แล้วเลือกสไตล์ในคลัง → กด "ทำคอนเทนต์แบบนี้" → "เปิดในแอป Claude" → กด Enter'),
        h('div', { class: 'row' }, h('a', { class: 'btn sm', href: './#armory', id: 'cnGallery' }, 'ไปเลือกสไตล์ในคลัง', h('span', { class: 'ar' }, '→')))));

    // other ways (advanced): Claude Code in a Terminal · claude.ai / app Connectors (looks at styles only; real clips need the kit)
    const webUrl = h('div', { class: 'code', id: 'url' }, mcpUrl('').replace(KEY_PH, maskKey(ctx.key)));
    const other = h('div', { class: 'panel', id: 'other' }, h('h2', null, 'วิธีอื่น ', h('span', { class: 'mini' }, '(สำหรับคนคุ้นเคย)')),
      cliAlt('cn', ctx.key, ''),
      h('details', { class: 'help alt', id: 'cnWeb' },
        h('summary', null, 'claude.ai บนเว็บ (Connector) — ดูสไตล์ได้ แต่ทำคลิปจริงต้องใช้แอป + ชุดเริ่มต้น'),
        h('ol', { class: 'ol', style: 'font-size:14px' },
          h('li', null, 'claude.ai → Settings → Connectors → Add custom connector'),
          h('li', null, 'ตั้งชื่อ TOP 1 คลังแสง แล้ววางลิงก์ด้านล่างในช่อง URL → Add'),
          h('li', null, 'ในแชท กดปุ่มเครื่องมือ แล้วเปิดใช้ TOP 1 คลังแสง')),
        webUrl,
        h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', id: 'cpUrl', onclick: () => copy(mcpUrl(ctx.key), 'คัดลอกลิงก์แล้ว') }, 'คัดลอกลิงก์')),
        h('div', { class: 'mini' }, 'ลิงก์นี้มีคีย์ของคุณอยู่ข้างใน ห้ามส่งต่อ')));
    APP.replaceChildren(keyPanel, steps, other);
  }

  // ---------------------------------------------------------------- no usable key yet
  let hashErr = '';
  function gate(acc) {
    APP.replaceChildren(h('div', { class: 'panel', id: 'gate' }, h('h2', null, 'ใช้คีย์ของคุณ'),
      ...keyGate(acc, { p: 'cn', next: 'connect.html', onKey: (key, name) => paint({ key, via: 'key', name }), retry: start })));
    if (hashErr) {                                          // the key from the owner's link did not pass → show it with the reason
      $('cnKeyOnly').open = true; $('cnKey').value = hashKey;
      $('cnKeyMsg').replaceChildren(h('span', { class: 'err' }, hashErr));
      hashErr = '';
    }
  }

  async function start() {
    const me = ++run;
    if (hashKey && !start.usedHash) {                      // link from the owner → check that key first
      start.usedHash = true;
      const r = await checkKey(hashKey);
      if (me !== run) return;
      if (r && r.ok) { LS.k = hashKey; paint({ key: hashKey, via: 'key', name: r.name || '' }); return; }
      hashErr = keyReason(r);
    }
    const acc = await accountState();
    if (me !== run) return;
    if (acc.state === 'student') { paint({ key: acc.key, via: 'account', name: acc.name }); return; }
    const saved = LS.k;                                     // key-only student from an earlier visit → re-check it
    if (saved) {
      const r = await checkKey(saved);
      if (me !== run) return;
      if (r && r.ok) { paint({ key: normKey(saved), via: 'key', name: r.name || '' }); return; }
    }
    gate(acc);
  }
  start();
})();
