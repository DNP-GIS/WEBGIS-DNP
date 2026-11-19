// Dashboard multi-kegiatan (v4): kartu per kegiatan, kurva kumulatif per tanggal, tabel per blok, toggle layer peta per kegiatan.
// Data ringkasan: data/progres.json (terenkripsi; dihitung di UTM 48S dari layer Puzzle17 oleh prep_p17.py). Dimuat SETELAH login.
(function(){
'use strict';
const A=window.Analytics;if(!A||!window.Vault||!window.Atlas)return;
const $=id=>document.getElementById(id);
const nf=(n,d)=>(+n).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const tg=s=>{if(!s)return'–';const[y,m,d]=s.split('-');return `${+d} ${BLN[m-1]} ${y}`};
const K=window.Kegiatan={P:null,sel:'lc',eye:{},excl:new Set(),csel:'lc'};
const CATMAP={'Planting':'Planting','Stake Out Titik Tanam':'Stake Out','Lubang Tanam':'Lubang Tanam','OFF Planting':'OFF Planting'};
const ha2=v=>nf(v,2),ha3=v=>nf(v,3),n0=v=>nf(v,0);
// ---- definisi kegiatan ----
const ACTS=[
 {id:'lc',name:'Land Clearing',color:'#e6c800',layers:['land_clearing'],unit:'ha'},
 {id:'rumpukan',name:'Rumpukan',color:'#ffaa00',layers:['rumpukan'],unit:'ha'},
 {id:'sto',name:'STO – Stake Out Surveyor',color:'#0070ff',layers:['sto'],unit:'titik'},
 {id:'stakeout',name:'Stake Out (titik tanam)',color:'#005ce6',layers:['titik_tanam_realisasi'],cat:'Stake Out',unit:'titik'},
 {id:'lubang',name:'Lubang Tanam',color:'#a87000',layers:['titik_tanam_realisasi'],cat:'Lubang Tanam',unit:'titik'},
 {id:'planting',name:'Planting (tanam)',color:'#4ce600',layers:['titik_tanam_realisasi'],cat:'Planting',unit:'titik'},
 {id:'jalan',name:'Jalan (Road)',color:'#5aa9e6',layers:['jalan_realisasi','jalan_rencana','jalan_maintenance'],unit:'ha'},
 {id:'drain',name:'Drain',color:'#ff3b30',layers:['drain_realisasi','drain_rencana'],unit:'ha'}];
const ACT=Object.fromEntries(ACTS.map(a=>[a.id,a]));
const basis=()=>(window.TARGET&&TARGET.basis==='status_lahan')?'kebun':'batas';
const tgtLabel=()=>(window.TARGET&&TARGET.label)||'Target = luas Batas Kebun DNP';
function lcIn(o){return basis()==='kebun'?{in:o.dalam_kebun_ha,out:o.luar_kebun_ha,pct:o.persen_kebun}:{in:o.dalam_batas_ha,out:o.luar_batas_ha,pct:o.persen_batas}}
// ---- angka per kegiatan (satu sumber untuk kartu, tabel ringkasan, tes) ----
function figures(P){
 const lc=P.lc,rp=P.rumpukan,ci=rp.kelas_info,sto=P.sto,tn=P.tanam.cats,jl=P.jalan,dr=P.drain,F={};
 const L=lcIn(lc),R=lcIn(rp);
 F.lc={real:L.in,total:lc.union_ha,out:L.out,pct:L.pct,w1:lc.code1.union_ha,w0:lc.code0.union_ha,und:lc.tanpa_tanggal,last:lc.tanggal_maks,n:lc.n};
 F.rumpukan={real:R.in,total:rp.union_ha,out:R.out,pct:R.pct,w1:rp.code1.union_ha,w0:rp.code0.union_ha,und:rp.tanpa_tanggal,last:rp.tanggal_maks,n:rp.n,maint:ci.maintenance.union_ha,timbun:ci.timbun.union_ha,komposit:rp.semua_kelas.union_ha};
 F.sto={real:sto.n,w1:sto.code1,w0:sto.code0,und:sto.tanpa_tanggal.n,last:sto.tanggal_maks,per:sto.per_name};
 ['Stake Out','Lubang Tanam','Planting','OFF Planting'].forEach(c=>{const o=tn[c];F[c]={real:o.unik,w1:o.code1,w0:o.code0,und:o.tanpa_tanggal,last:o.tanggal_maks,baris:o.baris}});
 const tp=(o,t)=>(o.per_tipe.find(x=>x.tipe===t)||{});
 F.jalan={real:jl.berencana.real_ha,plan:jl.berencana.rencana_ha,pct:jl.berencana.persen,total:jl.union_ha,w1:jl.code1.union_ha,w0:jl.code0.union_ha,und:jl.tanpa_tanggal,last:jl.tanggal_maks,perimeter:tp(jl,'Perimeter Road').real_ha||0,maint:jl.maintenance.ha,planUnion:jl.rencana.union_ha};
 F.drain={real:dr.berencana.real_ha,plan:dr.berencana.rencana_ha,pct:dr.berencana.persen,total:dr.union_ha,w1:dr.code1.union_ha,w0:dr.code0.union_ha,und:dr.tanpa_tanggal,last:dr.tanggal_maks,vol:dr.volume_m3,planUnion:dr.rencana.union_ha};
 return F}
// ---- kartu ----
const EYE='<svg viewBox="0 0 24 24" width="15" height="15"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
function cardData(a,F){const t=tgtLabel(),f=F[a.id];
 switch(a.id){
 case'lc':return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,s3:`${nf(f.pct,1)}% dari target · total ${ha2(f.total)} ha, di luar batas ${ha2(f.out)} ha (info)`,bar:f.pct,s4:t};
 case'rumpukan':return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,s3:`${nf(f.pct,1)}% (hanya kelas Rumpukan) · Maintenance ${ha2(f.maint)} ha · Timbun ${ha2(f.timbun)} ha (info, tanpa %)`,bar:f.pct,s4:t};
 case'sto':{const top=Object.entries(f.per).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>`${k} ${n0(v)}`).join(' · ');return{v:n0(f.real),u:'titik',pill:`+${n0(f.w1)}`,s3:top,s4:'Stake Out oleh surveyor · tanpa target (jumlah titik saja)'}}
 case'stakeout':{const o=F['Stake Out'];return{v:n0(o.real),u:'titik unik',pill:`+${n0(o.w1)}`,s3:`Hingga 7 Nov (Code 0): ${n0(o.w0)}`,s4:'Tahap titik tanam (berbeda dari STO) · tanpa target'}}
 case'lubang':{const o=F['Lubang Tanam'],pb=K.P.tanam.per_blok,bl=Object.entries(pb).filter(([k,v])=>v['Lubang Tanam']>0).sort((x,y)=>y[1]['Lubang Tanam']-x[1]['Lubang Tanam']).map(([k,v])=>`Blok ${k}: ${n0(v['Lubang Tanam'])}`).join(' · ');
  return{v:n0(o.real),u:'titik',pill:`+${n0(o.w1)}`,s3:`Tanpa tanggal: ${n0(o.und)} titik`,s4:bl||'Tanpa target'}}
 case'planting':{const o=F['Planting'],of=F['OFF Planting'];return{v:n0(o.real),u:'titik unik',pill:`+${n0(o.w1)}`,s3:`OFF Planting: ${n0(of.real)} titik (minggu ini ${n0(of.w1)})`,s4:`Realisasi saja · jumlah titik plan ${n0(K.P.tanam.rencana_referensi_unik)} (informasi saja, bukan target)`}}
 case'jalan':return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,s3:`${nf(f.pct,1)}% dari rencana ${ha2(f.plan)} ha (Main+Collection, luas poligon)`,bar:f.pct,s4:`Perimeter ${ha2(f.perimeter)} ha tanpa rencana · Maintenance ${ha2(f.maint)} ha`};
 case'drain':return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,s3:`${nf(f.pct,1)}% dari rencana ${ha2(f.plan)} ha (tipe berencana, luas poligon)`,bar:f.pct,s4:`Total realisasi ${ha2(f.total)} ha · volume galian ${n0(f.vol)} m³`}}}
