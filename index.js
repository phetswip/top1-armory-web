// index.js — the gallery home page (index.html): account slot, cinematic titles, particle scroll, 3D template ring, style grid.
// Moved out of an inline <script> so the page can run under CSP script-src 'self'. Uses app.js globals (h, safeUrl, getJSON, apiUrl, badges, openMake …).
window.T1Auth&&T1Auth.mountNav();
// ---- cinematic titles: graphemes fly in from depth one by one, .slamw words slam with flash + particle pulse + shake
const SEG=new Intl.Segmenter('th',{granularity:'grapheme'});
function cine(el,start,state){let t=start;
 const walk=n=>{[...n.childNodes].forEach(c=>{
  if(c.nodeType===3){const f=document.createDocumentFragment();for(const {segment:g} of SEG.segment(c.textContent)){if(/\s/.test(g)){f.appendChild(document.createTextNode(g));t+=60;continue;}const sp=document.createElement('span');sp.className='ch';sp.textContent=g;sp.style.setProperty('--d',t+'ms');f.appendChild(sp);t+=34;}c.replaceWith(f);}
  else if(c.nodeType===1&&c.classList.contains('slamw')){t+=140;c.classList.add('slam');c.style.setProperty('--d',t+'ms');state.slams.push(t);t+=420;}
  else if(c.nodeType===1&&c.tagName!=='BR')walk(c);});};
 walk(el);return t;}
const heroState={slams:[]};let tt=0;
document.querySelectorAll('#htitle .cine').forEach(el=>{tt=cine(el,el.dataset.start?+el.dataset.start:tt,heroState);});
const others=[...document.querySelectorAll('.cine')].filter(e=>!e.closest('#htitle'));others.forEach(el=>{el._st={slams:[]};cine(el,0,el._st);});
function fireHero(){const h=document.getElementById('hero');h.classList.add('in-hero');document.querySelectorAll('#htitle .cine').forEach(e=>e.classList.add('in'));
 heroState.slams.forEach((ms,i)=>setTimeout(()=>{FX.pulse(i?1.25:.9);const f=document.getElementById('hflash');f.classList.remove('on');void f.offsetWidth;f.classList.add('on');
  const ti=document.getElementById('htitle');ti.classList.remove('shake');void ti.offsetWidth;ti.classList.add('shake');},ms+120));}
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');(e.target._st?.slams||[]).forEach(ms=>setTimeout(()=>FX.pulse(.55),ms+120));cio.unobserve(e.target);}}),{threshold:.4});
others.forEach(e=>cio.observe(e));
setTimeout(fireHero,250);   // timer, not rAF: starts even if the first frames are delayed
if(!('IntersectionObserver' in window))document.querySelectorAll('.cine,.fade,.rv').forEach(e=>e.classList.add('in'));
// ---- blur-in reveals (split by spaces into words)
document.querySelectorAll('.rv').forEach(el=>{let i=0;const walk=n=>{[...n.childNodes].forEach(c=>{if(c.nodeType===3){const parts=c.textContent.split(/(\s+)/);const f=document.createDocumentFragment();parts.forEach(p=>{if(!p)return;if(/^\s+$/.test(p)){f.appendChild(document.createTextNode(p));return;}const s=document.createElement('span');s.className='w';s.style.setProperty('--i',i++);s.textContent=p;f.appendChild(s);});c.replaceWith(f);}else if(c.nodeType===1){if(c.children.length===0&&c.textContent.trim()){c.classList.add('w');c.style.setProperty('--i',i++);}else walk(c);}});};walk(el);});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.25});
document.querySelectorAll('.rv,.fade').forEach(e=>io.observe(e));
// ---- scroll → particle shape (0 ring · 1 halo · 2 wave · 3 galaxy) + dim over the gallery
const secs=['hero','templates','how','orbit'].map(id=>document.getElementById(id)),gal=document.getElementById('armory'),tplS=document.getElementById('templates');
let mids=[],galTop=0,tplTop=0,tplH=1,ticking=false;
function measure(){mids=secs.map(s=>s.offsetTop+s.offsetHeight/2);galTop=gal.offsetTop;tplTop=tplS.offsetTop;tplH=tplS.offsetHeight;onScroll();}
function onScroll(){ticking=false;const c=scrollY+innerHeight/2;let tg=0;
 if(c<=mids[0])tg=0;else if(c>=mids[3])tg=3;else for(let i=0;i<3;i++){if(c>=mids[i]&&c<mids[i+1]){tg=i+(c-mids[i])/(mids[i+1]-mids[i]);break;}}
 FX.target=tg;const g=galTop-scrollY;FX.dim=Math.max(0,Math.min(1,1-g/innerHeight));
 window.__tplP=Math.max(0,Math.min(1,(scrollY-tplTop)/(tplH-innerHeight)));}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll);}},{passive:true});addEventListener('resize',measure);addEventListener('load',measure);measure();
