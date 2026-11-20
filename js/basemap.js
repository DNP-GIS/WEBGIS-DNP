/* Pemilih basemap v7 + overzoom. Tidak mengubah angka/KPI/popup/legenda v6. */
(function(){
'use strict';
const C=()=>window.BASEMAP_CFG||{};
const KEY=()=>C().storeKey||'dnp_v7_basemap';
const MZ=()=>C().mapMaxZoom||21;
const IDS=['esri','google','wayback','eox'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const tglLab=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d);return m?`${+m[3]} ${BLN[+m[2]-1]} ${m[1]}`:d};

let map,layers={},currentId=null,waybackDate=null,ctlEl=null;

function loadStore(){try{return JSON.parse(sessionStorage.getItem(KEY())||'null')}catch(e){return null}}
function saveStore(){try{sessionStorage.setItem(KEY(),JSON.stringify({v:1,id:currentId,wayback:waybackDate}))}catch(e){}}

function mkTile(url,opt){
  const o=Object.assign({maxZoom:MZ(),minZoom:0,errorTileUrl:''},opt||{});
  return window.L.tileLayer(url,o);
}
function waybackReleases(){return (C().wayback&&C().wayback.releases)||[]}
function waybackOf(date){
  const rs=waybackReleases();
  return rs.find(r=>r.date===date)||rs[0]||null;
}
function ensureLayers(){
  const cfg=C();
  if(!layers.esri){
    const e=cfg.esri;
    layers.esri=mkTile(e.url,{maxNativeZoom:e.maxNativeZoom,attribution:e.attribution,className:'bm-esri'});
  }
  if(!layers.google){
    const g=cfg.google;
    layers.google=mkTile(g.url,{maxNativeZoom:g.maxNativeZoom,subdomains:g.subdomains||'0123',attribution:g.attribution,className:'bm-google'});
  }
  if(!layers.eox){
    const x=cfg.eox;
    layers.eox=mkTile(x.url,{maxNativeZoom:x.maxNativeZoom,attribution:x.attribution,className:'bm-eox'});
  }
  if(!layers.wayback){
    const w=cfg.wayback,r=waybackOf(waybackDate)||waybackReleases()[0];
    waybackDate=r?r.date:waybackDate;
    layers.wayback=mkTile(r?r.url:'',{maxNativeZoom:w.maxNativeZoom,attribution:w.attribution,className:'bm-wayback'});
  }
}

function show(id,wbDate){
  ensureLayers();
  const want=IDS.includes(id)?id:(C().defaultId||'esri');
  if(want==='wayback'&&wbDate&&wbDate!==waybackDate){
    const r=waybackOf(wbDate);
    if(r){waybackDate=r.date;layers.wayback.setUrl(r.url)}
  }else if(want==='wayback'&&!waybackDate){
    const r=waybackReleases()[0];if(r)waybackDate=r.date;
  }
  const next=layers[want];
  if(!next)return currentId;
  Object.keys(layers).forEach(k=>{
    if(layers[k]&&k!==want&&map.hasLayer(layers[k]))map.removeLayer(layers[k]);
  });
  if(!map.hasLayer(next))map.addLayer(next);
  currentId=want;
  saveStore();
  syncUi();
  return currentId;
}

function labelOf(id){
  if(id==='esri')return C().esri.label;
  if(id==='google')return C().google.label;
  if(id==='eox')return C().eox.label;
  if(id==='wayback')return C().wayback.label+(waybackDate?' · '+tglLab(waybackDate):'');
  return id;
}

function syncUi(){
  if(!ctlEl)return;
  const btn=ctlEl.querySelector('.bm-btn');
  if(btn){btn.querySelector('.bm-btn-l').textContent=labelOf(currentId);btn.setAttribute('aria-expanded',ctlEl.classList.contains('open')?'true':'false')}
  ctlEl.querySelectorAll('input[name="bmId"]').forEach(r=>{r.checked=r.value===currentId});
  const wb=ctlEl.querySelector('#bmWayback');
  if(wb&&waybackDate)wb.value=waybackDate;
}

function panelHtml(){
  const cfg=C();
  const rs=waybackReleases();
  const opt=rs.map(r=>`<option value="${esc(r.date)}">${esc(tglLab(r.date))}</option>`).join('');
  const item=(id,label,extra)=>`<label class="bm-item"><input type="radio" name="bmId" value="${id}"><span class="bm-lab">${esc(label)}</span>${extra||''}</label>`;
  const gNote=cfg.google&&cfg.google.warning?`<small class="bm-warn">Tidak resmi — risiko ToS. Lihat README_V7.md.</small>`:'';
  return `<button type="button" class="bm-btn" aria-expanded="false" aria-controls="bmPanel" title="Pilih citra dasar">
    <span class="bm-ico" aria-hidden="true">▣</span><span class="bm-btn-l">${esc(labelOf(currentId||cfg.defaultId))}</span><span class="bm-car" aria-hidden="true">▾</span>
  </button>
  <div id="bmPanel" class="bm-panel" hidden>
    <div class="bm-h">Citra dasar</div>
    ${item('esri',cfg.esri.label)}
    ${item('google',cfg.google.label,gNote)}
    ${item('wayback',cfg.wayback.label,`<select id="bmWayback" class="bm-sel" aria-label="Rilis Wayback">${opt}</select>`)}
    ${item('eox',cfg.eox.label)}
  </div>`;
}

function addControl(){
  const ctl=window.L.control({position:'topleft'});
  ctl.onAdd=()=>{
    const d=window.L.DomUtil.create('div','bm-ctl leaflet-control');
    d.id='bmCtl';
    d.innerHTML=panelHtml();
    window.L.DomEvent.disableClickPropagation(d);
    window.L.DomEvent.disableScrollPropagation(d);
    ctlEl=d;
    const btn=d.querySelector('.bm-btn'),panel=d.querySelector('#bmPanel');
    const open=on=>{d.classList.toggle('open',on);panel.hidden=!on;btn.setAttribute('aria-expanded',on?'true':'false')};
    btn.addEventListener('click',e=>{e.preventDefault();open(panel.hidden)});
    d.addEventListener('change',e=>{
      const t=e.target;
      if(t.name==='bmId')show(t.value,waybackDate);
      if(t.id==='bmWayback'){waybackDate=t.value;show('wayback',t.value)}
    });
    document.addEventListener('click',e=>{if(!d.contains(e.target))open(false)},true);
    return d;
  };
  ctl.addTo(map);
}

function refreshWaybackList(){
  const url=C().waybackConfigUrl;if(!url)return Promise.resolve();
  return fetch(url,{mode:'cors',credentials:'omit'}).then(r=>r.ok?r.json():Promise.reject()).then(js=>{
    const out=[];
    Object.keys(js).forEach(k=>{
      const v=js[k],m=/Wayback (\d{4}-\d{2}-\d{2})/.exec(v&&v.itemTitle||'');
      if(!m||!v.itemURL)return;
      out.push({date:m[1],release:+k||k,title:v.itemTitle,url:v.itemURL.replace('{level}','{z}').replace('{row}','{y}').replace('{col}','{x}'),id:v.layerIdentifier||''});
    });
    out.sort((a,b)=>a.date<b.date?1:-1);
    if(out.length){C().wayback.releases=out.slice(0,16);const sel=ctlEl&&ctlEl.querySelector('#bmWayback');
      if(sel){const cur=waybackDate;sel.innerHTML=out.slice(0,16).map(r=>`<option value="${esc(r.date)}">${esc(tglLab(r.date))}</option>`).join('');if(cur)sel.value=cur}}
  }).catch(()=>{});
}

function init(m){
  map=m;
  if(typeof map.setMaxZoom==='function')map.setMaxZoom(MZ());
  const st=loadStore();
  waybackDate=(st&&st.wayback)||((waybackReleases()[0]||{}).date);
  ensureLayers();
  addControl();
  const start=(st&&IDS.includes(st.id))?st.id:(C().defaultId||'esri');
  show(start,waybackDate);
  refreshWaybackList();
  return api;
}

const api={
  init,show,set:show,
  get id(){return currentId},
  get wayback(){return waybackDate},
  get layers(){return layers},
  get mapMaxZoom(){return MZ()},
  maxNativeZoom(id){const Lr=layers[id];return Lr&&Lr.options&&Lr.options.maxNativeZoom},
  storeKey:KEY,
  atlasBases(){ensureLayers();const e=C().esri;const o={};o[e.label]=layers.esri;return o},
  openPicker(on){if(!ctlEl)return;const p=ctlEl.querySelector('#bmPanel');if(!p)return;ctlEl.classList.toggle('open',on!==false);p.hidden=on===false;const b=ctlEl.querySelector('.bm-btn');if(b)b.setAttribute('aria-expanded',p.hidden?'false':'true')}
};
window.Basemap=api;
})();
