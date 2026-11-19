// Layer Atlas (ArcGIS-like): kontrol layer berkelompok, 22 layer dengan simbologi sesuai style_spec, pelabelan ringan,
// legenda per kelas, popup atribut (identify), lazy-load data terenkripsi. Dimuat SETELAH login (lihat login.js).
// Konfigurasi simbologi: atlas_cfg.js (dibuat dari style_spec.json). Data: data/atlas_<id>.geojson.enc (didekripsi di browser).
(function(){
'use strict';
const C=window.ATLAS_CFG;if(!C||!window.Vault){return}
const LAY=C.layers,NS='http://www.w3.org/2000/svg';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=(n,d)=>(+n).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const A={cfg:C,st:{},ctl:null,ops:[]};window.Atlas=A;
const dispName=L=>L.name.replace('288.66','288,66');
let map=null;
// ---------------- pola isian (SVG <pattern>) ----------------
function ensureDefs(){if(document.getElementById('atlPatterns'))return;const s=document.createElementNS(NS,'svg');s.id='atlPatterns';s.setAttribute('width','0');s.setAttribute('height','0');s.setAttribute('aria-hidden','true');s.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
 s.innerHTML='<defs>'+window.ATLAS_PATTERNS+'</defs>';document.body.appendChild(s)}
// ---------------- pane & renderer ----------------
function pane(L){const n='atl_'+L.id;if(!map.getPane(n)){map.createPane(n);const p=map.getPane(n);p.style.zIndex=L.z;p.style.pointerEvents='none';if(L.op<1)p.style.opacity=L.op}return n}
// ---------------- kelas simbol ----------------
function classOf(L,f){
 if(L.render==='simple')return L.classes[0];
 const fl=Array.isArray(L.field)?L.field[0]:L.field,k=fl==='Shape_Area'?f.properties.style_key:f.properties[fl];
 return L.classes.find(c=>c.key===String(k))||L.classes.find(c=>c.key==='default')||null}
const polyStyle=c=>{const s=Object.assign({},c.leaflet);if(s.dashArray==null)delete s.dashArray;s.interactive=false;return s};
// ---------------- pembangun layer ----------------
function buildLayer(L,data){
 const pn=pane(L);let g;
 if(L.kind==='poly'){
  const rend=L.svg||(L.svg=L.svgR=window.L.svg({pane:pn,padding:.3}));
  g=window.L.geoJSON(data,{pane:pn,renderer:rend,interactive:false,filter:f=>{const c=classOf(L,f);return !!(c&&c.drawn)},style:f=>polyStyle(classOf(L,f))});
 }else if(L.kind==='line'){
  const rend=window.L.canvas({pane:pn,padding:.25});g=window.L.layerGroup();
  const st=L.classes[0].leaflet.polylines_bottom_to_top;                       // 4 polyline bertumpuk: pertama = paling bawah
  st.forEach(s=>{const o=Object.assign({},s);if(o.dashArray==null)delete o.dashArray;o.interactive=false;o.smoothFactor=1.1;
   g.addLayer(window.L.geoJSON(data,{pane:pn,renderer:rend,interactive:false,style:()=>o}))});
 }else{
  const lf=L.classes[0].leaflet;
  if(lf.type==='L.circleMarker'){
   const rend=window.L.svg({pane:pn});
   g=window.L.geoJSON(data,{pane:pn,pointToLayer:(f,ll)=>window.L.circleMarker(ll,{pane:pn,renderer:rend,interactive:false,radius:lf.radius,color:lf.color,weight:lf.weight,opacity:lf.opacity,fill:true,fillColor:lf.fillColor,fillOpacity:lf.fillOpacity})});
  }else{
   const icon=window.L.divIcon({html:lf.html,iconSize:lf.iconSize,iconAnchor:lf.iconAnchor,className:''});
   g=window.L.geoJSON(data,{pane:pn,pointToLayer:(f,ll)=>window.L.marker(ll,{pane:pn,icon,interactive:false,keyboard:false})});
  }
 }
 return g}
// ---------------- label ----------------
const PRIO=['blok_kebun','bm_semipermanent_kebunspartan','benchmark','bm_semi_permanent','titik_bm_blok_spartan','up_land_low_land','batas_desa'];
const LBL={};let lblPane=null,lblTimer=0;const mc=document.createElement('canvas').getContext('2d');
const haloCss=h=>{if(!h)return'none';const w=h.px,c=h.color,o=[];[-w,0,w].forEach(x=>[-w,0,w].forEach(y=>{if(x||y)o.push(`${x}px ${y}px 0 ${c}`)}));return o.join(',')};
const fontStack="Tahoma,'DejaVu Sans',Verdana,sans-serif";
function labelPts(L,data){const c=L.label,out=[];
 data.features.forEach(f=>{const t=f.properties[c.field];if(t==null||t==='')return;const txt=typeof t==='number'?String(Math.round(t)):String(t);
  if(f.geometry.type==='Point'){const[x,y]=f.geometry.coordinates;out.push({ll:window.L.latLng(y,x),text:txt,a:0})}
  else(f.properties.lp||[]).forEach(p=>out.push({ll:window.L.latLng(p[1],p[0]),text:txt,a:p[2]}))});
 out.sort((a,b)=>b.a-a.a);return out}
function labelsOn(id,on){const L=LAY[id],s=A.st[id];if(!L.label||!L.label.on)return;
 if(on){if(!LBL[id])LBL[id]={L,pts:labelPts(L,s.data)};LBL[id].active=true}else if(LBL[id])LBL[id].active=false;scheduleLabels()}
function ensureLblPane(){if(lblPane)return lblPane;map.createPane('atlLblPane');lblPane=map.getPane('atlLblPane');lblPane.style.zIndex=640;lblPane.style.pointerEvents='none';return lblPane}
function scheduleLabels(){cancelAnimationFrame(lblTimer);lblTimer=requestAnimationFrame(relabel)}
function relabel(){
 const p=ensureLblPane();p.textContent='';if(map._animatingZoom)return;
 const ids=PRIO.filter(i=>LBL[i]&&LBL[i].active);if(!ids.length)return;
 const b=map.getBounds().pad(.05),placed=[],frag=document.createDocumentFragment();let n=0;
 for(const id of ids){const e=LBL[id],c=e.L.label;mc.font=`${c.bold?'bold ':''}${c.px}px ${fontStack}`;
  for(const q of e.pts){if(!b.contains(q.ll))continue;const pt=map.latLngToLayerPoint(q.ll);const w=(q.w||(q.w=mc.measureText(q.text).width)),h=c.px*.92;
   const r=[pt.x-w/2-1,pt.y-h/2,pt.x+w/2+1,pt.y+h/2];let hit=false;for(const o of placed){if(!(r[2]<o[0]||r[0]>o[2]||r[3]<o[1]||r[1]>o[3])){hit=true;break}}
   if(hit)continue;placed.push(r);
   const s=document.createElement('span');s.className='atl-lbl';s.textContent=q.text;
   s.style.cssText=`left:${pt.x.toFixed(1)}px;top:${pt.y.toFixed(1)}px;font:${c.bold?'700':'400'} ${c.px}px ${fontStack};color:${c.color};text-shadow:${haloCss(c.halo)}`;frag.appendChild(s);if(++n>600)break}}
 p.appendChild(frag)}
// ---------------- muat & tampilkan ----------------
let loading=0;const loadNames=new Set();
function chip(){const el=document.getElementById('atlLoad');if(!el)return;el.hidden=loadNames.size===0;document.getElementById('atlLoadTx').textContent='Memuat '+[...loadNames].join(', ')+'…'}
function rowBusy(id,b){document.querySelectorAll('.atl-l[data-id="'+id+'"]').forEach(r=>r.classList.toggle('busy',b))}
function load(id){const s=A.st[id];if(s.promise)return s.promise;const L=LAY[id];s.t0=performance.now();loadNames.add(dispName(L));rowBusy(id,true);chip();
 s.promise=Vault.getJSON('data/'+L.file).then(d=>{s.data=d;s.layer=buildLayer(L,d);s.loadMs=Math.round(performance.now()-s.t0);return s},e=>{s.promise=null;s.error=e;throw e})
  .finally(()=>{loadNames.delete(dispName(L));rowBusy(id,false);chip()});
 return s.promise}
function effective(id){const s=A.st[id];return s.own&&s.anc.every(g=>g.on)}
function apply(id){const s=A.st[id],L=LAY[id],eff=effective(id);
 if(eff){const go=()=>{if(!effective(id)||s.added)return;const t=performance.now();s.layer.addTo(map);s.added=true;s.addMs=Math.round(performance.now()-t);labelsOn(id,true);legend();document.dispatchEvent(new CustomEvent('atlas:layer',{detail:{id,on:true}}))};
  if(s.layer)go();else load(id).then(go).catch(()=>{})}
 else if(s.added){map.removeLayer(s.layer);s.added=false;labelsOn(id,false);legend();document.dispatchEvent(new CustomEvent('atlas:layer',{detail:{id,on:false}}))}}
function applyAll(){C.order.forEach(apply);refreshTOC()}
// ---------------- pohon ----------------
const nodes=[];   // semua node grup
function indexTree(n,anc){if(n.t==='l'){A.st[n.id]={own:LAY[n.id].on,anc:anc.slice(),added:false,loaded:false};return}
 n.collapsed=!n.on&&anc.length>0;n.anc=anc.slice();nodes.push(n);n.ch.forEach(c=>indexTree(c,anc.concat([n])))}
// ---------------- kontrol layer berkelompok ----------------
const ICO={car:'<svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 4.5 6 8l3-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'};
let ctlEl,listEl,baseDiv,opsDiv,treeDiv;
function swatch(id,w,h){const L=LAY[id];w=w||24;h=h||12;const op=L.op<1?` opacity="${L.op}"`:'';let inner='';
 if(L.kind==='poly'){const c=L.classes.find(x=>x.drawn)||L.classes[0],s=c.leaflet;inner=`<rect x=".8" y=".8" width="${w-1.6}" height="${h-1.6}" rx="1.5" fill="${s.fillOpacity>0?s.fillColor:'none'}" stroke="${s.color}" stroke-width="${Math.min(Math.max(s.weight,.8),2.4)}"/>`}
 else if(L.kind==='line'){inner=L.classes[0].leaflet.polylines_bottom_to_top.map(s=>`<line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="${s.color}" stroke-width="${Math.min(s.weight,h-3)}" stroke-linecap="${s.lineCap}"${s.dashArray?` stroke-dasharray="${s.dashArray}"`:''}/>`).join('')}
 else{const lf=L.classes[0].leaflet;if(lf.type==='L.circleMarker')inner=`<circle cx="${w/2}" cy="${h/2}" r="${Math.max(lf.radius*1.6,3)}" fill="${lf.fillColor}" stroke="${lf.color}" stroke-width="1"/>`;
  else{const f=(lf.html.match(/fill="(#[0-9a-f]{6})"/)||[])[1]||'#e60000';inner=`<svg x="${w/2-6}" y="${h/2-6}" width="12" height="12" viewBox="0 0 17 17"><path d="M6 6 L5.98 0 L10.98 0 L11 6 L17 6 L17 11 L11 11 L11 17 L6 17 L6 11 L0 11.02 L0 6.02Z" fill="${f}" stroke="#000" stroke-width=".8"/></svg>`}}
 return `<svg class="atl-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${op} aria-hidden="true">${inner}</svg>`}
function rowLayer(id,depth){const L=LAY[id],s=A.st[id],dim=s.own&&!s.anc.every(g=>g.on);
 return `<div class="atl-r atl-l${dim?' dim':''}" data-id="${id}" data-anc="${A.st[id].anc.map(g=>nodes.indexOf(g)).join(',')}" style="--d:${depth}"><label><input type="checkbox" data-l="${id}"${s.own?' checked':''}>${swatch(id)}<span class="atl-n">${esc(dispName(L))}</span></label><span class="atl-spin" aria-label="Memuat"></span><span class="atl-err" title="Gagal memuat">!</span></div>`}
function rowGroup(n,depth){const i=nodes.indexOf(n),dim=n.on&&n.anc.some(g=>!g.on);
 return `<div class="atl-r atl-g${dim?' dim':''}" data-g="${i}" data-anc="${n.anc.map(g=>nodes.indexOf(g)).join(',')}" style="--d:${depth}"><button type="button" class="atl-car${n.collapsed?'':' open'}" data-car="${i}" aria-expanded="${!n.collapsed}" aria-label="Buka/tutup grup">${ICO.car}</button><label><input type="checkbox" data-gc="${i}"${n.on?' checked':''}><span class="atl-n">${esc(n.name)}</span></label></div>`}
function rowsOf(n,depth,out){if(n.t==='l'){out.push(rowLayer(n.id,depth));return}
 out.push(rowGroup(n,depth));n.ch.forEach(c=>rowsOf(c,depth+1,out))}
let tocBuilt=false;
// Pohon dibangun SEKALI; perubahan hanya memperbarui atribut/kelas di tempat (tanpa membuang elemen di bawah kursor -> panel tidak menutup sendiri)
function refreshTOC(){if(!treeDiv)return;
 if(!tocBuilt){const out=[];C.tree.forEach(t=>rowsOf(t,0,out));treeDiv.innerHTML=out.join('');tocBuilt=true}
 treeDiv.querySelectorAll('.atl-r').forEach(r=>{const anc=r.dataset.anc?r.dataset.anc.split(',').map(Number):[];
  r.hidden=anc.some(i=>nodes[i].collapsed);
  if(r.dataset.id){const id=r.dataset.id,s=A.st[id];r.querySelector('input').checked=s.own;r.classList.toggle('dim',s.own&&!s.anc.every(g=>g.on));r.classList.toggle('fail',!!s.error);r.classList.toggle('busy',!!(s.promise&&!s.layer&&!s.error))}
  else{const n=nodes[+r.dataset.g];r.querySelector('input').checked=n.on;r.classList.toggle('dim',n.on&&n.anc.some(g=>!g.on));
   const c=r.querySelector('.atl-car');c.classList.toggle('open',!n.collapsed);c.setAttribute('aria-expanded',String(!n.collapsed))}})}
function refreshOps(){if(!opsDiv)return;
 if(opsDiv.dataset.n!==String(A.ops.length)){opsDiv.dataset.n=A.ops.length;opsDiv.innerHTML=A.ops.length?'<div class="atl-sec">Operasional</div>'+A.ops.map((o,i)=>`<div class="atl-r"><label><input type="checkbox" data-op="${i}"><span class="atl-n">${esc(o.name)}</span></label></div>`).join(''):''}
 opsDiv.querySelectorAll('input[data-op]').forEach(i=>{i.checked=map.hasLayer(A.ops[+i.dataset.op].layer)})}
function buildControl(bases){
 const c=window.L.control({position:'topright'});
 c.onAdd=()=>{ctlEl=window.L.DomUtil.create('div','leaflet-control-layers leaflet-control atl-ctl');
  ctlEl.innerHTML='<a class="leaflet-control-layers-toggle" href="#" role="button" title="Layer" aria-label="Layer"></a><section class="leaflet-control-layers-list atl-list"><div class="atl-head"><b>LAYER PETA</b><button type="button" class="atl-x" aria-label="Tutup">✕</button></div><div class="atl-base"></div><div class="atl-ops"></div><div class="atl-tree" role="tree"></div></section>';
  listEl=ctlEl.querySelector('.atl-list');baseDiv=ctlEl.querySelector('.atl-base');opsDiv=ctlEl.querySelector('.atl-ops');treeDiv=ctlEl.querySelector('.atl-tree');
  baseDiv.innerHTML='<div class="atl-sec">Peta Dasar</div>'+Object.keys(bases).map((k,i)=>`<div class="atl-r"><label><input type="radio" name="atlBase" data-b="${i}"${map.hasLayer(bases[k])?' checked':''}><span class="atl-n">${esc(k)}</span></label></div>`).join('');
  window.L.DomEvent.disableClickPropagation(ctlEl);window.L.DomEvent.disableScrollPropagation(ctlEl);
  const open=()=>{if(ctlEl.classList.contains('leaflet-control-layers-expanded'))return;const r=ctlEl.getBoundingClientRect();ctlEl.classList.add('leaflet-control-layers-expanded');ctlEl.parentNode.style.zIndex=1300;
   // panel melayang (position:fixed) agar tidak terpotong peta yang pendek (dock di bawah) dan muat di layar
   listEl.style.cssText=`position:fixed;top:${Math.max(r.top,4)}px;right:${Math.max(innerWidth-r.right,4)}px;max-height:${Math.max(innerHeight-r.top-14,160)}px`},close=()=>{ctlEl.classList.remove('leaflet-control-layers-expanded');ctlEl.parentNode.style.zIndex=''};
  const tg=ctlEl.querySelector('.leaflet-control-layers-toggle');
  window.L.DomEvent.on(tg,'click',e=>{window.L.DomEvent.preventDefault(e);ctlEl.classList.contains('leaflet-control-layers-expanded')?close():open()});
  ctlEl.querySelector('.atl-x').onclick=close;map.on('click',close);
  if(window.matchMedia('(hover:hover) and (pointer:fine)').matches){ctlEl.addEventListener('mouseenter',open);ctlEl.addEventListener('mouseleave',close)}
  ctlEl.addEventListener('change',e=>{const t=e.target;
   if(t.dataset.l){const s=A.st[t.dataset.l];s.own=t.checked;apply(t.dataset.l);refreshTOC()}
   else if(t.dataset.gc!=null){nodes[+t.dataset.gc].on=t.checked;applyAll()}
   else if(t.dataset.b!=null){const ks=Object.keys(bases);ks.forEach((k,i)=>{if(i===+t.dataset.b){if(!map.hasLayer(bases[k]))map.addLayer(bases[k])}else if(map.hasLayer(bases[k]))map.removeLayer(bases[k])})}
   else if(t.dataset.op!=null){const o=A.ops[+t.dataset.op];t.checked?map.addLayer(o.layer):map.removeLayer(o.layer)}});
  ctlEl.addEventListener('click',e=>{const b=e.target.closest('.atl-car');if(b){const n=nodes[+b.dataset.car];n.collapsed=!n.collapsed;refreshTOC()}});
  refreshTOC();refreshOps();return ctlEl};
 return c}
function fit(){if(ctlEl&&ctlEl.classList.contains('leaflet-control-layers-expanded')){const r=ctlEl.getBoundingClientRect();listEl.style.maxHeight=Math.max(innerHeight-Math.max(r.top,4)-14,160)+'px'}}
// API kompatibel dengan L.control.layers (dipakai analytics.js)
function addOverlay(layer,name){A.ops.push({layer,name});refreshOps();layer.on&&layer.on('add remove',refreshOps)}
// ---------------- legenda ----------------
function mobile(){return window.matchMedia('(max-width:760px)').matches}
const lgState={};   // kunci -> true (terbuka)
function legendClassRows(id){const L=LAY[id];
 if(L.id==='genangan_air')return L.classes.filter(c=>c.drawn&&c.n>0).map(c=>({label:c.key==='default'?'Semua nilai lain':'Luas '+nf(+c.key,0)+' m²',c}));
 if(L.render==='unique_value'||L.render==='unique')return L.classes.filter(c=>c.drawn).map(c=>({label:c.label,c}));
 return []}
function swatchClass(id,c){const L=LAY[id];if(L.kind!=='poly')return swatch(id);const s=c.leaflet,w=24,h=12;const op=L.op<1?` opacity="${L.op}"`:'';
 return `<svg class="atl-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${op}><rect x=".8" y=".8" width="${w-1.6}" height="${h-1.6}" rx="1.5" fill="${s.fillOpacity>0?s.fillColor:'none'}" stroke="${s.color}" stroke-width="${Math.min(Math.max(s.weight,.8),2.4)}"/></svg>`}
function legend(){const host=document.getElementById('lgAtlas');if(!host)return;
 const vis=id=>A.st[id]&&A.st[id].added;let html='';
 C.tree.forEach(top=>{const parts=[];
  const walk=(n,d)=>{if(n.t==='l'){if(!vis(n.id))return;const L=LAY[n.id],cr=legendClassRows(n.id),key='l:'+n.id;
    const open=lgState[key]!=null?lgState[key]:(!mobile()&&map.getSize().y>=520);
    if(cr.length>1){parts.push(`<div class="lg-lay"><button type="button" class="lg-lh" data-lk="${key}" aria-expanded="${open}"><i class="lg-car${open?' open':''}">${ICO.car}</i>${esc(dispName(L))}</button>${open?cr.map(r=>`<div class="lg-row lg-cr"><i class="lg-sw">${swatchClass(n.id,r.c)}</i><span>${esc(r.label)}</span></div>`).join(''):''}</div>`)}
    else parts.push(`<div class="lg-row lg-lay1"><i class="lg-sw">${swatch(n.id)}</i><span>${esc(dispName(L))}</span></div>`)}
   else n.ch.forEach(c=>walk(c,d+1))};
  walk(top,0);
  if(parts.length){const key='g:'+top.name,open=lgState[key]!=null?lgState[key]:!mobile();
   html+=`<div class="lg-gh"><button type="button" data-lk="${key}" aria-expanded="${open}"><i class="lg-car${open?' open':''}">${ICO.car}</i>${esc(top.name)}</button></div>${open?parts.join(''):''}`}});
 host.innerHTML=html;host.hidden=!html}
function legendInit(){const lg=document.querySelector('.legend');if(!lg||document.getElementById('lgAtlas'))return;
 // baris lama "Batas Kebun" & "Blok Kebun" diganti simbol Atlas
 const old=document.getElementById('lgBatas');if(old){const r=old.closest('.lg-row');const nx=r&&r.nextElementSibling;r&&r.remove();if(nx&&/Blok Kebun/.test(nx.textContent))nx.remove()}
 const h=document.createElement('div');h.id='lgAtlas';h.className='lg-atlas';h.hidden=true;lg.appendChild(h);
 const t=lg.querySelector('.lg-title');
 if(t&&!t.querySelector('.lg-tg')){const b=document.createElement('button');b.type='button';b.className='lg-tg';b.setAttribute('aria-label','Ciutkan/perluas legenda');b.innerHTML=ICO.car;t.appendChild(b);
  const apply=()=>{lg.classList.toggle('lg-collapsed',!!lgState.all);b.setAttribute('aria-expanded',!lgState.all)};
  b.addEventListener('click',e=>{e.stopPropagation();lgState.all=!lgState.all;apply()});if(mobile())lgState.all=true;apply()}
 lg.addEventListener('click',e=>{const b=e.target.closest('[data-lk]');if(!b)return;const k=b.dataset.lk;lgState[k]=!(lgState[k]!=null?lgState[k]:(k[0]==='l'?(!mobile()&&map.getSize().y>=520):!mobile()));legend()});
 const fitLg=()=>lg.style.setProperty('--lg-max',Math.max(map.getSize().y-80,110)+'px');fitLg();map.on('resize',fitLg)}
// ---------------- identify (popup atribut) ----------------
function inRing(r,x,y){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function inPoly(p,x,y){if(!inRing(p[0],x,y))return false;for(let i=1;i<p.length;i++)if(inRing(p[i],x,y))return false;return true}
function bbox(f){if(f._bb)return f._bb;let a=1e9,b=1e9,c=-1e9,d=-1e9;(function w(x){if(typeof x[0]==='number'){if(x[0]<a)a=x[0];if(x[0]>c)c=x[0];if(x[1]<b)b=x[1];if(x[1]>d)d=x[1]}else x.forEach(w)})(f.geometry.coordinates);return f._bb=[a,b,c,d]}
function distSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));const x=ax+t*dx-px,y=ay+t*dy-py;return Math.sqrt(x*x+y*y)}
function nearLine(f,ll,tolM){const k=Math.cos(ll.lat*Math.PI/180),mx=111320*k,my=110574,tolD=tolM/110000,bb=bbox(f);
 if(ll.lng<bb[0]-tolD*2||ll.lng>bb[2]+tolD*2||ll.lat<bb[1]-tolD*2||ll.lat>bb[3]+tolD*2)return false;
 const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
 for(const ln of lines){for(let i=1;i<ln.length;i++){const a=ln[i-1],b=ln[i];
  if(Math.max(a[0],b[0])<ll.lng-tolD*2||Math.min(a[0],b[0])>ll.lng+tolD*2||Math.max(a[1],b[1])<ll.lat-tolD*2||Math.min(a[1],b[1])>ll.lat+tolD*2)continue;
  if(distSeg(0,0,(a[0]-ll.lng)*mx,(a[1]-ll.lat)*my,(b[0]-ll.lng)*mx,(b[1]-ll.lat)*my)<=tolM)return true}}return false}
