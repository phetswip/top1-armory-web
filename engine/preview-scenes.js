// preview-scenes.js — 6-second live brand preview (loops). URL params:
//   style=kinetic|quiz|film  brand  product  price  old  pts=a|b|c  cta  color=#0A55EA
const Q = new URLSearchParams(location.search);
// text params end up in innerHTML → swap HTML-special characters for look-alikes (no markup injection via a crafted link)
const SAFE = v => String(v).replace(/[<>&"'`]/g, c => ({ '<': '‹', '>': '›', '&': '＆', '"': '”', "'": '’', '`': 'ˋ' }[c]));
const STYLE = Q.get('style') || 'kinetic';
const BRAND = SAFE((Q.get('brand') || 'แบรนด์ของคุณ').slice(0, 28));
const PRODUCT = SAFE((Q.get('product') || 'สินค้าที่ใช่สำหรับคุณ').slice(0, 40));
const fmtP = v => { const n = String(v || '').replace(/[^\d.]/g, ''); return n ? '฿' + Number(n).toLocaleString('en-US') : ''; };
const PRICE = fmtP(Q.get('price') || '590'), OLD = fmtP(Q.get('old') || '');
const PTS = (Q.get('pts') || 'ส่งไว ภายใน 24 ชม.|ของแท้ 100%|ใช้ดี รีวิวเพียบ').split('|').map(s => SAFE(s.trim().slice(0, 40))).filter(Boolean).slice(0, 3);
const CTA = SAFE((Q.get('cta') || 'ทักแชทเลย').slice(0, 24));
const COL = /^#[0-9a-f]{6}$/i.test(Q.get('color') || '') ? Q.get('color') : '#0A55EA';
const DUR = 6.0;
const tint = (h, k) => { const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = c => Math.round(c + (255 - c) * k); return `rgb(${m(r)},${m(g)},${m(b)})`; };
const LIGHT = tint(COL, .38), PALE = tint(COL, .86);
const GRAD = `background:linear-gradient(180deg,${LIGHT},${COL});-webkit-background-clip:text;background-clip:text;color:transparent;padding:.34em .1em .2em;margin:-.34em -.1em -.2em`;
const TONE = { a: '#F9FBFE', b: '#ECF3FD', glows: [[540, 900, 1000, '255,255,255', .9], [160, 260, 720, '205,226,255', .5], [960, 1680, 760, '214,232,255', .5]], dots: 0 };

// ---------- helpers (same as the starter kit helper block)
const cam = (sc, o) => { sc.root.style.transform = `translate3d(${-(o.x || 0)}px,${-(o.y || 0)}px,0) scale(${o.s || 1})`; };
const H_ = y => y * 1920;
function pop(t, t0, dy = -90, s0 = 1.25) { if (t < t0 - .01) return { o: 0 }; const u = E.in(clamp(G30(t, t0) / 6)); return { o: clamp(G30(t, t0) / 2 + .25), dy: dy * (1 - u), s: lerp(s0, 1, u), blur: 10 * (1 - u) }; }
function out(t, t0, n = 5) { if (t < t0) return { o: 1, s: 1, blur: 0 }; const u = E.out(clamp(G30(t, t0) / n)); return { o: 1 - u, s: 1 - .18 * u, blur: 12 * u }; }
const mix = (a, b) => ({ o: (a.o ?? 1) * (b.o ?? 1), s: (a.s ?? 1) * (b.s ?? 1), blur: (a.blur || 0) + (b.blur || 0), dy: (a.dy || 0) + (b.dy || 0), rz: (a.rz || 0) + (b.rz || 0) });
const expSlide = (t, t0, d = 900, r = .8) => t < t0 ? d : d * Math.pow(r, G30(t, t0));
function ring(node, t, t0, x, y, s1 = 5) { const u = clamp((t - t0) / .7); P(node, { x, y, s: lerp(.4, s1, E.in(u)), o: t < t0 ? 0 : (1 - u) * .9 }); }
const grid = sc => nd(sc, `<div style="position:absolute;left:-1620px;top:-2880px;width:3240px;height:5760px;background-image:linear-gradient(rgba(10,85,234,.06) 2px,transparent 2px),linear-gradient(90deg,rgba(10,85,234,.06) 2px,transparent 2px);background-size:120px 120px"></div>`);
const flashIO = (t, a, b) => window.__flash2 = t < a + .16 ? KF(t, a, [[0, .9], [5, 0]]) : (t > b - .14 ? KF(t, b - .14, [[0, 0], [4, .9]]) : 0);
const big = (sc, txt, w, size, css = '') => TB(sc, [{ txt, cls: 'w700', w, size, css: GRAD + ';' + css }], 'c');

// ---------- the closing third is shared: old price struck → new price slams → CTA button → brand
function closing(a, b) {
  const sc = scene(a, b); const g = grid(sc); const rg = rippleNode(sc);
  const old = OLD ? nd(sc, `<div class="c" style="white-space:nowrap"><span style="font:800 130px Inter,Anuphan;letter-spacing:-.04em;color:#8C98AE">${OLD}</span><i class="st" style="position:absolute;left:-14px;right:-14px;top:54%;height:12px;margin-top:-6px;border-radius:6px;background:#FF3B30;transform-origin:0 50%;transform:scaleX(0)"></i></div>`) : null;
  const price = nd(sc, `<div class="c" style="white-space:nowrap"><span style="font:800 250px Inter,Anuphan;letter-spacing:-.05em;${GRAD}">${PRICE || BRAND}</span></div>`);
  const btn = nd(sc, `<div class="c" style="display:flex;align-items:center;gap:18px;padding:30px 60px;border-radius:999px;background:linear-gradient(180deg,${LIGHT},${COL});box-shadow:0 26px 60px ${tint(COL, .55)};white-space:nowrap"><span style="font:800 64px Anuphan,Inter;color:#fff">${CTA} →</span></div>`);
  const br = TB(sc, [{ txt: BRAND, cls: 'w600', w: .5 * 1080, size: 70, css: 'color:#3B4A66' }], 'c');
  add(sc, t => {
    const shake = t >= a + .5 && t < a + .64 ? Math.sin((t - a - .5) * 90) * 10 * (1 - (t - a - .5) / .14) : 0;
    cam(sc, { x: shake }); P(g, { x: 540, y: 960 });
    if (old) { P(old, { x: 540, y: H_(.30), ...pop(t, a + .12, -60, 1.3) }); old.querySelector('.st').style.transform = `scaleX(${E.in(clamp((t - a - .38) / .2))})`; }
    P(price, { x: 540 + expSlide(t, a + .48, 900), y: H_(.43), o: t >= a + .48 ? 1 : 0, blur: t >= a + .48 && t < a + .6 ? 12 : 0 });
    ring(rg, t, a + .5, 540, H_(.43), 5);
    { const u = t < a + .95 ? 0 : spring(t, a + .95, 13); P(btn, { x: 540, y: lerp(H_(.75), H_(.60), u), s: lerp(.6, 1, u) * (1 + .025 * Math.sin((t - a) * 6)), o: t >= a + .95 ? clamp((t - a - .95) / .08) : 0 }); }
    P(br, { x: 540, y: H_(.72), ...pop(t, a + 1.25, 40, 1.15) });
    flashIO(t, a, b);
  }, TONE);
}

// =============================== KINETIC
if (STYLE === 'kinetic') {
  { const sc = scene(0, 2); const g = grid(sc); const bk = bokeh(sc, 7, 11); const rg = rippleNode(sc);
    const w1 = TB(sc, [{ txt: 'หยุดเลื่อนก่อน!', cls: 'w300', w: .56 * 1080, size: 110 }], 'c');
    const w2 = big(sc, BRAND, .84 * 1080, 230);
    const w3 = TB(sc, [{ txt: PRODUCT, cls: 'w400', w: .7 * 1080, size: 80, css: 'color:#3B4A66' }], 'c');
    add(sc, t => { cam(sc, { s: lerp(1, 1.04, t / 2) }); P(g, { x: 540, y: 960 }); bk.forEach((d, i) => P(d, { x: d.x + Math.sin(t * .7 + i) * 20, y: d.y - t * d.v, z: -150, blur: 6, o: .5 }));
      const ex = out(t, 1.78, 5);
      P(w1, { x: 540, y: H_(.32), ...mix(pop(t, .1), ex) });
      { const s = slam(t, .42, -8, 1.9); P(w2, { x: 540, y: H_(.44), o: (s.o ?? 0) * ex.o, s: (s.s || 1) * ex.s, rz: s.rz || 0, blur: (s.blur || 0) + ex.blur }); }
      ring(rg, t, .44, 540, H_(.44), 6);
      { const r = rollIn(t, .95, 40); P(w3, { x: 540, y: H_(.555), o: (r.o ?? 0) * ex.o, rz: r.rz || 0, s: (r.s || 1) * ex.s, blur: (r.blur || 0) + ex.blur }); }
      flashIO(t, -1, 2); }, TONE); }
  { const sc = scene(2, 4); const g = grid(sc);
    const hd = TB(sc, [{ txt: 'ทำไมต้อง ' + BRAND, cls: 'w700', w: .78 * 1080, size: 100 }], 'c');
    const chips = PTS.map(p => nd(sc, `<div class="glass c" style="padding:30px 44px;border-radius:999px;white-space:nowrap;display:flex;gap:18px;align-items:center;font:700 54px Anuphan,Inter;color:#0B1220">${CHECK(56)}${p}</div>`));
    add(sc, t => { cam(sc, {}); P(g, { x: 540, y: 960 });
      P(hd, { x: 540, y: H_(.27), ...pop(t, 2.06, -60, 1.2) });
      chips.forEach((c, i) => { const a = 2.3 + i * .3; const u = spring(t, a, 14); P(c, { x: 540 + (1 - u) * 700, y: H_(.42 + i * .1), o: t >= a ? 1 : 0, blur: (1 - u) * 10 }); });
      flashIO(t, 2, 4); }, TONE); }
  closing(4, DUR);
}

// =============================== QUIZ (A/B blind test)
if (STYLE === 'quiz') {
  const cardH = (lbl, fill) => `<div class="c" style="width:400px;height:640px;border-radius:44px;overflow:hidden;background:${fill};box-shadow:0 34px 80px rgba(16,42,94,.22),0 0 0 9px rgba(255,255,255,.95)"><div style="position:absolute;left:50%;top:44px;transform:translateX(-50%);width:110px;height:110px;border-radius:34px;background:#fff;box-shadow:0 14px 30px rgba(16,42,94,.18);display:flex;align-items:center;justify-content:center;font:800 70px Inter;color:#0B1220">${lbl}</div><div class="dim" style="position:absolute;inset:0;background:#fff;opacity:0"></div></div>`;
  { const sc = scene(0, 2.1); const g = grid(sc);
    const ab = nd(sc, `<div class="c" style="white-space:nowrap;display:flex;align-items:center;gap:30px"><span style="font:800 190px Inter;color:#0B1220">A</span><span style="font:300 100px Anuphan;color:#3B4A66">หรือ</span><span style="font:800 190px Inter;color:#0B1220">B</span><span style="font:800 160px Inter;${GRAD}">?</span></div>`);
    const A = nd(sc, cardH('A', `linear-gradient(160deg,${PALE},${tint(COL, .55)})`)), B = nd(sc, cardH('B', 'linear-gradient(160deg,#EEF1F6,#C9D2DE)'));
    const q = TB(sc, [{ txt: 'อันไหนคือ ' + BRAND + ' ?', cls: 'w700', w: .8 * 1080, size: 90, type: 1 }], 'c');
    add(sc, t => { cam(sc, {}); P(g, { x: 540, y: 960 });
      P(ab, { x: 540, y: H_(.18), ...pop(t, .08, -80, 1.3) });
      const u = spring(t, .25, 11), bob = Math.sin(t * 2.2) * 6;
      P(A, { x: lerp(-300, 300, u), y: H_(.5) + bob, ry: 8 }); P(B, { x: lerp(1380, 780, u), y: H_(.5) - bob, ry: -8 });
      P(q, { x: 540, y: H_(.8), o: t >= .9 ? 1 : 0 }); typeOn(q.lines[0], t, .9, 1.4);
      flashIO(t, -1, 2.1); }, TONE); }
  { const sc = scene(2.1, 4); const g = grid(sc); const rg = rippleNode(sc);
    const rv = TB(sc, [{ txt: 'เฉลย!', cls: 'w700', w: .4 * 1080, size: 200 }], 'c');
    const A = nd(sc, cardH('A', `linear-gradient(160deg,${PALE},${tint(COL, .55)})`)), B = nd(sc, cardH('B', 'linear-gradient(160deg,#EEF1F6,#C9D2DE)'));
    const stamp = nd(sc, `<div class="c" style="padding:26px 40px;border-radius:40px;background:linear-gradient(180deg,${LIGHT},${COL});box-shadow:0 24px 56px ${tint(COL, .5)};white-space:nowrap;font:800 64px Anuphan,Inter;color:#fff">${BRAND} ✓</div>`);
    add(sc, t => { cam(sc, {}); P(g, { x: 540, y: 960 });
      P(rv, { x: 540, y: H_(.18), ...slam(t, 2.16, -10, 2) });
      P(A, { x: 300, y: H_(.5), ry: 8, s: t > 2.6 ? lerp(1, 1.06, clamp((t - 2.6) / .3)) : 1 }); P(B, { x: 780, y: H_(.5), ry: -8, s: .96 });
      B.querySelector('.dim').style.opacity = (.45 * clamp((t - 2.6) / .3)).toFixed(2);
      P(stamp, { x: 300, y: H_(.5), z: 60, ...slam(t, 2.6, -12, 2.2) }); ring(rg, t, 2.62, 300, H_(.5), 4);
      flashIO(t, 2.1, 4); }, TONE); }
  closing(4, DUR);
}

// =============================== FILM (cinematic title)
if (STYLE === 'film') {
  { const sc = scene(0, 2.6); const bk = bokeh(sc, 9, 23);
    const beams = nd(sc, `<div style="position:absolute;left:-200px;top:-200px;width:1480px;height:2320px;background:conic-gradient(from 200deg at 50% 0%,rgba(58,134,255,0) 0deg,rgba(58,134,255,.10) 12deg,rgba(255,255,255,0) 24deg,rgba(58,134,255,.08) 40deg,rgba(255,255,255,0) 60deg)"></div>`);
    const pre = TB(sc, [{ txt: 'PRESENTS', cls: 'w500', w: .34 * 1080, size: 44, css: 'font-family:Inter;letter-spacing:.5em;padding-left:.5em;color:#5B6880' }], 'c');
    const ttl = TB(sc, [{ txt: BRAND.toUpperCase(), cls: 'w700', w: .86 * 1080, size: 190, css: 'font-family:Inter,Anuphan;letter-spacing:.06em;' + `background:linear-gradient(100deg,#0B1220 0%,#3F4D66 40%,#E9EEF5 50%,#3F4D66 60%,#0B1220 100%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;padding:.34em .1em .2em;margin:-.34em -.1em -.2em` }], 'c');
    add(sc, t => { cam(sc, { s: lerp(1.08, 1, E.in(clamp(t / 2.6))) }); P(beams, { x: 0, y: 0, o: clamp(t / .6) * .9 });
      bk.forEach((d, i) => P(d, { x: d.x + Math.sin(t * .5 + i) * 26, y: d.y - t * d.v * .6, z: -150, blur: 7, o: .45 }));
      P(pre, { x: 540, y: H_(.40), ...pop(t, .2, 30, 1.05) });
      P(ttl, { x: 540, y: H_(.48), o: clamp((t - .5) / .5), s: lerp(1.25, 1, E.in(clamp((t - .5) / 1.4))), blur: 18 * (1 - E.in(clamp((t - .5) / .9))) });
      ttl.lines[0].style.backgroundPosition = `${lerp(130, -30, clamp((t - 1.1) / 1.3))}% 0`;
      flashIO(t, -1, 2.6); }, TONE); }
  { const sc = scene(2.6, 4.2); const g = grid(sc);
    const tg = TB(sc, [{ txt: PRODUCT, cls: 'w700', w: .8 * 1080, size: 100, type: 1, css: 'color:#0B1220' }], 'c');
    const cr = PTS.map(p => TB(sc, [{ txt: p, cls: 'w300', size: 58, css: 'color:#3B4A66' }], 'c'));
    add(sc, t => { cam(sc, {}); P(g, { x: 540, y: 960 });
      P(tg, { x: 540, y: H_(.36), o: t >= 2.7 ? 1 : 0 }); typeOn(tg.lines[0], t, 2.7, 1.5);
      cr.forEach((c, i) => P(c, { x: 540, y: H_(.5 + i * .07), ...pop(t, 3.1 + i * .22, 30, 1.05) }));
      flashIO(t, 2.6, 4.2); }, TONE); }
  closing(4.2, DUR);
}
