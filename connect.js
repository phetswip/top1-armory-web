// connect.js — student connect page: key check (POST armory-api/public/key-check), connector URL + Claude Code command, copy buttons
(function () {
  const $ = id => document.getElementById(id);
  const kin = $('key'), msg = $('msg'), btn = $('test');
  // owner can hand out connect.html#key=T1-... ; the hash never reaches a server, and we drop it from the address bar right away
  const hk = new URLSearchParams(location.hash.slice(1)).get('key');
  if (hk) { kin.value = normKey(hk); try { history.replaceState(null, '', location.pathname + location.search); } catch {} }
  else kin.value = LS.k;
  let ok = false;                                // true only after the server accepted LS.k on this page load

  if (!CFG_READY) $('cfg').replaceChildren(h('div', { class: 'banner' }, 'เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js) — ทดสอบคีย์ไม่ได้ชั่วคราว'));

  const paint = () => {
    const k = ok ? LS.k : '';
    $('url').textContent = mcpUrl(k);
    $('cmd').textContent = cliCmd(mcpUrl(k));
  };
  const need = () => { if (!ok || !LS.k) { toast('ใส่คีย์แล้วกดทดสอบการเชื่อมก่อน'); kin.focus(); return true; } return false; };

  async function test() {
    const v = normKey(kin.value); kin.value = v;
    if (!v) { msg.replaceChildren(h('span', { class: 'err' }, 'ใส่คีย์ก่อน')); kin.focus(); return; }
    btn.disabled = true; msg.replaceChildren('กำลังตรวจคีย์กับเซิร์ฟเวอร์…');
    const r = await checkKey(v); btn.disabled = false;
    if (normKey(kin.value) !== v) return;          // typed something else meanwhile
    if (r && r.ok) {
      LS.k = v; ok = true; paint();
      msg.replaceChildren(h('span', { class: 'ok' }, '✓ เชื่อมต่อได้' + (r.name ? ' — สวัสดีคุณ ' + r.name : '')), ' · บันทึกคีย์ไว้ในเครื่องนี้แล้ว ทำขั้นตอนที่ 2 ต่อได้เลย');
    } else { ok = false; paint(); msg.replaceChildren(h('span', { class: 'err' }, keyReason(r))); }
  }
  btn.onclick = test;
  kin.addEventListener('keydown', e => { if (e.key === 'Enter') test(); });
  kin.addEventListener('input', () => { if (normKey(kin.value) !== LS.k) { ok = false; paint(); } });
  $('forget').onclick = () => { LS.k = ''; LS.linked = false; ok = false; kin.value = ''; paint(); msg.replaceChildren('ลบคีย์ออกจากเครื่องนี้แล้ว'); };
  $('cpUrl').onclick = () => { if (!need()) copy(mcpUrl(LS.k), 'คัดลอกลิงก์แล้ว'); };
  $('cpCmd').onclick = () => { if (!need()) copy(cliCmd(mcpUrl(LS.k)), 'คัดลอกคำสั่งแล้ว'); };
  $('cpTry').onclick = () => copy($('tryMsg').textContent, 'คัดลอกข้อความแล้ว');
  paint();
  if (hk) test();                                // link from the owner → check right away
  else if (kin.value) test();                    // remembered key → re-check it (may be revoked / expired since)
})();
