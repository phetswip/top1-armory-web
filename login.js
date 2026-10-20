// login.js — login.html: tabs เข้าสู่ระบบ / ลงทะเบียน (ใช้คีย์คอร์ส) / ลืมรหัสผ่าน · ?reset=1 → set a new password · ?next= (same-site relative only)
// Register = POST course-api/public/register (server creates the account) → signInWithPassword. Logged-in visitors go straight to ?next (default course.html).
(function () {
  'use strict';
  const A = window.T1Auth, U = window.T1UI;
  if (!A || !U) return;
  const $ = id => document.getElementById(id);
  const h = U.h;
  const params = new URLSearchParams(location.search);
  const NEXT = A.safeNext(params.get('next'));
  const RESET = params.get('reset') === '1';

  const say = (id, text, kind, ...extra) => { $(id).replaceChildren(kind ? h('span', { class: kind }, text) : text, ...extra); };
  const busy = (btn, on, label) => { btn.disabled = !!on; if (label) btn.textContent = label; };
  // contact button (config.js contactUrl) after a "ติดต่อทีมงาน" message — nothing when the owner has not set one
  const contact = () => { const a = U.contactLink && U.contactLink(); return a ? [' ', a] : []; };
  const banner = (text, kind) => $('banner').replaceChildren(text ? h('div', { class: 'banner' + (kind === 'err' ? ' err' : '') }, text) : '');

  // ---------------------------------------------------------------- tabs
  const TITLES = { in: ['เข้าสู่', 'คอร์สเรียน'], up: ['ลงทะเบียน', 'นักเรียน'], forgot: ['ลืม', 'รหัสผ่าน'], reset: ['ตั้ง', 'รหัสผ่านใหม่'] };
  const EMAIL_IDS = ['inEmail', 'upEmail', 'fgEmail'];
  let current = '';
  function tab(name) {
    if (!TITLES[name]) name = 'in';
    // carry a typed e-mail over to the other forms
    const typed = EMAIL_IDS.map(id => $(id).value.trim()).find(Boolean) || '';
    if (typed) EMAIL_IDS.forEach(id => { if (!$(id).value.trim()) $(id).value = typed; });
    current = name;
    document.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.getAttribute('data-pane') !== name; });
    document.querySelectorAll('#tabs .chip').forEach(c => { const on = c.getAttribute('data-tab') === name; c.classList.toggle('on', on); c.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('tabs').hidden = name === 'reset';
    $('ttl').replaceChildren(TITLES[name][0], h('b', { class: 'gb' }, TITLES[name][1]));
  }
  document.querySelectorAll('#tabs .chip').forEach(c => c.addEventListener('click', () => tab(c.getAttribute('data-tab'))));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => tab(b.getAttribute('data-goto'))));
  // "แสดงรหัสผ่าน" checkboxes
  document.querySelectorAll('[data-show]').forEach(cb => cb.addEventListener('change', () => {
    cb.getAttribute('data-show').split(',').forEach(id => { const i = $(id.trim()); if (i) i.type = cb.checked ? 'text' : 'password'; });
  }));

  // ---------------------------------------------------------------- password strength + "ยืนยันรหัสผ่าน" match (register + reset forms)
  // score 0 = too short · 1 อ่อน · 2 พอใช้ · 3 ดี · 4 แข็งแรงมาก. Guessable ones (12345678, password, aaaaaaaa, qwertyui…) are capped at 1 and refused on submit.
  const COMMON = /^(?:12345678\d*|123456789?0?|87654321|11111111|00000000|password\d*|passw0rd|qwerty\w*|asdfghjk\w*|abcd1234|abc12345|iloveyou|11223344|12341234|admin\d*|top1\w*)$/i;
  function pwStrength(pw) {
    const checks = [
      { ok: pw.length >= 8, text: 'อย่างน้อย 8 ตัว' },
      { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), text: 'ตัวพิมพ์เล็กและใหญ่' },
      { ok: /\d/.test(pw), text: 'ตัวเลข' },
      { ok: /[^A-Za-z0-9]/.test(pw), text: 'สัญลักษณ์ เช่น ! @ #' },
    ];
    const weak = COMMON.test(pw) || /^(.)\1+$/.test(pw) || new Set(pw).size <= 3;
    let score = 0;
    if (pw.length >= 8) {
      score = 1 + checks.slice(1).filter(c => c.ok).length + (pw.length >= 12 ? 1 : 0);
      score = weak ? 1 : Math.min(4, score);
    }
    return { score, weak: pw.length >= 8 && weak, checks };
  }
  const LEVELS = [['สั้นเกินไป', 's0'], ['อ่อน', 's1'], ['พอใช้', 's2'], ['ดี', 's3'], ['แข็งแรงมาก', 's4']];
  function renderMeter(box) {
    const pw = $(box.getAttribute('data-meter-for')).value;
    if (!pw) { box.replaceChildren(); box.className = 'pw-meter'; return; }
    const r = pwStrength(pw), [label, cls] = LEVELS[r.score];
    box.className = 'pw-meter ' + cls;
    box.replaceChildren(
      h('div', { class: 'pw-bar', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(i => h('i', { class: i <= r.score ? 'on' : '' }))),
      h('div', { class: 'pw-head' }, 'ความแข็งแรง: ', h('b', null, r.weak ? 'เดาง่ายเกินไป' : label)),
      h('ul', { class: 'pw-tips' }, r.checks.map(c => h('li', { class: c.ok ? 'ok' : '' }, c.text))));
  }
  function renderMatch(box) {
    const [a, b] = box.getAttribute('data-match-for').split(',').map(id => $(id.trim()).value);
    if (!b) { box.replaceChildren(); box.className = 'pw-match'; return; }
    const same = a === b;
    box.className = 'pw-match ' + (same ? 'ok' : 'bad');
    box.textContent = same ? 'รหัสผ่านตรงกัน' : 'รหัสผ่านยังไม่ตรงกัน';
  }
  document.querySelectorAll('[data-meter-for]').forEach(box => $(box.getAttribute('data-meter-for')).addEventListener('input', () => renderMeter(box)));
  document.querySelectorAll('[data-match-for]').forEach(box => box.getAttribute('data-match-for').split(',').forEach(id => $(id.trim()).addEventListener('input', () => renderMatch(box))));
  // shared submit check for new passwords → error text or ''
  function newPasswordProblem(pw, pw2) {
    if (pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว';
    if (pwStrength(pw).weak) return 'รหัสผ่านนี้เดาง่ายเกินไป — ลองผสมตัวอักษร ตัวเลข และสัญลักษณ์';
    if (pw !== pw2) return 'รหัสผ่านสองช่องไม่ตรงกัน';
    return '';
  }

  // the owner can hand out login.html?tab=register#key=T1-…  (the hash never reaches a server; dropped from the address bar right away)
  const hashKey = new URLSearchParams(String(A.initialHash || '').replace(/^#/, '')).get('key');
  if (hashKey && !RESET) {
    $('upKey').value = U.normKey(hashKey);
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  }
  const want = String(params.get('tab') || '').toLowerCase();
  tab(RESET ? 'reset' : (hashKey || /^(up|register|signup)$/.test(want)) ? 'up' : want === 'forgot' ? 'forgot' : 'in');

  const problem = A.problem();
  if (problem) banner(A.reasonText(problem), 'err');
  A.mountNav();

  // ---------------------------------------------------------------- sign in
  $('fIn').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('inEmail').value.trim(), pw = $('inPw').value, btn = $('inGo');
    if (!U.isEmail(email)) { say('inMsg', 'ใส่อีเมลให้ถูกต้อง', 'err'); $('inEmail').focus(); return; }
    if (!pw) { say('inMsg', 'ใส่รหัสผ่านก่อน', 'err'); $('inPw').focus(); return; }
    if (A.problem()) { say('inMsg', A.reasonText(A.problem()), 'err'); return; }
    busy(btn, true); say('inMsg', 'กำลังเข้าสู่ระบบ…');
    let res; try { res = await A.sb.auth.signInWithPassword({ email, password: pw }); } catch (err) { res = { error: err }; }
    busy(btn, false);
    if (!res || res.error) { say('inMsg', A.authErrorText(res && res.error || 'error'), 'err'); return; }
    say('inMsg', 'เข้าสู่ระบบแล้ว กำลังพาไปหน้าคอร์ส…', 'ok');
    A.go(NEXT);
  });

  // ---------------------------------------------------------------- register with a course key
  $('fUp').addEventListener('submit', async e => {
    e.preventDefault();
    const key = U.normKey($('upKey').value); $('upKey').value = key;
    const name = $('upName').value.trim().replace(/\s+/g, ' '), email = $('upEmail').value.trim(), pw = $('upPw').value, btn = $('upGo');
    if (!key) { say('upMsg', 'ใส่คีย์คอร์สก่อน', 'err'); $('upKey').focus(); return; }
    if (!name) { say('upMsg', 'ใส่ชื่อที่ให้เรียกก่อน', 'err'); $('upName').focus(); return; }
    if (!U.isEmail(email)) { say('upMsg', 'ใส่อีเมลให้ถูกต้อง', 'err'); $('upEmail').focus(); return; }
    const pwProblem = newPasswordProblem(pw, $('upPw2').value);
    if (pwProblem) { say('upMsg', pwProblem, 'err'); $(pw.length >= 8 && !pwStrength(pw).weak ? 'upPw2' : 'upPw').focus(); return; }
    if (A.problem()) { say('upMsg', A.reasonText(A.problem()), 'err'); return; }
    busy(btn, true); say('upMsg', 'กำลังตรวจคีย์และสร้างบัญชี…');
    try {
      await A.api('public/register', { body: { email, password: pw, name, key }, auth: false });
    } catch (err) {
      busy(btn, false);
      if (err.reason === 'email-exists') {
        say('upMsg', err.message, 'err', ' ', h('button', { class: 'linkbtn', type: 'button', onclick: () => { $('inEmail').value = email; tab('in'); $('inPw').focus(); } }, 'ไปหน้าเข้าสู่ระบบ'));
      } else say('upMsg', err.message, 'err', ...(/^(key-inactive|key-expired|key-used|inactive|expired)$/.test(err.reason || '') ? contact() : []));
      if (/^key-|^invalid$|^missing$/.test(err.reason || '')) $('upKey').focus();
      return;
    }
    say('upMsg', 'ลงทะเบียนสำเร็จ กำลังเข้าสู่ระบบ…', 'ok');
    let res; try { res = await A.sb.auth.signInWithPassword({ email, password: pw }); } catch (err) { res = { error: err }; }
    busy(btn, false);
    if (!res || res.error) {
      $('inEmail').value = email; tab('in');
      say('inMsg', 'ลงทะเบียนสำเร็จแล้ว — เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่เพิ่งตั้ง', 'ok');
      return;
    }
    A.go(NEXT);
  });

  // ---------------------------------------------------------------- forgot password → e-mail link back to login.html?reset=1
  $('fForgot').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('fgEmail').value.trim(), btn = $('fgGo');
    if (!U.isEmail(email)) { say('fgMsg', 'ใส่อีเมลให้ถูกต้อง', 'err'); $('fgEmail').focus(); return; }
    if (A.problem()) { say('fgMsg', A.reasonText(A.problem()), 'err'); return; }
    busy(btn, true); say('fgMsg', 'กำลังส่งลิงก์…');
    const redirectTo = new URL('login.html?reset=1', location.href).href;
    let res; try { res = await A.sb.auth.resetPasswordForEmail(email, { redirectTo }); } catch (err) { res = { error: err }; }
    busy(btn, false);
    if (!res || res.error) { const t = A.authErrorText(res && res.error || 'error'); say('fgMsg', t, 'err', ...(/ติดต่อทีมงาน/.test(t) ? contact() : [])); return; }
    say('fgMsg', 'ถ้าอีเมลนี้มีบัญชี เราส่งลิงก์ไปแล้ว — เปิดอีเมลแล้วกดลิงก์ในเบราว์เซอร์นี้ (เช็กในจดหมายขยะด้วย)', 'ok');
  });

  // ---------------------------------------------------------------- set a new password (PASSWORD_RECOVERY session from the e-mail link)
  if (RESET) {
    // expired / used link: the error comes back in the hash (implicit) and/or the query (PKCE)
    const hp = new URLSearchParams(String(A.initialHash || '').replace(/^#/, ''));
    const linkErr = hp.get('error_description') || hp.get('error_code') || hp.get('error') || params.get('error_description') || params.get('error_code') || params.get('error');
    let ready = false;
    const markReady = () => { if (ready) return; ready = true; say('rsState', 'ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ แล้วกดบันทึก'); };
    if (linkErr) say('rsState', 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว — กด "ขอลิงก์ใหม่" ด้านล่าง', 'err');
    else if (A.sb) {
      try { A.sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') markReady(); }); } catch {}
      A.session().then(s => { if (s) markReady(); });
      setTimeout(() => { if (!ready) say('rsState', 'ยังไม่พบลิงก์ตั้งรหัสที่ใช้ได้ — ลิงก์ใช้ได้ในเบราว์เซอร์ที่กดขอเท่านั้น: เปิดลิงก์จากอีเมลในเบราว์เซอร์นี้อีกครั้ง หรือกด "ขอลิงก์ใหม่"', 'err'); }, 6000);
    }
    $('fReset').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = $('rsPw').value, pw2 = $('rsPw2').value, btn = $('rsGo');
      const pwProblem = newPasswordProblem(pw, pw2);
      if (pwProblem) { say('rsMsg', pwProblem, 'err'); $(pw.length >= 8 && !pwStrength(pw).weak ? 'rsPw2' : 'rsPw').focus(); return; }
      if (A.problem()) { say('rsMsg', A.reasonText(A.problem()), 'err'); return; }
      busy(btn, true); say('rsMsg', 'กำลังบันทึก…');
      let res; try { res = await A.sb.auth.updateUser({ password: pw }); } catch (err) { res = { error: err }; }
      busy(btn, false);
      if (!res || res.error) { say('rsMsg', A.authErrorText(res && res.error || 'error'), 'err'); return; }
      say('rsMsg', 'ตั้งรหัสผ่านใหม่เรียบร้อย กำลังพาไปหน้าคอร์ส…', 'ok');
      setTimeout(() => A.go(NEXT), 1200);
    });
  } else {
    // already logged in → straight to the course (or ?next)
    A.session().then(s => { if (s && current !== 'reset') A.go(NEXT); });
  }
})();
