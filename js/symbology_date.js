/* Simbologi berbasis TANGGAL untuk semua layer progres (modul terpisah, tanpa dependensi).
 *
 * Aturan (keputusan Dwi):
 *  - fitur yang `Tanggal`-nya MASUK rentang filter tanggal  -> isian solid warna terang per jenis
 *  - fitur di LUAR rentang (sebelum, sesudah, atau tanpa tanggal) -> arsir diagonal tipis warna sama + outline sama, tanpa isian solid
 *  - geometri garis: terpilih = tebal solid; tidak terpilih = tipis putus-putus
 *  - legenda (rentang aktif): 2 entri per jenis; tanpa rentang (v7r2): 1 entri arsir per jenis
 *  - field `Code` TIDAK dipakai sama sekali; jenis diambil dari `Name` (atau dari id layer untuk LC).
 *
 * === PERBEDAAN v7r2 vs modul MJ 1.0.0 (jangan sunting /workspace/webgis_v7_mj/) ===
 * Keputusan Dwi 20 Nov 2026 15.00 WIB: TANPA rentang tanggal terpilih, SEMUA fitur progres
 * tampil gaya arsir (setara Code 0): diagonal tipis warna jenis + outline sewarna, tanpa isian solid.
 * Solid terang HANYA untuk fitur di dalam rentang terpilih. Legenda tanpa rentang: 1 entri arsir per jenis.
 * Saklar: cfg.noRange = 'hatch-all' (default v7r2) | 'legacy' (perilaku MJ asli: tanpa rentang = simbologi Code lama).
 * Ganti lewat SymbologiTanggal.configure({noRange:'legacy'}) bila perlu.
 * Lihat NOTES_SIMBOLOGI_V7R2.md (untuk Meridian-J).
 * Modul murni (bisa diuji di Node); bagian DOM (pola SVG, widget rentang) hanya jalan bila ada `document`. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.SymbologiTanggal=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const VERSION='1.0.0';
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const NS='http://www.w3.org/2000/svg';

// ------------------------------------------------------------------ jenis & warna
// match = nama (Name) yang dinormalisasi; `layers` = layer progres tempat jenis ini muncul;
// byLayer = jenis ditentukan oleh id layer (tanpa Name); noDate = layer tanpa kolom Tanggal -> dibiarkan simbologi lama.
const JENIS=[
 {key:'lc',label:'LC',layers:['land_clearing'],byLayer:true,color:'#FFFF00'},
 {key:'rumpukan',label:'Rumpukan',layers:['rumpukan'],match:['rumpukan'],color:'#FFA500'},
 {key:'maintenance_rumpukan',label:'Maintenance Rumpukan',layers:['rumpukan'],match:['maintenance rumpukan'],color:'#B5651D'},
 {key:'timbun',label:'Timbun',layers:['rumpukan'],match:['timbun rumpukan','timbun'],color:'#55FF00'},
 {key:'main_drain',label:'Main Drain',layers:['drain_realisasi'],match:['main drain'],color:'#FF0000'},
 {key:'field_drain',label:'Field Drain',layers:['drain_realisasi'],match:['field drain'],color:'#0070FF'},
 {key:'perimeter_drain',label:'Perimeter Drain',layers:['drain_realisasi'],match:['perimeter drain'],color:'#00E0B8'},
 {key:'gorong',label:'Gorong Gorong',layers:['drain_realisasi'],match:['gorong gorong','gorong'],color:'#FFD600'},
 {key:'collection_drain',label:'Collection Drain',layers:['drain_realisasi'],match:['collection drain'],color:'#FF69B4'},
 {key:'canal',label:'Canal',layers:['drain_realisasi'],match:['canal'],color:'#7DF9E8'},
 {key:'cuci_parit',label:'Cuci Parit',layers:['drain_realisasi'],match:['cuci parit'],color:'#33CC33'},
 // Jalan: warna TIDAK ditetapkan Dwi -> asumsi (dapat diganti lewat configure({colors}))
 {key:'main_road',label:'Main Road',layers:['jalan_realisasi'],match:['main road'],color:'#40C4FF'},
 {key:'collection_road',label:'Collection Road',layers:['jalan_realisasi'],match:['collection road'],color:'#C6FF00'},
 {key:'perimeter_road',label:'Perimeter Road',layers:['jalan_realisasi'],match:['perimeter road'],color:'#D580FF'},
 {key:'maintenance_road',label:'Maintenance Road',layers:['jalan_maintenance'],byLayer:true,color:'#B0BEC5',noDate:true}
];
const ORDER=['land_clearing','rumpukan','drain_realisasi','jalan_realisasi','jalan_maintenance'];

const cfg={afterRange:'hatch',noDate:'hatch',hatchGap:5,hatchWidth:1.3,lineIn:4,lineOut:1.4,dash:'6 5',minPersist:false,persistKey:'dnp_v7_symdate',noRange:'hatch-all'};
const colorOv={};
const state={global:{from:'',to:''},byLayer:{},listeners:[]};

// ------------------------------------------------------------------ tanggal
const pad=n=>(n<10?'0':'')+n;
function validYMD(y,m,d){if(!(m>=1&&m<=12&&d>=1&&d<=31))return false;const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d}
/** Normalisasi nilai Tanggal ke 'YYYY-MM-DD' (atau null bila kosong/tidak valid).
 *  Menerima: 'YYYY-MM-DD[...]', 'YYYY/MM/DD', 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'DD.MM.YYYY', Date, epoch ms/detik (UTC). */
