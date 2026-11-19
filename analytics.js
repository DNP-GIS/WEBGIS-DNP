// Analitik tambahan Web GIS Kebun Spartan (v2): tren, progres blok, produktivitas, tabel + CSV, realisasi tanam.
// Semua luas dihitung di UTM 48S (EPSG:32748) agar konsisten dengan kolom Luas (ha) pada data asli.
(function(){
'use strict';
const HL_COLOR='#00e5ff';
const NAMA_KAT={'Planting':'Planting (tanam)','Stake Out':'Stake Out titik tanam','Lubang Tanam':'Lubang tanam','OFF Planting':'OFF Planting'};
const A={ready:false,fs:[],hl:null,hlLayer:null,tab:'ring',mode:'day',sort:{blok:{k:'no',d:1},tabel:{k:'Tanggal',d:1},tanam:{k:'no',d:1}},colorBlok:false,tnCat:'Planting',showBlokAll:false};
window.Analytics=A;
const $=id=>document.getElementById(id);
const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
const pc=window.polygonClipping;
const proj=c=>proj4('EPSG:4326',UTM48S,c);
const toMulti=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p.map(r=>r.map(proj)));
function ringArea(r){let s=0;const n=r.length,x0=r[0][0],y0=r[0][1];for(let i=0;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=(a[0]-x0)*(b[1]-y0)-(b[0]-x0)*(a[1]-y0)}return Math.abs(s/2)}
const areaM2=m=>m.reduce((t,p)=>t+p.reduce((u,r,i)=>u+(i?-1:1)*ringArea(r),0),0);
const ha=m=>m&&m.length?areaM2(m)/1e4:0;
function bboxM(m){let a=1e99,b=1e99,c=-1e99,d=-1e99;m.forEach(p=>p[0].forEach(([x,y])=>{if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>d)d=y}));return[a,b,c,d]}
const bbHit=(p,q)=>p[0]<=q[2]&&p[2]>=q[0]&&p[1]<=q[3]&&p[3]>=q[1];
const clip=(op,...g)=>{try{return pc[op](...g)}catch(e){console.warn('polygon-clipping gagal',e);return[]}};
// union dengan cadangan: bila polygon-clipping gagal (segmen hampir berimpit, mis. potongan LC identik), gabungkan bertahap & pembulatan 1 cm
const snapM=m=>m.map(p=>p.map(r=>{const o=[];r.forEach(([x,y])=>{const q=[Math.round(x*100)/100,Math.round(y*100)/100],l=o[o.length-1];if(!l||l[0]!==q[0]||l[1]!==q[1])o.push(q)});return o}).filter(r=>r.length>=4||r.length===0)).filter(p=>p.length&&p[0].length>=4);
function unionOf(a){if(a.length===0)return[];if(a.length===1)return a[0];
 try{return pc.union(...a)}catch(e){}
 let acc=a[0];for(let i=1;i<a.length;i++){try{acc=pc.union(acc,a[i])}catch(e2){try{acc=pc.union(snapM(acc),snapM(a[i]))}catch(e3){console.warn('union LC dilewati (1 poligon)',e3.message)}}}
 return acc}
