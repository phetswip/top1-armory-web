// lesson.js — lesson.html?id=M00-L01: player (storage/url → <video>, YouTube/Vimeo → iframe), title, goal, deliverable,
// notes (tiny SAFE markdown), attachments, "เรียนจบบทนี้" toggle, prev/next, lessons of the same module.
// Not logged in: free-preview lessons open via public/lesson, everything else → login.html?next=lesson.html?id=…
(function () {
  'use strict';

  // ---------------------------------------------------------------- tiny safe markdown → HTML string
  // Everything is escaped first; the only tags that can come out are the ones written below.
  // Links: http(s) only, open in a new tab with rel=noopener. No raw HTML, no images, no attributes from the text except a checked href.
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINK_OK = /^https?:\/\/[^\s<>"'`]+$/i;
  const anchor = (url, labelHtml) => '<a href="' + escH(url) + '" target="_blank" rel="noopener noreferrer">' + labelHtml + '</a>';
  function inline(raw) {
    const slots = [];
    const keep = html => '\u0000' + (slots.push(html) - 1) + '\u0000';
    let s = String(raw ?? '').replace(/\u0000/g, '');
    s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('<code>' + escH(c) + '</code>'));                         // `code`
    s = s.replace(/\[([^\]\n]{1,300})\]\(\s*([^()\s]{1,2000})\s*\)/g, (_, label, url) =>                   // [label](https://…)
      LINK_OK.test(url) ? keep(anchor(url, emph(escH(label)))) : label);
    s = s.replace(/\bhttps?:\/\/[^\s<>"'`\u0000]+/gi, url => {                                               // bare https://…
      const t = /[.,;:!?)\]]+$/.exec(url); const tail = t ? t[0] : ''; if (tail) url = url.slice(0, -tail.length);
      return (LINK_OK.test(url) ? keep(anchor(url, escH(url))) : url) + tail;
    });
    s = emph(escH(s));
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i] || '');
  }
  // **bold** __bold__ *em* (input is already escaped)
  const emph = s => s
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?!\*)/g, '$1<em>$2</em>');
  function renderMarkdown(src) {
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
      if (m) {                                                                                               // fenced code block
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
      if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }   // wrapped list item
      flushList(); flushQuote(); para.push(line.trim());
    }
    flush();
    return out.join('\n');
  }

  // ---------------------------------------------------------------- video URL checks (only these hosts reach an iframe)
  const YT_RE = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20}(?:\?[^\s"'<>]*)?$/;
  const VM_RE = /^https:\/\/player\.vimeo\.com\/video\/\d{1,15}(?:\?[^\s"'<>]*)?$/;
  const FILE_RE = /^https:\/\/[^\s"'<>]+$/i;
  // local preview only (tools/mock-server.mjs on 127.0.0.1 over plain http): same-origin http links count as safe too — never true on the real https site
  const LOCAL = location.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  const localUrl = u => LOCAL && String(u || '').startsWith(location.origin + '/') && !/[\s"'<>]/.test(String(u));
  function videoOk(kind, url) {
    url = String(url || '');
    if (kind === 'youtube') return YT_RE.test(url);
    if (kind === 'vimeo') return VM_RE.test(url);
    if (kind === 'storage' || kind === 'url') return FILE_RE.test(url) || localUrl(url);
    return false;
  }
  window.T1Lesson = { renderMarkdown, videoOk };

  // ---------------------------------------------------------------- page
  const A = window.T1Auth, U = window.T1UI;
  const APP = document.getElementById('app');
  if (!A || !U || !APP) return;
  const h = U.h;
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,60}$/;
  const id = String(new URLSearchParams(location.search).get('id') || '').trim();
  const lessonHref = x => 'lesson.html?id=' + encodeURIComponent(x);
  const isHttps = u => FILE_RE.test(String(u || '')) || localUrl(u);
  let running = 0;

  A.mountNav();
  init();
  window.addEventListener('pageshow', e => { if (e.persisted) init(); });

  function loading() { APP.replaceChildren(h('div', { class: 'panel loading' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'muted' }, 'กำลังโหลดบทเรียน…'))); }
  function showError(e, opts) {
    const r = e && e.reason;
    const title = r === 'not-found' ? 'ไม่พบบทเรียนนี้' : r === 'bad-id' ? 'ลิงก์บทเรียนไม่ถูกต้อง' : r === 'not-student' ? 'ยังเปิดบทเรียนไม่ได้' : 'เปิดบทเรียนไม่สำเร็จ';
    const msg = r === 'not-found' ? 'บทนี้อาจถูกปิดหรือย้ายแล้ว — กลับไปเลือกบทจากหน้าคอร์ส'
      : r === 'bad-id' ? 'กลับไปเลือกบทจากหน้าคอร์สของฉัน'
        : r === 'not-student' ? 'บัญชีนี้ยังไม่ได้ผูกคีย์คอร์ส — ไปที่หน้าคอร์สของฉันเพื่อผูกคีย์'
          : (e && e.message) || A.reasonText('error');
    const retry = !(opts && opts.noRetry) && !['not-found', 'bad-id', 'not-student', 'inactive', 'key-inactive', 'key-expired'].includes(r);
    APP.replaceChildren(h('div', { class: 'panel state', id: 'state' },
      h('h2', null, title), h('div', { class: retry ? 'err' : 'muted' }, msg),
      h('div', { class: 'row', style: 'margin-top:12px' },
        retry ? h('button', { class: 'btn sm', type: 'button', id: 'retry', onclick: init }, 'ลองใหม่') : null,
        h('a', { class: 'btn sm ghost', href: 'course.html' }, 'ไปหน้าคอร์สของฉัน'))));
  }

  async function init() {
    const run = ++running;
    if (!ID_RE.test(id)) { showError({ reason: 'bad-id' }); return; }
    const p = A.problem(); if (p) { showError({ reason: p, message: A.reasonText(p) }); return; }
    loading();
    const s = await A.session();
    if (run !== running) return;
    if (!s) {
      // free-preview lessons are open to everyone; anything else → log in first
      try {
        const d = await A.api('public/lesson?id=' + encodeURIComponent(id), { auth: false });
        if (run === running) render(d, { preview: true });
      } catch (e) {
        if (run !== running) return;
        if (e.reason === 'network') showError(e); else A.go(A.loginHref(lessonHref(id)));
      }
      return;
    }
    let me;
    try { me = await A.requireStudent(lessonHref(id)); } catch (e) { if (run === running) showError(e); return; }
    if (run !== running || !me) return;
    if (me.needsKey || !me.student) {
      // logged in but no course key yet (e.g. the owner's admin account): free-preview lessons still open, others → link a key first
      try {
        const d = await A.api('public/lesson?id=' + encodeURIComponent(id), { auth: false });
        if (run === running) render(d, { preview: true, member: true });
      } catch (e) { if (run === running) showError(e.reason === 'network' ? e : { reason: 'not-student' }); }
      return;
    }
    const [l, c] = await Promise.allSettled([A.api('student/lesson?id=' + encodeURIComponent(id)), A.api('student/course')]);
    if (run !== running) return;
    if (l.status === 'rejected') { showError(l.reason); return; }
    render(l.value, { course: c.status === 'fulfilled' ? c.value : null, me });
  }

  function modulesOf(course) {
    const list = course && (Array.isArray(course.modules) ? course.modules : Array.isArray(course) ? course : null);
    return (list || []).filter(m => m && m.id).map(m => ({ ...m, lessons: (Array.isArray(m.lessons) ? m.lessons : []).filter(x => x && x.id) }));
  }
  const lessonNo = (l, i) => { const m = /-L(\d+)$/i.exec(l.id); return m ? String(+m[1]) : String(i + 1); };

  function placeholder(title, sub, kind) {
    return h('div', { class: 'player ph' + (kind === 'err' ? ' bad' : '') },
      h('div', null, h('div', { class: 'ph-ic', 'aria-hidden': 'true' }, kind === 'err' ? '!' : '▶'), h('b', null, title), sub ? h('div', { class: 'mini' }, sub) : null));
  }
  function player(video, title) {
    const kind = video && typeof video === 'object' ? String(video.kind || '') : '';
    const url = video && typeof video === 'object' ? String(video.url || '') : '';
    if (!kind || kind === 'none') return placeholder('วิดีโอบทนี้กำลังมา เร็วๆ นี้', 'อ่านโน้ตและทำตามด้านล่างไปก่อนได้');
    if (!videoOk(kind, url)) return placeholder('วิดีโอบทนี้เปิดไม่ได้', 'แจ้งทีมงาน TOP 1 HollyWood ให้ช่วยเช็ก', 'err');
    if (kind === 'youtube' || kind === 'vimeo') {
      return h('div', { class: 'player' }, h('iframe', {
        src: url, title: title || 'วิดีโอบทเรียน', loading: 'lazy', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share',
      }));
    }
    const wrap = h('div', { class: 'player' });
    const v = h('video', { controls: true, playsinline: true, preload: 'metadata', controlslist: 'nodownload', src: url });
    v.addEventListener('error', () => {
      if (wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('vid-err')) return;
      // storage = signed link that may have expired (refresh helps) · url = the owner's own link: refreshing will not fix it
      const c = kind === 'url' && U.contactLink ? U.contactLink('linkbtn') : null;
      wrap.after(h('div', { class: 'banner err vid-err' }, kind === 'url' ? 'เล่นวิดีโอไม่ได้ — แจ้งทีมงาน TOP 1 HollyWood ให้ช่วยเช็กลิงก์วิดีโอบทนี้' : 'เล่นวิดีโอไม่ได้ — ลิงก์อาจหมดอายุ ลองรีเฟรชหน้านี้', c ? ' ' : null, c));
    });
    wrap.append(v);
    return wrap;
  }

  function render(d, opts) {
    const L = (d && d.lesson) || {};
    if (!L.id) { showError({ reason: 'not-found' }); return; }
    const preview = !!opts.preview;
    const modules = modulesOf(opts.course);
    // the module's lesson list: from student/course, else from the lesson reply itself (module.lessons) when that request failed
    const own = !preview && d.module && d.module.id && Array.isArray(d.module.lessons)
      ? { id: d.module.id, title: d.module.title || '', lessons: d.module.lessons.filter(x => x && x.id) } : null;
    const mod = modules.find(m => m.id === L.module_id) || modules.find(m => m.lessons.some(x => x.id === L.id)) || own;
    const modInfo = (d.module && d.module.id) ? d.module : mod ? { id: mod.id, title: mod.title } : (L.module_id ? { id: L.module_id, title: '' } : null);
    const all = modules.flatMap(m => m.lessons);
    const titleOf = x => { const f = all.find(y => y.id === x); return f && f.title ? f.title : ''; };
    document.title = (L.title || L.id) + ' · TOP 1 HollyWood';
    let done = !!L.done;

    // done toggle
    const msg = h('div', { class: 'msg', id: 'doneMsg', 'aria-live': 'polite' });
    const prog = h('span', { class: 'mini', id: 'progText' });
    const setProg = (dn, tt) => { if (+tt > 0) prog.textContent = `เรียนแล้ว ${+dn} จาก ${+tt} บท`; };
    if (opts.me && opts.me.progress) setProg(opts.me.progress.done, opts.me.progress.total);
    if (all.length) setProg(all.filter(x => x.done).length, all.length);
    const nextCta = h('div', { class: 'next-cta', id: 'nextCta', hidden: true },
      d.next_id ? h('a', { class: 'btn sm', href: lessonHref(d.next_id) }, 'ไปบทถัดไป', h('span', { class: 'ar' }, '→')) : h('a', { class: 'btn sm ghost', href: 'course.html' }, 'กลับหน้าคอร์ส'));
    const btn = h('button', { class: 'btn done-btn', type: 'button', id: 'doneBtn', 'aria-pressed': 'false' });
    const paint = () => {
      btn.className = 'btn done-btn' + (done ? ' ghost is-done' : '');
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.textContent = done ? '✓ เรียนจบแล้ว' : 'เรียนจบบทนี้';
      btn.title = done ? 'กดอีกครั้งเพื่อยกเลิก' : 'กดเมื่อดูและทำตามบทนี้เสร็จ';
      const row = [...APP.querySelectorAll('.l-side a[data-lesson]')].find(a => a.getAttribute('data-lesson') === L.id);
      if (row) { row.classList.toggle('done', done); const t = row.querySelector('.tick'); if (t) t.textContent = done ? '✓' : (row.getAttribute('data-no') || ''); }
    };
    btn.addEventListener('click', async () => {
      const want = !done;
      btn.disabled = true; msg.replaceChildren('กำลังบันทึก…');
      try {
        const r = await A.api('student/progress', { body: { lessonId: L.id, done: want } });
        done = want; paint(); msg.replaceChildren();
        if (typeof r.done === 'number') setProg(r.done, r.total);
        nextCta.hidden = !want;
        if (want) U.toast('บันทึกแล้ว เก่งมาก!');
      } catch (e) { msg.replaceChildren(h('span', { class: 'err' }, e.message)); }
      btn.disabled = false;
    });

    const mins = +L.duration_min > 0 ? +L.duration_min : 0;
    const head = h('section', { class: 'panel l-head' },
      h('div', { class: 'cat' }, [L.id, mins ? `~${mins} นาที` : ''].filter(Boolean).join(' · ')),
      h('h1', { class: 'l-title' }, L.title || L.id),
      L.summary ? h('p', { class: 'muted', style: 'margin:6px 0 0' }, L.summary) : null,
      (L.goal || L.deliverable) ? h('div', { class: 'facts' },
        L.goal ? h('div', { class: 'fact' }, h('b', null, 'เป้าหมาย'), h('span', null, L.goal)) : null,
        L.deliverable ? h('div', { class: 'fact' }, h('b', null, 'ชิ้นงาน'), h('span', null, L.deliverable)) : null) : null,
      preview
        ? (opts.member
          ? h('div', { class: 'banner', style: 'margin:14px 0 0' }, 'บทเรียนตัวอย่าง — ', h('a', { class: 'linkbtn', href: 'course.html' }, 'ผูกคีย์คอร์สที่หน้าคอร์สของฉัน'), ' เพื่อเรียนครบทุกบท')
          : h('div', { class: 'banner', style: 'margin:14px 0 0' }, 'บทเรียนตัวอย่าง — ', h('a', { class: 'linkbtn', href: A.loginHref(lessonHref(L.id)) }, 'เข้าสู่ระบบหรือลงทะเบียน'), ' เพื่อเรียนครบทุกบท'))
        : h('div', { class: 'row done-row' }, btn, prog),
      preview ? null : msg, preview ? null : nextCta);

    const body = String(L.body_md || '').trim();
    const notes = body ? h('section', { class: 'panel', id: 'notes' }, h('h2', null, 'โน้ตประกอบบทเรียน')) : null;
    if (notes) { const box = h('div', { class: 'mdx' }); box.innerHTML = renderMarkdown(body); notes.append(box); }

    const atts = (Array.isArray(d.attachments) ? d.attachments : []).filter(a => a && (a.name || a.url));
    const files = atts.length ? h('section', { class: 'panel', id: 'attachments' }, h('h2', null, 'ไฟล์ประกอบบทนี้'),
      h('ul', { class: 'files' }, atts.map(a => h('li', null,
        h('div', { class: 'f-t' }, h('b', null, a.name || 'ไฟล์'), a.size ? h('span', { class: 'mini' }, U.fmtSize(a.size)) : null),
        isHttps(a.url) ? h('a', { class: 'btn sm ghost', href: a.url, target: '_blank', rel: 'noopener', download: '' }, 'ดาวน์โหลด') : h('span', { class: 'mini' }, 'ลิงก์ยังไม่พร้อม')))),
      h('div', { class: 'mini', style: 'margin-top:8px' }, 'ลิงก์ดาวน์โหลดหมดอายุได้ — ถ้ากดแล้วไม่ได้ ให้รีเฟรชหน้านี้')) : null;

    const pn = preview ? null : h('nav', { class: 'pn', 'aria-label': 'บทก่อนหน้าและถัดไป' },
      d.prev_id ? h('a', { class: 'btn ghost', href: lessonHref(d.prev_id), id: 'prevBtn', title: titleOf(d.prev_id) }, h('span', { class: 'ar' }, '←'), 'บทก่อนหน้า') : h('span'),
      d.next_id ? h('a', { class: 'btn', href: lessonHref(d.next_id), id: 'nextBtn', title: titleOf(d.next_id) }, 'บทถัดไป', h('span', { class: 'ar' }, '→'))
        : h('a', { class: 'btn ghost', href: 'course.html', id: 'nextBtn' }, 'กลับหน้าคอร์ส'));

    const side = mod && mod.lessons.length ? h('section', { class: 'panel' },
      h('h2', null, 'บทเรียนใน ' + mod.id), mod.title ? h('div', { class: 'muted' }, mod.title) : null,
      h('ol', { class: 'les-list compact' }, mod.lessons.map((x, j) => {
        const no = lessonNo(x, j), cur = x.id === L.id, dn = cur ? done : !!x.done;
        return h('li', null, h('a', { class: 'les' + (dn ? ' done' : '') + (cur ? ' cur' : ''), href: lessonHref(x.id), 'aria-current': cur ? 'page' : null, 'data-lesson': x.id, 'data-no': no },
          h('span', { class: 'tick', 'aria-hidden': 'true' }, dn ? '✓' : no),
          h('span', { class: 'les-t' }, h('span', { class: 'les-n' }, x.title || x.id)),
          +x.duration_min > 0 ? h('span', { class: 'les-meta' }, h('span', { class: 'mins' }, `${+x.duration_min} นาที`)) : null));
      })),
      h('div', { class: 'row' }, h('a', { class: 'btn sm ghost', href: 'course.html' }, 'ดูทุกหมวด'))) : null;

    APP.replaceChildren(
      h('nav', { class: 'crumbs', 'aria-label': 'ตำแหน่ง' },
        h('a', { href: preview ? './#armory' : 'course.html' }, preview ? 'คลังแสง' : 'คอร์สของฉัน'),
        modInfo ? [h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'), h('span', null, modInfo.id + (modInfo.title ? ' · ' + modInfo.title : ''))] : null),
      h('div', { class: 'l-grid' + (side ? '' : ' solo') },
        h('div', { class: 'l-main' }, player(d.video, L.title), head, notes, files, pn),
        side ? h('aside', { class: 'l-side' }, side) : null));
    if (!preview) paint();
  }
})();
