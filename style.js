// style.js — one style's detail page (style.html?id=…). Moved out of an inline <script> so the page can run under CSP script-src 'self'.
// style detail: GET {functionsBase}/armory-api/public/style?id=<id> — teaser playbook for everyone; the student's key (header x-armory-key:
// the logged-in account's key, else a key remembered in this browser) unlocks the full playbook · style.html?id=…#make opens the dialog (back from login)
if(window.T1Auth)T1Auth.mountNav();
const id=new URLSearchParams(location.search).get('id')||'';
const W=document.getElementById('w');
const fail=msg=>W.replaceChildren(h('div',{class:'panel'},h('h2',null,'เปิดสไตล์ไม่ได้'),h('div',{class:'muted'},msg),h('div',{class:'row',style:'margin-top:14px'},h('a',{class:'btn sm',href:'./#armory'},'กลับไปเลือกสไตล์'))));
const fmt2=v=>(Math.round((+v||0)*100)/100).toFixed(2);
function show(s){
 document.title=(s.title||s.id)+' · คลังแสง TOP 1';
 const tags=Array.isArray(s.tags)?s.tags:[];
 const qs=s.brief_questions||s.briefQuestions||s.questions||[];
 const beats=Array.isArray(s.beats)?s.beats:[];
 const nBeats=beats.length||+(s.beat_count??s.beatCount??s.counts?.beats??0)||0;
 const teaser=typeof s.playbook==='string'?s.playbook:(s.playbook_teaser||s.teaser||'');
 const mk=h('button',{class:'btn',id:'mk1',type:'button',onclick:()=>openMake(s)},'ทำคอนเทนต์แบบนี้');
 // live brand preview (engine/preview.html inside a scaled 1080×1920 iframe)
 const inp=(id,val,extra)=>h('input',Object.assign({type:'text',id,value:val},extra||{}));
 const pv=h('iframe',{id:'pv',title:'พรีวิว',style:'width:1080px;height:1920px;border:0;transform:scale(.25);transform-origin:0 0;position:absolute;left:0;top:0;pointer-events:none'});
 const fields={pb:inp('pb','แบรนด์ของคุณ',{maxlength:28}),pp:inp('pp','สินค้าที่ใช่สำหรับคุณ',{maxlength:40}),pt:inp('pt','ส่งไว ภายใน 24 ชม.|ของแท้ 100%|รีวิวเพียบ'),
  pr:inp('pr','590'),po:inp('po','990'),pc:inp('pc','ทักแชทเลย',{maxlength:24}),pk:h('input',{type:'color',id:'pk',value:'#0A55EA',style:'width:64px;height:40px;border:0;background:none;padding:0'})};
 const lab=t=>h('label',null,t);
 const info=h('div',null,
  h('div',{class:'cat'},s.category||''),h('h1',{style:'font:800 30px Anuphan;margin:6px 0 8px'},s.title||s.id),h('div',{class:'sum',style:'-webkit-line-clamp:unset;font-size:16px'},s.summary||''),
  h('div',{class:'tags',style:'margin:12px 0'},tags.map(t=>h('span',{class:'tag'},t))),
  h('div',{class:'badges',style:'margin:4px 0 14px'},badges(s.meta)),
  h('div',{class:'row'},mk),
  h('div',{class:'panel',style:'margin-top:18px'},h('h2',null,'ลองใส่แบรนด์ของคุณ'),h('div',{class:'muted'},'พิมพ์แล้วดูพรีวิว 6 วิด้านล่างขยับเป็นแบรนด์คุณทันที (ตัวอย่างโครง — งานจริง Claude ทำเต็มตามสไตล์นี้)'),
   h('div',{class:'cols2',style:'margin-top:6px'},
    h('div',null,lab('ชื่อแบรนด์'),fields.pb,lab('สินค้า / ประโยคเด็ด'),fields.pp,lab('จุดขาย 3 ข้อ (คั่นด้วย |)'),fields.pt),
    h('div',null,lab('ราคา'),fields.pr,lab('ราคาปกติ (ไม่ใส่ก็ได้)'),fields.po,lab('ปุ่ม CTA'),fields.pc,lab('สีแบรนด์'),fields.pk)),
   h('div',{style:'display:flex;justify-content:center;margin-top:16px'},h('div',{style:'width:270px;height:480px;border-radius:26px;overflow:hidden;box-shadow:0 26px 60px rgba(16,42,94,.2),0 0 0 6px #fff;background:#F5F8FD;position:relative'},pv))),
  h('div',{class:'panel'},h('h2',null,'Claude จะได้อะไรจากสไตล์นี้'),h('div',{class:'muted'},`คลิปตัวอย่างทีละเฟรม · บทพูดพร้อมเวลาคำสำคัญ · ลำดับฉาก${nBeats?' '+nBeats+' ฉาก':''} · แผนเพลงและเสียงประกอบ · คู่มือวิธีทำ · โค้ดตั้งต้น`)),
  qs.length?h('div',{class:'panel'},h('h2',null,'Claude จะถามคุณ'),h('ol',{style:'font:400 15px Anuphan;line-height:1.7;margin:6px 0 0;padding-left:20px'},qs.map(q=>h('li',null,q)))):null);
 const video=h('video',{controls:true,playsinline:true,preload:'metadata',poster:s.thumb,src:s.video});
 const parts=[h('div',{class:'detail'},h('div',null,video),info)];
 if(s.sheet)parts.push(h('div',{class:'panel'},h('h2',null,'ภาพรวมทั้งคลิป'),h('img',{src:s.sheet,alt:'ภาพรวมทั้งคลิป',loading:'lazy',style:'width:100%;border-radius:14px'})));
 if(beats.length)parts.push(h('div',{class:'panel'},h('h2',null,'ลำดับฉาก'),h('div',{class:'tw'},h('table',null,
  h('tr',null,h('th',null,'ฉาก'),h('th',null,'เวลา'),h('th',null,'หน้าที่'),h('th',null,'เสียง')),
  beats.map(b=>h('tr',null,h('td',null,h('b',null,b.id??'')),h('td',{style:'white-space:nowrap'},`${fmt2(b.start)}–${fmt2(b.end)}`),h('td',null,b.purpose||''),h('td',{class:'muted'},String(b.voice||'').slice(0,140))))))));
 const locked=s.locked!==false;
 parts.push(h('div',{class:'panel'},h('h2',null,'คู่มือสไตล์'),!locked?h('div',{class:'muted',style:'margin-bottom:8px'},'✓ คู่มือเต็ม (ปลดล็อกด้วยคีย์นักเรียนของคุณ)'):null,teaser?h('div',{class:'md'},teaser):null,
  locked?h('div',{class:'step',style:teaser?'margin-top:14px':''},h('h3',null,'🔒 คู่มือเต็มสำหรับนักเรียน'),h('div',{class:'muted'},'วิธีทำทีละขั้น จังหวะทุกฉาก บทพูดพร้อมเวลา และโค้ดตั้งต้น — เปิดได้เมื่อเข้าสู่ระบบนักเรียน (หรือใช้คีย์ในปุ่ม "ทำคอนเทนต์แบบนี้") และ Claude ในแอปเปิดได้เมื่อเชื่อมคลังแสงแล้ว')):null));
 W.replaceChildren(...parts);
 if(location.hash==='#make'){try{history.replaceState(null,'',location.pathname+location.search);}catch{}openMake(s);}
 const STY={'ทายผล / Blind test':'quiz','หนัง & อนิเมะ AI':'film','สยองขวัญ & VFX':'film'}[s.category]||'kinetic';
 let tmr=0;
 const upd=()=>{const q=new URLSearchParams({style:STY,brand:fields.pb.value,product:fields.pp.value,pts:fields.pt.value,price:fields.pr.value,old:fields.po.value,cta:fields.pc.value,color:fields.pk.value});pv.src='engine/preview.html?'+q;};
 Object.values(fields).forEach(el=>el.addEventListener('input',()=>{clearTimeout(tmr);tmr=setTimeout(upd,450);}));upd();
}
if(!id)fail('ลิงก์ไม่มีรหัสสไตล์ — กลับไปเลือกสไตล์จากคลัง');
else if(!CFG_READY)fail('เว็บยังไม่ได้ตั้งค่าเชื่อมเซิร์ฟเวอร์ (config.js)');
else pageKey().catch(()=>LS.k).then(k=>getJSON(apiUrl('public/style?id='+encodeURIComponent(id)),k?{headers:{'x-armory-key':k}}:undefined)).then(d=>{const s=d&&(d.style||d);if(!s||!s.id)throw Object.assign(new Error(''),{status:404});show(s);})
 .catch(e=>fail(e.status===404?'ไม่พบสไตล์นี้ในคลัง (อาจถูกปิดหรือย้ายแล้ว)':(e.message||'โหลดไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง')));