const pctS=n=>fmtN(n,1)+'%';
const tglNum=s=>s?Date.parse(s+'T00:00:00Z'):NaN;
function csv(rows,name){
 const q=x=>{x=x==null?'':String(x);return /[",\n;]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x};
 const txt='\ufeff'+rows.map(r=>r.map(q).join(',')).join('\r\n');
 const blob=new Blob([txt],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
 setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);A.lastCsv={name,rows}}
const stamp=()=>{const d=new Date();return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')};

// ---------- Inisialisasi: proyeksi + irisan LC x Blok (sekali saja) ----------
A.init=function(o){
 A.map=o.map;A.data=o.data;A.batasHa=o.batasHa;A.blokLayer=o.blokLayer;A.bl=o.bl;A.bk=o.bkReal||o.bk;A.tg=o.bk;
 map.invalidateSize({pan:false});
 map.createPane('hlPane');map.getPane('hlPane').style.zIndex=450;map.getPane('hlPane').style.pointerEvents='none';
 const t0=performance.now();
 A.batasM=o.bk?unionOf(o.bk.features.map(f=>toMulti(f.geometry))):[];
 A.batasM2=areaM2(A.batasM);
 A.blocks=(o.bl?o.bl.features:[]).map((f,i)=>{const p=f.properties,M=toMulti(f.geometry),no=p.No_Blok;
  return{i,f,M,bb:bboxM(M),no,name:p.Blok,label:no!=null?'Blok '+no:`${p.Blok} (tanpa No.)`,luas:ha(M),inBatas:ha(clip('intersection',M,A.batasM))}});
 A.lcs=o.data.features.map((f,i)=>{const M=toMulti(f.geometry);return{id:f.properties.OBJECTID,f,M,bb:bboxM(M),inter:{},interB:{},lcB:null}});
 A.byId={};A.lcs.forEach(l=>{A.byId[l.id]=l;l.lcB=clip('intersection',l.M,A.batasM);
  A.blocks.forEach(b=>{if(!bbHit(l.bb,b.bb))return;const I=clip('intersection',l.M,b.M);if(areaM2(I)<0.5)return;l.inter[b.i]=I;l.interB[b.i]=clip('intersection',I,A.batasM)})});
 A.initMs=Math.round(performance.now()-t0);
 Vault.getJSON('data/tanam_ringkas.json').then(j=>{A.tanam=j;if(A.tab==='tanam')renderTab()}).catch(e=>console.warn('ringkasan tanam gagal',e));
 A.ready=true;if(A.pending){A.update(A.pending);A.pending=null}
};

// ---------- Update setiap filter berubah ----------
A.update=function(fs){
 if(!A.ready){A.pending=fs;return}
 A.fs=fs;clearHL(true);
 const key=fs.map(f=>f.properties.OBJECTID).sort((a,b)=>a-b).join(',');
 if(A.key!==key){A.key=key;computeBlocks(fs)}
 renderKPI(fs);renderTab();
};
function computeBlocks(fs){
 const ls=fs.map(f=>A.byId[f.properties.OBJECTID]);
 const rows=A.blocks.map(b=>{
  const I=ls.filter(l=>l.inter[b.i]).map(l=>l.inter[b.i]),IB=ls.filter(l=>l.interB[b.i]).map(l=>l.interB[b.i]);
  const lc=ha(unionOf(I)),lcB=ha(unionOf(IB));
  return{i:b.i,no:b.no,label:b.label,name:b.name,luas:b.luas,inBatas:b.inBatas,lc,lcB,pct:b.luas?lc/b.luas*100:0,pctB:b.inBatas?lcB/b.inBatas*100:0,sisaB:Math.max(b.inBatas-lcB,0)}});
 const lcBatas=ha(unionOf(ls.map(l=>l.lcB).filter(m=>m.length)));
 A.rows=rows;A.tot={lcUnion:ha(unionOf(ls.map(l=>l.M))),lcBatas,sisa:Math.max(A.batasM2/1e4-lcBatas,0),lcBlok:sum(rows,r=>r.lc),sumLuas:sum(fs,f=>f.properties.Luas)};
 if(A.colorBlok)applyChoropleth();
}

// ---------- KPI tambahan ----------
function renderKPI(fs){
 const fsw=fs.filter(f=>{const p=f.properties;return p.Tanggal&&(p.Pengerjaan||p.Operator)});
 const days=new Set(fsw.map(f=>f.properties.Tanggal)),hari=days.size,luasW=sum(fsw,f=>f.properties.Luas),avg=hari?luasW/hari:0;
 A.kpi={hari,avg,luasW,sisa:A.tot.sisa};
 if(window.fillKpi)window.fillKpi();
}

// ---------- Sorotan peta ----------
const inv=c=>proj4(UTM48S,'EPSG:4326',c);
function multiToFeature(m){return{type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:m.map(p=>p.map(r=>r.map(inv)))}}}
function chip(){let c=$('hlChip');if(!c){c=document.createElement('div');c.id='hlChip';c.hidden=true;c.innerHTML='<span id="hlTxt"></span><button type="button" id="hlX" aria-label="Hapus sorotan" title="Hapus sorotan (Esc)">✕ Hapus sorotan</button>';map.getContainer().appendChild(c);L.DomEvent.disableClickPropagation(c);$('hlX').onclick=()=>clearHL()}return c}
function markSel(){document.querySelectorAll('[data-hl]').forEach(e=>e.classList.toggle('sel',!!A.hl&&e.dataset.hl===A.hl.key))}
function clearHL(silent){
 if(A.hlLayer){map.removeLayer(A.hlLayer);A.hlLayer=null}
 A.hl=null;const c=$('hlChip');if(c)c.hidden=true;markSel();
}
function setHL(key,label,feats,extra,fitTo){
 if(A.hl&&A.hl.key===key){clearHL();return}
 clearHL();if(!feats.length&&!(extra&&extra.length))return;
 const all=feats.concat(extra||[]);
 const g=L.featureGroup([
  L.geoJSON({type:'FeatureCollection',features:all},{pane:'hlPane',interactive:false,style:{color:'#fff',weight:8,opacity:.9,fill:false}}),
  L.geoJSON({type:'FeatureCollection',features:all},{pane:'hlPane',interactive:false,style:{color:HL_COLOR,weight:4,opacity:1,fillColor:HL_COLOR,fillOpacity:.18}})]).addTo(map);
 A.hlLayer=g;A.hl={key,label,n:all.length};
 const c=chip();$('hlTxt').textContent=`Sorotan: ${label}`;c.hidden=false;markSel();
 try{const bb=fitTo?L.geoJSON({type:'FeatureCollection',features:fitTo}).getBounds():g.getBounds();map.flyToBounds(bb.pad(.25),{maxZoom:17,duration:.5})}catch(e){}
}
A.setHL=setHL;A.clearHL=clearHL;
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearHL()});
function featsFor(dim,k){
 return A.fs.filter(f=>{const p=f.properties;
  switch(dim){case'code':return String(p.Code)===k;case'peng':return v(p.Pengerjaan)===k;case'op':return v(p.Operator)===k;case'tgl':return (p.Tanggal||'-')===k;
   case'day':return p.Tanggal===k;case'week':return p.Tanggal&&weekStart(p.Tanggal)===k;case'oid':return String(p.OBJECTID)===k;default:return false}})}
