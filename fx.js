// fx.js — scroll-driven particle morph (ring → orbit halo → horizon wave → galaxy), white · sky · silver
// window.FX.target = 0..3 (set by the page from scroll position); window.FX.dim = 0..1 (fade when the gallery is in view)
(function () {
  const cv = document.getElementById('fx'); if (!cv) return;
  const gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  window.FX = { target: 0, dim: 0, P: 0, pulse(k = 1) { this.P = Math.min(1.6, this.P + k); } };
  if (!gl) { cv.style.display = 'none'; return; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = innerWidth < 760 ? 3000 : 5600;
  const R1 = new Float32Array(N), R2 = new Float32Array(N), R3 = new Float32Array(N), D = new Float32Array(N), STAR = new Uint8Array(N);
  let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) { R1[i] = rnd(); R2[i] = rnd(); R3[i] = rnd(); D[i] = rnd(); STAR[i] = rnd() < 0.09 ? 1 : 0; }
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N), alp = new Float32Array(N);
  const PAL = [[0.23, 0.55, 1.0], [0.11, 0.36, 1.0], [0.52, 0.58, 0.68], [0.62, 0.77, 1.0], [0.07, 0.20, 0.60], [0.74, 0.79, 0.86]];
  for (let i = 0; i < N; i++) {
    // colour follows the particle's ring angle → a smooth sky-blue → deep-blue → silver sweep that survives every morph
    const g = 0.5 + 0.5 * Math.cos(6.2832 * (R1[i] - 0.12)), h = 0.5 + 0.5 * Math.cos(6.2832 * (R1[i] - 0.62));
    const A = PAL[1], B = PAL[2], C = PAL[0]; let c = [0, 1, 2].map(j => A[j] * g + B[j] * h * 0.9 + C[j] * (1 - g) * (1 - h * 0.9));
    const m = Math.max(1e-3, g + h * 0.9 + (1 - g) * (1 - h * 0.9)); c = c.map(v => Math.min(1, v / m));
    if (STAR[i]) c = R3[i] < .5 ? PAL[5] : PAL[3]; if (R3[i] > .965) c = PAL[4];
    col.set(c, i * 3);
    const big = D[i] > 0.982; siz[i] = big ? 12 + R2[i] * 10 : 2.1 + R1[i] * 2.4 + (STAR[i] ? 0.4 : 0);
    alp[i] = big ? 0.13 : 0.72 + R2[i] * 0.28;
  }
  const VS = `attribute vec3 aPos;attribute vec3 aCol;attribute float aSize;attribute float aA;uniform vec2 uRes;uniform float uDpr,uDim,uScale,uAlpha;varying vec3 vC;varying float vA;
  void main(){float z=aPos.z+3.4;vec2 p=aPos.xy*2.55/z;p.x*=uRes.y/uRes.x;gl_Position=vec4(p,0.,1.);gl_PointSize=aSize*uScale*uDpr*(3.4/z);vC=aCol;vA=uAlpha*aA*clamp(1.6-z*0.15,0.25,1.)*(1.-uDim*0.72);}`;
  const FS = `precision mediump float;varying vec3 vC;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float a=smoothstep(.5,.0,d);gl_FragColor=vec4(vC,a*vA);}`;
  const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = (data, name, n, dyn) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); return b; };
  const bPos = buf(pos, 'aPos', 3, true); buf(col, 'aCol', 3); buf(siz, 'aSize', 1); buf(alp, 'aA', 1);
  const uRes = gl.getUniformLocation(pr, 'uRes'), uDpr = gl.getUniformLocation(pr, 'uDpr'), uDim = gl.getUniformLocation(pr, 'uDim'), uScale = gl.getUniformLocation(pr, 'uScale'), uAlpha = gl.getUniformLocation(pr, 'uAlpha');
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(uRes, cv.width, cv.height); gl.uniform1f(uDpr, dpr); };
  addEventListener('resize', resize); resize();

  const TAU = Math.PI * 2; let OX = 0, OY = 0, OZ = 0;
  const star = (i, t) => { OX = (R1[i] * 2 - 1) * 2.9 + Math.sin(t * .1 + i) * .02; OY = (R2[i] * 2 - 1) * 1.7 + Math.cos(t * .12 + i) * .02; OZ = R3[i] * 3 - 1.1; };
  // 0 · hero ring made of meridian strands (like a breathing glass torus)
  function ring(i, t) {
    if (STAR[i]) return star(i, t);
    const a = (Math.floor(R1[i] * 180) / 180 + (R3[i] - .5) * .0016) * TAU, b = R2[i] * 2 - 1;
    const R = 1.02 + .09 * Math.sin(a * 3 + t * .7) + .05 * Math.sin(a * 7 - t * 1.1) + .03 * Math.sin(b * 9 + t * 2);
    const r = R + b * .085; OX = r * Math.cos(a); OY = r * Math.sin(a) + .05; OZ = b * .22 + .14 * Math.sin(a * 5 + t * .9);
  }
  // 1 · flat orbit halo around the template carousel (tilted ellipse)
  function halo(i, t) {
    if (STAR[i]) return star(i, t);
    const a = R1[i] * TAU + t * .22, b = R2[i] * 2 - 1, r = 1.62 + b * .13 + .04 * Math.sin(a * 6 + t);
    const x = r * Math.cos(a), zz = r * Math.sin(a), y = b * .045 + .03 * Math.sin(a * 9 - t * 1.4) - .08;
    OX = x; OY = y * .955336 - zz * .295520 - .06; OZ = (y * .295520 + zz * .955336) * .9;
  }
  // 2 · horizon wave (a field of points rolling under the steps)
  function wave(i, t) {
    if (STAR[i]) return star(i, t);
    const x = (R1[i] * 2 - 1) * 2.8, z = R2[i] * 2.6 - .7;
    OX = x; OZ = z; OY = -.66 + .10 * Math.sin(x * 1.5 + t * .8) * Math.cos(z * 1.7 + t * .55) + .045 * Math.sin(x * 4.2 + t * 1.5) + (R3[i] - .5) * .02;
  }
  // 3 · galaxy (three arms, tilted) — "always growing"
  function galaxy(i, t) {
    if (STAR[i]) return star(i, t);
    let x, zz, y;
    if (R3[i] < .14) { const r = .05 + .22 * Math.pow(R1[i], 1.6), a = R2[i] * TAU; x = r * Math.cos(a); zz = r * Math.sin(a); y = (D[i] - .5) * .12; }
    else { const r = .14 + 1.55 * Math.pow(R1[i], .72), arm = Math.floor(R2[i] * 3), a = arm * TAU / 3 + r * 2.5 + t * .16 + (R3[i] - .5) * .55; x = r * Math.cos(a); zz = r * Math.sin(a); y = (D[i] - .5) * .06 * (1.6 - r); }
    OX = x; OY = y * .435682 - zz * .900100 + .05; OZ = y * .900100 + zz * .435682;
  }
  const SH = [ring, halo, wave, galaxy];
  let cur = 0, mx = 0, my = 0, tmx = 0, tmy = 0, t0 = performance.now(), last = t0, run = true, frozen = false;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  document.addEventListener('visibilitychange', () => { run = !document.hidden; if (run) { last = performance.now(); requestAnimationFrame(loop); } });
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  function loop(now) {
    if (!run) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const F = window.FX;
    // gallery covers the screen → keep the last frame and idle (glass + scrolling stay smooth)
    if ((F.dim || 0) > .97 && Math.abs(F.target - cur) < .002 && F.P < .01) { if (!frozen) frozen = true; setTimeout(() => requestAnimationFrame(loop), 200); return; }
    frozen = false;
    const t = reduce ? 0 : (now - t0) / 1000;
    const kk = 1 - Math.pow(1 - .085, dt * 60);             // frame-rate independent easing (same feel at 60/120 Hz)
    cur += (F.target - cur) * kk; mx += (tmx - mx) * kk * .6; my += (tmy - my) * kk * .6; F.P *= Math.pow(.93, dt * 60); const PK = F.P;
    const k = Math.min(SH.length - 1, Math.floor(cur)), f = cur - k, A = SH[k], B = SH[Math.min(SH.length - 1, k + 1)], mix = f > 0.001 && B !== A;
    const ry = mx * .35 + Math.sin(t * .07) * .08, rx = my * .18, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    for (let i = 0; i < N; i++) {
      A(i, t); let x = OX, y = OY, z = OZ;
      if (mix) { const u = ease((f - D[i] * .32) / .68); if (u > 0) { B(i, t); x += (OX - x) * u; y += (OY - y) * u; z += (OZ - z) * u; } }
      const pk = 1 + PK * (0.16 + 0.10 * R2[i]); x *= pk; y *= pk; z *= pk;
      const x2 = x * cy + z * sy, z2 = -x * sy + z * cy, j = i * 3;
      pos[j] = x2; pos[j + 1] = y * cx - z2 * sx; pos[j + 2] = y * sx + z2 * cx;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.uniform1f(uDim, F.dim || 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uScale, 5.0); gl.uniform1f(uAlpha, 0.07); gl.drawArrays(gl.POINTS, 0, N);   // soft glow pass
    gl.uniform1f(uScale, 1.0); gl.uniform1f(uAlpha, 1.0); gl.drawArrays(gl.POINTS, 0, N);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