function normDate(v){
 if(v==null||v==='')return null;
 if(v instanceof Date){if(isNaN(v))return null;return v.getUTCFullYear()+'-'+pad(v.getUTCMonth()+1)+'-'+pad(v.getUTCDate())}
 if(typeof v==='number'){if(!isFinite(v))return null;const ms=Math.abs(v)<1e11?v*1000:v;return normDate(new Date(ms))}
 const s=String(v).trim();if(!s)return null;let m;
 if((m=/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?!\d)/.exec(s))){const y=+m[1],mo=+m[2],d=+m[3];return validYMD(y,mo,d)?y+'-'+pad(mo)+'-'+pad(d):null}
 if((m=/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?!\d)/.exec(s))){const d=+m[1],mo=+m[2],y=+m[3];return validYMD(y,mo,d)?y+'-'+pad(mo)+'-'+pad(d):null}
 return null}
function addDays(iso,n){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);if(!m)return null;const t=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())}
function fmtDate(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?`${+m[3]} ${BLN[+m[2]-1]} ${m[1]}`:''}
/** '1-7 Nov 2026' | '28 Okt-3 Nov 2026' | '30 Des 2026-2 Jan 2027' | '7 Nov 2026' | 'Mulai 1 Nov 2026' | 'Hingga 7 Nov 2026' */
function fmtRange(from,to){
 from=normDate(from)||'';to=normDate(to)||'';
 if(from&&to&&from>to){const t=from;from=to;to=t}
 if(!from&&!to)return '';
 if(!to)return 'Mulai '+fmtDate(from);
 if(!from)return 'Hingga '+fmtDate(to);
 if(from===to)return fmtDate(from);
 const a=from.split('-'),b=to.split('-');
 if(a[0]===b[0]&&a[1]===b[1])return `${+a[2]}-${+b[2]} ${BLN[+b[1]-1]} ${b[0]}`;
 if(a[0]===b[0])return `${+a[2]} ${BLN[+a[1]-1]}-${+b[2]} ${BLN[+b[1]-1]} ${b[0]}`;
 return `${fmtDate(from)}-${fmtDate(to)}`}

