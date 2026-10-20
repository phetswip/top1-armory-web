// course.js — course.html (คอร์สของฉัน): greeting, progress + "เรียนต่อ", modules → lessons, course files,
// and the card "เชื่อมคลังแสงกับแอป Claude" (kit folder path → claude://code/new?…&q=/top1-connect <KEY>).
// Not logged in → login.html?next=course.html · logged in without a student row → link-key form.
(function () {
  'use strict';
  const A = window.T1Auth, U = window.T1UI, D = window.T1Desktop;
  const APP = document.getElementById('app');
  if (!A || !U || !APP) return;
  const h = U.h;
  const lessonHref = id => 'lesson.html?id=' + encodeURIComponent(id);
  // local preview only (tools/mock-server.mjs on 127.0.0.1 over plain http): same-origin http links count as safe too — never true on the real https site
  const LOCAL = location.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  const localUrl = u => LOCAL && String(u || '').startsWith(location.origin + '/') && !/[\s"'<>]/.test(String(u));
  const isHttps = u => /^https:\/\/\S+$/i.test(String(u || '')) || localUrl(u);
  // contact button (config.js contactUrl) after a "ติดต่อทีมงาน" message — null when the owner has not set one
  const contact = cls => (U.contactLink ? U.contactLink(cls) : null);
  let running = 0;

  A.mountNav();
  init();
  // coming back with the browser's back button (bfcache) → refresh ticks/progress
  window.addEventListener('pageshow', e => { if (e.persisted) init(); });

  // ---------------------------------------------------------------- states
  function loading() {
    APP.replaceChildren(h('div', { class: 'panel loading' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'muted' }, 'กำลังโหลดคอร์สของคุณ…')));
  }
  function hero(title, sub) {
    return h('div', { class: 'hero-s' }, h('span', { class: 'pill glass' }, h('i'), 'MY COURSE'), h('h1', null, ...title), sub ? h('p', { class: 'muted' }, sub) : null);
  }
  function showError(e) {
    const r = e && e.reason;
    if (r === 'not-student') return showLinkKey(e && e.data);
    const blocked = r === 'inactive' || r === 'key-inactive' || r === 'key-expired';
    APP.replaceChildren(
      hero(['คอร์ส', h('b', { class: 'gb' }, 'ของฉัน')]),
      h('div', { class: 'panel state', id: 'state' },
        h('h2', null, blocked ? 'ยังเข้าเรียนไม่ได้' : 'โหลดคอร์สไม่สำเร็จ'),
        h('div', { class: blocked ? 'muted' : 'err' }, (e && e.message) || A.reasonText('error')),
        h('div', { class: 'row', style: 'margin-top:12px' },
          blocked ? [contact('btn sm'), h('a', { class: 'btn sm ghost', href: './#armory' }, 'ไปที่คลังสไตล์')] : h('button', { class: 'btn sm', type: 'button', id: 'retry', onclick: init }, 'ลองใหม่'))),
      (r === 'key-inactive' || r === 'key-expired') ? linkKeyForm('ได้คีย์ใหม่จากทีมงานแล้ว?', 'วางคีย์ใหม่ที่นี่ แล้วกดผูกคีย์') : null);
  }
  function linkKeyForm(title, text) {
    const inp = h('input', { type: 'text', id: 'lkKey', placeholder: 'T1-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', style: 'flex:1;min-width:200px' });
    const btn = h('button', { class: 'btn', type: 'submit', id: 'lkGo' }, 'ผูกคีย์');
    const msg = h('div', { class: 'msg', id: 'lkMsg', 'aria-live': 'polite' });
    const form = h('form', { class: 'panel', id: 'linkKey', novalidate: true },
      h('h2', null, title), h('div', { class: 'muted' }, text),
      h('label', { for: 'lkKey' }, 'คีย์คอร์ส'), h('div', { class: 'row', style: 'margin-top:0' }, inp, btn), msg);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const key = U.normKey(inp.value); inp.value = key;
      if (!key) { msg.replaceChildren(h('span', { class: 'err' }, 'ใส่คีย์คอร์สก่อน')); inp.focus(); return; }
      btn.disabled = true; msg.replaceChildren('กำลังผูกคีย์…');
      try {
        await A.api('student/link-key', { body: { key } });
        U.toast('ผูกคีย์เรียบร้อย เริ่มเรียนได้เลย');
        await A.me(true).catch(() => null);
        init();
      } catch (err) {
        btn.disabled = false;
        const c = /^(key-inactive|key-expired|key-used|inactive)$/.test(err.reason || '') ? contact() : null;
        msg.replaceChildren(h('span', { class: 'err' }, err.message), c ? ' ' : null, c);
      }
    });
    return form;
  }
  async function showLinkKey(me) {
    const s = await A.session();
    const email = (s && s.user && s.user.email) || '';
    const admin = !!(me && me.admin);
    APP.replaceChildren(
      hero(['คอร์ส', h('b', { class: 'gb' }, 'ของฉัน')], 'อีกขั้นเดียวก็เริ่มเรียนได้'),
      admin ? h('div', { class: 'panel', id: 'ownerNote' }, h('h2', null, 'บัญชีเจ้าของคอร์ส'),
        h('div', { class: 'muted' }, 'จัดการนักเรียน บทเรียน และไฟล์ได้ที่หลังบ้าน · อยากดูหน้าบทเรียนแบบนักเรียน ให้ผูกคีย์ทดสอบ 1 คีย์ด้านล่าง'),
        h('div', { class: 'row' }, h('a', { class: 'btn sm', href: 'admin.html', id: 'toAdmin' }, 'ไปหลังบ้าน'))) : null,
      linkKeyForm('ผูกคีย์คอร์สกับบัญชีนี้', `บัญชี ${email || 'นี้'} ยังไม่ได้ผูกคีย์คอร์ส — วางคีย์ที่ได้จากทีมงาน (ทำครั้งเดียว · 1 คีย์ ใช้ได้ 1 บัญชี)`),
      h('div', { class: 'panel' }, h('h2', null, 'ยังไม่มีคีย์?'),
        h('div', { class: 'muted' }, 'ติดต่อทีมงาน TOP 1 HollyWood เพื่อรับคีย์คอร์ส แล้วกลับมาที่หน้านี้'),
        h('div', { class: 'row' }, contact('btn sm'), h('a', { class: 'btn sm ghost', href: './#armory' }, 'ดูคลังสไตล์ไปก่อน'))));
  }

  // ---------------------------------------------------------------- load
  async function init() {
    const run = ++running;
    loading();
    let me;
    try { me = await A.requireStudent('course.html' + (/^#[\w-]{1,40}$/.test(location.hash) ? location.hash : '')); }
    catch (e) { if (run === running) showError(e); return; }
    if (run !== running || !me) return;                      // !me → on the way to login.html
    if (me.needsKey || !me.student) { showLinkKey(me); return; }
    const [c, f] = await Promise.allSettled([A.api('student/course'), A.api('student/files')]);
    if (run !== running) return;
    if (c.status === 'rejected') { showError(c.reason); return; }
    const s = await A.session();
    render(me, c.value || {}, f, s && s.user);
    // deep link such as course.html#connect (content is drawn after load, so jump to it ourselves)
    if (/^#[\w-]{1,40}$/.test(location.hash)) { const t = document.getElementById(location.hash.slice(1)); if (t && t.scrollIntoView) try { t.scrollIntoView({ block: 'start' }); } catch {} }
  }

  // ---------------------------------------------------------------- page
  function modulesOf(course) {
    const list = Array.isArray(course.modules) ? course.modules : Array.isArray(course) ? course : [];
    return list.filter(m => m && m.id).map(m => ({ ...m, lessons: (Array.isArray(m.lessons) ? m.lessons : []).filter(l => l && l.id) }));
  }
  const lessonNo = (l, i) => { const m = /-L(\d+)$/i.exec(l.id); return m ? String(+m[1]) : String(i + 1); };

  function render(me, course, filesRes, user) {
    const modules = modulesOf(course);
    const all = modules.flatMap(m => m.lessons);
    const total = all.length || (me.progress && +me.progress.total) || 0;
    const done = all.length ? all.filter(l => l.done).length : (me.progress && +me.progress.done) || 0;
    const pct = total ? Math.round(done * 100 / total) : 0;
    let nextId = typeof course.next_lesson_id === 'string' ? course.next_lesson_id : '';
    if (!all.some(l => l.id === nextId)) nextId = (all.find(l => !l.done) || {}).id || '';
    const nextL = all.find(l => l.id === nextId);
    const name = (me.student && String(me.student.name || '').trim()) || A.displayName(user);

    const top = h('section', { class: 'panel c-hero' },
      h('div', { class: 'c-hi' },
        h('span', { class: 'pill glass' }, h('i'), 'MY COURSE'),
        h('h1', { class: 'c-title' }, 'สวัสดี คุณ', h('b', { class: 'gb' }, name)),
        h('p', { class: 'muted' }, 'คอร์ส TOP 1 HollyWood — ดูทีละบท ทำตาม แล้วกด "เรียนจบบทนี้"')),
      h('div', { class: 'c-prog' },
        h('div', { class: 'c-prog-top' }, h('b', { id: 'progText' }, `เรียนแล้ว ${done} จาก ${total} บท`), h('span', { class: 'muted' }, pct + '%')),
        h('div', { class: 'prog', role: 'progressbar', 'aria-label': 'ความคืบหน้า', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) }, h('i', { style: `width:${pct}%` })),
        nextL
          ? h('div', { class: 'c-next' },
            h('a', { class: 'btn lg', href: lessonHref(nextL.id), id: 'continue' }, done ? 'เรียนต่อ' : 'เริ่มเรียนบทแรก', h('span', { class: 'ar' }, '→')),
            h('div', { class: 'c-next-t' }, h('small', null, 'บทถัดไป'), h('span', null, `${nextL.id} · ${nextL.title || ''}`)))
          : total
            ? h('div', { class: 'c-next' }, h('div', { class: 'ok' }, 'เรียนครบทุกบทแล้ว เก่งมาก!'), h('a', { class: 'btn sm ghost', href: lessonHref(all[0].id) }, 'ทบทวนตั้งแต่บทแรก'))
            : h('div', { class: 'muted' }, 'ยังไม่มีบทเรียน — ทีมงานกำลังเพิ่มให้เร็วๆ นี้')));

    const mods = h('section', { class: 'panel', id: 'modules' },
      h('h2', null, 'บทเรียนทั้งหมด'),
      h('div', { class: 'muted' }, modules.length ? `${modules.length} หมวด · ${total} บท · กดที่หมวดเพื่อเปิด/ปิด` : ''),
      modules.length ? h('div', { class: 'mods' }, modules.map((m, i) => moduleEl(m, i, nextId))) : h('div', { class: 'empty' }, 'ยังไม่มีบทเรียน — ทีมงานกำลังเพิ่มให้'));

    APP.replaceChildren(top,
      h('div', { class: 'c-grid' },
        h('div', { class: 'c-main' }, mods),
        h('aside', { class: 'c-side' },
          filesPanel(filesRes),                                // download the starter kit first, then connect it
          connectCard(me),
          h('section', { class: 'panel' }, h('h2', null, 'คลังสไตล์'),
            h('div', { class: 'muted' }, 'ดูพรีเซ็ตโฆษณาที่ทำสำเร็จแล้ว เลือกสไตล์ที่ชอบ แล้วให้ Claude ทำแบบเดียวกันให้แบรนด์คุณ'),
            h('div', { class: 'row' }, h('a', { class: 'btn sm', href: './#armory' }, 'ไปที่คลังสไตล์'),
              me.admin ? h('a', { class: 'btn sm ghost', href: 'admin.html' }, 'หลังบ้าน') : null)))));
  }

  function moduleEl(m, i, nextId) {
    const n = m.lessons.length, d = m.lessons.filter(l => l.done).length;
    const mins = m.lessons.reduce((a, l) => a + (+l.duration_min > 0 ? +l.duration_min : 0), 0);
    const full = n > 0 && d === n;
    const open = m.lessons.some(l => l.id === nextId) || (!nextId && i === 0);
    return h('details', { class: 'mod' + (full ? ' all' : ''), open, 'data-module': m.id },
      h('summary', null,
        h('span', { class: 'mod-id' }, m.id),
        h('span', { class: 'mod-t' }, m.title || m.id, h('small', null, `${n} บท` + (mins ? ` · ~${mins} นาที` : ''))),
        h('span', { class: 'mod-c' + (full ? ' ok' : '') }, full ? '✓ ครบ' : `${d}/${n}`)),
      m.summary ? h('div', { class: 'mod-sum muted' }, m.summary) : null,
      n ? h('ol', { class: 'les-list' }, m.lessons.map((l, j) => lessonRow(l, j, nextId))) : h('div', { class: 'mini', style: 'padding:6px 4px 10px' }, 'ยังไม่มีบทในหมวดนี้'));
  }
  function lessonRow(l, j, nextId) {
    const next = l.id === nextId;
    return h('li', null, h('a', { class: 'les' + (l.done ? ' done' : '') + (next ? ' next' : ''), href: lessonHref(l.id), 'data-lesson': l.id },
      h('span', { class: 'tick', 'aria-hidden': 'true' }, l.done ? '✓' : lessonNo(l, j)),
      h('span', { class: 'les-t' }, h('span', { class: 'les-id' }, l.id), h('span', { class: 'les-n' }, l.title || l.id), l.goal ? h('small', null, l.goal) : null),
      h('span', { class: 'les-meta' },
        next ? h('span', { class: 'tag t-next' }, 'เรียนต่อ') : null,
        l.has_video === false ? h('span', { class: 'tag t-soon' }, 'เร็วๆ นี้') : null,
        +l.duration_min > 0 ? h('span', { class: 'mins' }, `${+l.duration_min} นาที`) : null),
      h('span', { class: 'vh' }, l.done ? ' (เรียนแล้ว)' : ' (ยังไม่ได้เรียน)')));
  }

  function filesPanel(res) {
    const box = h('section', { class: 'panel', id: 'files' }, h('h2', null, 'ไฟล์ประกอบคอร์ส'));
    const fill = r => {
      box.replaceChildren(box.firstChild);
      if (!r || r.status === 'rejected') {
        box.append(h('div', { class: 'err' }, (r && r.reason && r.reason.message) || A.reasonText('error')),
          h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { box.append(h('div', { class: 'mini' }, 'กำลังโหลด…')); fill(await A.api('student/files').then(v => ({ status: 'fulfilled', value: v }), e => ({ status: 'rejected', reason: e }))); } }, 'ลองใหม่')));
        return;
      }
      const d = r.value || {};
      const files = (Array.isArray(d.files) ? d.files : Array.isArray(d) ? d : []).filter(f => f && (f.title || f.url));
      if (!files.length) { box.append(h('div', { class: 'muted' }, 'ยังไม่มีไฟล์ — ทีมงานจะเพิ่มให้เร็วๆ นี้')); return; }
      box.append(h('div', { class: 'muted' }, 'ชุดเริ่มต้นและไฟล์ที่ใช้ในคอร์ส — ดาวน์โหลดแล้วแตกไฟล์ (.zip) ก่อนใช้'),
        D && D.isMobile() ? h('div', { class: 'banner', style: 'margin:10px 0 0' }, 'ดาวน์โหลดบนคอมพิวเตอร์ — ชุดเริ่มต้นใช้กับแอป Claude บนคอม (ไฟล์ใหญ่ ไม่ต้องโหลดลงมือถือ)') : null,
        h('ul', { class: 'files' }, files.map(f => h('li', null,
          h('div', { class: 'f-t' }, h('b', null, f.title || 'ไฟล์'), f.description ? h('div', { class: 'muted' }, f.description) : null, f.size ? h('span', { class: 'mini' }, U.fmtSize(f.size)) : null),
          isHttps(f.url) ? h('a', { class: 'btn sm ghost', href: f.url, target: '_blank', rel: 'noopener', download: '' }, 'ดาวน์โหลด') : h('span', { class: 'mini' }, 'ลิงก์ยังไม่พร้อม')))),
        h('div', { class: 'mini', style: 'margin-top:8px' }, 'ลิงก์ดาวน์โหลดใช้ได้ 1 ชั่วโมง — ถ้ากดแล้วไม่ได้ ให้รีเฟรชหน้านี้'));
    };
    fill(res);
    return box;
  }

  // ---------------------------------------------------------------- "เชื่อมคลังแสงกับแอป Claude"
  function connectCard(me) {
    const k = me.key || null;
    const key = k && k.key ? U.normKey(k.key) : '';
    const expired = !!(k && k.expires_at && Date.parse(k.expires_at) <= Date.now());
    const keyOk = !!key && k.active !== false && !expired;
    const card = h('section', { class: 'panel link-card', id: 'connect' });
    if (!D) { card.append(h('h2', null, 'เชื่อมคลังแสงกับแอป Claude'), h('div', { class: 'err' }, 'โหลดส่วนนี้ไม่สำเร็จ — รีเฟรชหน้าอีกครั้ง')); return card; }

    // key row + "ทดสอบคีย์"
    const kmsg = h('div', { class: 'msg', id: 'keyMsg', 'aria-live': 'polite' });
    const ktest = h('button', { class: 'btn sm ghost', type: 'button', id: 'keyTest' }, 'ทดสอบคีย์');
    ktest.addEventListener('click', async () => {
      ktest.disabled = true; kmsg.replaceChildren('กำลังตรวจคีย์…');
      const r = await A.keyCheck(key);
      ktest.disabled = false;
      kmsg.replaceChildren(r.ok ? h('span', { class: 'ok' }, '✓ คีย์ใช้งานได้' + (r.name ? ' — ' + r.name : '')) : h('span', { class: 'err' }, r.message));
    });
    const keyRow = key
      ? h('div', { class: 'keyrow' }, h('span', { class: 'mini' }, 'คีย์ของคุณ'), h('span', { class: 'kcode', id: 'keyMasked' }, U.maskKey(key)),
        h('span', { class: 'st ' + (keyOk ? 'on' : expired ? 'exp' : 'off') }, keyOk ? 'ใช้งานได้' : expired ? 'หมดอายุ' : 'ปิดอยู่'), ktest)
      : h('div', { class: 'err' }, 'บัญชีนี้ยังไม่มีคีย์ที่ใช้ได้ — ติดต่อทีมงาน TOP 1 HollyWood ', contact());

    // step 1: kit folder
    const fin = h('input', { type: 'text', id: 'kitFolder', value: D.folder, placeholder: D.placeholder(), autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'ที่อยู่โฟลเดอร์ชุดเริ่มต้น', style: 'flex:1;min-width:200px' });
    const fsave = h('button', { class: 'btn sm', type: 'button', id: 'folderSave' }, 'บันทึก');
    const fmsg = h('div', { class: 'msg', id: 'folderMsg', 'aria-live': 'polite' });
    const help = h('details', { class: 'help', open: !D.folder });
    help.append(h('summary', null, 'หาที่อยู่โฟลเดอร์ยังไง?'));
    const helpBody = document.createElement('div'); helpBody.innerHTML = D.folderHelpHtml; help.append(helpBody);   // fixed text from desktop.js
    const savedLine = f => [h('span', { class: 'ok' }, '✓ บันทึกแล้ว'), ' — เครื่องนี้จำไว้ให้ ', h('span', { class: 'mini path' }, f)];
    if (D.folder) fmsg.replaceChildren(...savedLine(D.folder));
    function save() {
      const raw = fin.value;
      const v = D.setFolder(raw);
      if (!v) { fmsg.replaceChildren(h('span', { class: 'err' }, D.folderError(D.cleanFolder(raw)))); help.open = true; fin.focus(); return ''; }
      fin.value = v; fmsg.replaceChildren(...savedLine(v));
      return v;
    }
    fsave.addEventListener('click', save);
    fin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

    // step 2: open the desktop app with "/top1-connect <KEY>" typed in
    const go = h('button', { class: 'btn', type: 'button', id: 'connectGo', disabled: !keyOk }, 'เชื่อมคลังแสงกับแอป Claude');
    const gmsg = h('div', { class: 'msg', id: 'connectMsg', 'aria-live': 'polite' });
    const hint = h('div', { id: 'connectHint' });
    go.addEventListener('click', () => {
      if (!keyOk) { gmsg.replaceChildren(h('span', { class: 'err' }, 'คีย์นี้ยังใช้ไม่ได้ — ติดต่อทีมงาน TOP 1 HollyWood'), ' ', contact() || ''); return; }
      // typed a path but did not press บันทึก → save it now
      if (D.cleanFolder(fin.value) !== D.folder) { if (!save()) { gmsg.replaceChildren(h('span', { class: 'err' }, 'ทำขั้นที่ 1 ก่อน — วางที่อยู่โฟลเดอร์ให้ถูกแล้วกดบันทึก')); return; } }
      if (!D.validFolder(D.folder)) { gmsg.replaceChildren(h('span', { class: 'err' }, 'ทำขั้นที่ 1 ก่อน — วางที่อยู่โฟลเดอร์แล้วกดบันทึก')); help.open = true; fin.focus(); return; }
      const url = D.connectLink(key);
      if (!url) { gmsg.replaceChildren(h('span', { class: 'err' }, 'สร้างลิงก์ไม่สำเร็จ — เช็กคีย์และที่อยู่โฟลเดอร์อีกครั้ง')); return; }
      gmsg.replaceChildren('กำลังเปิดแอป Claude… (ถ้าเบราว์เซอร์ถามว่าเปิดแอปไหม ให้กด เปิด)');
      // onDone runs with true at ~2 s (hint shown) and again with false if the app opens later (browser "Open Claude?" prompt)
      D.open(url, { fallbackText: D.connectPrompt(key), hintEl: hint, onDone: notOpened => {
        if (notOpened) return;
        // same flag as app.js: the "ทำคอนเทนต์แบบนี้" dialog then skips its first-time setup step on this browser
        try { localStorage.setItem('top1_kit_linked', D.folder); } catch {}
        gmsg.replaceChildren(h('span', { class: 'ok' }, '✓ แอปเปิดแล้ว — กด Enter ในแอป รอจนขึ้นว่า "เชื่อมเสร็จแล้ว" แล้วปิดแชทนั้น'));
      } });
    });

    // other way (advanced): Claude Code in Terminal
    const mcp = A.functionsBase + '/armory-mcp?key=';
    const cli = kk => `claude mcp add --transport http top1-armory "${mcp}${kk}"`;
    const alt = h('details', { class: 'help alt' }, h('summary', null, 'วิธีอื่น (Claude Code ใน Terminal)'),
      h('div', { class: 'muted' }, 'สำหรับคนที่ใช้ Terminal เป็น: เปิด Terminal ในโฟลเดอร์ชุดเริ่มต้น แล้ววางคำสั่งนี้ครั้งเดียว (ห้ามส่งคำสั่งนี้ให้คนอื่น เพราะมีคีย์ของคุณอยู่ข้างใน)'),
      h('div', { class: 'code' }, cli(key ? U.maskKey(key) : '<คีย์ของคุณ>')),
      // the full command only for a key the server says is usable (active, not expired)
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', id: 'cliCopy', disabled: !keyOk, onclick: () => { if (keyOk) U.copy(cli(encodeURIComponent(key)), 'คัดลอกคำสั่งแล้ว'); } }, 'คัดลอกคำสั่ง')));

    // phones cannot run the Claude desktop app → key check + "open this page on your computer", no connect button / Terminal steps
    if (D.isMobile()) {
      const pageLink = (() => { try { return new URL('course.html#connect', location.href).href; } catch { return 'course.html#connect'; } })();
      card.append(
        h('h2', null, 'เชื่อมคลังแสงกับแอป Claude'),
        h('div', { class: 'banner mk-phone', id: 'connectPhone', style: 'margin:12px 0 0' },
          h('b', null, 'ขั้นนี้ทำบนคอมพิวเตอร์ (Mac / Windows)'),
          h('div', null, 'แอป Claude ที่ใช้กับชุดเริ่มต้นเป็นแอปบนคอม — เปิดหน้านี้บนคอมที่ติดตั้งแอป Claude แล้วทำตามขั้นตอน'),
          h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', type: 'button', id: 'connectCopyPage', onclick: () => U.copy(pageLink, 'คัดลอกลิงก์แล้ว — ส่งไปเปิดบนคอม') }, 'คัดลอกลิงก์หน้านี้'))),
        keyRow, kmsg);
      return card;
    }
    card.append(
      h('h2', null, 'เชื่อมคลังแสงกับแอป Claude'),
      h('div', { class: 'muted' }, 'ทำครั้งเดียวบนคอมพิวเตอร์ที่ติดตั้งแอป Claude — แล้ว Claude ในโฟลเดอร์ชุดเริ่มต้นจะเปิดคลังแสงได้ทุกสไตล์'),
      keyRow, kmsg,
      h('div', { class: 'kitnote', id: 'kitNote' }, 'ยังไม่มีชุดเริ่มต้น? ดาวน์โหลดที่ ', h('a', { class: 'linkbtn', href: '#files', onclick: e => { const t = document.getElementById('files'); if (t && t.scrollIntoView) { e.preventDefault(); try { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {} } } }, 'ไฟล์ประกอบคอร์ส'), ' แล้วแตกไฟล์ (.zip) ก่อน'),
      h('div', { class: 'step' },
        h('h3', null, h('span', { class: 'num' }, '1'), 'บอกเว็บว่าโฟลเดอร์ชุดเริ่มต้นอยู่ที่ไหน'),
        h('div', { class: 'muted' }, 'วางที่อยู่ (path) ของโฟลเดอร์ชุดเริ่มต้นที่แตกไฟล์แล้ว — ทำครั้งเดียวต่อเครื่อง'),
        h('div', { class: 'row' }, fin, fsave), fmsg, help),
      h('div', { class: 'step' },
        h('h3', null, h('span', { class: 'num' }, '2'), 'กดเชื่อม แล้วกด Enter ในแอป'),
        h('div', { class: 'row', style: 'margin-top:0' }, go),
        h('div', { class: 'muted', style: 'margin-top:8px' }, 'แอป Claude จะเปิดขึ้นในโฟลเดอร์ชุดเริ่มต้น พร้อมข้อความที่พิมพ์ไว้ให้แล้ว — กด ', h('span', { class: 'kbd' }, 'Enter'), ' หนึ่งครั้ง แล้วรอจน Claude บอกว่า "เชื่อมเสร็จแล้ว"'),
        h('div', { class: 'mini', style: 'margin-top:4px' }, 'ครั้งแรกแอปจะถามว่าไว้ใจโฟลเดอร์นี้ไหม ให้กดอนุญาต (Trust)'),
        gmsg, hint),
      h('div', { class: 'step' },
        h('h3', null, h('span', { class: 'num' }, '3'), 'เริ่มทำคอนเทนต์'),
        h('div', { class: 'muted' }, 'ปิดแชทที่เชื่อมเสร็จ แล้วไปเลือกสไตล์ในคลัง กด "ทำคอนเทนต์แบบนี้" → "เปิดในแอป Claude"'),
        h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: './#armory' }, 'ไปที่คลังสไตล์'))),
      alt);
    return card;
  }
})();