function fmtVal(v,t){if(v==null||v===''||(typeof v==='number'&&!isFinite(v)))return null;
 switch(t){case'ha':return nf(v/1e4,2)+' ha';case'ha_v':return nf(v,2)+' ha';case'm2':return nf(v,2)+' m²';case'm':return nf(v,2);case'int':return String(Math.round(v));case'num':return nf(v,3).replace(/,?0+$/,'').replace(/,$/,'');default:return String(v)}}
function hitsAt(e){const ll=e.latlng,z=map.getZoom(),mpp=40075016.686*Math.cos(ll.lat*Math.PI/180)/(256*Math.pow(2,z)),out=[];
 const ids=Object.keys(A.st).filter(i=>A.st[i].added).sort((a,b)=>LAY[b].z-LAY[a].z);
 ids.forEach(id=>{const L=LAY[id],d=A.st[id].data,hit=[];
  for(const f of d.features){let ok=false;const g=f.geometry;if(!g)continue;
   if(L.kind==='poly'){const c=classOf(L,f);if(!c||!c.drawn)continue;const bb=bbox(f);if(ll.lng<bb[0]||ll.lng>bb[2]||ll.lat<bb[1]||ll.lat>bb[3])continue;
    ok=g.type==='Polygon'?inPoly(g.coordinates,ll.lng,ll.lat):g.coordinates.some(p=>inPoly(p,ll.lng,ll.lat))}
   else if(L.kind==='line')ok=nearLine(f,ll,Math.max(9*mpp,3));
   else{const p=map.latLngToContainerPoint([g.coordinates[1],g.coordinates[0]]);ok=p.distanceTo(e.containerPoint)<=12}
   if(ok){hit.push(f);if(hit.length>=3)break}}
  if(hit.length)out.push({id,hit})});
 return out}