const DIMLBL={code:k=>codeLbl(k),peng:k=>'Alat '+k,op:k=>'Operator '+k,tgl:k=>'Tanggal '+tgl(k),day:k=>'Tanggal '+tgl(k),week:k=>'Minggu '+tgl(k),oid:k=>'LC #'+k};
function hlAction(key){
 const i=key.indexOf(':'),dim=key.slice(0,i),k=key.slice(i+1);
 if(dim==='blok'){const r=A.rows.find(x=>String(x.i)===k);if(!r)return;const b=A.blocks[r.i];
  const I=unionOf(A.fs.map(f=>A.byId[f.properties.OBJECTID].inter[r.i]).filter(Boolean)),ex=I.length?[multiToFeature(I)]:[];return setHL(key,r.label,[b.f],ex,[b.f])}
 if(dim==='tanam'){const b=A.blocks.find(x=>String(x.no)===k);if(!b)return;return setHL(key,'Blok '+k,[b.f])}
 setHL(key,DIMLBL[dim]?DIMLBL[dim](k):key,featsFor(dim,k));
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-hl]');if(!el)return;hlAction(el.dataset.hl);
 if(typeof mobile==='function'&&mobile()&&el.closest('#panel'))$('panel').classList.remove('open')});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.bi[data-hl]')){e.preventDefault();hlAction(e.target.dataset.hl)}});

// ---------- Dock & tab ----------
const TABS=A.TABS={tren:renderTren,blok:renderBlok,prod:renderProd,tabel:renderTabel,tanam:renderTanam};
function renderTab(){if(A.ready)(TABS[A.tab]||renderTren)();markSel()}
function showTab(t){A.tab=t;document.querySelectorAll('.dock .tab, #dock .tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
 document.querySelectorAll('#dock .pane').forEach(p=>p.classList.toggle('on',p.id==='p-'+t));
 if(!document.body.classList.contains('dock-open'))setDock(true);renderTab()}
function setDock(open){document.body.classList.toggle('dock-open',open);$('dockToggle').setAttribute('aria-expanded',open);
 setTimeout(()=>{map.invalidateSize({pan:false});renderTab()},300)}
document.querySelectorAll('#dock .tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('dockToggle').onclick=()=>setDock(!document.body.classList.contains('dock-open'));
if(!window.matchMedia('(max-width:760px)').matches&&window.innerHeight>=640)document.body.classList.add('dock-open');
else $('dockToggle').setAttribute('aria-expanded','false');
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(A.ready)renderTab()},150)});
if(window.ResizeObserver)new ResizeObserver(()=>{clearTimeout(rz);rz=setTimeout(()=>{if(A.ready)renderTab()},120)}).observe($('dock'));

// ---------- Tabel yang bisa diurutkan ----------
function sortRows(rows,s,cols){const c=cols.find(x=>x.k===s.k)||cols[0];const f=c.sv||(r=>r[c.k]);
 return rows.slice().sort((a,b)=>{let x=f(a),y=f(b);if(x==null||x==='')x=c.num?-Infinity:'';if(y==null||y==='')y=c.num?-Infinity:'';
  const r=c.num?(x===y?0:x<y?-1:1):String(x).localeCompare(String(y),'id');return r*s.d||(a._i-b._i)})}
