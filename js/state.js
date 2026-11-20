/* State tampilan & filter v7r4 — localStorage per pengguna.
 * Kunci: dnp_v7_state_<user> (user dinormalisasi NFKC + huruf kecil + aman untuk kunci).
 * Skema {v:1, ...}. Tidak menyimpan token, password, DEK, atau kredensial.
 * Logout TIDAK menghapus kunci ini. sessionStorage dnp_v6_legend / dnp_v7_basemap tetap
 * dipakai dalam sesi (tidak diubah formatnya) dan diisi ulang dari state ini setelah login.
 * dnp_v5_layout (ukuran panel) dan dnp_v7_symdate (minPersist mati) tidak diubah.
 */
(function(root){
'use strict';
const SCHEMA=1;
const PREFIX='dnp_v7_state_';
const DEBOUNCE=450;
const PRESETS={'minggu_ini':1,'minggu_lalu':1,'2_minggu':1,'bulan_ini':1,'bulan_lalu':1,'semua':1,'kustom':1};
const RELATIVE={'minggu_ini':1,'minggu_lalu':1,'2_minggu':1,'bulan_ini':1,'bulan_lalu':1};
const BASEMAPS={'esri':1,'google':1,'eox':1,'wayback':1};
const CATS={'Planting':1,'Stake Out':1,'Lubang Tanam':1,'OFF Planting':1,'Plan Titik Tanam':1};
const ACTS_OK={'lc':1,'rumpukan':1,'sto':1,'planting':1,'jalan':1,'drain':1,'statuslahan':1};
/* Pad longgar di sekitar bbox Batas Kebun DNP (~104.43–104.46, -3.724–-3.699) */
const BOUNDS={latMin:-3.80,latMax:-3.62,lngMin:104.35,lngMax:104.55};
const ZMIN=11,ZMAX=21,YMIN=2024,YMAX=2030;

function normUser(user){
  const s=String(user==null?'':user).normalize('NFKC').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64);
  return s||null;
}
function currentUser(){try{return window.Vault&&Vault.user?normUser(Vault.user):null}catch(e){return null}}
function storageKey(user){const n=normUser(user)||currentUser();return n?PREFIX+n:null}

function validYMD(s){
  if(s==null||s==='')return true;
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));if(!m)return false;
  const y=+m[1],mo=+m[2],d=+m[3];
  if(y<YMIN||y>YMAX||mo<1||mo>12||d<1||d>31)return false;
  const t=new Date(Date.UTC(y,mo-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d;
}
function knownLayers(){
  const s=new Set();
  try{
    if(window.Atlas&&Atlas.lay)Object.keys(Atlas.lay).forEach(id=>s.add(id));
    if(window.P17&&P17.layers)Object.keys(P17.layers).forEach(id=>s.add(id));
    if(window.ATLAS_CFG&&ATLAS_CFG.layers)Object.keys(ATLAS_CFG.layers).forEach(id=>s.add(id));
  }catch(e){}
  return s;
}
function str(v,max){if(typeof v!=='string')return '';const t=v.trim();return t.length>max?'':t}

function sanitize(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(raw.v!==SCHEMA)return null;
  const out={v:SCHEMA};
  if(raw.date&&typeof raw.date==='object'){
    const preset=PRESETS[raw.date.preset]?raw.date.preset:'kustom';
    const from=validYMD(raw.date.from)?(raw.date.from||''):'';
    const to=validYMD(raw.date.to)?(raw.date.to||''):'';
    if(!(from&&to&&from>to))out.date={from,to,preset:(from||to)?preset:'semua'};
  }
  if(raw.filters&&typeof raw.filters==='object'){
    const f={};
    Object.keys(raw.filters).forEach(id=>{
      if(!/^[a-z][a-z0-9_]{0,31}$/.test(id))return;
      const o=raw.filters[id];if(!o||typeof o!=='object')return;
      f[id]={blok:str(o.blok,32),peng:str(o.peng,80),op:str(o.op,80)};
    });
    out.filters=f;
  }
  if(Array.isArray(raw.excl))out.excl=raw.excl.filter(c=>typeof c==='string'&&CATS[c]);
  const known=knownLayers();
  if(raw.layers&&typeof raw.layers==='object'){
    const layers={};
    Object.keys(raw.layers).forEach(id=>{
      if(known.size&&!known.has(id))return;
      if(!/^[a-z][a-z0-9_]{0,47}$/.test(id))return;
      const o=raw.layers[id];if(!o||typeof o!=='object')return;
      const rec={};
      if(typeof o.on==='boolean')rec.on=o.on;
      const op=+o.op;
      if(typeof o.op==='number'&&isFinite(op))rec.op=Math.max(0,Math.min(1,op));
      if('on' in rec||'op' in rec)layers[id]=rec;
    });
    out.layers=layers;
  }
  if(raw.groups&&typeof raw.groups==='object'){
    const g={};
    Object.keys(raw.groups).forEach(k=>{
      if(typeof raw.groups[k]==='boolean'&&k.length<80)g[k]=raw.groups[k];
    });
    out.groups=g;
  }
  if(typeof raw.lgCollapsed==='boolean')out.lgCollapsed=raw.lgCollapsed;
  if(raw.basemap&&typeof raw.basemap==='object'){
    const id=BASEMAPS[raw.basemap.id]?raw.basemap.id:null;
    let wb=raw.basemap.wayback==null||raw.basemap.wayback===''?null:String(raw.basemap.wayback);
    if(wb&&!validYMD(wb)&&!/^\d{4}-\d{2}-\d{2}/.test(wb))wb=null;
    if(id)out.basemap={id,wayback:wb};
  }
  if(raw.map&&typeof raw.map==='object'){
    const lat=+raw.map.lat,lng=+raw.map.lng,z=+raw.map.zoom;
    if(isFinite(lat)&&isFinite(lng)&&isFinite(z)&&
       lat>=BOUNDS.latMin&&lat<=BOUNDS.latMax&&lng>=BOUNDS.lngMin&&lng<=BOUNDS.lngMax&&
       z>=ZMIN&&z<=ZMAX)out.map={lat,lng,zoom:Math.round(z)};
  }
  if(typeof raw.act==='string'&&ACTS_OK[raw.act])out.act=raw.act;
  if(typeof raw.savedAt==='number'&&isFinite(raw.savedAt))out.savedAt=raw.savedAt;
  return out;
}

function read(user){
  try{
    const k=storageKey(user);if(!k)return null;
    const raw=localStorage.getItem(k);if(!raw)return null;
    return sanitize(JSON.parse(raw));
  }catch(e){return null}
}
function write(obj,user){
  try{
    const k=storageKey(user);if(!k)return false;
    const clean=sanitize(obj);if(!clean){localStorage.removeItem(k);return false}
    const banned=['password','token','secret','dek','wrappedDEK','kek','auth','credential','key'];
    if(banned.some(b=>b in clean||(clean.date&&b in (clean.date||{}))))return false;
    localStorage.setItem(k,JSON.stringify(clean));
    return true;
  }catch(e){return false}
}
function clear(user){
  try{const k=storageKey(user);if(k)localStorage.removeItem(k)}catch(e){}
}

function snapshot(){
  const DR=root.DateRange,BM=root.Basemap,A=root.Atlas,K=root.Kegiatan;
  const o={v:SCHEMA,savedAt:Date.now()};
  if(DR&&DR.getRange){
    const r=DR.getRange();
    o.date={from:r.from||'',to:r.to||'',preset:r.preset||((r.from||r.to)?'kustom':'semua')};
  }
  if(K&&K.gflt&&typeof K.gflt==='object'){
    const f={};
    Object.keys(K.gflt).forEach(id=>{
      const x=K.gflt[id]||{};
      f[id]={blok:x.blok||'',peng:x.peng||'',op:x.op||''};
    });
    o.filters=f;
  }
  if(K&&K.excl)o.excl=[...K.excl].filter(c=>CATS[c]);
  if(K&&K.sel&&ACTS_OK[K.sel])o.act=K.sel;
  if(A&&typeof A.lgCollapsed==='function')o.lgCollapsed=!!A.lgCollapsed();
  if(A&&A.st){
    const layers={};
    Object.keys(A.st).forEach(id=>{
      const L=A.lay&&A.lay[id];
      layers[id]={on:!!A.st[id].own,op:+((L&&L.op!=null)?L.op:1)};
    });
    o.layers=layers;
    if(A._lgGroups)o.groups=A._lgGroups();
  }
  if(BM&&BM.id)o.basemap={id:BM.id,wayback:BM.wayback||null};
  const map=(A&&A.map)||root.map;
  if(map&&map.getCenter&&map.getZoom){
    const c=map.getCenter();
    o.map={lat:c.lat,lng:c.lng,zoom:map.getZoom()};
  }
  return o;
}

let saveT=0,paused=false;
function saveNow(){if(paused)return false;return write(snapshot())}
function scheduleSave(){
  if(paused)return;
  clearTimeout(saveT);
  saveT=setTimeout(saveNow,DEBOUNCE);
}

/* Isi sessionStorage dnp_v6_legend / dnp_v7_basemap dari state per-user
 * SEBELUM Basemap.init / Atlas.init agar tidak berkedip ke default. */
function seedSession(){
  const st=read();if(!st)return st;
  try{
    /* Jangan timpa sessionStorage yang masih ada (reload / login ulang tanpa logout).
     * Setelah logout, session dikosongkan — baru diisi dari localStorage. */
    const key=(root.BASEMAP_CFG&&root.BASEMAP_CFG.storeKey)||'dnp_v7_basemap';
    if(st.basemap&&!sessionStorage.getItem(key)){
      sessionStorage.setItem(key,JSON.stringify({v:1,id:st.basemap.id,wayback:st.basemap.wayback||undefined}));
    }
    if((st.layers||st.groups||typeof st.lgCollapsed==='boolean')&&!sessionStorage.getItem('dnp_v6_legend')){
      const layers={};
      if(st.layers)Object.keys(st.layers).forEach(id=>{
        const o=st.layers[id];layers[id]={on:!!o.on,op:o.op==null?1:o.op};
      });
      sessionStorage.setItem('dnp_v6_legend',JSON.stringify({v:1,layers,groups:st.groups||{},collapsed:!!st.lgCollapsed}));
    }
  }catch(e){}
  if(st.date&&root.DateRange){
    try{
      const p=st.date.preset;
      if(!st.date.from&&!st.date.to)root.DateRange.clearRange();
      else if(RELATIVE[p]&&root.DateRange.applyPreset)root.DateRange.applyPreset(p);
      else root.DateRange.setRange({from:st.date.from,to:st.date.to},{preset:p||'kustom',force:true});
    }catch(e){}
  }
  return st;
}

let mapApplied=false;
function takeMapView(){
  if(mapApplied)return null;
  const st=read();
  if(!st||!st.map)return null;
  mapApplied=true;
  return st.map;
}
function hasMapView(){return !!(read()&&read().map)}

function restoreKegiatan(){
  const st=read();if(!st)return;
  const K=root.Kegiatan;if(!K)return;
  paused=true;
  try{
    if(st.filters){
      K.gflt=K.gflt||{};
      Object.keys(st.filters).forEach(id=>{K.gflt[id]=Object.assign({},K.gflt[id]||{},st.filters[id])});
    }
    if(st.excl&&K.excl){
      K.excl.clear();
      st.excl.forEach(c=>K.excl.add(c));
      if(root.Atlas&&Atlas.st&&Atlas.st.titik_tanam_realisasi&&Atlas.st.titik_tanam_realisasi.pts&&Atlas.setPointFilter){
        const map={Planting:'Planting','Stake Out Titik Tanam':'Stake Out','Lubang Tanam':'Lubang Tanam','OFF Planting':'OFF Planting'};
        Atlas.setPointFilter('titik_tanam_realisasi',p=>!K.excl.has(map[p.Name]||p.Name));
      }
    }
    if(st.act&&K.openAct&&K.ready){
      try{K.openAct(st.act,false)}catch(e){}
    }
  }finally{paused=false}
}

let hookedDR=false;
function hook(){
  if(!hookedDR&&root.DateRange&&root.DateRange.onChange){root.DateRange.onChange(scheduleSave);hookedDR=true}
  const map=(root.Atlas&&root.Atlas.map)||root.map;
  if(map&&map.on&&!map._dnpStateHook){map._dnpStateHook=1;map.on('moveend zoomend',scheduleSave)}
}

const api={
  SCHEMA,PREFIX,normUser,key:storageKey,read,write,clear,
  snapshot,save:scheduleSave,saveNow,seedSession,takeMapView,hasMapView,
  restoreKegiatan,hook,sanitize,
  get paused(){return paused},setPaused(v){paused=!!v}
};
root.UiState=api;
try{seedSession();hook()}catch(e){}
})(typeof window!=='undefined'?window:this);