function popupHtml(hs){
 return '<div class="atl-pop">'+hs.map(h=>{const L=LAY[h.id];return h.hit.map(f=>{const P=L.pop,p=f.properties;
  let title=P.title&&p[P.title]!=null&&p[P.title]!==''?P.prefix+(typeof p[P.title]==='number'?Math.round(p[P.title]):p[P.title]):dispName(L);
  const rows=P.fields.map(([k,lab,t])=>{const s=fmtVal(p[k],t);return s==null?null:[lab,s]}).filter(Boolean).concat(A.enrich?A.enrich(h.id,f):[]);
  const body=rows.length?`<table class="pp-t">${rows.map(([k,x])=>`<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</table>`:'';
  return `<div class="atl-card"><div class="pp-h"><div class="t">${esc(title)}</div><span class="s">${esc(dispName(L))}</span></div>${body}</div>`}).join('')}).join('')+'</div>'}
function identify(e){
 const t=e.originalEvent&&e.originalEvent.target;if(t&&t.closest&&t.closest('.leaflet-interactive,.leaflet-marker-icon,.leaflet-popup,.leaflet-control,#locTop'))return;
 const hs=hitsAt(e);if(!hs.length)return;
 window.L.popup({className:'pp pp-atlas',minWidth:240,maxWidth:300,maxHeight:340,autoPanPadding:[20,70]}).setLatLng(e.latlng).setContent(popupHtml(hs)).openOn(map)}
// ---------------- init ----------------
A.init=function(o){
 map=o.map;A.map=map;ensureDefs();
 C.tree.forEach(t=>indexTree(t,[]));
 A.ctl=buildControl(o.bases);A.ctl.addTo(map);A.ctl.addOverlay=addOverlay;
 const ch=document.createElement('div');ch.id='atlLoad';ch.className='atl-load';ch.hidden=true;ch.setAttribute('role','status');ch.innerHTML='<span class="atl-spin on"></span><span id="atlLoadTx"></span>';map.getContainer().appendChild(ch);
 legendInit();map.on('moveend zoomend resize',scheduleLabels);map.on('zoomstart',()=>{if(lblPane)lblPane.textContent=''});map.on('click',identify);map.on('resize',fit);
 // yang paling berat (Jalan Lokal / Sungai) dimuat paling akhir agar peta & dashboard tampil lebih dulu
 const late=new Set(['jalan_lokal','sungai_ln_50k']);const first=C.order.filter(i=>!late.has(i)),last=C.order.filter(i=>late.has(i));
 first.forEach(apply);setTimeout(()=>last.forEach(apply),60);
 return A.ctl};
A.setVisible=(id,on)=>{A.st[id].own=on;apply(id);refreshTOC()};
A.showAll=()=>{nodes.forEach(n=>{n.on=true;n.collapsed=false});Object.values(A.st).forEach(s=>s.own=true);applyAll()};
A.isShown=id=>!!A.st[id].added;
A.inPoly=inPoly;A.classOf=classOf;A.effective=effective;A.lay=LAY;A.relabel=relabel;A.hitsAt=hitsAt;A.identify=identify;
})();