function renderCards(){const F=K.F,host=$('kpis');host.innerHTML=ACTS.map(a=>{const d=cardData(a,F);K.cards=K.cards||{};K.cards[a.id]=d;
 return `<article class="act${K.sel===a.id?' sel':''}" data-act="${a.id}" tabindex="0" role="button" aria-label="${esc(a.name)}: buka kurva kumulatif" style="--ac:${a.color}">
 <div class="act-h"><i class="act-dot"></i><b title="${esc(a.name)}">${esc(a.name)}</b><button type="button" class="act-eye" data-eye="${a.id}" aria-pressed="false" title="Tampilkan/sembunyikan layer ${esc(a.name)} di peta" aria-label="Layer peta ${esc(a.name)}">${EYE}</button></div>
 <div class="act-v"><span class="v">${d.v}</span><small>${d.u}</small><span class="pill" title="Minggu ini = Code 1 (data ${tg(K.P.meta.minggu_ini.tanggal)}); Hingga 7 Nov = Code 0">${d.pill} minggu ini</span></div>
 <div class="act-s" title="${esc(d.s3)}">${esc(d.s3)}</div>${d.bar!=null?`<div class="kpi-prog"><div style="width:${Math.min(d.bar,100)}%"></div></div>`:''}
 <div class="act-s2" title="${esc(d.s4)}">${esc(d.s4)}</div></article>`}).join('');
 syncEyes()}