// ------------------------------------------------------------------ rentang
function cleanRange(r){r=r||{};let from=normDate(r.from)||'',to=normDate(r.to)||'';if(from&&to&&from>to){const t=from;from=to;to=t}return{from,to}}
const same=(a,b)=>a.from===b.from&&a.to===b.to;
function emit(){state.listeners.slice().forEach(fn=>{try{fn(api.getRange())}catch(e){if(typeof console!=='undefined')console.error('symbology_date listener',e)}});persist()}
function setRange(r){const n=cleanRange(r);if(same(n,state.global))return n;state.global=n;emit();return n}
function clearRange(){return setRange({from:'',to:''})}
function setLayerRange(layerId,r){const n=cleanRange(r);if(!n.from&&!n.to){if(!state.byLayer[layerId])return n;delete state.byLayer[layerId]}else{if(state.byLayer[layerId]&&same(state.byLayer[layerId],n))return n;state.byLayer[layerId]=n}emit();return n}
function clearLayerRange(layerId){return setLayerRange(layerId,{})}
function getRange(layerId){return Object.assign({},(layerId&&state.byLayer[layerId])||state.global)}
function rangeOn(layerId){const r=getRange(layerId);return !!(r.from||r.to)}
function isActive(layerId){if(rangeOn(layerId))return true;if(cfg.noRange==='hatch-all')return !layerId||handles(layerId);return false}
function onChange(fn){state.listeners.push(fn);return()=>{const i=state.listeners.indexOf(fn);if(i>=0)state.listeners.splice(i,1)}}