function tableHTML(id,cols,rows,rowAttr,foot){const s=A.sort[id];
 return `<table class="dt" data-tbl="${id}"><thead><tr>${cols.map(c=>`<th data-k="${c.k}" class="${c.num?'n':''}${s.k===c.k?' on':''}" tabindex="0" aria-sort="${s.k===c.k?(s.d>0?'ascending':'descending'):'none'}" title="Klik untuk mengurutkan">${c.t}<i>${s.k===c.k?(s.d>0?'▲':'▼'):''}</i></th>`).join('')}</tr></thead><tbody>${
  rows.map(r=>`<tr${rowAttr?` data-hl="${rowAttr(r)}" tabindex="0"`:''}>${cols.map(c=>`<td class="${c.num?'n':''}">${c.h?c.h(r):esc(c.f?c.f(r):r[c.k])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}" class="empty">Tidak ada data</td></tr>`}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table>`}
function wireSort(pane,id){pane.querySelectorAll(`table[data-tbl="${id}"] th`).forEach(th=>{const go=()=>{const s=A.sort[id];if(s.k===th.dataset.k)s.d*=-1;else{s.k=th.dataset.k;s.d=1}renderTab()};th.onclick=go;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}})}
const rowKeyHandler=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-hl]')){e.preventDefault();hlAction(e.target.dataset.hl)}};

// ---------- 1. Tren LC kumulatif ----------
function weekStart(t){const d=new Date(t+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
function trendData(fs,mode){const g={};let nodate=0,nd=0;
 fs.forEach(f=>{const p=f.properties;if(!p.Tanggal){nodate+=p.Luas;nd++;return}const k=mode==='week'?weekStart(p.Tanggal):p.Tanggal;g[k]=(g[k]||0)+p.Luas});
 let c=0;return{pts:Object.keys(g).sort().map(k=>({k,add:g[k],cum:(c+=g[k])})),nodate,nd}}
const niceStep=m=>{const p=Math.pow(10,Math.floor(Math.log10(m||1))),r=m/p;return(r<=1?1:r<=2?2:r<=2.5?2.5:r<=5?5:10)*p};
function lcKpiHtml(){const c=(l,v,u,s)=>`<div class="ck"><span class="ck-l">${l}</span><span class="ck-v">${v}${u?`<small>${u}</small>`:''}</span>${s||''}</div>`;
 return `<div class="lc-kpis" aria-label="Indikator Land Clearing (mengikuti filter)">`+
  c('Total LC','<span id="kTot">–</span>','ha','<span class="ck-s" id="kTotS"></span>')+c('<span id="kOctL">LC bulan berjalan</span>','<span id="kOct">–</span>','ha','<span class="ck-s" id="kOctS"></span>')+
  c('Luas target (Batas Kebun)','<span id="kBatas">–</span>','ha','<span class="ck-s">Target LC</span>')+c('% LC / target','<span id="kPct">–</span>','%','<div class="kpi-prog"><div id="kPctBar"></div></div>')+
  c('Jumlah blok','<span id="kBlok">–</span>','blok','<span class="ck-s" id="kBlokS"></span>')+
  c('Rata-rata ha/hari kerja <span class="tip" tabindex="0" data-tip="Total luas LC (poligon bertanggal yang punya data alat/operator) ÷ jumlah hari kerja. Poligon tanpa data alat/operator (mis. LC s/d 31 Agu 2026) tidak dihitung.">i</span>','<span id="kAvg">–</span>','ha/hari')+
  c('Jumlah hari kerja <span class="tip" tabindex="0" data-tip="Jumlah tanggal berbeda (kolom Tanggal) pada poligon yang punya data alat/operator. Tanggal adalah tanggal rekap/pengukuran, sehingga ini perkiraan hari kerja.">i</span>','<span id="kHari">–</span>','hari')+
  c('Sisa area belum LC <span class="tip" tabindex="0" data-tip="Luas target − luas gabungan (union, tanpa hitung ganda) poligon LC yang berada di dalam target. Dihitung di UTM 48S dari LC terfilter.">i</span>','<span id="kSisa">–</span>','ha')+`</div>`}
function renderTren(){
 const pane=$('p-tren'),T=trendData(A.fs,A.mode);A.trend=T;
 const target=A.batasHa||0;
 pane.innerHTML=`${lcKpiHtml()}<div class="two-col"><div class="card chart-card"><div class="card-h"><h4>Tren LC kumulatif vs target</h4><div class="seg" role="group" aria-label="Agregasi"><button data-m="day" class="${A.mode==='day'?'on':''}">Per tanggal</button><button data-m="week" class="${A.mode==='week'?'on':''}">Per minggu</button></div></div><div id="trendSvg" class="svgbox"></div>
 <div class="foot one">${(window.TARGET&&TARGET.label)||('Target = luas Batas Kebun DNP ('+fmt(target)+' ha)')}.${T.nd?` Tanpa tanggal: ${T.nd} poligon, ${fmt(T.nodate)} ha (tidak digambar).`:''}</div></div>
 <div class="card"><div class="card-h"><h4>Rincian ${A.mode==='week'?'mingguan':'per tanggal'}</h4></div><div class="tscroll"><table class="dt"><thead><tr><th>${A.mode==='week'?'Minggu':'Tanggal'}</th><th class="n">+ LC (ha)</th><th class="n">Kumulatif (ha)</th><th class="n">% Target</th></tr></thead><tbody>${
 T.pts.map(p=>`<tr data-hl="${A.mode}:${p.k}" tabindex="0"><td>${tgl(p.k)}</td><td class="n">${fmt(p.add)}</td><td class="n">${fmt(p.cum)}</td><td class="n">${target?pctS(p.cum/target*100):'–'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Tidak ada data bertanggal</td></tr>'}</tbody></table></div></div></div>`;
 if(window.fillKpi)window.fillKpi();
 pane.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{A.mode=b.dataset.m;renderTab()});
 pane.querySelectorAll('tr[data-hl]').forEach(r=>r.onkeydown=rowKeyHandler);
 const box=$('trendSvg'),W=Math.max(box.clientWidth,300),H=Math.max(box.clientHeight,150);
 const m={l:44,r:18,t:14,b:30},pw=W-m.l-m.r,ph=H-m.t-m.b;
 const pts=T.pts;if(!pts.length){box.innerHTML='<div class="empty" style="padding:20px">Tidak ada data bertanggal untuk digambar.</div>';return}
 const yTop=Math.max(target,pts[pts.length-1].cum)*1.08,ystep=niceStep(yTop/4),ymax=ystep*Math.ceil(yTop/ystep);
 const tms=pts.map(p=>tglNum(p.k)),t0=Math.min(...tms),t1=Math.max(...tms),span=(t1-t0)||86400000*7;
 const pad=pts.length>1?0.04*span:span/2;
 const X=t=>m.l+((t-(t0-pad))/(span+2*pad))*pw,Y=y=>m.t+ph-(y/ymax)*ph;
 let s=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafik LC kumulatif">`;
 for(let i=0;i<=8;i++){const y=ystep*i;if(y>ymax+1e-9)break;s+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(y)}" y2="${Y(y)}" class="gl"/><text x="${m.l-6}" y="${Y(y)+3.5}" class="ax" text-anchor="end">${fmtN(y,ystep<1?1:0)}</text>`}
 if(target&&target<=ymax)s+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(target)}" y2="${Y(target)}" class="tg"/><text x="${W-m.r}" y="${Y(target)-5}" class="tgl" text-anchor="end">Target: Luas Batas Kebun ${fmt(target)} ha</text>`;
 const xy=pts.map((p,i)=>[X(tms[i]),Y(p.cum)]);
 s+=`<path d="M${xy[0][0]},${Y(0)} ${xy.map(q=>'L'+q.join(',')).join(' ')} L${xy[xy.length-1][0]},${Y(0)} Z" class="ar"/><polyline points="${xy.map(q=>q.join(',')).join(' ')}" class="ln"/>`;
 let lastX=-99,lastL=-99;
 pts.forEach((p,i)=>{const[x,y]=xy[i];
  s+=`<g class="pt" data-hl="${A.mode}:${p.k}" tabindex="0" role="button"><title>${tgl(p.k)} · +${fmt(p.add)} ha · kumulatif ${fmt(p.cum)} ha (${target?pctS(p.cum/target*100):'–'} target)</title><circle cx="${x}" cy="${y}" r="11" class="hit"/><circle cx="${x}" cy="${y}" r="4.6" class="dot"/></g>`;
  if(x-lastL>40||i===pts.length-1){s+=`<text x="${x}" y="${y+17}" class="vl" text-anchor="middle">${fmtN(p.cum,1)}</text>`;lastL=x}
  if(x-lastX>46||i===pts.length-1){const d=new Date(p.k+'T00:00:00Z');const lb=`${d.getUTCDate()} ${BLN[d.getUTCMonth()]}`;s+=`<text x="${x}" y="${H-10}" class="ax" text-anchor="middle">${A.mode==='week'?'Mgg '+lb:lb}</text>`;lastX=x}});
 box.innerHTML=s+'</svg>';
 box.querySelectorAll('g.pt').forEach(g=>g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hlAction(g.dataset.hl)}});
 markSel();
}