// ---- toggle layer peta per kegiatan ----
const tanamFlt=p=>!K.excl.has(CATMAP[p.Name]||p.Name);
function eyeOn(a){if(a.cat)return Atlas.isShown('titik_tanam_realisasi')&&!K.excl.has(a.cat);const main=a.id==='jalan'?['jalan_realisasi','jalan_rencana']:a.layers;return main.every(l=>Atlas.st[l]&&Atlas.isShown(l))}
function syncEyes(){document.querySelectorAll('.act-eye').forEach(b=>{const a=ACT[b.dataset.eye],on=eyeOn(a);b.setAttribute('aria-pressed',on);b.classList.toggle('on',on)})}
function toggleEye(id){const a=ACT[id],on=!eyeOn(a);
 if(a.cat){if(on){K.excl.delete(a.cat);Atlas.setPointFilter('titik_tanam_realisasi',tanamFlt);Atlas.setVisible('titik_tanam_realisasi',true)}
  else{K.excl.add(a.cat);Atlas.setPointFilter('titik_tanam_realisasi',tanamFlt);}}
 else{const main=a.id==='jalan'?['jalan_realisasi','jalan_rencana']:a.layers;main.forEach(l=>Atlas.setVisible(l,on))}
 syncEyes()}
document.addEventListener('atlas:layer',syncEyes);
// ---- tab Ringkasan ----
function ringRows(){const F=K.F,P=K.P,pc=v=>v==null?'–':nf(v,1)+'%';
 const r=[];
 r.push({id:'lc',n:'Land Clearing',u:'ha',real:ha2(F.lc.real),w1:ha2(F.lc.w1),w0:ha2(F.lc.w0),und:F.lc.und.n?`${F.lc.und.n} poligon · ${ha2(F.lc.und.ha)} ha`:'–',tgt:`${ha2(window.TARGET?TARGET.ha:0)} ha (Batas Kebun DNP)`,cap:pc(F.lc.pct),note:`Dalam batas; di luar batas ${ha2(F.lc.out)} ha (info). Total union ${ha2(F.lc.total)} ha. Tanggal terakhir ${tg(F.lc.last)}.`});
 r.push({id:'rumpukan',n:'Rumpukan (kelas Rumpukan)',u:'ha',real:ha2(F.rumpukan.real),w1:ha2(F.rumpukan.w1),w0:ha2(F.rumpukan.w0),und:F.rumpukan.und.n?`${F.rumpukan.und.n} poligon`:'–',tgt:`${ha2(window.TARGET?TARGET.ha:0)} ha (Batas Kebun DNP)`,cap:pc(F.rumpukan.pct),note:`Hanya kelas Rumpukan, dalam batas; di luar batas ${ha2(F.rumpukan.out)} ha (info).`});
 [['maintenance','Maintenance Rumpukan'],['timbun','Timbun Rumpukan']].forEach(([k,nm])=>{const o=P.rumpukan.kelas_info[k];r.push({id:'rumpukan',sub:1,n:'↳ '+nm,u:'ha',real:ha2(o.union_ha),w1:ha2(o.code1.union_ha),w0:ha2(o.code0.union_ha),und:o.tanpa_tanggal&&o.tanpa_tanggal.n?`${o.tanpa_tanggal.n} poligon`:'–',tgt:'–',cap:'info saja',note:'Kondisional: info luas, tidak masuk % / progress bar Rumpukan.'})});
 r.push({id:'sto',n:'STO – Stake Out Surveyor',u:'titik',real:n0(F.sto.real),w1:n0(F.sto.w1),w0:n0(F.sto.w0),und:`${n0(F.sto.und)} titik`,tgt:'tanpa target',cap:'–',note:'Jumlah titik: '+Object.entries(F.sto.per).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${k} ${n0(v)}`).join(', ')+'.'});
 [['stakeout','Stake Out (titik tanam)','Stake Out'],['lubang','Lubang Tanam','Lubang Tanam'],['planting','Planting','Planting'],['planting','OFF Planting','OFF Planting']].forEach(([id,nm,c],i)=>{const o=F[c];r.push({id,sub:i==3,n:(i==3?'↳ ':'')+nm,u:'titik unik',real:n0(o.real),w1:n0(o.w1),w0:n0(o.w0),und:o.und?`${n0(o.und)} titik`:'–',tgt:'tanpa target',cap:'–',note:c==='Planting'?`Realisasi saja. Jumlah titik plan ${n0(P.tanam.rencana_referensi_unik)} = informasi saja, bukan target.`:(c==='Lubang Tanam'?'Seluruhnya tanpa tanggal.':'Titik unik per Kode_Pokok.')})});
 r.push({id:'jalan',n:'Jalan (Main + Collection)',u:'ha',real:ha2(F.jalan.real),w1:ha2(F.jalan.w1),w0:ha2(F.jalan.w0),und:'–',tgt:`${ha2(F.jalan.plan)} ha (rencana)`,cap:pc(F.jalan.pct),note:`Luas poligon. Perimeter ${ha2(F.jalan.perimeter)} ha tanpa rencana; Maintenance ${ha2(F.jalan.maint)} ha tanpa tanggal; total union ${ha2(F.jalan.total)} ha vs rencana union ${ha2(F.jalan.planUnion)} ha.`});
 r.push({id:'drain',n:'Drain (tipe berencana)',u:'ha',real:ha2(F.drain.real),w1:ha2(F.drain.w1),w0:ha2(F.drain.w0),und:F.drain.und.n?`${F.drain.und.n} poligon · ${ha2(F.drain.und.ha)} ha`:'–',tgt:`${ha2(F.drain.plan)} ha (rencana)`,cap:pc(F.drain.pct),note:`Luas poligon. Total union ${ha2(F.drain.total)} ha; volume galian ${n0(F.drain.vol)} m³ (terisi sebagian). Catatan data: Rencana Perimeter Drain berisi 2 poligon identik (OBJECTID 2 &amp; 336) sehingga rencana (Σ per tipe) terhitung ganda; tanpa duplikat ≈ 9,30 ha → ≈ 35,8%.`});
 return r}
function renderRing(){const pane=$('p-ring');if(!K.P){pane.innerHTML='<div class="empty" style="padding:16px">Memuat ringkasan kegiatan…</div>';return}
 const P=K.P,rows=ringRows();
 pane.innerHTML=`<div class="two-col wide-left"><div class="card"><div class="card-h"><h4>Ringkasan semua kegiatan <small>(klik baris = kurva kumulatif)</small></h4><div class="card-tools"><button class="btn-mini" id="csvRing">⭳ CSV</button></div></div><div class="tscroll"><table class="dt" id="ringT"><thead><tr><th>Kegiatan</th><th>Satuan</th><th class="n">Realisasi</th><th class="n" title="Code 1 = data ${tg(P.meta.minggu_ini.tanggal)}">Minggu ini</th><th class="n" title="Code 0 = hingga ${tg(P.meta.hingga.tanggal)}">Hingga 7 Nov</th><th>Tanpa tanggal</th><th>Target / rencana</th><th class="n">Capaian</th><th>Catatan</th></tr></thead><tbody>${rows.map(r=>`<tr data-act="${r.id}" class="${r.sub?'sub':''}${K.sel===r.id?' sel':''}" tabindex="0"><td><b>${esc(r.n)}</b></td><td>${r.u}</td><td class="n">${r.real}</td><td class="n">${r.w1}</td><td class="n">${r.w0}</td><td>${esc(r.und)}</td><td>${esc(r.tgt)}</td><td class="n">${r.cap}</td><td class="nt">${esc(r.note)}</td></tr>`).join('')}</tbody></table></div></div>
 <div class="card side-card"><div class="card-h"><h4>Definisi &amp; catatan data</h4></div><div class="pbody notes">
  <p><b>Minggu ini</b> = Code 1 (data ${tg(P.meta.minggu_ini.tanggal)}); <b>Hingga 7 Nov</b> = Code 0. Code adalah penanda minggu pelaporan dari data, bukan diturunkan dari tanggal. Tanggal data terbaru: <b>${tg(P.meta.tanggal_data)}</b>.</p>
  <p><b>${esc(tgtLabel())}.</b> Persen LC dan Rumpukan = luas union (tanpa hitung ganda) yang berada <i>di dalam</i> Batas Kebun ÷ luas Batas Kebun, dihitung di UTM 48S; luas di luar Batas Kebun hanya info. Rumpukan = hanya kelas <i>Rumpukan</i>; Maintenance &amp; Timbun = info luas.</p>
  <p>Jalan &amp; Drain dibandingkan dengan rencananya sendiri (luas poligon, bukan panjang; tipe yang punya rencana). STO = Stake Out oleh surveyor (tanpa target, jumlah titik saja).</p>
  <p>Titik tanam: hanya angka realisasi (titik unik). Titik “Plan Titik Tanam” dalam layer Realisasi Titik Tanam (${n0(P.tanam.rencana_referensi_unik)} titik) = informasi saja, bukan target; tidak ada persentase capaian.</p>
  <p>Label kelas legenda mengikuti ArcGIS (style_spec) dan sebagian tidak sama dengan tanggal data. Data tanpa tanggal tidak masuk kurva kumulatif.</p></div></div></div>`;
 pane.querySelectorAll('tr[data-act]').forEach(tr=>{const go=()=>{K.sel=tr.dataset.act;K.csel=csTab(K.sel);selCards();A.showTab('kurva')};tr.onclick=go;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
 $('csvRing').onclick=()=>A.u.csv([['Kegiatan','Satuan','Realisasi','Minggu_ini_Code1','Hingga_7Nov_Code0','Tanpa_tanggal','Target_rencana','Capaian','Catatan']].concat(rows.map(r=>[r.n,r.u,r.real,r.w1,r.w0,r.und,r.tgt,r.cap,r.note])),`ringkasan_kegiatan_${A.u.stamp()}.csv`)}
// ---- kurva ----
const csTab=id=>['stakeout','lubang','planting'].includes(id)?'tanam':id;
function selCards(){document.querySelectorAll('.act').forEach(c=>c.classList.toggle('sel',c.dataset.act===K.sel))}
function seriesFor(id){const P=K.P,pt=(arr,key)=>arr.map(x=>[x.t,x[key]]);let S=[],target=null,rows=[],note='',unit='ha',und=null;
 switch(id){
 case'lc':S=[{n:'LC kumulatif (union)',c:'#c9a800',p:pt(P.lc.timeline,'cum')}];target={v:window.TARGET?TARGET.ha:0,l:tgtLabel()};rows=P.lc.timeline.map(x=>[x.t,x.add,x.cum]);und=P.lc.tanpa_tanggal;note='Luas union kumulatif per tanggal (total, termasuk di luar batas).';break;
 case'rumpukan':{const ci=P.rumpukan.kelas_info;S=[{n:'Rumpukan (kelas Rumpukan) kumulatif',c:'#ff8c00',p:pt(P.rumpukan.timeline,'cum')},{n:'Maintenance (info)',c:'#a87000',dash:1,p:pt(ci.maintenance.timeline,'cum')},{n:'Timbun (info)',c:'#2fa100',dash:1,p:pt(ci.timbun.timeline,'cum')}];
  target={v:window.TARGET?TARGET.ha:0,l:tgtLabel()};rows=P.rumpukan.timeline.map(x=>[x.t,x.add,x.cum]);und=P.rumpukan.tanpa_tanggal;note='Target &amp; progres hanya untuk kelas Rumpukan; Maintenance dan Timbun = info luas (garis putus-putus), tanpa %.';break}
 case'sto':S=[{n:'STO kumulatif (titik)',c:'#0070ff',p:pt(P.sto.timeline,'cum')}];unit='titik';rows=P.sto.timeline.map((x,i)=>[x.t,x.n,x.cum]);und={n:P.sto.tanpa_tanggal.n,ha:null};note='STO = Stake Out surveyor. Tanpa target.';break;
 case'tanam':{const T=P.tanam.timeline;S=[['Planting','#2fb300'],['Stake Out','#005ce6'],['OFF Planting','#e60000']].map(([c,col])=>({n:c+' kumulatif',c:col,p:T.filter(x=>x['cum_'+c]!=null).map(x=>[x.t,x['cum_'+c]])}));unit='titik unik';
  rows=T.map(x=>[x.t,(x.Planting||0)+(x['Stake Out']||0)+(x['OFF Planting']||0),x['cum_Planting']||0,x['cum_Stake Out']||0]);und={n:P.tanam.cats['Lubang Tanam'].tanpa_tanggal,ha:null,lbl:'Lubang Tanam'};note='Hanya realisasi (titik unik per Kode_Pokok); plan titik tanam bukan target.';break}
 case'jalan':{const j=P.jalan;S=[{n:'Jalan realisasi kumulatif (union)',c:'#3b8fd6',p:pt(j.timeline,'cum')}];target={v:j.rencana.union_ha,l:'Rencana (Plan Road, union) '+ha2(j.rencana.union_ha)+' ha'};rows=j.timeline.map(x=>[x.t,x.add,x.cum]);und=j.tanpa_tanggal;note='Capaian % memakai tipe berencana (Main+Collection). Maintenance Road tanpa tanggal.';break}
 case'drain':{const d=P.drain;S=[{n:'Drain realisasi kumulatif (union)',c:'#e0301e',p:pt(d.timeline,'cum')}];target={v:d.rencana.union_ha,l:'Rencana Drain (union) '+ha2(d.rencana.union_ha)+' ha'};rows=d.timeline.map(x=>[x.t,x.add,x.cum]);und=d.tanpa_tanggal;note='Capaian % memakai tipe berencana (rencana Σ per tipe, mengikuti Puzzle17); volume galian terisi sebagian. Rencana Perimeter Drain memuat 2 poligon identik (OBJECTID 2 & 336): tanpa duplikat ≈ 9,30 ha → ≈ 35,8%.';break}}
 return{S,target,rows,und,note,unit}}
function lineChart(box,o){const W=Math.max(box.clientWidth,300),H=Math.max(box.clientHeight,150),m={l:48,r:18,t:16,b:30},pw=W-m.l-m.r,ph=H-m.t-m.b;
 const all=[].concat(...o.S.map(s=>s.p));if(!all.length){box.innerHTML='<div class="empty" style="padding:20px">Tidak ada data bertanggal untuk digambar.</div>';return}
 const tn=A.u.tglNum,ts=all.map(p=>tn(p[0])),t0=Math.min(...ts),t1=Math.max(...ts),span=(t1-t0)||86400000*7,pad=all.length>1&&t1>t0?0.04*span:span/2;
 const vmax=Math.max(...all.map(p=>p[1]),o.target&&o.target.v<Math.max(...all.map(p=>p[1]))*3?o.target.v:0)*1.08||1,ys=A.u.niceStep(vmax/4),ym=ys*Math.ceil(vmax/ys);
 const X=t=>m.l+((t-(t0-pad))/(span+2*pad))*pw,Y=y=>m.t+ph-(y/ym)*ph;let s=`<svg width="${W}" height="${H}" role="img" aria-label="Kurva kumulatif">`;
 for(let y=0;y<=ym+1e-9;y+=ys)s+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(y)}" y2="${Y(y)}" class="gl"/><text x="${m.l-6}" y="${Y(y)+3}" class="ax" text-anchor="end">${nf(y,ys<1?1:0)}</text>`;
 if(o.target&&o.target.v<=ym)s+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(o.target.v)}" y2="${Y(o.target.v)}" class="tg"/><text x="${W-m.r}" y="${Y(o.target.v)-5}" class="tgl" text-anchor="end">${esc(o.target.l)}</text>`;
 o.S.forEach(se=>{if(!se.p.length)return;const pts=se.p.map(p=>[X(tn(p[0])),Y(p[1]),p]);
  if(pts.length>1)s+=`<path d="${pts.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join('')}" fill="none" stroke="${se.c}" stroke-width="${se.dash?1.8:2.4}"${se.dash?' stroke-dasharray="5 3"':''} stroke-linejoin="round"/>`;
  pts.forEach(q=>s+=`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${se.dash?2.5:3.4}" fill="#fff" stroke="${se.c}" stroke-width="2"><title>${esc(se.n)} · ${tg(q[2][0])}: ${nf(q[2][1],o.unit==='ha'?3:0)} ${o.unit}</title></circle>`)});
 let lx=-99;const uniq=[...new Set(all.map(p=>p[0]))].sort();uniq.forEach((t,i)=>{const x=X(tn(t));if(x-lx>56||i===uniq.length-1){const d=new Date(t+'T00:00:00Z');s+=`<text x="${x}" y="${H-10}" class="ax" text-anchor="middle">${d.getUTCDate()} ${BLN[d.getUTCMonth()]}</text>`;lx=x}});
 box.innerHTML=s+'</svg><div class="legend-ln">'+o.S.map(se=>`<span><i style="background:${se.c}"></i>${esc(se.n)}</span>`).join('')+'</div>'}
function renderKurva(){const pane=$('p-kurva');if(!K.P){pane.innerHTML='<div class="empty" style="padding:16px">Memuat…</div>';return}
 const id=K.csel||csTab(K.sel),o=seriesFor(id),opts=[['lc','Land Clearing'],['rumpukan','Rumpukan'],['sto','STO – Stake Out Surveyor'],['tanam','Titik tanam (Planting / Stake Out / OFF)'],['jalan','Jalan'],['drain','Drain']];
 const heads=id==='tanam'?['Tanggal','+ titik (unik)','Planting kum.','Stake Out kum.']:['Tanggal','+ '+o.unit,'Kumulatif ('+o.unit+')'];const dd=o.unit==='ha'?3:0;
 const und=o.und&&o.und.n?`<div class="foot und">Tanpa tanggal: <b>${n0(o.und.n)}</b> ${o.unit==='ha'?'poligon':'titik'}${o.und.ha!=null?`, ${ha2(o.und.ha)} ha`:''}${o.und.lbl?' ('+o.und.lbl+')':''} — ditandai “tanpa tanggal”, tidak digambar pada kurva.</div>`:'';
 pane.innerHTML=`<div class="two-col"><div class="card chart-card"><div class="card-h"><h4>Kurva kumulatif per tanggal</h4><div class="card-tools"><select id="kvSel" aria-label="Kegiatan">${opts.map(([k,l])=>`<option value="${k}"${k===id?' selected':''}>${l}</option>`).join('')}</select></div></div><div id="kvSvg" class="svgbox"></div><div class="foot one" title="${esc(o.note.replace(/&amp;/g,'&'))}">${o.note}</div></div>
 <div class="card"><div class="card-h"><h4>Rincian per tanggal</h4><div class="card-tools"><button class="btn-mini" id="csvKv">⭳ CSV</button></div></div><div class="tscroll"><table class="dt"><thead><tr>${heads.map((h,i)=>`<th class="${i?'n':''}">${h}</th>`).join('')}</tr></thead><tbody>${o.rows.map(r=>`<tr><td>${tg(r[0])}</td>${r.slice(1).map(v=>`<td class="n">${nf(v,dd)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${heads.length}" class="empty">Tidak ada data bertanggal</td></tr>`}</tbody></table>${und}</div></div></div>`;
 $('kvSel').onchange=e=>{K.csel=e.target.value;if(['lc','rumpukan','sto','jalan','drain'].includes(K.csel))K.sel=K.csel;else if(!['stakeout','lubang','planting'].includes(K.sel))K.sel='planting';selCards();renderKurva()};
 $('csvKv').onclick=()=>A.u.csv([heads].concat(o.rows),`kurva_${id}_${A.u.stamp()}.csv`);
 lineChart($('kvSvg'),o)}
// ---- tabel per blok ----
const PBCOLS=[
 {k:'no',t:'Blok',sv:r=>r.no==null?1000+r.i:r.no,num:true,h:r=>`<b>${esc(r.label)}</b>`},
 {k:'luas',t:'Luas blok (ha)',num:true,f:r=>ha2(r.luas)},{k:'bk_blok',t:'Dlm Batas Kebun (ha)',num:true,f:r=>ha2(r.bk_blok)},
 {k:'lc_batas',t:'LC (ha)',num:true,f:r=>ha2(r.lc_batas)},{k:'lc_pct',t:'% LC',num:true,sv:r=>r.lc_pct==null?-1:r.lc_pct,h:r=>r.lc_pct==null?'<span class="dash" title="Tidak ada Batas Kebun pada blok ini">—</span>':`<span class="pb"><i style="width:${Math.min(r.lc_pct,100)}%"></i></span><b>${nf(r.lc_pct,1)}%</b>`},
 {k:'rumpukan_batas',t:'Rumpukan (ha)',num:true,f:r=>ha2(r.rumpukan_batas)},{k:'rp_pct',t:'% Rumpukan',num:true,sv:r=>r.rp_pct==null?-1:r.rp_pct,h:r=>r.rp_pct==null?'<span class="dash" title="Tidak ada Batas Kebun pada blok ini">—</span>':`<span class="pb"><i style="width:${Math.min(r.rp_pct,100)}%"></i></span><b>${nf(r.rp_pct,1)}%</b>`},
 {k:'rump_mt',t:'Maint.+Timbun (ha, info)',num:true,f:r=>ha2(r.rump_mt)},
 {k:'jalan_real',t:'Jalan real. (ha)',num:true,f:r=>ha2(r.jalan_real)},{k:'jalan_rencana',t:'Jalan rencana (ha)',num:true,f:r=>ha2(r.jalan_rencana)},
 {k:'drain_real',t:'Drain real. (ha)',num:true,f:r=>ha2(r.drain_real)},{k:'drain_rencana',t:'Drain rencana (ha)',num:true,f:r=>ha2(r.drain_rencana)},
 {k:'sto',t:'STO (titik)',num:true,f:r=>n0(r.sto)},{k:'so',t:'Stake Out',num:true,f:r=>n0(r.so)},{k:'lt',t:'Lubang',num:true,f:r=>n0(r.lt)},{k:'pl',t:'Planting',num:true,f:r=>n0(r.pl)},{k:'off',t:'OFF',num:true,f:r=>n0(r.off)},{k:'ref',t:'Titik plan (info)',num:true,f:r=>n0(r.ref)}];
function pbRows(){const P=K.P,all=P.blok.map((b,i)=>{const t=P.tanam.per_blok_idx[i]||{};
  return Object.assign({},b,{_i:i,lc_pct:b.bk_blok>0.0005?b.lc_batas/b.bk_blok*100:null,rp_pct:b.bk_blok>0.0005?b.rumpukan_batas/b.bk_blok*100:null,rump_mt:(b.rump_maint||0)+(b.rump_timbun||0),
   so:t['Stake Out']||0,lt:t['Lubang Tanam']||0,pl:t['Planting']||0,off:t['OFF Planting']||0,ref:t.ref||0})});
 return K.showAll?all:all.filter(r=>r.lc_batas>0.0005||r.rumpukan_batas>0.0005||r.rump_mt>0.0005||r.jalan_real>0.0005||r.drain_real>0.0005||r.sto||r.so||r.lt||r.pl||r.off)}
function renderPB(){const pane=$('p-pb');if(!K.P){pane.innerHTML='<div class="empty" style="padding:16px">Memuat…</div>';return}
 A.sort.pb=A.sort.pb||{k:'no',d:1};const base=pbRows(),rows=A.u.sortRows(base,A.sort.pb,PBCOLS),S=k=>A.u.sum(rows,r=>r[k]||0);
 const foot=`<tr><td><b>Total (${rows.length} blok)</b></td>${PBCOLS.slice(1).map(c=>{const k=c.k;if(k==='lc_pct')return`<td class="n"><b>${nf(S('bk_blok')>0?S('lc_batas')/S('bk_blok')*100:0,1)}%</b></td>`;if(k==='rp_pct')return`<td class="n"><b>${nf(S('bk_blok')>0?S('rumpukan_batas')/S('bk_blok')*100:0,1)}%</b></td>`;return`<td class="n"><b>${['sto','so','lt','pl','off','ref'].includes(k)?n0(S(k)):ha2(S(k))}</b></td>`}).join('')}</tr>`;
 pane.innerHTML=`<div class="card" style="height:100%"><div class="card-h"><h4>Progres per blok — semua kegiatan <small>(klik baris = zoom ke blok)</small></h4><div class="card-tools"><label class="chk"><input type="checkbox" id="pbAll"${K.showAll?' checked':''}> semua blok</label><button class="btn-mini" id="csvPB">⭳ CSV</button></div></div><div class="tscroll">${A.u.tableHTML('pb',PBCOLS,rows,r=>r.no==null?'':'tanam:'+r.no,foot)}</div>
 <div class="foot">% LC / % Rumpukan = luas union di dalam Batas Kebun ∩ blok ÷ luas (Batas Kebun ∩ blok); “—” bila blok tidak punya Batas Kebun (bukan 0%). Rumpukan = hanya kelas Rumpukan; Maintenance + Timbun = info luas. Jalan/Drain = luas union poligon ∩ blok. Tanam = jumlah titik layer Realisasi Titik Tanam (SHP dedup) per blok (field Blok; kode pokok B11/R001/02); titik plan = informasi saja. LC per blok di sini = seluruh LC (tab “LC · Progres Blok” mengikuti filter).</div></div>`;
 A.u.wireSort(pane,'pb');pane.querySelectorAll('tr[data-hl]').forEach(r=>r.onkeydown=A.u.rowKeyHandler);
 $('pbAll').onchange=e=>{K.showAll=e.target.checked;renderPB()};
 $('csvPB').onclick=()=>A.u.csv([PBCOLS.map(c=>c.t)].concat(rows.map(r=>PBCOLS.map(c=>c.k==='no'?r.label:c.k==='lc_pct'||c.k==='rp_pct'?(r[c.k]==null?'':r[c.k].toFixed(2)):(typeof r[c.k]==='number'?r[c.k]:r[c.k])))),`progres_per_blok_${A.u.stamp()}.csv`);
 A.u.markSel()}
// ---- pasang tab ----
A.TABS.ring=renderRing;A.TABS.kurva=renderKurva;A.TABS.pb=renderPB;
function boot(){
 if(!A.ready){setTimeout(boot,120);return}
 Vault.getJSON('data/progres.json?v=202611192210').then(P=>{K.P=P;K.F=figures(P);
  renderCards();A.renderTab();
  const d=P.meta.tanggal_data,[y,m]=d.split('-');const per=$('periode'),up=$('lastUpd');
  if(per)per.textContent=`Periode: ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][m-1]} ${y}`;if(up)up.textContent=tg(d).replace(/ (\w+) /,(a,b)=>' '+['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][BLN.indexOf(b)]+' ');
  K.ready=true;document.dispatchEvent(new CustomEvent('kegiatan:ready'))}).catch(e=>{console.warn('progres gagal',e);$('kpis').innerHTML='<div class="note" style="padding:12px">Ringkasan kegiatan gagal dimuat. Muat ulang halaman.</div>'})}
document.addEventListener('click',e=>{const eye=e.target.closest('.act-eye');if(eye){e.stopPropagation();toggleEye(eye.dataset.eye);return}
 const c=e.target.closest('.act');if(c&&c.parentNode.id==='kpis'){K.sel=c.dataset.act;K.csel=csTab(K.sel);selCards();A.showTab('kurva')}});
document.addEventListener('keydown',e=>{const c=e.target.closest&&e.target.closest('.act');if(c&&(e.key==='Enter'||e.key===' ')&&e.target===c){e.preventDefault();K.sel=c.dataset.act;K.csel=csTab(K.sel);selCards();A.showTab('kurva')}});
// ---- Cari kode pokok (format baku B11/R001/02; format lama B11/R1/2, huruf kecil & spasi tetap diterima) ----
async function cariKode(){const q=$('kodeQ').value,res=$('kodeRes');if(!q.trim()){res.textContent='';return}
 const n=Atlas.kode.norm(q);if(!n){res.innerHTML='Format tidak dikenali. Contoh: <b>B11/R001/02</b> (B+blok / R+baris 3 digit / pohon 2 digit).';return}
 res.textContent='Mencari '+n+'…';let r;try{r=await Atlas.findKode(q)}catch(e){res.textContent='Gagal mencari: '+e.message;return}
 const note=(n!==String(q).trim()?` (dari masukan “${esc(q.trim())}”)`:'');
 if(!r.hits.length){res.innerHTML=`<b>${n}</b>${note}: tidak ditemukan pada layer Realisasi Titik Tanam (semua tahap, termasuk Plan).`;return}
 const hs=[];r.hits.forEach(h=>{let o=hs.find(x=>x.id===h.id);if(!o)hs.push(o={id:h.id,hit:[]});o.hit.push({p:h.p})});
 hs.forEach(o=>{if(!Atlas.isShown(o.id))Atlas.setVisible(o.id,true)});
 const h=r.hits[0],ll=[h.lat,h.lng];Atlas.map.setView(ll,19,{animate:false});
 setTimeout(()=>Atlas.showAttr(ll,hs),150);
 res.innerHTML=`<b>${n}</b>${note}: ${r.hits.length} titik (${hs.map(o=>Atlas.lay[o.id].name+' ×'+o.hit.length).join(', ')}).`}
if($('kodeGo')){$('kodeGo').onclick=cariKode;$('kodeQ').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();cariKode()}}}
boot();
})();