// ------------------------------------------------------------------ klasifikasi
const normName=s=>String(s==null?'':s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
const colorOf=j=>colorOv[j.key]||j.color;
function handles(layerId){return JENIS.some(j=>j.layers.includes(layerId))}
function jenisOf(layerId,props){
 const p=props&&props.properties&&!('Name' in props)?props.properties:(props||{});
 const cand=JENIS.filter(j=>j.layers.includes(layerId));if(!cand.length)return null;
 const byL=cand.find(j=>j.byLayer);if(byL)return byL;
 const n=normName(p.Name);return cand.find(j=>(j.match||[]).includes(n))||null}
/** 'in' | 'out_before' | 'out_after' | 'nodate' ; null bila rentang tidak aktif. Hanya memakai `Tanggal` (bukan Code). */
function bucketOf(range,tanggal){
 if(!range||(!range.from&&!range.to))return null;
 const d=normDate(tanggal);if(!d)return 'nodate';
 if(range.from&&d<range.from)return 'out_before';
 if(range.to&&d>range.to)return 'out_after';
 return 'in'}
function bucket(layerId,props){const p=props&&props.properties&&!('Tanggal' in props)?props.properties:(props||{});return bucketOf(getRange(layerId),p.Tanggal)}
/** Apakah fitur digambar? (default: semua digambar; 'hide' pada afterRange/noDate menyembunyikan) */
function shouldDraw(layerId,props){
 const j=jenisOf(layerId,props);if(!j||j.noDate||!isActive(layerId))return true;
 const b=bucket(layerId,props);
 if(b==='out_after'&&cfg.afterRange==='hide')return false;
 if(b==='nodate'&&cfg.noDate==='hide')return false;
 return true}

// ------------------------------------------------------------------ gaya
function shade(hex,f){const m=/^#?([0-9a-f]{6})$/i.exec(hex);if(!m)return '#000000';const n=parseInt(m[1],16);const c=[(n>>16)&255,(n>>8)&255,n&255].map(x=>Math.max(0,Math.min(255,Math.round(x*f))));return '#'+c.map(x=>x.toString(16).padStart(2,'0')).join('')}
const patId=hex=>'sd-hatch-'+hex.replace('#','').toLowerCase();
const isLineGeom=t=>t==='LineString'||t==='MultiLineString';
function styleOf(j,b,geom){
 const c=colorOf(j),line=isLineGeom(geom),inR=(b==='in');
 if(line)return inR?{stroke:true,color:c,weight:cfg.lineIn,opacity:1,lineCap:'round',lineJoin:'round',fill:false,dashArray:null,interactive:false}
  :{stroke:true,color:c,weight:cfg.lineOut,opacity:1,lineCap:'butt',lineJoin:'round',fill:false,dashArray:cfg.dash,interactive:false};
 if(inR)return{stroke:true,color:shade(c,.45),weight:.9,opacity:1,lineCap:'round',lineJoin:'round',fill:true,fillColor:c,fillOpacity:1,dashArray:null,interactive:false};
 return{stroke:true,color:c,weight:1.2,opacity:1,lineCap:'round',lineJoin:'round',fill:true,fillColor:'url(#'+patId(c)+')',fillOpacity:1,dashArray:null,interactive:false}}
/** Opsi gaya Leaflet untuk satu fitur (GeoJSON Feature atau objek properties), atau null bila modul tidak berlaku
 *  (rentang tidak aktif / jenis tidak dikenal / layer tanpa Tanggal) -> pemanggil memakai simbologi lama. */
function styleFor(layerId,feat,geomType){
 const props=feat&&feat.properties?feat.properties:feat;const j=jenisOf(layerId,props);
 if(!j||j.noDate)return null;
 if(!isActive(layerId))return null;
 const g=geomType||(feat&&feat.geometry&&feat.geometry.type)||'Polygon';
 const b=bucket(layerId,props);
 if(!b)return cfg.noRange==='hatch-all'?styleOf(j,'out',g):null;
 return styleOf(j,b==='in'?'in':'out',g)}
/** Urutkan fitur: yang di luar rentang digambar dulu, yang di dalam rentang terakhir (di atas). Stabil; tidak mengubah array asal. */
function prepare(layerId,feats){
 if(!handles(layerId)||!rangeOn(layerId))return feats;
 const rk=f=>{const j=jenisOf(layerId,f.properties);if(!j||j.noDate)return 1;return bucket(layerId,f.properties)==='in'?2:0};
 return feats.map((f,i)=>[rk(f),i,f]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2])}

// ------------------------------------------------------------------ statistik & legenda
/** { jenisKey: {in, out_before, out_after, nodate, total} } untuk daftar fitur sebuah layer. */
function stats(layerId,feats){
 const out={};(feats||[]).forEach(f=>{const j=jenisOf(layerId,f.properties);if(!j)return;
  const o=out[j.key]||(out[j.key]={in:0,out_before:0,out_after:0,nodate:0,total:0,line:false});
  const b=bucket(layerId,f.properties);if(b)o[b]++;o.total++;if(f.geometry&&isLineGeom(f.geometry.type))o.line=true});
 return out}
/** Baris legenda (2 per jenis yang ada di layer): [{id,jenisKey,kind:'solid'|'hatch',label,title,color,n,line}] ; null bila rentang tidak aktif. */
function legendRows(layerId,feats){
 if(!handles(layerId))return null;
 const r=getRange(layerId),st=stats(layerId,feats),rows=[];
 if(!rangeOn(layerId)){
  if(cfg.noRange!=='hatch-all')return null;
  JENIS.filter(j=>j.layers.includes(layerId)&&!j.noDate&&st[j.key]).forEach(j=>{
   const s=st[j.key],c=colorOf(j);
   rows.push({id:j.key+':hatch',jenisKey:j.key,kind:'hatch',label:j.label,title:`Tanpa rentang terpilih: ${s.total} fitur tampil arsir (gaya Code 0). Pilih rentang agar fitur dalam rentang solid terang.`,color:c,n:s.total,line:s.line})});
  return rows}
 JENIS.filter(j=>j.layers.includes(layerId)&&!j.noDate&&st[j.key]).forEach(j=>{
  const s=st[j.key],c=colorOf(j);
  rows.push({id:j.key+':solid',jenisKey:j.key,kind:'solid',label:`${j.label} ${fmtRange(r.from,r.to)}`,title:`${s.in} fitur dengan Tanggal dalam rentang`,color:c,n:s.in,line:s.line});
  const hl=r.from?`${j.label} Hingga ${fmtDate(addDays(r.from,-1))}`:`${j.label} Setelah ${fmtDate(r.to)}`;
  const note=`${s.out_before+s.out_after+s.nodate} fitur di luar rentang: ${s.out_before} sebelum, ${s.out_after} sesudah, ${s.nodate} tanpa tanggal`;
  rows.push({id:j.key+':hatch',jenisKey:j.key,kind:'hatch',label:hl,title:note,color:c,n:s.out_before+s.out_after+s.nodate,line:s.line})});
 return rows}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** SVG swatch 24x12 untuk satu baris legenda (aman: hanya angka/warna internal). */
function swatchSvg(row,w,h){w=w||24;h=h||12;const c=row.color,dk=shade(c,.45);
 if(row.line){return row.kind==='solid'
  ?`<svg class="atl-sw sd-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="1.5" y1="${h/2}" x2="${w-1.5}" y2="${h/2}" stroke="${c}" stroke-width="${cfg.lineIn}" stroke-linecap="round"/></svg>`
  :`<svg class="atl-sw sd-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="1.5" y1="${h/2}" x2="${w-1.5}" y2="${h/2}" stroke="${c}" stroke-width="${cfg.lineOut}" stroke-dasharray="${cfg.dash.replace(' ',',')}"/></svg>`}
 return row.kind==='solid'
  ?`<svg class="atl-sw sd-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x=".8" y=".8" width="${w-1.6}" height="${h-1.6}" rx="1.5" fill="${c}" stroke="${dk}" stroke-width=".9"/></svg>`
  :`<svg class="atl-sw sd-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect x=".8" y=".8" width="${w-1.6}" height="${h-1.6}" rx="1.5" fill="url(#${patId(c)})" stroke="${c}" stroke-width="1.2"/></svg>`}
/** HTML baris legenda siap-pakai (mengikuti markup .lg-row.lg-cr milik atlas.js). */
function legendRowHtml(row,depth){return `<div class="lg-row lg-cr sd-row${row.n?'':' sd-zero'}" data-sd="${esc(row.id)}" title="${esc(row.title)}" style="--d:${depth==null?1:depth}"><i class="lg-sw">${swatchSvg(row)}</i><span>${esc(row.label)}</span></div>`}

// ------------------------------------------------------------------ pola SVG (arsir)
function usedColors(){return JENIS.map(colorOf).filter((c,i,a)=>a.indexOf(c)===i)}
/** Markup <pattern> arsir diagonal untuk semua warna (latar transparan = tanpa isian solid). */
function patternsMarkup(){
 return usedColors().map(c=>`<pattern id="${patId(c)}" patternUnits="userSpaceOnUse" width="${cfg.hatchGap}" height="${cfg.hatchGap}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${cfg.hatchGap}" stroke="${c}" stroke-width="${cfg.hatchWidth}"/></pattern>`).join('')}
function ensurePatterns(doc){doc=doc||(typeof document!=='undefined'?document:null);if(!doc)return false;
 const old=doc.getElementById('sdPatterns');if(old)old.remove();
 const s=doc.createElementNS(NS,'svg');s.id='sdPatterns';s.setAttribute('width','0');s.setAttribute('height','0');s.setAttribute('aria-hidden','true');s.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
 s.innerHTML='<defs>'+patternsMarkup()+'</defs>';doc.body.appendChild(s);return true}

// ------------------------------------------------------------------ konfigurasi & persist
function configure(o){o=o||{};
 if(o.colors)Object.keys(o.colors).forEach(k=>{if(JENIS.some(j=>j.key===k)&&/^#[0-9a-f]{6}$/i.test(o.colors[k]))colorOv[k]=o.colors[k].toUpperCase()});
 ['afterRange','noDate'].forEach(k=>{if(o[k]==='hatch'||o[k]==='hide')cfg[k]=o[k]});
 if(o.noRange==='hatch-all'||o.noRange==='legacy')cfg.noRange=o.noRange;
 ['hatchGap','hatchWidth','lineIn','lineOut'].forEach(k=>{if(typeof o[k]==='number'&&o[k]>0)cfg[k]=o[k]});
 if(typeof o.dash==='string')cfg.dash=o.dash;
 if(typeof o.persist==='boolean')cfg.minPersist=o.persist;
 if(o.colors&&typeof document!=='undefined'&&document.getElementById('sdPatterns'))ensurePatterns();
 emit();return api}
function persist(){if(!cfg.minPersist||typeof sessionStorage==='undefined')return;try{sessionStorage.setItem(cfg.persistKey,JSON.stringify({v:1,range:state.global}))}catch(e){}}
function restore(){if(typeof sessionStorage==='undefined')return null;try{const o=JSON.parse(sessionStorage.getItem(cfg.persistKey)||'null');if(o&&o.v===1&&o.range)return setRange(o.range)}catch(e){}return null}

// ------------------------------------------------------------------ pasang ke Atlas (opsional)
/** Bangun ulang layer progres yang sudah dimuat setiap rentang berubah. `atlas` = window.Atlas. */
function attach(atlas){if(!atlas||!atlas.st||!atlas.setFeatures)return()=>{};
 const un=onChange(()=>{ORDER.forEach(id=>{const s=atlas.st[id];if(!s||!s.layer||!s.data||!s.data.features)return;atlas.setFeatures(id,s.feats||s.data.features)})});
 return un}

// ------------------------------------------------------------------ widget rentang (opsional)
/** Isi `host` (elemen) dengan dua input tanggal + Reset. Hanya memakai textContent / atribut, tanpa innerHTML data. */
function mountControl(host,opts){
 if(!host||typeof document==='undefined')return null;opts=opts||{};
 if(typeof window!=='undefined'&&window.DateRange)return window.DateRange.mount(host,{variant:'legend',sumId:'sdSum'});
 const d=document,mk=(t,c,x)=>{const e=d.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
 host.textContent='';const box=mk('div','sd-ctl');box.setAttribute('role','group');box.setAttribute('aria-label','Simbologi tanggal');
 box.appendChild(mk('div','sd-title','Simbologi tanggal'));
 const row=mk('div','sd-two');
 const lf=mk('label',null,'Dari'),inF=mk('input');inF.type='text';inF.id='sdFrom';inF.setAttribute('inputmode','numeric');inF.setAttribute('placeholder','YYYY-MM-DD');lf.appendChild(inF);
 const lt=mk('label',null,'Sampai'),inT=mk('input');inT.type='text';inT.id='sdTo';inT.setAttribute('inputmode','numeric');inT.setAttribute('placeholder','YYYY-MM-DD');lt.appendChild(inT);
 row.appendChild(lf);row.appendChild(lt);box.appendChild(row);
 const rs=mk('button','sd-reset','Reset');rs.type='button';rs.id='sdReset';
 const sum=mk('div','sd-sum');sum.id='sdSum';sum.setAttribute('aria-live','polite');
 box.appendChild(rs);box.appendChild(sum);host.appendChild(box);
 const paint=()=>{const r=getRange();inF.value=r.from;inT.value=r.to;sum.textContent=r.from||r.to?('Rentang: '+fmtRange(r.from,r.to)+' - di luar rentang diarsir'):(cfg.noRange==='hatch-all'?'Tanpa rentang: semua fitur arsir (gaya Code 0)':'Tidak aktif (simbologi lama)')};
 const read=()=>setRange({from:inF.value,to:inT.value});
 inF.addEventListener('change',read);inT.addEventListener('change',read);rs.addEventListener('click',()=>clearRange());
 const un=onChange(paint);paint();
 return{el:box,destroy(){un();host.textContent=''}}}

const api={version:VERSION,JENIS,cfg,
 normDate,addDays,fmtDate,fmtRange,
 setRange,clearRange,setLayerRange,clearLayerRange,getRange,isActive,rangeOn,onChange,
 handles,jenisOf,bucketOf,bucket,shouldDraw,styleFor,prepare,stats,
 legendRows,legendRowHtml,swatchSvg,
 patternsMarkup,ensurePatterns,configure,restore,attach,mountControl,
 _shade:shade,_patId:patId};
return api;
});