// ---------- 2. Progres per blok ----------
const BCOLS=[
 {k:'no',t:'Blok',sv:r=>r.no==null?1000+r.i:r.no,num:true,h:r=>`<b>${esc(r.label)}</b>${r.name&&r.no!=null&&!new RegExp('^Blok\\s*'+r.no+'$').test(r.name)?`<em class="nm" title="Nama pada atribut: ${esc(r.name)}"> ·${esc(r.name)}</em>`:''}`},
 {k:'luas',t:'Luas blok (ha)',num:true,f:r=>fmt(r.luas)},
 {k:'inBatas',t:'Dlm batas (ha)',num:true,f:r=>fmt(r.inBatas)},
 {k:'lc',t:'LC (ha)',num:true,f:r=>fmt(r.lc)},
 {k:'pct',t:'% LC / blok',num:true,h:r=>`<span class="pb"><i style="width:${Math.min(r.pct,100)}%"></i></span><b>${pctS(r.pct)}</b>`},
 {k:'pctB',t:'% LC / dlm batas',num:true,f:r=>r.inBatas>0.05?pctS(r.pctB):'–'},
 {k:'sisaB',t:'Sisa dlm batas (ha)',num:true,f:r=>fmt(r.sisaB)}];
function visibleBlocks(){return A.rows.filter(r=>A.showBlokAll||r.lc>0.0005||r.inBatas>0.05).map((r,i)=>(r._i=i,r))}
function renderBlok(){
 const pane=$('p-blok'),all=A.rows,rows=sortRows(visibleBlocks(),A.sort.blok,BCOLS),T=A.tot;
 const fl=sum(rows,r=>r.luas),fi=sum(rows,r=>r.inBatas),fc=sum(rows,r=>r.lc),fs_=sum(rows,r=>r.sisaB),fcb=sum(rows,r=>r.lcB);
 const foot=`<tr><td><b>Total (${rows.length} blok)</b></td><td class="n">${fmt(fl)}</td><td class="n">${fmt(fi)}</td><td class="n">${fmt(fc)}</td><td class="n"><b>${fl?pctS(fc/fl*100):'–'}</b></td><td class="n">${fi?pctS(fcb/fi*100):'–'}</td><td class="n">${fmt(fs_)}</td></tr>`;
 const pctBatas=A.batasM2?T.lcBatas/(A.batasM2/1e4)*100:0;
 pane.innerHTML=`<div class="two-col wide-left"><div class="card"><div class="card-h"><h4>Progres LC per blok <small>(klik baris = zoom &amp; sorot)</small></h4><div class="card-tools"><label class="chk"><input type="checkbox" id="chkBlokAll"${A.showBlokAll?' checked':''}> Semua blok</label><button class="btn-mini" id="csvBlok">⭳ CSV</button></div></div><div class="tscroll">${tableHTML('blok',BCOLS,rows,r=>'blok:'+r.i,foot)}</div></div>
 <div class="card side-card"><div class="card-h"><h4>Ringkasan</h4></div>
  <div class="mini-kv"><span>Sisa belum LC (batas kebun)</span><b>${fmt(T.sisa)} ha</b></div>
  <div class="mini-kv"><span>LC dalam batas (union)</span><b>${fmt(T.lcBatas)} ha · ${pctS(pctBatas)}</b></div>
  <div class="kpi-prog wide"><div style="width:${Math.min(pctBatas,100)}%"></div></div>
  <div class="mini-kv"><span>LC di dalam blok</span><b>${fmt(T.lcBlok)} ha</b></div>
  <div class="mini-kv"><span>LC di luar semua blok</span><b>${fmt(Math.max(T.lcUnion-T.lcBlok,0))} ha</b></div>
  <label class="chk big"><input type="checkbox" id="chkColor"${A.colorBlok?' checked':''}> Warnai blok di peta menurut % LC</label>
  <div class="ramp"><i></i><span>0%</span><span>50%</span><span>100%</span></div>
  <div class="foot">% LC / blok = luas gabungan LC (tanpa hitung ganda) ∩ blok ÷ luas blok, dihitung di UTM 48S. <b>Sisa dlm batas</b> = bagian blok yang berada di Batas Kebun dan belum LC. Blok tanpa LC &amp; di luar batas disembunyikan (centang “Semua blok”).</div></div></div>`;
 wireSort(pane,'blok');pane.querySelectorAll('tr[data-hl]').forEach(r=>r.onkeydown=rowKeyHandler);
 $('chkBlokAll').onchange=e=>{A.showBlokAll=e.target.checked;renderTab()};
 $('chkColor').onchange=e=>{A.colorBlok=e.target.checked;A.colorBlok?applyChoropleth():resetChoropleth()};
 $('csvBlok').onclick=()=>csv([['Blok','Nama_atribut','No_Blok','Luas_blok_ha','Luas_dlm_batas_ha','LC_ha','Pct_LC_per_blok','LC_dlm_batas_ha','Pct_LC_per_luas_dlm_batas','Sisa_dlm_batas_ha']].concat(rows.map(r=>[r.label,r.name,r.no==null?'':r.no,r.luas.toFixed(4),r.inBatas.toFixed(4),r.lc.toFixed(4),r.pct.toFixed(2),r.lcB.toFixed(4),r.inBatas>0.05?r.pctB.toFixed(2):'',r.sisaB.toFixed(4)])),`progres_blok_${stamp()}.csv`);
 markSel();
}
const ramp=p=>{const a=[232,241,239],b=[4,51,45],t=Math.min(Math.max(p/100,0),1);return'rgb('+a.map((x,i)=>Math.round(x+(b[i]-x)*t)).join(',')+')'};
function applyChoropleth(){if(!A.blokLayer)return;A.blokLayer.eachLayer(l=>{const i=A.blocks.findIndex(b=>b.f===l.feature),r=A.rows[i];if(!r)return;
 const on=r.lc>0.0005||r.inBatas>0.05;l.setStyle(on?{fill:true,fillColor:ramp(r.pct),fillOpacity:.6}:{fillOpacity:0})})}
