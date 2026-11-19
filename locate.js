// Pelacakan lokasi ala Google Maps (v3): tombol "Lokasi saya", titik biru + lingkaran akurasi, mode ikuti,
// arah (heading/kompas), panel info (koordinat, akurasi, blok, Batas Kebun) dan pesan galat berbahasa Indonesia.
// Murni sisi klien (navigator.geolocation); tidak ada data posisi yang dikirim ke mana pun.
(function(){
'use strict';
const WATCH_OPTS={enableHighAccuracy:true,timeout:20000,maximumAge:2000};
const LOW_ACC=50;                    // m: di atas ini tampil catatan "akurasi rendah"
const MOVING_MS=0.5;                 // m/s: heading GPS hanya dipakai bila bergerak
const S={state:'off',follow:false,watch:null,hasFix:false,last:null,gps:null,compass:null,compassTs:0,marker:null,circle:null,collapsed:null,heading:null};
window.Locate=S;
const $=id=>document.getElementById(id);
const fmtC=n=>n.toFixed(6);

// ---------- Titik-dalam-poligon (Polygon/MultiPolygon + lubang) ----------
function ringHas(r,x,y){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c}
function inPoly(rings,x,y){if(!rings.length||!ringHas(rings[0],x,y))return false;for(let k=1;k<rings.length;k++)if(ringHas(rings[k],x,y))return false;return true}
function inGeom(g,x,y){return!!g&&(g.type==='Polygon'?inPoly(g.coordinates,x,y):g.type==='MultiPolygon'?g.coordinates.some(p=>inPoly(p,x,y)):false)}
S.pip=inGeom;

// ---------- Kontrol tombol ----------
const ICON='<svg class="loc-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><circle class="c" cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ST={
 off:{lbl:'Lokasi saya',title:'Tampilkan lokasi saya di peta',pressed:false},
 search:{lbl:'Mencari…',title:'Mencari posisi… ketuk untuk membatalkan',pressed:true},
 follow:{lbl:'Mengikuti',title:'Peta mengikuti posisi Anda. Ketuk untuk berhenti',pressed:true},
 free:{lbl:'Ikuti',title:'Ketuk untuk memusatkan peta ke posisi Anda dan mengikuti lagi',pressed:true}};
const ctl=L.control({position:'bottomleft'});
ctl.onAdd=()=>{const d=L.DomUtil.create('div','loc-ctl');
 d.innerHTML=`<button type="button" id="locBtn" class="loc-btn st-off" aria-pressed="false" aria-label="Lokasi saya" title="${ST.off.title}">${ICON}<span class="loc-lbl">${ST.off.lbl}</span></button>`;
 L.DomEvent.disableClickPropagation(d);return d};
ctl.addTo(map);
function setState(s){S.state=s;const b=$('locBtn');if(!b)return;const o=ST[s];
 b.className='loc-btn st-'+s;b.title=o.title;b.setAttribute('aria-pressed',o.pressed);b.setAttribute('aria-label',o.lbl+(s==='off'?'':' — '+o.title));b.querySelector('.loc-lbl').textContent=o.lbl;
 document.body.classList.toggle('loc-on',s!=='off')}
$('locBtn').addEventListener('click',()=>{
 if(S.state==='off')start();else if(S.state==='free')recenter();else stop()});

// ---------- UI atas peta: panel + toast ----------
const top=document.createElement('div');top.id='locTop';
top.innerHTML=`<div id="locToast" class="loc-toast" role="alert" hidden><span id="locToastTx"></span><button type="button" id="locToastX" aria-label="Tutup pesan">✕</button></div>
<div id="locPanel" class="loc-panel" hidden>
 <div class="loc-head"><span class="loc-live" aria-hidden="true"></span><div class="loc-hd"><b>Lokasi saya</b><span id="locSum">–</span></div>
  <button type="button" id="locCol" class="loc-ib" aria-expanded="true" aria-label="Ciutkan / perluas panel" title="Ciutkan / perluas"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button type="button" id="locOff" class="loc-ib" aria-label="Matikan lokasi" title="Matikan lokasi">✕</button></div>
 <div class="loc-body">
  <div class="loc-blok"><b id="locBlok">–</b><span id="locBatas" class="loc-tag">–</span></div>
  <div class="loc-warn" id="locWarn" hidden>Akurasi rendah, coba di area terbuka.</div>
  <dl class="loc-grid">
   <div class="w2"><dt>Koordinat (lat, lon)</dt><dd id="locLL" class="mono">–</dd></div>
   <div class="w2"><dt>UTM 48S</dt><dd id="locUTM" class="mono">–</dd></div>
   <div><dt>Akurasi</dt><dd id="locAcc">–</dd></div><div><dt>Kecepatan</dt><dd id="locSpd">–</dd></div>
   <div><dt>Arah</dt><dd id="locHdg">–</dd></div><div><dt>Diperbarui</dt><dd id="locTs">–</dd></div>
   <div class="w2"><dt>LC pada blok <small>(sesuai filter)</small></dt><dd id="locLC">–</dd></div>
   <div class="w2"><dt>Titik ini di area LC</dt><dd id="locLCpt">–</dd></div>
  </dl>
  <div class="loc-actions"><button type="button" id="locCopy" class="btn-mini">⧉ Salin koordinat</button><a id="locGm" class="btn-mini" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps">↗ Buka di Google Maps</a></div>
 </div></div>`;
map.getContainer().appendChild(top);L.DomEvent.disableClickPropagation(top);L.DomEvent.disableScrollPropagation(top);
function fitBody(){const bd=document.querySelector('#locPanel .loc-body');if(bd)bd.style.maxHeight=(mobile()?Math.max(map.getSize().y*.34,140):Math.max(map.getSize().y-96,110))+'px'}
map.on('resize',fitBody);fitBody();
if(window.ResizeObserver)new ResizeObserver(()=>{const h=top.offsetHeight;map.getContainer().style.setProperty('--loc-h',h?(h+8)+'px':'0px')}).observe(top);
let toastTimer;
function toast(msg,kind,sticky){const t=$('locToast');$('locToastTx').textContent=msg;t.className='loc-toast '+(kind||'info');t.hidden=false;clearTimeout(toastTimer);if(!sticky)toastTimer=setTimeout(()=>{t.hidden=true},7000)}
$('locToastX').onclick=()=>{$('locToast').hidden=true};
$('locOff').onclick=()=>stop();
$('locCol').onclick=()=>{S.collapsed=!S.collapsed;applyCollapse();if(S.follow&&S.last)setTimeout(()=>panFollow(L.latLng(S.last.lat,S.last.lng)),60)};
function applyCollapse(){$('locPanel').classList.toggle('collapsed',!!S.collapsed);$('locCol').setAttribute('aria-expanded',!S.collapsed)}
$('locCopy').onclick=()=>{if(!S.last)return;const t=`${fmtC(S.last.lat)}, ${fmtC(S.last.lng)}`;
 const ok=()=>toast('Koordinat disalin: '+t,'info');
 const fb=()=>{try{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();ok()}catch(e){toast('Gagal menyalin. Koordinat: '+t,'warn')}};
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,fb);else fb()};

