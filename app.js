// Label Code: diambil dari style_spec.json (via p17_cfg.js: kelas simbologi layer LC). Code = penanda minggu pelaporan, bukan diturunkan dari tanggal.
const CODE_LABELS=(window.P17&&P17.codeLabels&&P17.codeLabels.land_clearing)||{"1":"LC Code 1 (minggu ini)","0":"LC Code 0 (hingga 7 Nov)"};
const CUR_CODE='1';
// Dasar target persen LC & Rumpukan: 'batas_kebun' (keputusan pemilik) atau 'status_lahan' (union Status Lahan DNP) - ubah HANYA konstanta ini
const TARGET_BASIS='batas_kebun';
const BATAS_COLOR='#333333',BLOK_COLOR='#555555';
const VER='202611192210';
const DATA_URL='data/land_clearing.geojson?v='+VER;
const BATAS_URL='data/batas_kebun.geojson?v='+VER;
const BLOK_URL='data/blok_sawit.geojson?v='+VER;
const KEBUN_URL='data/kebun_dnp.geojson?v='+VER;
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BLN_FULL=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'});
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri World Imagery'});
const blank=L.tileLayer('data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',{maxZoom:19,attribution:'Polos'});
const map=L.map('map',{layers:[sat]}).setView([-3.71,104.45],13);
L.control.scale({imperial:false,maxWidth:140}).addTo(map);
let data,batas,blok,nBlok=0,first=true,homeBounds=null;
map.createPane('blokPane');map.getPane('blokPane').style.zIndex=335;map.createPane('batasPane');map.getPane('batasPane').style.zIndex=336;
const $=id=>document.getElementById(id);
const fmt=n=>n.toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN=(n,d)=>n.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const v=x=>(x===null||x===undefined||x==='')?'-':x;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const codeLbl=c=>CODE_LABELS[c]||('Code '+c);
const tgl=s=>{if(!s||s==='-')return'-';const[y,m,d]=s.split('-');return `${+d} ${BLN[m-1]} ${y}`};
const tglFull=s=>{if(!s)return'-';const[y,m,d]=s.split('-');return `${+d} ${BLN_FULL[m-1]} ${y}`};
function group(fs,key,lab=k=>k){const g={};fs.forEach(f=>{const k=v(f.properties[key]);g[k]=(g[k]||0)+f.properties.Luas});return g}
function bars(g,lab=k=>k,keys,cls=()=>'',dim){keys=keys||Object.keys(g).sort();const mx=Math.max(...Object.values(g),0),tot=Object.values(g).reduce((a,b)=>a+b,0);
 return keys.map(k=>`<div class="bi"${dim?` data-hl="${dim}:${esc(k)}" tabindex="0" role="button" title="Klik untuk menyorot &amp; zoom ke peta"`:''}><div class="row"><span>${esc(lab(k))}</span><b>${fmt(g[k])} ha<em>${tot?fmtN(g[k]/tot*100,1):0}%</em></b></div><div class="bar"><div class="${cls(k)}" style="width:${mx?g[k]/mx*100:0}%"></div></div></div>`).join('')||'<div class="empty">Tidak ada data</div>'}
const FIDS=['fCode','fPeng','fOp','fFrom','fTo'];
function filtered(){const c=$('fCode').value,pg=$('fPeng').value,op=$('fOp').value,a=$('fFrom').value,b=$('fTo').value;
 return data.features.filter(f=>{const p=f.properties;
  if(c&&p.Code!=c)return false;if(pg&&v(p.Pengerjaan)!=pg)return false;if(op&&v(p.Operator)!=op)return false;
  if((a||b)&&!p.Tanggal)return false;if(a&&p.Tanggal<a)return false;if(b&&p.Tanggal>b)return false;return true})}