function resetChoropleth(){if(A.blokLayer)A.blokLayer.setStyle({fillOpacity:0})}

// ---------- 3. Produktivitas ----------
function prodGroups(fs,key){const g={};fs.forEach(f=>{const p=f.properties,k=p[key];if(!k||!p.Tanggal)return;const o=g[k]||(g[k]={k,ha:0,days:new Set(),n:0});o.ha+=p.Luas;o.days.add(p.Tanggal);o.n++});
 return Object.values(g).map(o=>({k:o.k,ha:o.ha,hari:o.days.size,n:o.n,rate:o.ha/o.days.size})).sort((a,b)=>b.rate-a.rate)}
function prodBlock(title,arr,dim){const mx=Math.max(...arr.map(a=>a.rate),0);
 return `<div class="card"><div class="card-h"><h4>${title}</h4></div><div class="pbody">${arr.map(a=>`<div class="bi" data-hl="${dim}:${esc(a.k)}" tabindex="0" role="button" title="Klik untuk menyorot &amp; zoom ke peta"><div class="row"><span>${esc(a.k)}</span><b>${fmt(a.rate)} ha/hari<em>${fmt(a.ha)} ha · ${a.hari} hari · ${a.n} poligon</em></b></div><div class="bar"><div style="width:${mx?a.rate/mx*100:0}%"></div></div></div>`).join('')||'<div class="empty">Tidak ada data alat/operator pada filter ini</div>'}</div></div>`}