// ---------- Pesan galat ----------
const MSG={
 insecure:'Lokasi hanya bisa dipakai lewat HTTPS (atau localhost). Buka situs ini dengan alamat yang diawali https://.',
 unsupported:'Peramban ini tidak mendukung pelacakan lokasi (geolocation). Coba peramban lain yang lebih baru.',
 denied:'Izin lokasi ditolak. Aktifkan lokasi untuk situs ini: ketuk ikon gembok/pengaturan di sebelah alamat situs → Izin/Lokasi → Izinkan, lalu muat ulang halaman dan coba lagi. Di HP, pastikan juga GPS/Layanan Lokasi perangkat menyala.',
 unavailable:'Posisi tidak tersedia. Periksa GPS/Layanan Lokasi perangkat dan sinyal, lalu coba lagi (sebaiknya di area terbuka).',
 timeout:'Waktu habis saat mencari posisi. Coba lagi di area terbuka atau periksa sinyal GPS.'};

// ---------- Mulai / berhenti ----------
function start(){
 if(!window.isSecureContext){toast(MSG.insecure,'error',true);return}
 if(!navigator.geolocation){toast(MSG.unsupported,'error',true);return}
 $('locToast').hidden=true;requestOrientation();
 S.follow=true;S.hasFix=false;S.last=null;S.gps=null;setState('search');
 try{S.watch=navigator.geolocation.watchPosition(onFix,onErr,WATCH_OPTS)}catch(e){stop();toast(MSG.unavailable,'error',true);return}
 S.timer=setInterval(updateHeading,2000)}
function stop(){
 if(S.watch!=null){try{navigator.geolocation.clearWatch(S.watch)}catch(e){}}
 S.watch=null;clearInterval(S.timer);stopOrientation();
 if(S.marker){map.removeLayer(S.marker);S.marker=null}if(S.circle){map.removeLayer(S.circle);S.circle=null}
 S.hasFix=false;S.follow=false;S.last=null;S.compass=null;S.heading=null;$('locPanel').hidden=true;setState('off')}
