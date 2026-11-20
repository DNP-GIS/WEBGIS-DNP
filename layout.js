// Tata letak v5: sidebar & panel bawah bisa di-resize, di-collapse, maximize, mode peta penuh.
// Ukuran diingat di localStorage (kunci dnp_v5_layout). Tidak menyimpan kredensial.
(function(){
'use strict';
const KEY='dnp_v5_layout';
const $=id=>document.getElementById(id);
const mobile=()=>window.matchMedia('(max-width:760px)').matches;
const root=document.documentElement;
const LS={side:392,dock:300,collapsed:false,dockOpen:true,dockMax:false,fullmap:false,cari:true};

function load(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');Object.assign(LS,s)}catch(e){}
}
function save(){
 try{localStorage.setItem(KEY,JSON.stringify({side:LS.side,dock:LS.dock,collapsed:LS.collapsed,dockOpen:LS.dockOpen,dockMax:LS.dockMax,fullmap:LS.fullmap,cari:LS.cari}))}catch(e){}
}
function cssNum(v){root.style.setProperty(v[0],v[1])}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function mapResize(){
 try{
  if(window.Atlas&&Atlas.map){Atlas.map.invalidateSize({pan:false});if(Atlas.fitLegend)Atlas.fitLegend()}
  else if(typeof L!=='undefined'){const el=$('map');if(el&&el._leaflet_id){/* leaflet map via app */}}
 }catch(e){}
 window.dispatchEvent(new Event('resize'));
}

function apply(opts){
 if(opts&&opts.skipSave){/* */ }
 const m=mobile();
 if(!m){
  root.style.setProperty('--side',LS.side+'px');
  root.style.setProperty('--dockh',LS.dock+'px');
  root.style.setProperty('--map-left',(LS.collapsed||LS.fullmap)?'0px':LS.side+'px');
 }else{
  root.style.setProperty('--side','0px');
  root.style.setProperty('--map-left','0px');
 }
 document.body.classList.toggle('collapsed',!m&&(LS.collapsed||LS.fullmap));
 document.body.classList.toggle('fullmap',!!LS.fullmap);
 document.body.classList.toggle('dock-max',!!LS.dockMax&&!LS.fullmap);
 const dockOpen=LS.fullmap?false:(LS.dockMax||LS.dockOpen);
 document.body.classList.toggle('dock-open',dockOpen);
 const tg=$('toggle');if(tg)tg.setAttribute('aria-expanded',m?String($('panel').classList.contains('open')):String(!(LS.collapsed||LS.fullmap)));
 const fm=$('fullMapBtn');if(fm){fm.setAttribute('aria-pressed',String(!!LS.fullmap));fm.title=LS.fullmap?'Kembali ke tampilan panel':'Sembunyikan panel, fokus ke peta'}
 const dm=$('dockMax');if(dm)dm.setAttribute('aria-pressed',String(!!LS.dockMax&&!LS.fullmap));
 const dt=$('dockToggle');if(dt)dt.setAttribute('aria-expanded',String(dockOpen));
 const cari=$('secCari');if(cari)cari.open=LS.cari!==false;
 const hide=m||LS.collapsed||LS.fullmap;
 ['map','strip','dock'].forEach(id=>{const el=$(id);if(!el)return;
  if(hide)el.style.setProperty('left','0px','important');else el.style.removeProperty('left');
  if(id==='map'){if(LS.fullmap){el.style.setProperty('top','var(--hdr)','important');el.style.setProperty('bottom','var(--ftr)','important')}else{el.style.removeProperty('top');el.style.removeProperty('bottom')}}});
 syncBackdrop();
 setTimeout(mapResize,80);
}

function setCollapsed(v){
 if(mobile()){setSheet(v===false?true: !v);return}
 LS.collapsed=!!v;if(v)LS.fullmap=false;apply();save();
}
function setSheet(open){
 const p=$('panel');if(!p)return;
 p.classList.toggle('open',!!open);
 const tg=$('toggle');if(tg)tg.setAttribute('aria-expanded',String(!!open));
 syncBackdrop();
}
function syncBackdrop(){
 const b=$('panelBackdrop');if(!b)return;
 const show=mobile()&&$('panel').classList.contains('open')&&!LS.fullmap;
 b.classList.toggle('show',show);b.hidden=!show;
}
function setDockOpen(v){
 LS.dockOpen=!!v;if(v){LS.fullmap=false}else{LS.dockMax=false}
 apply();save();
}
function setDockMax(v){
 LS.dockMax=!!v;if(v){LS.dockOpen=true;LS.fullmap=false}apply();save();
}
function setFullMap(v){
 LS.fullmap=!!v;
 if(v){if(mobile())$('panel').classList.remove('open')}
 else if(mobile()){/* keep sheet closed */}
 apply();save();
}
function setSide(px){LS.side=clamp(Math.round(px),280,560);apply();save()}
function setDockH(px){
 const max=Math.max(180,window.innerHeight-120);
 LS.dock=clamp(Math.round(px),160,max);LS.dockOpen=true;LS.dockMax=false;LS.fullmap=false;apply();save();
}

function drag(el,axis){
 if(!el)return;
 el.addEventListener('pointerdown',e=>{
  if(mobile()&&axis==='x')return;
  if(LS.fullmap)return;
  e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch(err){}
  document.body.classList.add(axis==='x'?'resizing-x':'resizing-y');
  el.classList.add('drag');
  const start=axis==='x'?e.clientX:e.clientY;
  const base=axis==='x'?LS.side: (LS.dockMax? (window.innerHeight-64-44-30): LS.dock);
  const move=ev=>{
   if(axis==='x'){setSide(base+(ev.clientX-start))}
   else{setDockH(base-(ev.clientY-start))}
  };
  const up=()=>{document.body.classList.remove('resizing-x','resizing-y');el.classList.remove('drag');try{el.releasePointerCapture(e.pointerId)}catch(err){}el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);save();setTimeout(mapResize,40)};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
 });
}

function bind(){
 const tg=$('toggle');
 if(tg)tg.onclick=()=>{
  if(LS.fullmap){setFullMap(false);if(mobile())setSheet(true);else{LS.collapsed=false;apply();save()}return}
  if(mobile())setSheet(!$('panel').classList.contains('open'));
  else setCollapsed(!LS.collapsed);
 };
 const pc=$('panelClose');if(pc)pc.onclick=()=>{if(mobile())setSheet(false);else setCollapsed(true)};
 const bd=$('panelBackdrop');if(bd)bd.onclick=()=>setSheet(false);
 const fm=$('fullMapBtn');if(fm)fm.onclick=()=>setFullMap(!LS.fullmap);
 const dm=$('dockMax');if(dm)dm.onclick=()=>{if(LS.fullmap)setFullMap(false);setDockMax(!LS.dockMax)};
 // dockToggle diikat analytics.js; bungkus setelah siap
 const hookDock=()=>{
  const dt=$('dockToggle');if(!dt||dt.dataset.v5)return;
  dt.dataset.v5='1';
  dt.addEventListener('click',()=>{
   // analytics sudah toggle dock-open; sinkronkan state kita
   setTimeout(()=>{
    const open=document.body.classList.contains('dock-open');
    LS.dockOpen=open;if(!open)LS.dockMax=false;if(open)LS.fullmap=false;
    apply();save();
   },0);
  },true);
 };
 hookDock();document.addEventListener('kegiatan:ready',hookDock);
 const cari=$('secCari');if(cari)cari.addEventListener('toggle',()=>{LS.cari=cari.open;save()});
 drag($('sideResize'),'x');
 drag($('dockResize'),'y');
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(LS.fullmap){setFullMap(false);return}
   if(mobile()&&$('panel').classList.contains('open'))setSheet(false);
  }
 });
 window.addEventListener('resize',()=>{
  if(!mobile()){root.style.setProperty('--side',(LS.collapsed||LS.fullmap)?getComputedStyle(root).getPropertyValue('--side'):LS.side+'px')}
  syncBackdrop();
 });
}

load();
// Terapkan setelah DOM siap (skrip ini dimuat setelah login, DOM sudah ada)
bind();
// Hormati preferensi tersimpan; jika pertama kali, biarkan analytics membuka dock di desktop
if(localStorage.getItem(KEY)){
 apply();
}else{
 if(window.innerWidth<=1440)LS.side=360;
 LS.dockOpen=!mobile()&&window.innerHeight>=640;
 apply();save();
}

// Sinkronkan status dock bila analytics.js mengubah kelas (klik tab, toggle)
if(window.MutationObserver){
 let lock=false;
 new MutationObserver(()=>{
  if(lock)return;
  const open=document.body.classList.contains('dock-open');
  const full=document.body.classList.contains('fullmap');
  const max=document.body.classList.contains('dock-max');
  if(full)return;
  if(LS.dockOpen!==open||LS.dockMax!==max){
   LS.dockOpen=open;if(!open)LS.dockMax=false;else LS.dockMax=max;save();
  }
 }).observe(document.body,{attributes:true,attributeFilter:['class']});
}

window.Layout={setCollapsed,setDockOpen,setDockMax,setFullMap,setSide,setDockH,setSheet,apply,save,get state(){return Object.assign({},LS)}};
})();