function renderProd(){
 const fs=A.fs,pa=prodGroups(fs,'Pengerjaan'),po=prodGroups(fs,'Operator');
 const excl=fs.filter(f=>!f.properties.Pengerjaan&&!f.properties.Operator);
 $('p-prod').innerHTML=`<div class="three-col">${prodBlock('Produktivitas per alat (Pengerjaan)',pa,'peng')}${prodBlock('Produktivitas per operator',po,'op')}
 <div class="card"><div class="card-h"><h4>Cara membaca</h4></div><div class="pbody notes"><p><b>ha/hari</b> = total luas LC ÷ jumlah <b>tanggal berbeda</b> (hari kerja) pada poligon alat/operator tsb.</p><p>Tanggal pada data adalah tanggal rekap/pengukuran (umumnya mingguan), sehingga hari kerja sebenarnya bisa lebih banyak dan produktivitas riil lebih rendah.</p><p>${excl.length?`<b>${excl.length} poligon (${fmt(sum(excl,f=>f.properties.Luas))} ha)</b> tidak punya data alat/operator (mis. LC s/d 31 Agu 2026) sehingga tidak dihitung.`:'Semua poligon pada filter ini punya data alat/operator.'}</p></div></div></div>`;
 A.prod={alat:pa,operator:po};markSel();
}

// ---------- 4. Tabel data + CSV ----------
const TCOLS=[{k:'OBJECTID',t:'ID',num:true,f:r=>r.OBJECTID},{k:'Tanggal',t:'Tanggal',sv:r=>r.Tanggal||'',f:r=>tgl(r.Tanggal)},{k:'Luas',t:'Luas (ha)',num:true,f:r=>fmt(r.Luas)},{k:'Code',t:'Code',f:r=>codeLbl(r.Code)},{k:'Pengerjaan',t:'Pengerjaan (Alat)',f:r=>v(r.Pengerjaan)},{k:'Operator',t:'Operator',f:r=>v(r.Operator)}];
function renderTabel(){
 const rows=A.fs.map((f,i)=>Object.assign({_i:i},f.properties)),sorted=sortRows(rows,A.sort.tabel,TCOLS);
 const foot=`<tr><td><b>Total</b></td><td></td><td class="n"><b>${fmt(sum(rows,r=>r.Luas))}</b></td><td colspan="3">${rows.length} poligon</td></tr>`;
 $('p-tabel').innerHTML=`<div class="card full"><div class="card-h"><h4>Tabel poligon land clearing <small>(sesuai filter · klik judul kolom = urutkan · klik baris = zoom &amp; sorot)</small></h4><div class="card-tools"><button class="btn-mini" id="csvTabel">⭳ Ekspor CSV</button></div></div><div class="tscroll">${tableHTML('tabel',TCOLS,sorted,r=>'oid:'+r.OBJECTID,foot)}</div></div>`;
 wireSort($('p-tabel'),'tabel');$('p-tabel').querySelectorAll('tr[data-hl]').forEach(r=>r.onkeydown=rowKeyHandler);
 $('csvTabel').onclick=()=>csv([['OBJECTID','Tanggal','Luas_ha','Code','Label_Code','Pengerjaan','Operator']].concat(sorted.map(r=>[r.OBJECTID,r.Tanggal||'',r.Luas.toFixed(4),r.Code,codeLbl(r.Code),r.Pengerjaan||'',r.Operator||''])),`land_clearing_terfilter_${stamp()}.csv`);
 markSel();
}