function onErr(err){
 const kind=err&&err.code===1?'denied':err&&err.code===3?'timeout':'unavailable';
 if(kind==='denied'||!S.hasFix){stop();toast(MSG[kind],'error',true)}   // gagal total → tombol kembali ke "off"
 else toast(MSG[kind],'warn')}                                         // sudah pernah dapat posisi → tetap melacak

// ---------- Posisi ----------
function ensureLayers(){
 if(!map.getPane('locPane')){map.createPane('locPane');const p=map.getPane('locPane');p.style.zIndex=455;p.style.pointerEvents='none'}
 if(!map.getPane('locDotPane')){map.createPane('locDotPane');const p=map.getPane('locDotPane');p.style.zIndex=660;p.style.pointerEvents='none'}   // di atas label blok (tooltipPane 650)
 if(!S.circle)S.circle=L.circle([0,0],{pane:'locPane',radius:1,color:'#2563eb',weight:1.2,opacity:.8,fillColor:'#2563eb',fillOpacity:.13,interactive:false,className:'loc-circle'}).addTo(map);
 if(!S.marker)S.marker=L.marker([0,0],{pane:'locDotPane',interactive:false,keyboard:false,zIndexOffset:1500,icon:L.divIcon({className:'loc-marker',iconSize:[64,64],iconAnchor:[32,32],html:'<div class="loc-dot"><i class="loc-pulse"></i><i class="loc-cone" hidden></i><i class="loc-core"></i></div>'})}).addTo(map)}
function onFix(pos){
 const c=pos.coords,ll=L.latLng(c.latitude,c.longitude),acc=Math.max(+c.accuracy||0,0),first=!S.hasFix;
 S.hasFix=true;S.last={lat:c.latitude,lng:c.longitude,acc,speed:(c.speed!=null&&isFinite(c.speed))?c.speed:null,ts:pos.timestamp||Date.now()};
 const hv=(c.heading!=null&&isFinite(c.heading))?c.heading:null;S.gps={h:hv,moving:S.last.speed!=null&&S.last.speed>=MOVING_MS};
 ensureLayers();S.marker.setLatLng(ll);S.circle.setLatLng(ll).setRadius(acc);
 if(first){$('locPanel').hidden=false;if((mobile()||map.getSize().y<560)&&S.collapsed===null)S.collapsed=true;applyCollapse();
  if(S.follow){setState('follow');const b=ll.toBounds(Math.max(acc*2.4,60));{const z=Math.min(map.getBoundsZoom(b,false,L.point(40,40)),17);map.flyTo(tgt(ll,z),z,{duration:.8})}}
  else setState('free')}
 else if(S.follow)panFollow(ll);
 updateHeading();updatePanel()}
// Bila panel info terbuka (menutupi bagian atas peta), titik pengguna digeser ke area peta yang masih terlihat.
function tgt(ll,z){const pn=$('locPanel');if(pn.hidden||S.collapsed)return ll;const mp=map.getContainer().getBoundingClientRect(),bt=pn.getBoundingClientRect().bottom-mp.top,M=mp.height;
 if(bt<=0||bt>M*.8)return ll;let bot=M-14;
 const lg=document.querySelector('.legend');if(lg&&lg.offsetParent){const r=lg.getBoundingClientRect(),cx=mp.left+mp.width/2;if(r.left<cx+12&&r.right>cx&&r.top>mp.top)bot=Math.min(bot,r.top-mp.top-8)}
 const off=(bt+bot)/2-M/2;if(bot-bt<60||off<=0)return ll;z=z==null?map.getZoom():z;return map.unproject(map.project(ll,z).subtract([0,off]),z)}
function panFollow(ll){const t=tgt(ll),p=map.latLngToContainerPoint(t),s=map.getSize();if(p.distanceTo(s.divideBy(2))>3)map.panTo(t,{animate:true,duration:.6,easeLinearity:.5})}
function recenter(){if(!S.last)return;S.follow=true;setState('follow');{const z=Math.max(map.getZoom(),16);map.flyTo(tgt(L.latLng(S.last.lat,S.last.lng),z),z,{duration:.6})}}
function dropFollow(){if(S.state!=='off'&&S.follow){S.follow=false;if(S.hasFix)setState('free')}}
map.on('dragstart',dropFollow);
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.ctl-bar a, [data-hl]'))dropFollow()},true);

// ---------- Arah: heading GPS (saat bergerak) atau kompas perangkat ----------
function requestOrientation(){
 const D=window.DeviceOrientationEvent;
 if(D&&typeof D.requestPermission==='function'){D.requestPermission().then(r=>{if(r==='granted')listenOrientation()}).catch(()=>{})}   // iOS: wajib dari gestur pengguna
 else listenOrientation()}
