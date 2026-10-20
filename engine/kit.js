// kit.js — shared builders + the reference move set (from ep06)
const INK='#0B1220', SUB='#3B4A66';
const VIEW=document.getElementById('view');
const vblur=(b,br=1)=>{VIEW.style.filter=b>0.3||br!==1?`blur(${b.toFixed(1)}px) brightness(${br.toFixed(3)})`:'none';};
const R0=-1/30;
const ICON=n=>`assets/icons/${n}.png`, UI=n=>`assets/ui_real/pc/${n}.png`, MOB=n=>`assets/ui_real/mobile/clean/mobile_${n}_clean.png`;
const PRODS=['airfryer','serum','sneakers','perfume','smartwatch','handbag','earbuds','blender','lipstick','milk','coffee','powerbank','plush','creamjar','eyemassager','sunscreen'];
// ---------- builders ----------
function glassCard(parent,w,h,inner='',r=36,css=''){return nd(parent,`<div class="glass c" style="width:${w}px;height:${h}px;border-radius:${r}px;${css}">${inner}</div>`);}
function chip(parent,label,icon='',cls='',size=38){return nd(parent,`<div class="pill c ${cls}" style="font-size:${size}px">${icon}<span>${label}</span></div>`);}
function macWin(parent,title,src,w){return nd(parent,`<div class="win c" style="width:${w}px"><div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i><b>${title}</b></div><img src="${src}"></div>`);}
function phone(parent,w,h,inner){return nd(parent,`<div class="phone c" style="width:${w}px;height:${h}px"><div class="scr">${inner}<div class="isl"></div></div></div>`);}
const AV=(c1,c2,s=58)=>`<div class="av" style="width:${s}px;height:${s}px;background:linear-gradient(135deg,${c1},${c2})"></div>`;
const CHECK=(s=40)=>`<svg width="${s}" height="${s}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#34C759"/><path d="M11 20.5l6 6 12-13" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CARTI=(s=30)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4" fill="#fff"/><circle cx="17" cy="20" r="1.4" fill="#fff"/></svg>`;
const PLAYS=(z,x='50%',y='50%')=>`<div style="position:absolute;left:${x};top:${y};width:${z}px;height:${z}px;margin:-${z/2}px;flex:none;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 8px 20px rgba(16,42,94,.2);display:flex;align-items:center;justify-content:center"><svg width="${z*.42}" height="${z*.42}" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#0A55EA"/></svg></div>`;
const CURSOR=`<svg width="78" height="78" viewBox="0 0 32 32"><path d="M6 3l18 13-8 1.5 4.6 9.2-3.4 1.6-4.6-9.3L6 25z" fill="#0B1220" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
function prodCard(parent,p,price,name,w=420){return glassCard(parent,w,w*0.42,`<img src="${PROD(p)}" style="position:absolute;left:10px;top:8px;width:${w*0.38}px;height:${w*0.38}px;object-fit:contain"><div style="position:absolute;left:${w*0.42}px;top:${w*0.07}px;font:600 ${w*0.065}px Anuphan;color:${INK}">${name}</div><div style="position:absolute;left:${w*0.42}px;top:${w*0.17}px;font:800 ${w*0.095}px Inter;color:#0A55EA">${price}</div><div class="cart" style="left:${w*0.42}px;top:${w*0.30}px;padding:3px 12px;font-size:${w*0.045}px">${CARTI(w*0.05)}ตะกร้า</div>`,w*0.07);}
function rippleNode(parent){return nd(parent,`<div class="c" style="width:220px;height:220px;border-radius:50%;border:5px solid #3A86FF"></div>`);}
const sheenHTML=`<div class="sheen"></div>`;
function textSheen(node,u){const s=node.querySelector('.sheen');if(s){s.style.transform=`translateX(${lerp(-120,120,u)}%)`;s.style.opacity=u>0&&u<1?1:0;}}
const q=t=>window.TQ??t;
const FI=(f,a,n=2)=>clamp((f-a+0.5)/n), FO=(f,b,n=2)=>clamp((b-f)/n);   // soft appear / disappear (≈2 frames) instead of hard pops
const num=n=>Math.round(n).toLocaleString('en-US');

// ---------- reference move set, reused for the new ending (all values from the bible) ----------
const G30=(t,t0)=>(t-t0)*30;
function slam(t,t0,r0=-14,s0=1.7){if(G30(t,t0)<-0.5)return {o:0};return {o:1,s:KF(t,t0,[[-0.5,s0+1.3],[0,s0],[1,1.25],[2,1.15],[3,1.10],[4,1.07],[5,1.05],[6,1.03],[7,1.02],[8,1.0]]),rz:KF(t,t0,[[0,r0],[1,r0*0.93],[8,0]]),blur:KF(t,t0,[[-0.5,30],[0,18],[1,7],[3,0]])};}
function rollIn(t,t0,r0=62){if(t<t0)return {o:0};const g=G30(t,t0);return {o:1,rz:r0*Math.pow(0.77,g),s:1+1.3*Math.pow(0.77,g),blur:12*Math.pow(0.55,g)};}
function shootIn(t,t0){if(t<t0)return {o:0,dx:0,dy:0};const u=E.in(clamp(G30(t,t0)/4));return {o:1,dx:-(1-u)*320,dy:-(1-u)*220,rz:KF(t,t0,[[0,54],[1,50],[2,23],[3,2],[4,0]]),blur:(1-u)*14};}
function rollOut(t,t0){const g=G30(t,t0);if(g<0)return {rz:0,s:1,blur:0};return {rz:KF(t,t0,[[0,0],[1,3.7],[2,6.8],[3,11.6],[4,15.4],[5,19.2],[6,24.2],[7,33.1]]),s:KF(t,t0,[[0,1],[7,0.7,E.out]]),blur:KF(t,t0,[[2,0],[7,10]])};}
function pushOut(t,t0){const g=G30(t,t0);if(g<0)return {s:1,rz:0,blur:0};return {s:KF(t,t0,[[0,1.0],[1,1.03],[2,1.07],[3,1.14],[4,1.25],[5,1.41],[6,1.79],[7,2.5],[8,3.6]]),rz:KF(t,t0,[[0,0],[8,22]]),blur:KF(t,t0,[[3,0],[8,24]])};}
function dropIn(t,t0){if(t<t0)return {o:0};return {o:1,dy:KF(t,t0,[[0,-0.62],[2,-0.2],[3,-0.12],[7,-0.05],[15,0]])*1920,s:KF(t,t0,[[0,2],[2,1.6],[3,1.35],[7,1.15],[15,1.0]]),rz:KF(t,t0,[[0,-10],[2,-7.1],[15,-1],[17,0]]),blur:KF(t,t0,[[0,30],[2,14],[5,0]])};}
const DOLLY=[[0,0.01],[1,0.104],[2,0.32],[3,0.47],[4,0.57],[5,0.64],[6,0.67],[9,0.72],[15,0.8],[30,0.9],[60,1.0]];
const bokeh=(sc,n,seed)=>{const R=SEED(seed);return [...Array(n)].map(()=>{const s=120+R()*200;const d=nd(sc,`<div class="c" style="width:${s}px;height:${s}px;border-radius:50%;background:radial-gradient(circle,rgba(127,179,255,.85) 0%,rgba(190,220,255,.55) 45%,rgba(190,220,255,0) 70%)"></div>`);d.x=R()*1080;d.y=R()*1920;d.v=R()*30+10;return d;});};


// ---------- footage / comparison-clip frames ----------
const FT=(id,t,t0,loop=false)=>{const M=window.FOOT[id];let f=Math.floor((q(t)-t0)*30);f=loop?((f%M.n)+M.n)%M.n:Math.max(0,Math.min(M.n-1,f));return `assets/foot/${id}/f${String(f+1).padStart(4,'0')}.jpg`;};
const CLIP=(ab,sec)=>{const n=ab==='A'?1587:1391;const f=Math.max(1,Math.min(n,Math.floor(sec*30+1e-6)+1));return `assets/clips/${ab}/f${String(f).padStart(4,'0')}.jpg`;};
function setSrc(img,src){if(img._s!==src){img.src=src;img._s=src;}}