// ---------- 7. Realisasi tanam ----------
function blokTanam(){ // baris per nomor blok dari ringkasan
 const T=A.tanam;if(!T)return null;const bl=T.bulan.filter(m=>m),hasNo=T.bulan.includes('');
 const cats=A.tnCat==='ALL'?T.kategori:[A.tnCat];
 const val=(no,m)=>sum(cats,c=>((T.blok[no]||{})[c]||{})[m]||0);
 const nos=Object.keys(T.blok).map(Number).sort((a,b)=>a-b);
 return{bl,hasNo,rows:nos.map((no,i)=>{const r={_i:i,no,rencana:T.rencana[no]||0,tot:0};T.bulan.forEach(m=>{r['m'+m]=val(no,m);r.tot+=r['m'+m]});return r}).filter(r=>r.tot>0),cats}
}
function bulanLbl(m){if(!m)return'Tanpa bulan';const[y,mm]=m.split('-');return BLN[mm-1]+' '+y}
function renderTanam(){
 const pane=$('p-tanam'),B=blokTanam();
 if(!B){pane.innerHTML='<div class="empty" style="padding:16px">Memuat ringkasan realisasi tanam…</div>';return}
 const cols=[{k:'no',t:'Blok',num:true,h:r=>`<b>Blok ${r.no}</b>`}].concat(A.tanam.bulan.filter(m=>B.hasNo||m).filter(m=>B.rows.some(r=>r['m'+m])).map(m=>({k:'m'+m,t:bulanLbl(m),num:true,f:r=>r['m'+m]?fmtN(r['m'+m],0):'–'})),[{k:'tot',t:'Total',num:true,h:r=>`<b>${fmtN(r.tot,0)}</b>`},{k:'rencana',t:'Titik plan (info)*',num:true,f:r=>fmtN(r.rencana,0)}]);
 const rows=sortRows(B.rows,A.sort.tanam,cols);
 const mt={};cols.forEach(c=>{if(c.k.startsWith('m'))mt[c.k]=sum(B.rows,r=>r[c.k])});const tot=sum(B.rows,r=>r.tot);
 const foot=`<tr><td><b>Total</b></td>${cols.slice(1,-2).map(c=>`<td class="n"><b>${fmtN(mt[c.k],0)}</b></td>`).join('')}<td class="n"><b>${fmtN(tot,0)}</b></td><td class="n">${fmtN(sum(B.rows,r=>r.rencana),0)}</td></tr>`;
 const mx=Math.max(...Object.values(mt),0);
 A.tanamAgg={cols:cols.map(c=>c.t),rows:B.rows,totals:mt,total:tot};
 pane.innerHTML=`<div class="two-col wide-left"><div class="card"><div class="card-h"><h4>Realisasi tanam per blok &amp; bulan <small>(klik baris = zoom ke blok)</small></h4><div class="card-tools"><select id="tnCat" aria-label="Jenis titik">${A.tanam.kategori.map(c=>`<option value="${c}"${A.tnCat===c?' selected':''}>${NAMA_KAT[c]||c}</option>`).join('')}<option value="ALL"${A.tnCat==='ALL'?' selected':''}>Semua jenis</option></select><button class="btn-mini" id="csvTanam">⭳ CSV</button></div></div><div class="tscroll">${tableHTML('tanam',cols,rows,r=>'tanam:'+r.no,foot)}</div></div>
 <div class="card side-card"><div class="card-h"><h4>Per bulan — ${A.tnCat==='ALL'?'semua jenis':NAMA_KAT[A.tnCat]||A.tnCat}</h4></div><div class="pbody">${Object.keys(mt).map(k=>`<div class="bi"><div class="row"><span>${bulanLbl(k.slice(1))}</span><b>${fmtN(mt[k],0)} titik</b></div><div class="bar"><div style="width:${mx?mt[k]/mx*100:0}%"></div></div></div>`).join('')}
  <label class="chk big"><input type="checkbox" id="chkTanam"${window.Atlas&&Atlas.isShown('titik_tanam_realisasi')?' checked':''}> Tampilkan titik tanam di peta</label>
  <div class="foot">Hitungan = jumlah titik layer <b>Realisasi Titik Tanam</b> (SHP dedup; 1 titik = 1 kode pokok) per jenis (field <i>Name</i>) dan <i>Bulan</i>. Format kode pokok: <b>B11/R001/02</b> (blok / baris 3 digit / pohon 2 digit). Kode blok pada Kode_Pokok (mis. <b>B11</b>) cocok dengan <i>No_Blok</i> pada blok_sawit.geojson (diverifikasi spasial). *Titik plan = jumlah titik tahap “Plan Titik Tanam” (pada layer Realisasi Titik Tanam, hasil dedup) per blok, <b>informasi saja</b>: bukan target resmi, tidak dipakai untuk persentase capaian (Planting, Stake Out, Lubang Tanam, OFF hanya angka realisasi).</div></div></div></div>`;
 wireSort(pane,'tanam');pane.querySelectorAll('tr[data-hl]').forEach(r=>r.onkeydown=rowKeyHandler);
 $('tnCat').onchange=e=>{A.tnCat=e.target.value;renderTab()};
 $('chkTanam').onchange=e=>{if(window.Atlas)Atlas.setVisible('titik_tanam_realisasi',e.target.checked)};
 $('csvTanam').onclick=()=>csv([['Blok'].concat(cols.slice(1,-2).map(c=>c.t),['Total','Titik_plan_info'])].concat(rows.map(r=>['Blok '+r.no].concat(cols.slice(1,-2).map(c=>r[c.k]),[r.tot,r.rencana]))),`realisasi_tanam_${A.tnCat}_${stamp()}.csv`);
 markSel();
}
function syncTanamChk(){const c=$('chkTanam');if(c&&window.Atlas)c.checked=Atlas.isShown('titik_tanam_realisasi')}
document.addEventListener('atlas:layer',e=>{if(e.detail.id==='titik_tanam_realisasi')syncTanamChk()});
map.on('click',()=>{clearHL()});
A.renderTab=renderTab;A.showTab=showTab;A.u={tableHTML,wireSort,sortRows,csv,stamp,sum,$,markSel,rowKeyHandler,niceStep,tglNum,pctS};
// mulai dengan tab aktif ter-render setelah data ada
})();