// ---- 3D template carousel (real preset videos; only the front card plays)
let ALL=[],CAT='';
const shortTitle=t=>String(t||'').split(/[:(]/)[0].trim();
function buildRing(list){const spin=document.getElementById('spin');if(!list.length)return;
 const by={};list.forEach(x=>(by[x.category]=by[x.category]||[]).push(x));const qs=Object.values(by),mix=[];for(let r=0;mix.length<list.length;r++)qs.forEach(q=>{if(q[r])mix.push(q[r]);});
 const cards=[];while(cards.length<8)cards.push(...mix);cards.length=Math.max(8,Math.min(14,cards.length));
 const n=cards.length,w=document.getElementById('ring').offsetWidth,R=Math.round((w/2)/Math.tan(Math.PI/n)*1.18);
 spin.replaceChildren(...cards.map((s,i)=>{const v=h('video',{muted:true,loop:true,playsinline:true,preload:'none'});v.dataset.src=safeUrl(s.video);
  return h('a',{class:'tcard',href:styleHref(s.id),'data-k':i,style:`transform:rotateY(${i*360/n}deg) translateZ(${R}px)`},
   h('img',{src:s.thumb,alt:'',loading:'lazy',decoding:'async'}),v,h('i',{class:'dimv'}),
   h('div',{class:'lab'},shortTitle(s.title),h('small',null,`${Math.round(+s.duration||0)} วิ · ${s.category||''}`)));}));
 const els=[...spin.children];let playing=-1,t0=performance.now();
 let sp=0,lastT=performance.now();const tick=now=>{const dt=Math.min(.05,(now-lastT)/1000);lastT=now;sp+=((window.__tplP||0)-sp)*(1-Math.pow(1-.12,dt*60));const ang=(now-t0)/1000*9+sp*300;spin.style.transform=`translateZ(${-R}px) rotateY(${-ang}deg)`;
  let best=-1,bd=1e9;els.forEach((el,i)=>{let d=((i*360/n-ang)%360+540)%360-180;const ad=Math.abs(d);if(ad<bd){bd=ad;best=i;}const o=(Math.min(1,ad/150)*.42).toFixed(2);if(el._o!==o){el.querySelector('.dimv').style.opacity=o;el._o=o;}});
  if(best!==playing){els.forEach((el,i)=>{const v=el.querySelector('video');if(i===best){if(!v.src&&v.dataset.src)v.src=v.dataset.src;v.style.opacity=1;v.play().catch(()=>{});}else{v.pause();v.style.opacity=0;}});playing=best;}
  const mx=(window.__mx||0),my=(window.__my||0);[['s1',-18],['s2',14],['s3',-10]].forEach(([id,k])=>{const e=document.getElementById(id);if(e)e.style.transform=`translate3d(${mx*k}px,${my*k+Math.sin(now/1300+k)*6}px,0)`;});
  requestAnimationFrame(tick);};requestAnimationFrame(tick);}
addEventListener('pointermove',e=>{window.__mx=e.clientX/innerWidth-.5;window.__my=e.clientY/innerHeight-.5;});
// ---- gallery
function card(s,i){const href=styleHref(s.id);
 const vd=h('video',{muted:true,loop:true,playsinline:true,preload:'none',src:s.video,style:'opacity:0'});
 const vid=h('a',{class:'vid',href},h('img',{src:s.thumb,alt:'',loading:'lazy',decoding:'async'}),vd,h('span',{class:'dur'},`${Math.round(+s.duration||0)} วิ · ${s.ratio||'9:16'}`));
 vid.onmouseenter=()=>vd.play().then(()=>vd.style.opacity=1).catch(()=>{});vid.onmouseleave=()=>{vd.pause();vd.style.opacity=0;};
 return h('div',{class:'card fade',style:`transition-delay:${(i%4)*80}ms`},vid,
  h('div',{class:'body'},h('div',{class:'cat'},s.category||''),h('a',{class:'ttl',href},s.title||s.id),h('div',{class:'sum'},s.summary||''),
   h('div',null,badges(s.meta,false)),
   h('div',{class:'acts'},h('button',{class:'btn sm',type:'button',onclick:()=>openMake(s)},'ทำคอนเทนต์แบบนี้'),h('a',{class:'btn sm ghost',href},'รายละเอียด'))));}
const render=()=>{const q=document.getElementById('q').value.trim().toLowerCase();
 const rows=ALL.filter(s=>(!CAT||s.category===CAT)&&(!q||JSON.stringify([s.title,s.summary,s.tags,s.category]).toLowerCase().includes(q)));
 const g=document.getElementById('g');
 g.replaceChildren(...(rows.length?rows.map(card):[h('div',{class:'empty'},LOAD_ERR||'ยังไม่มีสไตล์ที่ตรงกับคำค้น')]));
 g.querySelectorAll('.fade').forEach(e=>io.observe(e));measure();};
let LOAD_ERR='';
const loadStyles=CFG_READY?getJSON(apiUrl('public/styles')).then(d=>Array.isArray(d)?d:(d.styles||[])):Promise.reject(new Error('cfg'));
loadStyles.catch(e=>{LOAD_ERR=e.message==='cfg'?'เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js)':'โหลดคลังไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง';return [];})
 .then(d=>new Promise(ok=>setTimeout(()=>ok(d),scrollY<innerHeight*.5?2300:0))).then(d=>{ALL=d.filter(s=>s&&s.id);document.getElementById('sn').textContent=ALL.length;buildRing(ALL);
 const cats=[...new Set(ALL.map(s=>s.category).filter(Boolean))];
 const chip=(c,label)=>h('button',{class:'chip'+(c===''?' on':''),type:'button','data-c':c,onclick:e=>{CAT=c;document.querySelectorAll('#cats .chip').forEach(x=>x.classList.toggle('on',x===e.currentTarget));render();}},label);
 document.getElementById('cats').replaceChildren(chip('','ทั้งหมด'),...cats.map(c=>chip(c,c.split(' (')[0])));render();});
document.getElementById('q').oninput=render;