function listenOrientation(){if(S.orient)return;S.orient=true;
 if('ondeviceorientationabsolute' in window)window.addEventListener('deviceorientationabsolute',onOrient,true);
 window.addEventListener('deviceorientation',onOrient,true)}
function stopOrientation(){if(!S.orient)return;S.orient=false;window.removeEventListener('deviceorientationabsolute',onOrient,true);window.removeEventListener('deviceorientation',onOrient,true)}
let lastOr=0;
function onOrient(e){let h=null;
 if(typeof e.webkitCompassHeading==='number'&&isFinite(e.webkitCompassHeading))h=e.webkitCompassHeading;       // iOS
 else if(e.alpha!=null&&isFinite(e.alpha)&&(e.absolute===true||e.type==='deviceorientationabsolute'))h=(360-e.alpha)%360; // Android
 if(h==null)return;const so=(screen.orientation&&screen.orientation.angle)||window.orientation||0;
 S.compass=(h+so+360)%360;S.compassTs=Date.now();const n=performance.now();if(n-lastOr>100){lastOr=n;updateHeading()}}
function pickHeading(){
 if(S.gps&&S.gps.moving&&S.gps.h!=null)return{h:S.gps.h,src:'GPS'};
 if(S.compass!=null&&Date.now()-S.compassTs<4000)return{h:S.compass,src:'kompas'};
 return null}
const DIR=['U','TL','T','TG','S','BD','B','BL'];
function updateHeading(){if(!S.marker)return;const el=S.marker.getElement(),cone=el&&el.querySelector('.loc-cone');if(!cone)return;
 const r=pickHeading();S.heading=r;
 if(!r){cone.hidden=true}else{cone.hidden=false;cone.style.setProperty('--h',r.h.toFixed(0)+'deg')}
 const hd=$('locHdg');if(hd)hd.textContent=r?`${Math.round(r.h)}° ${DIR[Math.round(r.h/45)%8]} (${r.src})`:'–'}

// ---------- Panel info ----------
function lookup(lat,lng){
 const A=window.Analytics;if(!A||!A.ready)return null;
 const b=(A.blocks||[]).find(b=>inGeom(b.f.geometry,lng,lat));
 const batas=A.bk?A.bk.features.some(f=>inGeom(f.geometry,lng,lat)):null;
 const lc=(A.fs||[]).find(f=>inGeom(f.geometry,lng,lat));
 return{blok:b||null,batas,row:b&&A.rows?A.rows[b.i]:null,lc:lc||null}}
S.lookup=lookup;
function updatePanel(){const p=S.last;if(!p)return;
 $('locLL').textContent=`${fmtC(p.lat)}, ${fmtC(p.lng)}`;
 try{const[x,y]=proj4('EPSG:4326',UTM48S,[p.lng,p.lat]);$('locUTM').textContent=`X ${fmtN(x,0)}  Y ${fmtN(y,0)}`}catch(e){$('locUTM').textContent='–'}
 $('locAcc').textContent='±'+fmtN(p.acc,p.acc<10?1:0)+' m';
 $('locSpd').textContent=p.speed!=null?`${fmtN(p.speed*3.6,1)} km/jam`:'–';
 $('locTs').textContent=new Date(p.ts).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 $('locGm').href=`https://www.google.com/maps?q=${fmtC(p.lat)},${fmtC(p.lng)}`;
 const low=p.acc>LOW_ACC;$('locWarn').hidden=!low;$('locPanel').classList.toggle('low',low);
 const info=lookup(p.lat,p.lng);S.info=info;let blokTxt='Memuat data blok…',sum;
 if(info){blokTxt=info.blok?info.blok.label:'Di luar blok';
  $('locBatas').textContent=info.batas==null?'–':info.batas?'Di dalam Batas Kebun':'Di luar Batas Kebun';$('locBatas').className='loc-tag '+(info.batas?'in':'out');
  $('locLC').textContent=info.row?`${fmt(info.row.lc)} ha dari ${fmt(info.row.luas)} ha · ${fmtN(info.row.pct,1)}%`:'–';
  $('locLCpt').textContent=info.lc?`Ya · ${codeLbl(info.lc.properties.Code)}${info.lc.properties.Tanggal?' · '+tgl(info.lc.properties.Tanggal):''}`:'Tidak'}
 $('locBlok').textContent=blokTxt;
 $('locSum').textContent=`${blokTxt} · ±${fmtN(p.acc,0)} m${low?' ⚠':''}`}
// perbarui info LC bila filter berubah saat melacak
if(window.Analytics){const u=Analytics.update;Analytics.update=function(fs){const r=u.apply(this,arguments);if(S.last)updatePanel();return r}}
})();