function render(){const fs=filtered();
 if(window.Atlas&&Atlas.st&&Atlas.st.land_clearing)Atlas.setFeatures('land_clearing',fs);   // LC digambar modul Atlas (simbologi style_spec); popup = tabel atribut
 if(first&&fs.length){const b=L.geoJSON({type:'FeatureCollection',features:fs}).getBounds();if(batas)b.extend(batas.getBounds());homeBounds=b;map.fitBounds(b,{padding:[20,20]});first=false;const h=location.hash.match(/^#(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);if(h)map.setView([+h[2],+h[3]],+h[1])}
 const tot=fs.reduce((t,f)=>t+f.properties.Luas,0);
 const nAct=FIDS.filter(i=>$(i).value).length;
 $('summary').innerHTML=`<div class="kv">Jumlah poligon LC <b id="nPoly">${fs.length}</b></div><div class="kv">Total luas LC <b><span id="totLuas">${fmt(tot)}</span> ha</b></div>`+(batas?`<div class="kv">Luas Batas Kebun <b><span id="luasBatas">${fmt(batasHa)}</span> ha</b></div>`:'')+(blok?`<div class="kv">Jumlah Blok <b id="nBlok">${nBlok}</b></div>`:'');
 const gc=group(fs,'Code');
 $('perCode').innerHTML=bars(gc,codeLbl,Object.keys(gc).sort().reverse(),k=>k=='1'?'b-oct':k=='0'?'b-sep':'','code');
 $('perPeng').innerHTML=bars(group(fs,'Pengerjaan'),k=>k,undefined,()=>'','peng');
 $('perOp').innerHTML=bars(group(fs,'Operator'),k=>k,undefined,()=>'','op');
 const gt=group(fs,'Tanggal');$('perTgl').innerHTML=bars(gt,tgl,Object.keys(gt).sort((x,y)=>x=='-'?1:y=='-'?-1:x<y?-1:1),()=>'','tgl');
 // KPI
 const cur=fs.filter(f=>f.properties.Code==CUR_CODE).reduce((t,f)=>t+f.properties.Luas,0);
 const pct=batasHa?tot/batasHa*100:0;
 window.KPIV=Object.assign(window.KPIV||{},{tot,n:fs.length,N:data.features.length,nAct,cur,pct,batasHa});fillKpi();
 $('fCount').hidden=!nAct;$('fCount').textContent=nAct+' aktif';
 window.RENDERED=fs.length;window.TOTAL=tot;
 if(window.Analytics)Analytics.update(fs)}
let batasHa=0;
function fillKpi(){const K=window.KPIV,A=window.Analytics;if(!K)return;const set=(id,t)=>{const e=$(id);if(e)e.textContent=t};
 set('kTot',fmt(K.tot));set('kTotS',K.nAct?`Terfilter · ${K.n} dari ${K.N} poligon`:`${K.n} poligon land clearing`);if($('kTotS'))$('kTotS').classList.toggle('flt',!!K.nAct);
 set('kOct',fmt(K.cur));set('kOctS',K.tot?`${fmtN(K.cur/K.tot*100,1)}% dari total LC`:'–');if(K.octL)set('kOctL',K.octL);
 set('kPct',K.batasHa?fmtN(K.pct,2):'–');if($('kPctBar'))$('kPctBar').style.width=Math.min(K.pct,100)+'%';
 set('kBatas',K.batasTxt||'–');set('kBlok',K.blokTxt||'–');set('kBlokS',K.blokS||'');
 if(A&&A.kpi){set('kAvg',A.kpi.hari?fmt(A.kpi.avg):'–');set('kHari',A.kpi.hari?fmtN(A.kpi.hari,0):'–');set('kSisa',fmt(A.kpi.sisa))}}
window.fillKpi=fillKpi;
const getJ=u=>Vault.getJSON(u);   // data terenkripsi: fetch -> dekripsi AES-GCM -> parse (lihat login.js)
(window.EXTRAS_READY||Promise.resolve()).then(()=>Promise.all([getJ(DATA_URL),getJ(BATAS_URL).catch(e=>{console.warn('Batas kebun gagal dimuat',e);return null}),getJ(BLOK_URL).catch(e=>{console.warn('Blok sawit gagal dimuat',e);return null}),TARGET_BASIS==='status_lahan'?getJ(KEBUN_URL).catch(e=>null):Promise.resolve(null)])).then(([d,bk,bl,kd])=>{data=d;if(window.Atlas)Atlas.pre.land_clearing=d;
 // Layer lama blok/batas = SUMBER ANALITIK (angka dashboard, choropleth, titik-dalam-poligon). Tampilan peta memakai layer Atlas
 // (Batas Kebun DNP & Blok Kebun di grup 03 BATAS), jadi layer lama dibuat tak terlihat & tak interaktif (stroke 0, tanpa tooltip/popup).
 if(bl){nBlok=bl.features.length;blok=L.geoJSON(bl,{pane:'blokPane',interactive:false,style:{color:BLOK_COLOR,weight:0,opacity:0,fill:true,fillOpacity:0}}).addTo(map)}
 if(bk){batas=L.geoJSON(bk,{pane:'batasPane',interactive:false,style:{color:BATAS_COLOR,weight:0,opacity:0,fill:false}});
  batasHa=bk.features.reduce((t,f)=>t+(+f.properties.LuasHa||0),0)}
 const tg=kd||bk;if(kd)batasHa=kd.features.reduce((t,f)=>t+(+f.properties.LuasHa||0),0);
 window.TARGET={basis:TARGET_BASIS,ha:batasHa,label:TARGET_BASIS==='status_lahan'?'Target = luas kebun DNP (union Status Lahan DNP, '+fmtN(batasHa,2)+' ha)':'Target = luas Batas Kebun DNP ('+fmtN(batasHa,2)+' ha)'};
 const P=d.features.map(f=>f.properties);
 ['1','0'].filter(c=>P.some(p=>p.Code==c)).forEach(c=>$('fCode').add(new Option(codeLbl(c),c)));
 [['fPeng','Pengerjaan'],['fOp','Operator']].forEach(([id,k])=>[...new Set(P.map(p=>v(p[k])))].sort().forEach(x=>$(id).add(new Option(x,x))));
 const ds=P.map(p=>p.Tanggal).filter(Boolean).sort();['fFrom','fTo'].forEach(i=>{$(i).min=ds[0];$(i).max=ds[ds.length-1]});
 // Header: periode & update terakhir dari Tanggal maksimum
 const last=ds[ds.length-1];
 if(last){const[y,m]=last.split('-');$('periode').textContent=`Periode: ${BLN_FULL[m-1]} ${y}`;$('lastUpd').textContent=tglFull(last);window.KPIV=Object.assign(window.KPIV||{},{octL:`LC ${BLN_FULL[m-1]} ${y}`})}
 window.KPIV=Object.assign(window.KPIV||{},{batasTxt:bk?fmt(batasHa):'–',blokTxt:bl?fmtN(nBlok,0):'–'});
 if(bl){const lb=bl.features.reduce((t,f)=>t+(+f.properties.LuasHa||0),0);window.KPIV.blokS=`Total ${fmt(lb)} ha`}
 const bases={'Citra Satelit (Esri)':sat,'OpenStreetMap':osm,'Polos (Putih)':blank};
 // Kontrol layer berkelompok ala ArcGIS (atlas.js); jika modul Atlas tak tersedia -> kontrol Leaflet biasa
 window.layersCtl=window.Atlas?Atlas.init({map,bases}):L.control.layers(bases,{}).addTo(map);
 // Atlas.enrich: baris tambahan pada tabel atribut = SEMUA field data analitik lama (blok_sawit / batas_kebun) yang cocok secara spasial
 if(window.Atlas)Atlas.enrich=(id,f)=>{let o=null;
  if(id==='blok_kebun'&&bl){const lp=(f.properties.lp||[])[0];if(lp)o=bl.features.find(g=>g.geometry&&(g.geometry.type==='Polygon'?Atlas.inPoly(g.geometry.coordinates,lp[0],lp[1]):g.geometry.coordinates.some(p=>Atlas.inPoly(p,lp[0],lp[1]))))}
  else if(id==='batas_kebun_dnp'&&bk)o=bk.features[0];
  if(!o)return[];const src=id==='blok_kebun'?'blok_sawit':'batas_kebun';
  return Object.entries(o.properties).map(([k,x])=>[src+'.'+k,(x==null||String(x).trim()==='')?'—':(typeof x==='number'?fmtN(x,Number.isInteger(x)?0:3):String(x).trim())])};
 northCtl.addTo(map);
 FIDS.forEach(i=>$(i).onchange=render);
 $('reset').onclick=()=>{FIDS.forEach(i=>$(i).value='');render()};
 if(window.Analytics)Analytics.init({map,bk:tg,bkReal:bk,bl,data,batasHa,blokLayer:blok,layersCtl:window.layersCtl});
 render();window.APP_OK=true}).catch(e=>{console.error(e);$('summary').innerHTML='<div class="note">Data gagal dimuat. Muat ulang halaman.</div>'});

// ---- Legenda (swatch sama seperti sebelumnya) ----
const lg=L.control({position:'bottomright'});lg.onAdd=()=>{const d=L.DomUtil.create('div','legend');const it=(sw,t,id)=>`<div class="lg-row"><i style="${sw}"></i><span${id?` id="${id}"`:''}>${t}</span></div>`;
 d.innerHTML='<div class="lg-title">LEGENDA</div>'
 ;L.DomEvent.disableClickPropagation(d);return d};lg.addTo(map);

// ---- Tombol peta: Zoom ke kebun & Layar penuh ----
const ICON={home:'<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
 fs:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 fsx:'<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'};
const tools=L.control({position:'topleft'});tools.onAdd=()=>{const d=L.DomUtil.create('div','leaflet-bar ctl-bar');
 const btn=(html,title,fn)=>{const a=L.DomUtil.create('a','ctl',d);a.href='#';a.title=title;a.setAttribute('role','button');a.setAttribute('aria-label',title);a.innerHTML=html;L.DomEvent.on(a,'click',e=>{L.DomEvent.preventDefault(e);fn(a)});return a};
 btn(ICON.home,'Zoom ke kebun',()=>{const b=homeBounds||(batas&&batas.getBounds());if(b)map.flyToBounds(b,{padding:[20,20],duration:.8})});
 const fsEl=map.getContainer(),canFs=!!(fsEl.requestFullscreen||fsEl.webkitRequestFullscreen);
 if(canFs){const a=btn(ICON.fs,'Layar penuh',()=>{const cur=document.fullscreenElement||document.webkitFullscreenElement;
   if(cur)(document.exitFullscreen||document.webkitExitFullscreen).call(document);else(fsEl.requestFullscreen||fsEl.webkitRequestFullscreen).call(fsEl)});
  const onFs=()=>{const on=!!(document.fullscreenElement||document.webkitFullscreenElement);a.innerHTML=on?ICON.fsx:ICON.fs;a.title=on?'Keluar layar penuh':'Layar penuh';setTimeout(()=>map.invalidateSize(),120)};
  document.addEventListener('fullscreenchange',onFs);document.addEventListener('webkitfullscreenchange',onFs)}
 L.DomEvent.disableClickPropagation(d);return d};tools.addTo(map);

// ---- Panah utara ----
const northCtl=L.control({position:'topright'});northCtl.onAdd=()=>{const d=L.DomUtil.create('div','north');d.title='Arah Utara';
 d.innerHTML='<svg viewBox="0 0 30 46"><text x="15" y="11" text-anchor="middle" font-family="Plus Jakarta Sans,Arial,sans-serif" font-weight="800" font-size="11" fill="#0f3d2e">U</text><path d="M15 14 L23 42 L15 36 Z" fill="#0f3d2e"/><path d="M15 14 L7 42 L15 36 Z" fill="#fff" stroke="#0f3d2e" stroke-width="1.2" stroke-linejoin="round"/></svg>';return d};

// ---- Koordinat (lat/lng + UTM 48S) ----
const UTM48S='+proj=utm +zone=48 +south +datum=WGS84 +units=m +no_defs';
const hasProj=typeof proj4==='function';
function showCoord(ll){$('cLL').textContent=`Lat ${fmtN(ll.lat,5)}, Lng ${fmtN(ll.lng,5)}`;
 if(hasProj){try{const[x,y]=proj4('EPSG:4326',UTM48S,[ll.lng,ll.lat]);$('cUTM').textContent=`UTM 48S  X ${fmtN(x,0)}  Y ${fmtN(y,0)}`}catch(e){}}
 $('cZ').textContent='Zoom '+map.getZoom()}
map.on('mousemove',e=>showCoord(e.latlng));map.on('click',e=>showCoord(e.latlng));map.on('moveend',()=>showCoord(map.getCenter()));showCoord(map.getCenter());

// ---- Panel: desktop collapse / mobile off-canvas ----
const mobile=()=>window.matchMedia('(max-width:760px)').matches;
$('toggle').onclick=()=>{if(mobile())$('panel').classList.toggle('open');else{document.body.classList.toggle('collapsed');setTimeout(()=>map.invalidateSize({pan:false}),280)}};
map.on('click',()=>{if(mobile())$('panel').classList.remove('open')});

// ---- Cetak ----
$('printBtn').onclick=()=>window.print();
window.addEventListener('beforeprint',()=>{map.invalidateSize({pan:false});if(homeBounds)map.fitBounds(homeBounds,{animate:false})});
window.addEventListener('afterprint',()=>setTimeout(()=>map.invalidateSize(),50));
