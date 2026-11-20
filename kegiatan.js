// Dashboard multi-kegiatan (v5): kartu per kegiatan, kurva kumulatif per tanggal, tabel per blok, toggle layer peta per kegiatan.
// Data ringkasan: data/progres.json (terenkripsi; dihitung di UTM 48S dari layer Puzzle17 oleh prep_p17.py). Dimuat SETELAH login.
(function(){
'use strict';
const A=window.Analytics;if(!A||!window.Vault||!window.Atlas)return;
const $=id=>document.getElementById(id);
const nf=(n,d)=>(+n).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const tg=s=>{if(!s)return'–';const[y,m,d]=s.split('-');return `${+d} ${BLN[m-1]} ${y}`};
const K=window.Kegiatan={P:null,sel:null,eye:{},excl:new Set(),csel:'lc'};
const CATMAP={'Planting':'Planting','Stake Out Titik Tanam':'Stake Out','Lubang Tanam':'Lubang Tanam','OFF Planting':'OFF Planting'};
const ha2=v=>nf(v,2),ha3=v=>nf(v,3),ha4=v=>nf(v,4),n0=v=>nf(v,0);
// ---- definisi kegiatan ----
const ACTS=[
 {id:'lc',name:'Land Clearing',color:'#e6c800',layers:['land_clearing'],unit:'ha'},
 {id:'rumpukan',name:'Rumpukan',color:'#ffaa00',layers:['rumpukan'],unit:'ha'},
 {id:'sto',name:'STO – Stake Out Surveyor',color:'#0070ff',layers:['sto'],unit:'titik'},
 {id:'planting',name:'Planting',color:'#4ce600',layers:['titik_tanam_realisasi'],unit:'titik',group:'tanam'},
 {id:'jalan',name:'Jalan (Road)',color:'#5aa9e6',layers:['jalan_realisasi','jalan_rencana','jalan_maintenance'],unit:'ha'},
 {id:'drain',name:'Drain',color:'#ff3b30',layers:['drain_realisasi','drain_rencana'],unit:'ha'},
 {id:'statuslahan',name:'Status Lahan',color:'#1b7a3a',layers:['status_lahan_dnp'],unit:'ha',noDate:true}];
const ACT=Object.fromEntries(ACTS.map(a=>[a.id,a]));
const basis=()=>(window.TARGET&&TARGET.basis==='status_lahan')?'kebun':'batas';
const tgtLabel=()=>(window.TARGET&&TARGET.label)||'Target = luas Batas Kebun DNP';
function lcIn(o){return basis()==='kebun'?{in:o.dalam_kebun_ha,out:o.luar_kebun_ha,pct:o.persen_kebun}:{in:o.dalam_batas_ha,out:o.luar_batas_ha,pct:o.persen_batas}}
// ---- angka per kegiatan (satu sumber untuk kartu, tabel ringkasan, tes) ----
function figures(P){
 const lc=P.lc,rp=P.rumpukan,ci=rp.kelas_info,sto=P.sto,tn=P.tanam.cats,jl=P.jalan,dr=P.drain,F={};
 const L=lcIn(lc),R=lcIn(rp);
 const fromAt=(At,extra)=>{const und={n:At.tanpa_tanggal_n||0,ha:At.tanpa_tanggal_ha||0};
  return Object.assign({real:At.sum_ha,dalam:At.dalam_ha,luar:At.luar_ha,pct:At.persen_dalam_batas,penyebut:At.penyebut_ha,
   w1:At.code1_sum_ha||0,w0:At.code0_sum_ha||0,und,n:At.n,residual:At.selisih_atribut_minus_geom_ha,rawSum:At.mentah_geom_sum_ha,
   metode:At.metode_dalam_luar,kolom:At.kolom,total:At.sum_ha,out:At.luar_ha,perTipe:At.per_tipe||{},last:null},extra||{})};
 F.lc=fromAt(lc.atribut,{last:lc.tanggal_maks});
 const At=rp.atribut,pk=At&&At.per_kelas||{},kR=pk.Rumpukan||{},kM=pk['Maintenance Rumpukan']||{},kT=pk['Timbun Rumpukan']||{};
 F.rumpukan={real:At.sum_luas_ha,dalam:At.dalam_ha,luar:At.luar_ha,pct:At.persen_dalam_batas,penyebut:At.penyebut_ha,
  w1:At.code1_sum_luas_ha,w0:At.code0_sum_luas_ha,und:rp.tanpa_tanggal,last:rp.tanggal_maks,n:At.n,
  kelas:kR.sum_luas_ha,kelasDalam:kR.dalam_ha,kelasLuar:kR.luar_ha,
  maint:kM.sum_luas_ha,maintDalam:kM.dalam_ha,timbun:kT.sum_luas_ha,timbunDalam:kT.dalam_ha,
  residual:At.selisih_atribut_minus_geom_ha,rawSum:At.mentah_geom_sum_ha,rawDalam:At.mentah_geom_dalam_ha,rawLuar:At.mentah_geom_luar_ha,
  metode:At.metode_dalam_luar,unionKomposit:rp.semua_kelas&&rp.semua_kelas.union_ha,unionDalam:rp.semua_kelas&&rp.semua_kelas.dalam_batas_ha,
  total:At.sum_luas_ha,out:At.luar_ha};
 F.sto={real:sto.n,w1:sto.code1,w0:sto.code0,und:sto.tanpa_tanggal.n,last:sto.tanggal_maks,per:sto.per_name};
 ['Stake Out','Lubang Tanam','Planting','OFF Planting'].forEach(c=>{const o=tn[c];F[c]={real:o.unik,w1:o.code1,w0:o.code0,und:o.tanpa_tanggal,last:o.tanggal_maks,baris:o.baris}});
 const ja=jl.atribut,jra=jl.rencana.atribut,da=dr.atribut,dra=dr.rencana.atribut;
 F.jalan=fromAt(ja,{last:jl.tanggal_maks,plan:jra.sum_ha,planDalam:jra.dalam_ha,planLuar:jra.luar_ha,
  perimeter:ja.perimeter_ha,mc:ja.main_collection_ha,pctPlan:ja.persen_main_collection_dari_rencana,
  maint:ja.maintenance_luas_ha,maintDalam:ja.maintenance_dalam_ha,maintLuar:ja.maintenance_luar_ha,
  alasanKolom:ja.alasan_kolom_bukan_Luas,planUnion:jl.rencana.union_ha,planN:jra.n});
 F.drain=fromAt(da,{last:dr.tanggal_maks,plan:dra.sum_ha,planDalam:dra.dalam_ha,planLuar:dra.luar_ha,
  planRaw:dra.sum_mentah_ha,planN:dra.n,planNMentah:dra.n_mentah,planDelta:dra.delta_duplikat_ha,
  planDup:dra.duplikat,planned:da.tipe_berencana_ha,pctPlan:da.persen_tipe_berencana_dari_rencana,
  pctPlanAll:da.persen_semua_dari_rencana,vol:dr.volume_m3,planUnion:dr.rencana.union_ha,planTypes:dra.per_tipe});
 const sl=P.status_lahan,sa=sl&&sl.atribut;
 if(sa){F.statuslahan={real:sa.sum_ha,dalam:sa.dalam_ha,luar:sa.luar_ha,pct:sa.persen_dalam_batas,penyebut:sa.penyebut_ha,
  n:sa.n,residual:sa.selisih_atribut_minus_geom_ha,rawSum:sa.mentah_geom_sum_ha,metode:sa.metode_dalam_luar,kolom:sa.kolom||'Luas',
  perStatus:sa.per_status||{},urutan:sa.urutan||Object.keys(sa.per_status||{}),union:sl.union_ha,sumberLuas:sl.sumber_Luas_ha,
  sumberUnion:sl.sumber_union_ha,catatan:sa.catatan,identitas:sl.identitas||['Nama_SKTH','N_Pemilik']}}
 applyWeek(F);return F}
function weekBounds(){const DR=window.DateRange;return DR?DR.presetRange('minggu_ini'):{from:'',to:''}}
function sumDates(map,from,to){let s=0;if(!map||!from||!to)return 0;for(const[t,v] of Object.entries(map)){if(t>=from&&t<=to)s+=+v||0}return s}
function sumBefore(map,from){let s=0;if(!map||!from)return 0;for(const[t,v] of Object.entries(map)){if(t&&t<from)s+=+v||0}return s}
function applyWeek(F){
 const KT=window.KpiTanggal||{},w=weekBounds();
 const set=(obj,key)=>{if(!obj)return;const m=KT[key]||{};obj.w1=sumDates(m,w.from,w.to);obj.w0=sumBefore(m,w.from)};
 set(F.lc,'lc');set(F.rumpukan,'rumpukan');set(F.jalan,'jalan');set(F.drain,'drain');set(F.sto,'sto');
 ['Stake Out','Lubang Tanam','Planting','OFF Planting'].forEach(c=>set(F[c],c));
 return F}
K.applyWeek=applyWeek;
K.refreshWeek=function(){if(!K.F)return;applyWeek(K.F);renderCards();try{renderRing()}catch(e){}};
// ---- kartu ----
const EYE='<svg viewBox="0 0 24 24" width="15" height="15"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const ZICO='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function fmtTipe(pt){if(!pt||!Object.keys(pt).length)return'';return Object.entries(pt).map(([k,o])=>`${k} ${ha2(o.sum_ha)} (dalam ${ha2(o.dalam_ha)} / luar ${ha2(o.luar_ha)})`).join('; ')}
function areaCard(f,opt){opt=opt||{};
 const tip=`Total ${ha2(f.real)} ha = Σ ${f.kolom||'atribut'} (${n0(f.n)} poligon), dalam + luar Batas Kebun. Dalam ${ha2(f.dalam)} + Luar ${ha2(f.luar)} = ${ha2(f.real)}. Metode: setiap poligon, nilai atribut dibagi proporsional menurut clip geometri ke Batas Kebun (UTM 48S), dijumlah per poligon (bukan union).`+
  (f.rawSum!=null?` Mentah geometri: Σ area ${ha2(f.rawSum)} ha; selisih Σ atribut − Σ geometri = ${(+f.residual||0).toLocaleString('id-ID',{minimumFractionDigits:4,maximumFractionDigits:4})} ha (pembulatan koordinat).`:'')+
  (opt.tipeTxt?` Per tipe (Σ atribut): ${opt.tipeTxt}.`:'')+
  ` Persen ${nf(f.pct,1)}% = ${ha2(f.dalam)} / ${ha2(f.penyebut)} ha Batas Kebun, bukan dari angka total yang mencakup luar kebun.`+
  (opt.extraTip||'');
 const s3=`Dalam Batas Kebun ${ha2(f.dalam)} ha (${nf(f.pct,1)}% dari ${ha2(f.penyebut)} ha Batas Kebun) · Luar Batas Kebun ${ha2(f.luar)} ha`+(opt.extraS3||'');
 const subs=[{k:'dalam',lab:'Dalam Batas Kebun',v:ha2(f.dalam)+' ha',s:`${nf(f.pct,1)}% dari ${ha2(f.penyebut)} ha Batas Kebun`},
  {k:'luar',lab:'Luar Batas Kebun',v:ha2(f.luar)+' ha',s:'tidak masuk persen target'}].concat(opt.subs||[]);
 return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,s3,bar:f.pct,hidePctOnTotal:true,barOnCard:false,s4:opt.s4||tgtLabel(),tip,subs,heroExtra:opt.heroExtra||''};}
function cardData(a,F){const t=tgtLabel(),f=F[a.id];
 switch(a.id){
 case'lc':return areaCard(f,{s4:t,extraTip:' Layer LC tidak memiliki kelas/tipe.',heroExtra:'Tidak ada pembagian kelas pada Land Clearing.'});
 case'rumpukan':{const tip=`Total ${ha2(f.real)} ha = Σ kolom Luas semua kelas (${n0(f.n)} poligon), dalam + luar Batas Kebun. Dalam ${ha2(f.dalam)} + Luar ${ha2(f.luar)} = ${ha2(f.real)}. Metode: setiap poligon, Luas dibagi proporsional menurut clip geometri ke Batas Kebun (UTM 48S), dijumlah per poligon (bukan union — union semua kelas ∩ BK ≈ ${ha2(f.unionDalam)} ha karena tumpang tindih antar-kelas). Mentah geometri: Σ area ${ha2(f.rawSum)} ha; dalam ${ha2(f.rawDalam)}; luar ${ha2(f.rawLuar)}; selisih Σ Luas − Σ geometri = ${f.residual.toLocaleString('id-ID',{minimumFractionDigits:4,maximumFractionDigits:4})} ha (pembulatan koordinat). Per kelas (Σ Luas): Rumpukan ${ha2(f.kelas)} (dalam ${ha2(f.kelasDalam)} / luar ${ha2(f.kelasLuar)}); Maintenance ${ha2(f.maint)} (semua dalam); Timbun ${ha2(f.timbun)} (semua dalam). Persen ${nf(f.pct,1)}% = ${ha2(f.dalam)} / ${ha2(f.penyebut)} ha Batas Kebun, bukan dari angka total yang mencakup luar kebun.`;
  return{v:ha2(f.real),u:'ha',pill:`+${ha2(f.w1)} ha`,
   s3:`Dalam Batas Kebun ${ha2(f.dalam)} ha (${nf(f.pct,1)}% dari ${ha2(f.penyebut)} ha Batas Kebun) · Luar Batas Kebun ${ha2(f.luar)} ha · kelas: Rumpukan ${ha2(f.kelas)} · Maintenance ${ha2(f.maint)} · Timbun ${ha2(f.timbun)}`,
   bar:f.pct,hidePctOnTotal:true,barOnCard:false,s4:t,tip,
   subs:[
    {k:'dalam',lab:'Dalam Batas Kebun',v:ha2(f.dalam)+' ha',s:`${nf(f.pct,1)}% dari ${ha2(f.penyebut)} ha Batas Kebun`},
    {k:'luar',lab:'Luar Batas Kebun',v:ha2(f.luar)+' ha',s:'tidak masuk persen target'}
   ]};}
 case'sto':{const top=Object.entries(f.per).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>`${k} ${n0(v)}`).join(' · ');return{v:n0(f.real),u:'titik',pill:`+${n0(f.w1)}`,s3:top,s4:'Stake Out oleh surveyor · tanpa target (jumlah titik saja)'}}
 case'planting':{const o=F['Planting'],of=F['OFF Planting'],lb=F['Lubang Tanam'],so=F['Stake Out'],m=K.P.tanam.mentah||{};
  const planU=K.P.tanam.rencana_referensi_unik,planM=K.P.tanam.rencana_referensi_mentah||m.rencana;
  const tip=`Angka besar = Planting (tahap tertinggi), titik unik setelah dedup 3 m. Mentah sumber: Planting ${n0(m.Planting)} baris → ${n0(o.real)} unik; Lubang Tanam ${n0(m['Lubang Tanam']||lb.baris)} baris → ${n0(lb.real)} unik; Stake Out Titik Tanam ${n0(m['Stake Out']||so.baris)} baris → ${n0(so.real)} unik; Plan Titik Tanam ${n0(planM)} baris → ${n0(planU)} unik (referensi, bukan target; tidak ada % vs Plan). OFF Planting ${n0(m['OFF Planting'])} baris → ${n0(of.real)} unik (tidak dinomori, keputusan Pak Dwi).`;
  return{v:n0(o.real),u:'titik unik',pill:`+${n0(o.w1)}`,s3:`OFF Planting: ${n0(of.real)} titik unik (minggu ini ${n0(of.w1)}) · tanpa Kode_Pokok`,
   s4:'Kelompok titik tanam (4 kelas) · Plan = referensi, bukan target · tidak ada capaian vs Plan',tip,bar:null,
   subs:[
    {k:'planting',lab:'Planting',v:n0(o.real),s:`titik unik · mentah ${n0(m.Planting)} baris`},
    {k:'lubang',lab:'Lubang Tanam',v:n0(lb.real),s:`titik unik · mentah ${n0(m['Lubang Tanam']||lb.baris)} baris`},
    {k:'stakeout',lab:'Stake Out Titik Tanam',v:n0(so.real),s:`titik unik · mentah ${n0(m['Stake Out']||so.baris)} baris`},
    {k:'plan',lab:'Plan Titik Tanam',v:n0(planU),s:`referensi, bukan target · mentah ${n0(planM)} baris`}
   ]};}
 case'statuslahan':{const f=F.statuslahan,order=f.urutan||Object.keys(f.perStatus||{});
  const tip=`Total ${ha2(f.real)} ha = Σ kolom Luas (${n0(f.n)} poligon Status Lahan). Dalam ${ha4(f.dalam)} + Luar ${ha4(f.luar)} = ${ha4(f.real)}. Metode: setiap poligon, Luas dibagi proporsional menurut clip geometri ke Batas Kebun (UTM 48S), dijumlah per poligon (bukan union). Persen ${nf(f.pct,4)}% = ${ha4(f.dalam)} / ${ha4(f.penyebut)} ha Batas Kebun. Audit Atlas sumber SHP: Σ Luas 492,3385 ha; angka kartu memakai atribut layer web 492,3383 ha (selisih 0,0002 ha, pembulatan 4 desimal GeoJSON). 491,97 ha = union geometri Status Lahan (kebun_dnp), overlap dihitung sekali — bukan luas Batas Kebun (288,6584 ha). Identitas: Nama_SKTH dan N_Pemilik (field No_Rekap tidak ada di data). Bukan kegiatan berprogres: tanpa simbologi tanggal, tanpa pill minggu ini, tidak dijumlah dengan LC/Rumpukan.`+
   order.map(k=>{const o=f.perStatus[k];return o?` ${k}: ${ha4(o.sum_ha)} ha (${n0(o.n)} poligon; dalam ${ha4(o.dalam_ha)} / luar ${ha4(o.luar_ha)}).`:'';}).join('');
  const subs=[{k:'dalam',lab:'Dalam Batas Kebun',v:ha4(f.dalam)+' ha',s:`${nf(f.pct,4)}% dari ${ha4(f.penyebut)} ha Batas Kebun`},
   {k:'luar',lab:'Luar Batas Kebun',v:ha4(f.luar)+' ha',s:'tidak masuk persen target'}].concat(order.map(k=>{const o=f.perStatus[k]||{};return{k,lab:k,v:ha2(o.sum_ha)+' ha',s:`dalam ${ha4(o.dalam_ha||0)} / luar ${ha4(o.luar_ha||0)} · ${n0(o.n||0)} poligon`}}));
  return{v:ha2(f.real),u:'ha',noPill:true,hidePctOnTotal:true,barOnCard:false,bar:f.pct,
   s3:`Dalam Batas Kebun ${ha4(f.dalam)} ha (${nf(f.pct,4)}% dari ${ha4(f.penyebut)} ha Batas Kebun) · Luar Batas Kebun ${ha4(f.luar)} ha`,
   s4:'Bukan kegiatan berprogres · tidak dijumlah dengan LC/Rumpukan · identitas Nama_SKTH / N_Pemilik (tanpa No_Rekap)',
   tip,subs,heroExtra:'492,34 ha (Σ Luas web 492,3383) vs 491,97 ha (union / kebun_dnp). Sumber audit 492,3385 ha.'};}
 case'jalan':{const tipe=fmtTipe(f.perTipe);
  return areaCard(f,{s4:`Rencana ${ha2(f.plan)} ha (Σ Shape_Area, ${n0(f.planN)} poligon) · Maintenance ${ha2(f.maint)} ha (dalam ${ha2(f.maintDalam)} / luar ${ha2(f.maintLuar)}; layer terpisah, tidak masuk 6,93)`,
   tipeTxt:tipe,extraTip:' '+ (f.alasanKolom||'')+` Vs rencana ${ha2(f.plan)} ha (hanya Main+Collection): Main+Collection realisasi ${ha2(f.mc)} ha = ${nf(f.pctPlan,1)}% dari ${ha2(f.plan)} ha. Perimeter Road ${ha2(f.perimeter)} ha tidak punya pasangan rencana.`,
   extraS3:` · vs rencana ${ha2(f.plan)} ha: Main+Collection ${ha2(f.mc)} ha = ${nf(f.pctPlan,1)}% dari ${ha2(f.plan)} ha · Perimeter ${ha2(f.perimeter)} ha tanpa pasangan rencana`,
   heroExtra:`Per tipe (Σ Shape_Area): ${tipe}. Rencana ${ha2(f.plan)} ha (penyebut pembanding Main+Collection).`,
   subs:[{k:'rencana',lab:'Rencana Jalan (Σ Shape_Area)',v:ha2(f.plan)+' ha',s:`penyebut pembanding Main+Collection · ${n0(f.planN)} poligon`}]});}
 case'drain':{const tipe=fmtTipe(f.perTipe);
  const dup=(f.planDup&&f.planDup[0])||{objectid:[2,336],ha_masing:0.81560301};
  const dupNote=`Dua poligon Rencana Perimeter Drain identik (OBJECTID ${dup.objectid.join(' & ')}) dihitung sekali (${ha2(dup.ha_masing)} ha), bukan dua kali. Mentah ${ha2(f.planRaw)} ha → resmi ${ha2(f.plan)} ha (${n0(f.planN)} dari ${n0(f.planNMentah)} poligon).`;
  return areaCard(f,{s4:`Rencana ${ha2(f.plan)} ha (Σ Shape_Area, ${dupNote}) · volume galian ${n0(f.vol)} m³`,
   tipeTxt:tipe,extraTip:' '+dupNote+` Vs rencana: semua tipe ${ha2(f.real)} / ${ha2(f.plan)} = ${nf(f.pctPlanAll,1)}%; tipe berencana (tanpa Cuci parit & Gorong Gorong) ${ha2(f.planned)} / ${ha2(f.plan)} = ${nf(f.pctPlan,1)}%.`,
   extraS3:` · vs rencana ${ha2(f.plan)} ha (dedup): semua tipe ${nf(f.pctPlanAll,1)}% · tipe berencana ${ha2(f.planned)} ha = ${nf(f.pctPlan,1)}%`,
   heroExtra:`Per tipe (Σ Shape_Area): ${tipe}. ${dupNote}`,
   subs:[{k:'rencana',lab:'Rencana Drain (Σ Shape_Area, dedup)',v:ha2(f.plan)+' ha',s:`Rencana Perimeter Drain berisi 2 poligon identik (OBJECTID 2 & 336); dihitung sekali; mentah ${ha2(f.planRaw)} ha`}]});}}}
const SHORT={lc:'LC',rumpukan:'Rumpukan',sto:'STO',planting:'Planting',jalan:'Jalan',drain:'Drain',statuslahan:'Status Lahan'};
function pctTxt(d){return d.bar!=null?nf(d.bar,1)+'%':''}
function renderCards(){const F=K.F,host=$('actList')||$('kpis');if(!host)return;const wrap=$('actDetailWrap');if(wrap&&host.contains(wrap))(host.parentNode||document.body).insertBefore(wrap,host.nextSibling);host.innerHTML=ACTS.map(a=>{const d=cardData(a,F);K.cards=K.cards||{};K.cards[a.id]=d;
 const pct=(!d.hidePctOnTotal)&&pctTxt(d);
 const pill=(!d.noPill&&d.pill)?`<span class="pill" title="Minggu ini = Senin–Minggu minggu berjalan (zona Asia/Jakarta)">${d.pill}</span>`:'';
 const subs=d.subs?`<div class="act-subs" title="${esc(d.tip||d.s3)}">${d.subs.map(x=>`<div class="ip" data-rp="${esc(x.k||'')}"><b>${esc(x.v)}</b><span>${esc(x.lab)}</span>${x.s?`<span class="sp">${esc(x.s)}</span>`:''}</div>`).join('')}</div>`:'';
 return `<article class="act${K.sel===a.id?' sel':''}" data-act="${a.id}" tabindex="0" role="button" aria-expanded="${K.sel===a.id}" aria-label="${esc(a.name)}: buka detail di panel kiri" style="--ac:${a.color}" ${d.tip?`title="${esc(d.tip)}"`:''}>
 <div class="act-h"><i class="act-dot"></i><b title="${esc(a.name)}">${esc(a.name)}</b><button type="button" class="act-zbtn" data-zoom="${a.id}" title="Zoom ke layer" aria-label="Zoom ke layer ${esc(a.name)}">${ZICO}</button><button type="button" class="act-eye" data-eye="${a.id}" aria-pressed="false" title="Tampilkan/sembunyikan layer ${esc(a.name)} di peta" aria-label="Layer peta ${esc(a.name)}">${EYE}</button></div>
 <div class="act-v"><span class="v">${d.v}</span><small>${d.u}</small>${pct?`<span class="pct">${pct}</span>`:''}${pill}</div>
 ${subs}
 ${d.bar!=null&&d.barOnCard!==false?`<div class="kpi-prog"><div style="width:${Math.min(d.bar,100)}%"></div></div>`:''}
 </article>`}).join('');
 renderStrip();placeDetail();syncEyes()}
function renderStrip(){const host=$('strip');if(!host||!K.F)return;
 host.innerHTML=ACTS.map(a=>{const d=K.cards[a.id],pct=pctTxt(d),tip=esc((d.tip||d.s3||'')+' · '+(d.s4||''));
  return `<button type="button" class="strip-item${K.sel===a.id?' sel':''}" data-act="${a.id}" style="--ac:${a.color}" title="${tip}">
   <span class="meta"><span class="nm">${esc(SHORT[a.id]||a.name)}</span><span class="val">${d.v}<small>${d.u}</small></span></span>
   ${pct?`<span class="pct">${pct}</span>`:'<span class="pct" style="color:var(--mut);font-weight:600">—</span>'}
   <span class="info" title="${tip}" aria-label="Catatan ${esc(a.name)}">i</span>
  </button>`}).join('')}
function barsMini(items,unit){if(!items||!items.length)return'<div class="empty">Tidak ada data</div>';
 const mx=Math.max(...items.map(x=>x.v),0);
 return items.map(x=>`<div class="bi"><div class="row"><span>${esc(x.l)}</span><b>${esc(x.t)}${x.s?`<em>${esc(x.s)}</em>`:''}</b></div><div class="bar"><div style="width:${mx?Math.min(100,x.v/mx*100):0}%"></div></div></div>`).join('')}
function topBlok(field,pctField,unit){
 if(!K.P||!K.P.blok)return'';
 const rows=K.P.blok.map((b,i)=>{const t=K.P.tanam&&K.P.tanam.per_blok_idx?K.P.tanam.per_blok_idx[i]||{}:{};
  const rec=Object.assign({},b,{so:t['Stake Out']||0,lt:t['Lubang Tanam']||0,pl:t['Planting']||0,off:t['OFF Planting']||0,ref:t.ref||0,
   lc_pct:b.bk_blok>0.0005?b.lc_batas/b.bk_blok*100:null,rp_pct:b.bk_blok>0.0005?b.rumpukan_batas/b.bk_blok*100:null});
  return rec}).filter(r=>(+r[field]||0)>0).sort((a,b)=>b[field]-a[field]).slice(0,12);
 const isHa=unit==='ha';
 return barsMini(rows.map(r=>{const pct=pctField?r[pctField]:null;
  return{l:r.label||('Blok '+r.no),v:r[field],t:isHa?ha2(r[field])+' ha':n0(r[field]),s:pctField?(pct==null?'—':nf(pct,1)+'%'):''}}),unit)}
function lyBox(a){const host=$('actLy');if(!host)return;
 const chk=(id,lab,on)=>`<label><input type="checkbox" data-ly="${esc(id)}" ${on?'checked':''}> ${esc(lab)}</label>`;
 if(!window.Atlas){host.innerHTML='';return}
 if(a.group==='tanam'||a.id==='planting'||a.cat){
  const cats=[['Planting','Planting'],['Lubang Tanam','Lubang Tanam'],['Stake Out','Stake Out Titik Tanam'],['Plan Titik Tanam','Plan Titik Tanam (referensi)'],['OFF Planting','OFF Planting (tidak dinomori)']];
  const onLay=Atlas.isShown('titik_tanam_realisasi');
  host.innerHTML=`<div class="ly-hint">Layer peta: Realisasi Titik Tanam (termasuk Plan sebagai referensi, bukan target)</div>`+
   chk('titik_tanam_realisasi','Tampilkan layer',onLay)+
   cats.map(([cat,lab])=>`<label><input type="checkbox" data-cat="${esc(cat)}" ${!K.excl.has(cat)?'checked':''}> ${esc(lab)}</label>`).join('');
  host.querySelectorAll('[data-ly]').forEach(i=>i.onchange=()=>Atlas.setVisible('titik_tanam_realisasi',i.checked));
  host.querySelectorAll('[data-cat]').forEach(i=>i.onchange=()=>{if(i.checked)K.excl.delete(i.dataset.cat);else K.excl.add(i.dataset.cat);if(Atlas.isShown('titik_tanam_realisasi')){const a=ACT[K.sel];Atlas.setPointFilter('titik_tanam_realisasi',(a&&isTanamAct(a))?pointPred(a):tanamFlt)}syncEyes()});
  return}
 const LYS={lc:[['land_clearing','Land Clearing']],rumpukan:[['rumpukan','Rumpukan']],sto:[['sto','STO – Stake Out Surveyor']],
  statuslahan:[['status_lahan_dnp','Status Lahan']],
  jalan:[['jalan_realisasi','Jalan realisasi'],['jalan_rencana','Jalan rencana (Plan Road)'],['jalan_maintenance','Maintenance Road']],
  drain:[['drain_realisasi','Drain realisasi'],['drain_rencana','Rencana Drain']]}[a.id]||a.layers.map(id=>[id,id]);
 host.innerHTML=`<div class="ly-hint">Toggle layer di peta untuk kegiatan ini</div>`+LYS.map(([id,lab])=>chk(id,lab,Atlas.st[id]?Atlas.isShown(id):false)).join('');
 host.querySelectorAll('[data-ly]').forEach(i=>i.onchange=()=>{Atlas.setVisible(i.dataset.ly,i.checked);syncEyes()})}

// ---- Filter (blok, rentang tanggal global, Rumpukan juga alat & operator) ----
K.gflt={};
const TANPA='tanpa data';
function cleanVal(x){if(x==null||x===undefined)return TANPA;const s=String(x).trim();return s===''?TANPA:s}
K.cleanVal=cleanVal;
function fltOf(id){const o=K.gflt[id]||(K.gflt[id]={blok:'',peng:'',op:''});if(o.peng==null)o.peng='';if(o.op==null)o.op='';return o}
function dateR(){const DR=window.DateRange;if(!DR)return{from:'',to:''};const r=DR.getRange();return{from:r.from||'',to:r.to||''}}
function fltActive(f){const r=dateR();return !!(f&&(f.blok||f.peng||f.op||r.from||r.to))}
function matchDate(p){const r=dateR(),tg0=p.Tanggal||'';if((r.from||r.to)&&!tg0)return false;if(r.from&&tg0<r.from)return false;if(r.to&&tg0>r.to)return false;return true}
function matchFltBase(p,f){if(f.blok&&!blokSet(p).has(String(f.blok)))return false;if(f.peng&&cleanVal(p.Pengerjaan)!==f.peng)return false;if(f.op&&cleanVal(p.Operator)!==f.op)return false;return true}
function blokSet(p){const out=new Set();const add=v=>{if(v==null||v==='')return;String(v).split(/[;,]/).forEach(x=>{x=String(x).trim();if(!x||x==='tanpa_No')return;out.add(x.replace(/^Blok\s*/i,''))})};add(p.Blok_utama);add(p.Blok_semua);add(p.No_Blok);add(p.Blok);add(p.Blok_sjoin);return out}
function matchFlt(p,f){if(!f)f=fltOf((K.sel)||'');if(!fltActive(f))return true;return matchFltBase(p,f)&&matchDate(p)}
function lyrIds(a){return (a.group==='tanam'||a.cat||a.id==='planting')?['titik_tanam_realisasi']:a.layers.slice()}
function isTanamAct(a){return !!(a&&(a.group==='tanam'||a.cat||a.id==='planting'))}
function catOf(p){return CATMAP[p.Name]||p.Name}
function pointPred(a){const f=fltOf(a.id);return p=>{if(isTanamAct(a)&&!tanamFlt(p))return false;if(isTanamAct(a)||(a&&a.noDate))return matchFltBase(p,f);return matchFlt(p,f)}}
function restoreLayer(id){const s=Atlas.st[id];if(!s||!Atlas.lay[id])return;if(Atlas.lay[id].fmt==='pts'){if(s.pts)Atlas.setPointFilter(id,tanamFlt)}else if(s.data&&s.data.features){const all=s.data.features;if(s.feats&&s.feats.length!==all.length)Atlas.setFeatures(id,all);else if(s.feats&&s.feats!==all)Atlas.setFeatures(id,all)}}
function restoreAllLayers(){const seen=new Set(),SD=window.SymbologiTanggal;ACTS.forEach(a=>lyrIds(a).forEach(id=>{if(!seen.has(id)){seen.add(id);if(SD&&SD.handles(id))SD.clearLayerRange(id);restoreLayer(id)}}))}
function applyMapFlt(a){if(!window.Atlas||!a)return;lyrIds(a).forEach(id=>{const s=Atlas.st[id],L=Atlas.lay[id];if(!s||!L)return;if(L.fmt==='pts'){if(s.pts)Atlas.setPointFilter(id,pointPred(a))}else if(s.data&&s.data.features){const f=fltOf(a.id),SD=window.SymbologiTanggal;
  /* simbologi tanggal: rentang global (DateRange) tidak membuang fitur; di luar rentang / tanpa rentang = arsir */
  const sdOn=!!(SD&&SD.handles(id));if(sdOn)SD.clearLayerRange(id);
  const local=!!(f.blok||f.peng||f.op);
  if(a.noDate){Atlas.setFeatures(id,local?s.data.features.filter(ft=>matchFltBase(ft.properties,f)):s.data.features);return}
  Atlas.setFeatures(id,sdOn?(local?s.data.features.filter(ft=>matchFltBase(ft.properties,f)):s.data.features):(fltActive(f)?s.data.features.filter(ft=>matchFlt(ft.properties,f)):s.data.features))}})}
function layerReady(id){const s=Atlas.st[id];return !!(s&&(s.pts||(s.data&&s.data.features)))}
async function ensureAndApply(a,forceLoad){if(!window.Atlas||!a)return;const ids=lyrIds(a);const need=ids.filter(id=>!layerReady(id));if(need.length&&(forceLoad||fltActive(fltOf(a.id)))){await Promise.all(need.map(id=>((Atlas.ensure||(x=>Atlas.setVisible(x,true)))(id)).catch(()=>null)));need.forEach(id=>{if(Atlas.st[id]&&!Atlas.isShown(id))Atlas.setVisible(id,true)})}restoreAllLayers();applyMapFlt(a);syncEyes()}
function featProps(id){const s=Atlas.st[id];if(!s)return null;if(s.pts){const o=[];for(let i=0;i<s.pts.n;i++)o.push(Atlas.rowProps(s.pts,i));return o}if(s.data&&s.data.features)return s.data.features.map(f=>f.properties);return null}
function filteredProps(a){const f=fltOf(a.id);let all=[];let ready=true;lyrIds(a).forEach(id=>{const arr=featProps(id);if(!arr){ready=false;return}arr.forEach(p=>all.push(p))});if(!ready&&!all.length)return null;if(isTanamAct(a)&&a.cat)all=all.filter(p=>catOf(p)===a.cat);return all.filter(p=>a.noDate?matchFltBase(p,f):matchFlt(p,f))}
function uniqClean(id,field){const arr=featProps(id);if(!arr)return[];const s=new Set(arr.map(p=>cleanVal(p[field])));
 return[...s].sort((a,b)=>a===TANPA?1:b===TANPA?-1:a.localeCompare(b,'id'))}
function optList(vals,sel,allLab){return `<option value="">${esc(allLab)}</option>`+vals.map(x=>`<option value="${esc(x)}"${sel===x?' selected':''}>${esc(x)}</option>`).join('')}
function genFilterUI(a){const f=fltOf(a.id);const seen=new Set();const bloks=[];(K.P.blok||[]).forEach(b=>{if(b.no==null||seen.has(b.no))return;seen.add(b.no);bloks.push(b)});bloks.sort((x,y)=>x.no-y.no);
 const opts=['<option value="">Semua blok</option>'].concat(bloks.map(b=>`<option value="${esc(b.no)}"${String(f.blok)===String(b.no)?' selected':''}>${esc(b.label||('Blok '+b.no))}</option>`));
 const full=a.id==='rumpukan';
 const alat=full?uniqClean('rumpukan','Pengerjaan'):[];
 const ops=full?uniqClean('rumpukan','Operator'):[];
 const title=full?'Filter':'Filter dasar';
 const extra=full?`
  <label>Pengerjaan (Alat)<select id="gPeng">${optList(alat,f.peng,'Semua alat')}</select></label>
  <label>Operator<select id="gOp">${optList(ops,f.op,'Semua operator')}</select></label>`:'';
 return `<h3>${title} <span class="badge" id="gCount"${fltActive(f)?'':' hidden'}>Terfilter</span></h3>
 <div class="filters gen-filters" data-act="${a.id}">
  <label>Blok<select id="gBlok">${opts.join('')}</select></label>${extra}
  <div id="gDateHost" class="dr-host"></div>
  <button type="button" id="gReset" class="btn-sec">Reset Filter</button>
  <div class="ly-hint" id="gHint">Filter memotong statistik; di luar rentang tanggal peta diarsir. KPI kartu tetap.</div>
 </div>`}
function fltSummary(a){const f=fltOf(a.id);if(!fltActive(f))return'';const rows=filteredProps(a);if(!rows){return `<div class="flt-sum">Filter siap. <button type="button" id="gLoad">Muat layer &amp; terapkan di peta</button></div>`}
 const n=rows.length;const unit=a.unit==='ha'?'fitur':'titik';let extra='';
 if(a.unit==='ha'){let m2=0,ha=0,useHa=false;rows.forEach(p=>{const L=p.Luas,S=p.Shape_Area;if(typeof L==='number'){if(L>80)m2+=L;else{ha+=L;useHa=true}}else if(typeof S==='number')m2+=S});if(useHa||m2)extra=` · luas ± ${ha2(useHa?ha:m2/1e4)} ha`}
 const per={};rows.forEach(p=>{const B=blokSet(p);if(!B.size){(per['(tanpa blok)']=(per['(tanpa blok)']||0)+1);return}B.forEach(b=>{if(!f.blok||String(b)===String(f.blok))per['Blok '+b]=(per['Blok '+b]||0)+1})});
 const top=Object.entries(per).sort((x,y)=>y[1]-x[1]).slice(0,8).map(([k,v])=>`${esc(k)} ${n0(v)}`).join(' · ');
 return `<div class="flt-sum">Hasil filter: <b>${n0(n)}</b> ${unit}${extra}.${top?`<br>${top}`:''}</div>`}
function bindGen(a){const read=()=>{const f=fltOf(a.id);f.blok=$('gBlok')?$('gBlok').value:'';f.peng=$('gPeng')?$('gPeng').value:'';f.op=$('gOp')?$('gOp').value:''};
 const run=()=>{read();ensureAndApply(a,true).then(()=>{genStats(a)})};
 ['gBlok','gPeng','gOp'].forEach(id=>{const e=$(id);if(e)e.onchange=run});
 if(window.DateRange&&$('gDateHost'))DateRange.mount($('gDateHost'),{variant:'kegiatan'});
 const rs=$('gReset');if(rs)rs.onclick=()=>{const f=fltOf(a.id);f.blok=f.peng=f.op='';if(window.DateRange)DateRange.clearRange();if(isTanamAct(a))K.excl.clear();restoreAllLayers();applyMapFlt(a);syncEyes();lyBox(a);genStats(a);if(window.UiState)UiState.saveNow()};
 const ld=$('gLoad');if(ld)ld.onclick=()=>ensureAndApply(a,true).then(()=>genStats(a))}
function recapBy(rows,field){const tot=rows.reduce((s,p)=>s+(+p.Luas||0),0),g={};
 rows.forEach(p=>{const k=cleanVal(p[field]);if(!g[k])g[k]={k,ha:0,n:0};g[k].ha+=(+p.Luas||0);g[k].n++});
 return{tot,rows:Object.values(g).sort((a,b)=>b.ha-a.ha||a.k.localeCompare(b.k,'id')).map(r=>Object.assign(r,{share:tot?r.ha/tot*100:0}))}}
function recapBars(rc,id){const mx=Math.max(0,...rc.rows.map(r=>r.ha));
 const body=rc.rows.map(r=>`<div class="bi" data-k="${esc(r.k)}"><div class="row"><span>${esc(r.k)}</span><b>${ha2(r.ha)} ha<em>${n0(r.n)} poligon · ${nf(r.share,1)}%</em></b></div><div class="bar"><div style="width:${mx?r.ha/mx*100:0}%"></div></div></div>`).join('')||'<div class="empty">Tidak ada data</div>';
 const sumG=rc.rows.reduce((s,r)=>s+r.ha,0);
 const ok=Math.abs(sumG-rc.tot)<1e-6;
 return `<div id="${id}">${body}</div><div class="ly-hint" id="${id}Sum">Jumlah kelompok: <b>${ha2(sumG)} ha</b> (${n0(rc.rows.reduce((s,r)=>s+r.n,0))} poligon)${ok?' = total':' ≠ total — periksa data'}.</div>`}
function rumpFilteredBlok(rows){
 const by={};rows.forEach(p=>{const no=p.Blok_utama;const k=(no==null||no==='')?'(tanpa blok)':String(no);if(!by[k])by[k]={no:k,ha:0,n:0};by[k].ha+=(+p.Luas||0);by[k].n++});
 const bk={};(K.P.blok||[]).forEach(b=>{if(b.no!=null)bk[String(b.no)]=b});
 return Object.values(by).sort((a,b)=>b.ha-a.ha).slice(0,12).map(r=>{
  const b=bk[r.no];const hasBk=b&&b.bk_blok>0.0005;const lab=b&&b.label?b.label:(r.no==='(tanpa blok)'?r.no:('Blok '+r.no));
  return{l:lab,v:r.ha,t:ha2(r.ha)+' ha',s:hasBk?n0(r.n)+' poligon':(r.no==='(tanpa blok)'?n0(r.n)+' poligon':'— · '+n0(r.n)+' poligon')}})
}
K.applyGenFlt=ensureAndApply;K.fltOf=fltOf;K.matchFlt=matchFlt;K.matchFltBase=matchFltBase;K.dateR=dateR;K.lyrIds=lyrIds;K.ACT=ACT;K.isTanamAct=isTanamAct;K.ACTS=ACTS;

function genStats(a){const host=$('genTools');if(!host)return;if(!K.P){host.innerHTML='';return}
 const F=K.F,P=K.P;let html='';
 const codeNote='';
 if(a.id==='rumpukan'){
  const rows=filteredProps(a)||[];
  const on=fltActive(fltOf(a.id));
  const tag=on?'Hasil filter':'Semua poligon';
  const byName={};rows.forEach(p=>{const k=p.Name||'(tanpa kelas)';if(!byName[k])byName[k]={l:k,ha:0,n:0};byName[k].ha+=(+p.Luas||0);byName[k].n++});
  const order=['Rumpukan','Maintenance Rumpukan','Timbun Rumpukan'];
  const komp=order.filter(k=>byName[k]).map(k=>{const o=byName[k],lab=k==='Rumpukan'?'Rumpukan (kelas)':(k.startsWith('Maintenance')?'Maintenance':'Timbun');
   return{l:lab,v:o.ha,t:ha2(o.ha)+' ha',s:n0(o.n)+' poligon'}});
  const rp=recapBy(rows,'Pengerjaan'),ro=recapBy(rows,'Operator'),rt=recapBy(rows,'Tanggal');
  const tglRows=rt.rows.map(r=>({k:r.k==='tanpa data'?r.k:tg(r.k),ha:r.ha,n:r.n,share:r.share}));
  html+=codeNote+`<div class="flt-sum" id="rRecapHead">${esc(tag)}: <b>${n0(rows.length)}</b> poligon · jumlah Luas <b>${ha2(rp.tot)} ha</b>. Recap memakai jumlah kolom Luas (semua kelas). KPI resmi di atas (Σ Luas ${ha2(F.rumpukan.real)} ha; dalam ${ha2(F.rumpukan.dalam)} ha = ${nf(F.rumpukan.pct,1)}% dari ${ha2(F.rumpukan.penyebut)} ha Batas Kebun) tidak terfilter.</div>
  <h3>Komposisi kelas <small>(${esc(tag)})</small></h3>`+(komp.length?barsMini(komp):'<div class="empty">Tidak ada data</div>')+
   `<h3 class="subh">Luas per Pengerjaan (Alat) <small>(ha, jumlah poligon, pangsa)</small></h3>`+recapBars(rp,'rPeng')+
   `<h3 class="subh">Luas per Operator <small>(ha, jumlah poligon, pangsa)</small></h3>`+recapBars(ro,'rOp')+
   `<h3 class="subh">Luas per Tanggal</h3>`+recapBars({tot:rt.tot,rows:tglRows},'rTgl')+
   `<h3 class="subh">Per blok (12 teratas, ${esc(tag)}) · “—” bila tanpa Batas Kebun</h3>`+
   (on?barsMini(rumpFilteredBlok(rows)):topBlok('rumpukan_batas','rp_pct','ha'));
 }else if(a.id==='sto'){
  const per=F.sto.per||{};
  html+=codeNote+`<h3>Jumlah per jenis STO</h3>`+barsMini(Object.entries(per).sort((x,y)=>y[1]-x[1]).map(([k,v])=>({l:k,v,t:n0(v)+' titik'})))+
   `<h3 class="subh">Per blok (12 teratas)</h3>`+topBlok('sto',null,'titik')+
   (F.sto.und?`<div class="hero-note" style="margin-top:8px">${n0(F.sto.und)} titik tanpa tanggal — ditandai “tanpa tanggal”, tidak masuk kurva kumulatif.</div>`:'');
 }else if(a.id==='planting'){
  const m=P.tanam.mentah||{},planU=P.tanam.rencana_referensi_unik,planM=P.tanam.rencana_referensi_mentah||m.rencana;
  const cls=[{l:'Planting',v:F['Planting'].real,t:n0(F['Planting'].real)+' unik',s:'mentah '+n0(m.Planting)+' baris'},
   {l:'Lubang Tanam',v:F['Lubang Tanam'].real,t:n0(F['Lubang Tanam'].real)+' unik',s:'mentah '+n0(m['Lubang Tanam']||F['Lubang Tanam'].baris)+' baris'},
   {l:'Stake Out Titik Tanam',v:F['Stake Out'].real,t:n0(F['Stake Out'].real)+' unik',s:'mentah '+n0(m['Stake Out']||F['Stake Out'].baris)+' baris'},
   {l:'Plan Titik Tanam',v:planU,t:n0(planU)+' unik',s:'referensi, bukan target · mentah '+n0(planM)+' baris'}];
  html+=codeNote+`<h3>Empat kelas (tahap tertinggi ke terendah)</h3>`+barsMini(cls)+
   `<h3 class="subh">Per blok — Planting (12 teratas)</h3>`+topBlok('pl',null,'titik')+
   `<h3 class="subh">Per blok — Lubang Tanam</h3>`+topBlok('lt',null,'titik')+
   `<h3 class="subh">Per blok — Stake Out Titik Tanam</h3>`+topBlok('so',null,'titik')+
   `<h3 class="subh">OFF Planting (info, tidak dinomori)</h3>`+topBlok('off',null,'titik')+
   `<div class="hero-note" style="margin-top:8px">Plan Titik Tanam ${n0(planU)} unik (mentah ${n0(planM)}) = referensi, bukan target; tidak ada % capaian vs Plan. OFF Planting tidak dinomori (keputusan Pak Dwi). STO surveyor adalah kartu terpisah.</div>`;
 }else if(a.id==='statuslahan'){
  const f=F.statuslahan,order=f.urutan||Object.keys(f.perStatus||{});
  const cats=order.map(k=>{const o=f.perStatus[k]||{};return{l:k,v:o.sum_ha||0,t:ha2(o.sum_ha||0)+' ha',s:`dalam ${ha4(o.dalam_ha||0)} / luar ${ha4(o.luar_ha||0)} · ${n0(o.n||0)} poligon`}});
  html+=`<div class="flt-sum">Σ Luas <b>${ha2(f.real)} ha</b> (${n0(f.n)} poligon). Dalam ${ha4(f.dalam)} + Luar ${ha4(f.luar)} = ${ha4(f.real)}. ${nf(f.pct,4)}% dari ${ha4(f.penyebut)} ha Batas Kebun. Bukan kegiatan berprogres — tanpa simbologi tanggal, tanpa pill minggu ini, tidak dijumlah dengan LC/Rumpukan.</div>
  <h3>Per kategori status</h3>`+barsMini(cats)+
   `<div class="hero-note" style="margin-top:8px">${esc(f.catatan||'492,34 ha = Σ Luas web; 491,97 ha = union Status Lahan (kebun_dnp), overlap dihitung sekali.')} Identitas popup: Nama_SKTH / N_Pemilik (tanpa No_Rekap).</div>`;
 }else if(a.id==='jalan'){
  const pt=(P.jalan.per_tipe||[]).map(x=>({l:x.tipe,v:x.real_ha||0,t:ha2(x.real_ha||0)+' ha'}));
  html+=codeNote+`<h3>Realisasi per tipe</h3>`+(pt.length?barsMini(pt):'<div class="empty">Tidak ada rincian tipe</div>')+
   `<h3 class="subh">Per blok (12 teratas)</h3>`+topBlok('jalan_real',null,'ha')+
   `<div class="hero-note" style="margin-top:8px">Capaian = realisasi vs rencana (belum dikonfirmasi). ${nf(F.jalan.pct,1)}% dari rencana ${ha2(F.jalan.plan)} ha (Main+Collection, luas poligon).</div>`;
 }else if(a.id==='drain'){
  const pt=(P.drain.per_tipe||[]).map(x=>({l:x.tipe,v:x.real_ha||0,t:ha2(x.real_ha||0)+' ha'}));
  html+=codeNote+`<h3>Realisasi per tipe</h3>`+(pt.length?barsMini(pt):'<div class="empty">Tidak ada rincian tipe</div>')+
   `<h3 class="subh">Per blok (12 teratas)</h3>`+topBlok('drain_real',null,'ha')+
   `<div class="hero-note" style="margin-top:8px">Capaian = realisasi vs rencana (belum dikonfirmasi). ${nf(F.drain.pct,1)}% dari rencana ${ha2(F.drain.plan)} ha. Data rencana punya dua OBJECTID ganda; tanpa duplikat angkanya sekitar 35,8%.</div>`;
 }else if(a.id==='lc'){html=''}
 if(a.id!=='lc'&&a.id!=='statuslahan'){html=genFilterUI(a)+fltSummary(a)+html}
 host.innerHTML=html;if(a.id!=='lc')bindGen(a)}
function renderDetail(){const wrap=$('actDetailWrap');if(!wrap)return;
 if(!K.sel||!K.F){wrap.hidden=true;return}
 const a=ACT[K.sel],d=K.cards[K.sel];if(!a||!d){wrap.hidden=true;return}
 wrap.hidden=false;wrap.className='sec sec-detail act-'+a.id;
 const title=$('actDetailTitle');if(title)title.textContent=a.name;
 const hero=$('actHero');const pct=pctTxt(d);
 if(hero){const showPct=(!d.hidePctOnTotal)&&pct;
  const pairs=d.subs?`<div class="info-pairs" title="${esc(d.tip||'')}">${d.subs.map(x=>`<div class="ip" data-rp="${esc(x.k||'')}"><b>${esc(x.v)}</b><span>${esc(x.lab)}</span>${x.s?`<span class="sp">${esc(x.s)}</span>`:''}</div>`).join('')}</div>`:'';
  const extra=d.heroExtra?`<p class="hero-s2 rp-kelas">${esc(d.heroExtra)}</p>`:(a.id==='rumpukan'?`<p class="hero-s2 rp-kelas">Per kelas (Σ Luas): Rumpukan ${ha2(K.F.rumpukan.kelas)} ha (dalam ${ha2(K.F.rumpukan.kelasDalam)} / luar ${ha2(K.F.rumpukan.kelasLuar)}) · Maintenance ${ha2(K.F.rumpukan.maint)} ha · Timbun ${ha2(K.F.rumpukan.timbun)} ha</p>`:'');
  const heroPill=(!d.noPill&&d.pill)?`<span class="pill" title="Minggu ini = Senin–Minggu minggu berjalan (zona Asia/Jakarta)">${d.pill} minggu ini</span>`:'';
  hero.innerHTML=`<div class="hero-v"><span class="v">${d.v}</span><small>${d.u}</small>${showPct?`<span class="pct" style="font-weight:800;color:var(--g8)">${pct}</span>`:''}${heroPill}</div>
  ${d.bar!=null&&d.barOnCard!==false?`<div class="kpi-prog"><div style="width:${Math.min(d.bar,100)}%"></div></div>`:''}
  <p class="hero-s">${esc(d.s3)}</p><p class="hero-s2">${esc(d.s4)}</p>
  ${pairs}${extra}
  ${d.subs||a.id==='lc'||a.id==='rumpukan'||a.id==='jalan'||a.id==='drain'?`<div class="hero-note">${esc(tgtLabel())}</div>`:''}
  <button type="button" class="open-dock" id="actOpenDock">Buka kurva &amp; tabel di panel bawah</button>`;}
 const od=$('actOpenDock');if(od)od.onclick=()=>{K.csel=csTab(K.sel);if(window.Layout){Layout.setFullMap(false);Layout.setDockOpen(true)}else document.body.classList.add('dock-open');A.showTab('kurva')};
 lyBox(a);genStats(a)}
function placeDetail(){const wrap=$('actDetailWrap');if(!wrap)return;
 const hint=$('actHint');if(hint)hint.hidden=!!K.sel;
 if(!K.sel){wrap.hidden=true;return}
 const card=document.querySelector('#actList .act[data-act="'+K.sel+'"]');
 if(card)card.after(wrap);
 renderDetail();
 try{card&&card.scrollIntoView({block:'nearest',behavior:'smooth'})}catch(e){}}
function openAct(id,toggle){
 if(toggle&&K.sel===id){closeAct();return}
 K.sel=id;K.csel=csTab(id);selCards();placeDetail();
 const a=ACT[id],force=a&&a.id==='rumpukan';
 ensureAndApply(a,!!force).then(()=>{if(K.sel===id&&a&&a.id!=='lc'){lyBox(a);genStats(a);syncEyes()}})}
function closeAct(){K.sel=null;selCards();placeDetail();restoreAllLayers();syncEyes()}
K.openAct=openAct;K.closeAct=closeAct;
// ---- toggle layer peta per kegiatan ----
const tanamFlt=p=>!K.excl.has(CATMAP[p.Name]||p.Name);
function eyeOn(a){if(a.cat)return Atlas.isShown('titik_tanam_realisasi')&&!K.excl.has(a.cat);const main=a.id==='jalan'?['jalan_realisasi','jalan_rencana']:a.layers;return main.every(l=>Atlas.st[l]&&Atlas.isShown(l))}
function syncEyes(){document.querySelectorAll('.act-eye').forEach(b=>{const a=ACT[b.dataset.eye],on=eyeOn(a);b.setAttribute('aria-pressed',on);b.classList.toggle('on',on)})}
function toggleEye(id){const a=ACT[id],on=!eyeOn(a);
 if(a.cat){if(on){K.excl.delete(a.cat);Atlas.setPointFilter('titik_tanam_realisasi',tanamFlt);Atlas.setVisible('titik_tanam_realisasi',true)}
  else{K.excl.add(a.cat);Atlas.setPointFilter('titik_tanam_realisasi',tanamFlt);}}
 else{const main=a.id==='jalan'?['jalan_realisasi','jalan_rencana']:a.layers;main.forEach(l=>Atlas.setVisible(l,on))}
 syncEyes()}
document.addEventListener('atlas:layer',()=>{syncEyes();document.querySelectorAll('[data-ly]').forEach(i=>{if(i.dataset.ly&&Atlas.st[i.dataset.ly])i.checked=Atlas.isShown(i.dataset.ly)})});
// ---- tab Ringkasan ----
function ringRows(){const F=K.F,P=K.P,pc=v=>v==null?'–':nf(v,1)+'%';
 const r=[];
 r.push({id:'lc',n:'Land Clearing (Σ Luas, semua poligon)',u:'ha',real:ha2(F.lc.real),w1:ha2(F.lc.w1),w0:ha2(F.lc.w0),und:F.lc.und.n?`${F.lc.und.n} poligon · ${ha2(F.lc.und.ha)} ha`:'–',tgt:`${ha2(F.lc.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.lc.pct),note:`Angka utama = Σ kolom Luas (dalam + luar kebun). Capaian ${nf(F.lc.pct,1)}% = Dalam Batas Kebun ${ha2(F.lc.dalam)} / ${ha2(F.lc.penyebut)} ha Batas Kebun. Luar ${ha2(F.lc.luar)} ha tidak masuk persen. Tanggal terakhir ${tg(F.lc.last)}.`});
 r.push({id:'lc',sub:1,n:'↳ Dalam Batas Kebun',u:'ha',real:ha2(F.lc.dalam),w1:'–',w0:'–',und:'–',tgt:`${ha2(F.lc.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.lc.pct),note:'Clip geometri (proporsi Σ Luas). Pembilang persen target.'});
 r.push({id:'lc',sub:1,n:'↳ Luar Batas Kebun',u:'ha',real:ha2(F.lc.luar),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Tidak masuk persen target. Dalam + luar = total.'});
 r.push({id:'rumpukan',n:'Rumpukan (semua kelas, Σ Luas)',u:'ha',real:ha2(F.rumpukan.real),w1:ha2(F.rumpukan.w1),w0:ha2(F.rumpukan.w0),und:F.rumpukan.und.n?`${F.rumpukan.und.n} poligon`:'–',tgt:`${ha2(F.rumpukan.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.rumpukan.pct),note:`Angka utama = Σ kolom Luas semua kelas (dalam + luar kebun). Capaian ${nf(F.rumpukan.pct,1)}% = Dalam Batas Kebun ${ha2(F.rumpukan.dalam)} ha ÷ ${ha2(F.rumpukan.penyebut)} ha Batas Kebun (bukan 170,21 ÷ target). Dalam ${ha2(F.rumpukan.dalam)} + luar ${ha2(F.rumpukan.luar)} = ${ha2(F.rumpukan.real)}.`});
 r.push({id:'rumpukan',sub:1,n:'↳ Dalam Batas Kebun',u:'ha',real:ha2(F.rumpukan.dalam),w1:'–',w0:'–',und:'–',tgt:`${ha2(F.rumpukan.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.rumpukan.pct),note:'Clip geometri (proporsi Σ Luas). Pembilang persen target.'});
 r.push({id:'rumpukan',sub:1,n:'↳ Luar Batas Kebun',u:'ha',real:ha2(F.rumpukan.luar),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Tidak masuk persen target. Dalam + luar = total.'});
 const pkPairs=[['Rumpukan (kelas)',F.rumpukan.kelas,F.rumpukan.kelasDalam,F.rumpukan.kelasLuar],['Maintenance Rumpukan',F.rumpukan.maint,F.rumpukan.maintDalam,0],['Timbun Rumpukan',F.rumpukan.timbun,F.rumpukan.timbunDalam,0]];
 pkPairs.forEach(([nm,tot,din,dout])=>{r.push({id:'rumpukan',sub:1,n:'↳ '+nm,u:'ha',real:ha2(tot),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:`Σ Luas. Dalam ${ha2(din)} ha`+(dout?` · luar ${ha2(dout)} ha`:' (semua dalam batas)')+'.'})});
 r.push({id:'sto',n:'STO – Stake Out Surveyor',u:'titik',real:n0(F.sto.real),w1:n0(F.sto.w1),w0:n0(F.sto.w0),und:`${n0(F.sto.und)} titik`,tgt:'tanpa target',cap:'–',note:'Jumlah titik: '+Object.entries(F.sto.per).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${k} ${n0(v)}`).join(', ')+'.'});
 (function(){const m=P.tanam.mentah||{},planU=P.tanam.rencana_referensi_unik,planM=P.tanam.rencana_referensi_mentah||m.rencana;
  const rows=[['planting','Planting','Planting',0],['planting','↳ Lubang Tanam','Lubang Tanam',1],['planting','↳ Stake Out Titik Tanam','Stake Out',1],['planting','↳ Plan Titik Tanam',null,1],['planting','↳ OFF Planting','OFF Planting',1]];
  rows.forEach(([id,nm,c,sub])=>{
   if(!c){r.push({id,sub,n:nm,u:'titik unik',real:n0(planU),w1:'–',w0:'–',und:'–',tgt:'referensi, bukan target',cap:'–',note:`Plan = referensi, bukan target; tidak ada % vs Plan. Mentah ${n0(planM)} baris → ${n0(planU)} unik.`});return}
   const o=F[c];r.push({id,sub,n:nm,u:'titik unik',real:n0(o.real),w1:n0(o.w1),w0:n0(o.w0),und:o.und?`${n0(o.und)} titik`:'–',tgt:'tanpa target',cap:'–',note:`Titik unik setelah dedup 3 m`+(m[c]!=null||o.baris!=null?` (mentah ${n0(m[c]||o.baris)} baris)`:'')+'.'+(c==='OFF Planting'?' Tidak dinomori (keputusan Pak Dwi).':'')})})})();
 r.push({id:'jalan',n:'Jalan (semua tipe, Σ Shape_Area)',u:'ha',real:ha2(F.jalan.real),w1:ha2(F.jalan.w1),w0:ha2(F.jalan.w0),und:'–',tgt:`${ha2(F.jalan.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.jalan.pct),note:`Angka utama = Σ Shape_Area/1e4 semua tipe (dalam + luar). Capaian ${nf(F.jalan.pct,1)}% = Dalam ${ha2(F.jalan.dalam)} / ${ha2(F.jalan.penyebut)} ha Batas Kebun. Luar ${ha2(F.jalan.luar)} ha. Vs rencana ${ha2(F.jalan.plan)} ha (Σ Shape_Area, ${n0(F.jalan.planN)} poligon): Main+Collection ${ha2(F.jalan.mc)} ha = ${nf(F.jalan.pctPlan,1)}%. Perimeter ${ha2(F.jalan.perimeter)} ha tanpa pasangan rencana. Maintenance ${ha2(F.jalan.maint)} ha layer terpisah.`});
 r.push({id:'jalan',sub:1,n:'↳ Dalam Batas Kebun',u:'ha',real:ha2(F.jalan.dalam),w1:'–',w0:'–',und:'–',tgt:`${ha2(F.jalan.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.jalan.pct),note:'Clip geometri (proporsi Σ atribut). Pembilang persen terhadap Batas Kebun.'});
 r.push({id:'jalan',sub:1,n:'↳ Luar Batas Kebun',u:'ha',real:ha2(F.jalan.luar),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Tidak masuk persen Batas Kebun. Dalam + luar = total.'});
 r.push({id:'jalan',sub:1,n:'↳ Rencana Jalan (Σ Shape_Area)',u:'ha',real:ha2(F.jalan.plan),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Penyebut pembanding Main+Collection. Tidak ada Perimeter Road rencana.'});
 r.push({id:'drain',n:'Drain (semua tipe, Σ Shape_Area)',u:'ha',real:ha2(F.drain.real),w1:ha2(F.drain.w1),w0:ha2(F.drain.w0),und:F.drain.und.n?`${F.drain.und.n} poligon · ${ha2(F.drain.und.ha)} ha`:'–',tgt:`${ha2(F.drain.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.drain.pct),note:`Angka utama = Σ Shape_Area/1e4 semua tipe termasuk Cuci parit & Gorong Gorong. Capaian ${nf(F.drain.pct,1)}% = Dalam ${ha2(F.drain.dalam)} / ${ha2(F.drain.penyebut)} ha Batas Kebun. Luar ${ha2(F.drain.luar)} ha. Rencana ${ha2(F.drain.plan)} ha (Σ Shape_Area, Rencana Perimeter Drain berisi 2 poligon identik (OBJECTID 2 & 336); dihitung sekali; mentah ${ha2(F.drain.planRaw)} ha). Semua tipe ${nf(F.drain.pctPlanAll,1)}% dari rencana; tipe berencana ${ha2(F.drain.planned)} ha = ${nf(F.drain.pctPlan,1)}%. Volume galian ${n0(F.drain.vol)} m³.`});
 r.push({id:'drain',sub:1,n:'↳ Dalam Batas Kebun',u:'ha',real:ha2(F.drain.dalam),w1:'–',w0:'–',und:'–',tgt:`${ha2(F.drain.penyebut)} ha (Batas Kebun DNP)`,cap:pc(F.drain.pct),note:'Clip geometri (proporsi Σ atribut). Pembilang persen terhadap Batas Kebun.'});
 r.push({id:'drain',sub:1,n:'↳ Luar Batas Kebun',u:'ha',real:ha2(F.drain.luar),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Tidak masuk persen Batas Kebun. Dalam + luar = total.'});
 r.push({id:'drain',sub:1,n:'↳ Rencana Drain (Σ Shape_Area, dedup)',u:'ha',real:ha2(F.drain.plan),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:`2 poligon Rencana Perimeter Drain (OBJECTID 2 & 336) identik, dihitung sekali. Mentah ${ha2(F.drain.planRaw)} ha.`});
 if(F.statuslahan){const sl=F.statuslahan,order=sl.urutan||Object.keys(sl.perStatus||{});
  r.push({id:'statuslahan',n:'Status Lahan (Σ Luas, semua poligon)',u:'ha',real:ha2(sl.real),w1:'–',w0:'–',und:'–',tgt:`${ha4(sl.penyebut)} ha (Batas Kebun DNP)`,cap:ha4(sl.pct)+'%',note:`Bukan kegiatan berprogres; tidak dijumlah dengan LC/Rumpukan. ${sl.catatan||''}`});
  r.push({id:'statuslahan',sub:1,n:'↳ Dalam Batas Kebun',u:'ha',real:ha4(sl.dalam),w1:'–',w0:'–',und:'–',tgt:`${ha4(sl.penyebut)} ha`,cap:ha4(sl.pct)+'%',note:'Clip geometri (proporsi Σ Luas). Pembilang persen.'});
  r.push({id:'statuslahan',sub:1,n:'↳ Luar Batas Kebun',u:'ha',real:ha4(sl.luar),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:'Tidak masuk persen. Dalam + luar = total.'});
  order.forEach(k=>{const o=sl.perStatus[k]||{};r.push({id:'statuslahan',sub:1,n:'↳ '+k,u:'ha',real:ha2(o.sum_ha||0),w1:'–',w0:'–',und:'–',tgt:'–',cap:'–',note:`${n0(o.n||0)} poligon · dalam ${ha4(o.dalam_ha||0)} / luar ${ha4(o.luar_ha||0)}`})})}
 return r}
function renderRing(){const pane=$('p-ring');if(!K.P){pane.innerHTML='<div class="empty" style="padding:16px">Memuat ringkasan kegiatan…</div>';return}
 const P=K.P,rows=ringRows();
 pane.innerHTML=`<div class="two-col wide-left"><div class="card"><div class="card-h"><h4>Ringkasan semua kegiatan <small>(klik baris = kurva kumulatif)</small></h4><div class="card-tools"><button class="btn-mini" id="csvRing">⭳ CSV</button></div></div><div class="tscroll"><table class="dt" id="ringT"><thead><tr><th>Kegiatan</th><th>Satuan</th><th class="n">Realisasi</th><th class="n" title="Senin–Minggu minggu berjalan, zona Asia/Jakarta">Minggu ini</th><th class="n" title="Bertanggal sebelum Senin minggu berjalan">Sebelum minggu ini</th><th>Tanpa tanggal</th><th>Target / rencana</th><th class="n">Capaian</th><th>Catatan</th></tr></thead><tbody>${rows.map(r=>`<tr data-act="${r.id}" class="${r.sub?'sub':''}${K.sel===r.id?' sel':''}" tabindex="0"><td><b>${esc(r.n)}</b></td><td>${r.u}</td><td class="n">${r.real}</td><td class="n">${r.w1}</td><td class="n">${r.w0}</td><td>${esc(r.und)}</td><td>${esc(r.tgt)}</td><td class="n">${r.cap}</td><td class="nt">${esc(r.note)}</td></tr>`).join('')}</tbody></table></div></div>
 <div class="card side-card"><div class="card-h"><h4>Definisi &amp; catatan data</h4></div><div class="pbody notes">
  <p><b>Minggu ini</b> = Senin–Minggu minggu berjalan (zona Asia/Jakarta), dihitung dari kolom Tanggal — bukan field Code. <b>Sebelum minggu ini</b> = rekaman bertanggal sebelum Senin minggu ini. Tanggal data terbaru: <b>${tg(P.meta.tanggal_data)}</b>.</p>
  <p><b>${esc(tgtLabel())}.</b> Persen LC = luas union (tanpa hitung ganda) yang berada <i>di dalam</i> Batas Kebun ÷ luas Batas Kebun, dihitung di UTM 48S; luas LC di luar Batas Kebun hanya info. Rumpukan: angka utama = Σ kolom Luas semua kelas (Rumpukan, Maintenance, Timbun), termasuk di luar Batas Kebun; persen = luas di dalam Batas Kebun (proporsi clip geometri, bukan union) ÷ luas Batas Kebun (288,66 ha) — bukan dari angka total yang mencakup luar kebun. Dalam + luar = total.</p>
  <p>Jalan &amp; Drain dibandingkan dengan rencananya sendiri (luas poligon, bukan panjang; tipe yang punya rencana). STO = Stake Out oleh surveyor (tanpa target, jumlah titik saja).</p>
  <p>Titik tanam: satu kartu Planting dengan 4 kelas (Planting, Lubang Tanam, Stake Out Titik Tanam, Plan Titik Tanam). Angka = titik unik (dedup 3 m); Plan = referensi, bukan target; tidak ada % vs Plan. STO surveyor tetap kartu terpisah. Status Lahan = Σ Luas (bukan kegiatan berprogres, tidak dijumlah dengan LC/Rumpukan).</p>
  <p>Label kelas legenda mengikuti ArcGIS (style_spec) dan sebagian tidak sama dengan tanggal data. Data tanpa tanggal tidak masuk kurva kumulatif.</p></div></div></div>`;
 pane.querySelectorAll('tr[data-act]').forEach(tr=>{const go=()=>{openAct(tr.dataset.act,false);A.showTab('kurva')};tr.onclick=go;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
 $('csvRing').onclick=()=>A.u.csv([['Kegiatan','Satuan','Realisasi','Minggu_ini_Code1','Hingga_7Nov_Code0','Tanpa_tanggal','Target_rencana','Capaian','Catatan']].concat(rows.map(r=>[r.n,r.u,r.real,r.w1,r.w0,r.und,r.tgt,r.cap,r.note])),`ringkasan_kegiatan_${A.u.stamp()}.csv`)}
// ---- kurva ----
const csTab=id=>id==='planting'?'tanam':id;
function selCards(){document.querySelectorAll('.act,.strip-item').forEach(c=>c.classList.toggle('sel',c.dataset.act===K.sel));document.querySelectorAll('#actList .act').forEach(c=>c.setAttribute('aria-expanded',String(c.dataset.act===K.sel)))}
function seriesFor(id){const P=K.P,pt=(arr,key)=>arr.map(x=>[x.t,x[key]]);let S=[],target=null,rows=[],note='',unit='ha',und=null;
 switch(id){
 case'lc':{const At=P.lc.atribut;S=[{n:'LC kumulatif (Σ Luas)',c:'#c9a800',p:pt(At.timeline,'cum')}];target={v:At.penyebut_ha,l:'Batas Kebun DNP '+ha2(At.penyebut_ha)+' ha (penyebut %)'};rows=At.timeline.map(x=>[x.t,x.add,x.cum]);und={n:At.tanpa_tanggal_n,ha:At.tanpa_tanggal_ha};note='Kumulatif Σ kolom Luas per tanggal (semua poligon, termasuk di luar batas). Tanpa tanggal dicatat terpisah, tidak masuk kurva. Persen resmi = dalam / 288,66 ha, bukan total/target.';break}
 case'rumpukan':{const ci=P.rumpukan.kelas_info,At=P.rumpukan.atribut,tl=At.timeline||P.rumpukan.timeline;S=[{n:'Rumpukan semua kelas (Σ Luas) kumulatif',c:'#ff8c00',p:pt(tl,'cum')},{n:'Maintenance (info)',c:'#a87000',dash:1,p:pt(ci.maintenance.timeline,'cum')},{n:'Timbun (info)',c:'#2fa100',dash:1,p:pt(ci.timbun.timeline,'cum')}];target={v:At.penyebut_ha,l:'Batas Kebun DNP '+ha2(At.penyebut_ha)+' ha (penyebut %)'};rows=tl.map(x=>[x.t,x.add,x.cum]);und=P.rumpukan.tanpa_tanggal;note='Kurva resmi = Σ Luas semua kelas per tanggal (satu basis dengan kartu). Maintenance dan Timbun = garis putus-putus (info per kelas).';break}
 case'sto':S=[{n:'STO kumulatif (titik)',c:'#0070ff',p:pt(P.sto.timeline,'cum')}];unit='titik';rows=P.sto.timeline.map((x,i)=>[x.t,x.n,x.cum]);und={n:P.sto.tanpa_tanggal.n,ha:null};note='STO = Stake Out surveyor. Tanpa target.';break;
 case'tanam':{const T=P.tanam.timeline;S=[['Planting','#2fb300'],['Stake Out','#005ce6'],['OFF Planting','#e60000']].map(([c,col])=>({n:c+' kumulatif',c:col,p:T.filter(x=>x['cum_'+c]!=null).map(x=>[x.t,x['cum_'+c]])}));unit='titik unik';
  rows=T.map(x=>[x.t,(x.Planting||0)+(x['Stake Out']||0)+(x['OFF Planting']||0),x['cum_Planting']||0,x['cum_Stake Out']||0]);und={n:P.tanam.cats['Lubang Tanam'].tanpa_tanggal,ha:null,lbl:'Lubang Tanam'};note='Hanya realisasi (titik unik per Kode_Pokok); plan titik tanam bukan target.';break}
 case'statuslahan':{S=[];unit='ha';note='Status Lahan bukan kegiatan berprogres bertanggal; tidak ada kurva kumulatif.';break}
 case'jalan':{const At=P.jalan.atribut,Ra=P.jalan.rencana.atribut;S=[{n:'Jalan realisasi kumulatif (Σ Shape_Area, semua tipe)',c:'#3b8fd6',p:pt(At.timeline,'cum')}];target={v:Ra.sum_ha,l:'Rencana Jalan (Σ Shape_Area) '+ha2(Ra.sum_ha)+' ha'};rows=At.timeline.map(x=>[x.t,x.add,x.cum]);und={n:At.tanpa_tanggal_n,ha:At.tanpa_tanggal_ha};note='Kumulatif Σ Shape_Area semua tipe (termasuk Perimeter Road). Target kurva = rencana Σ Shape_Area '+ha2(Ra.sum_ha)+' ha (Main+Collection saja; penyebut tertulis). Kolom Luas tidak dipakai.';break}
 case'drain':{const At=P.drain.atribut,Ra=P.drain.rencana.atribut;S=[{n:'Drain realisasi kumulatif (Σ Shape_Area, semua tipe)',c:'#e0301e',p:pt(At.timeline,'cum')}];target={v:Ra.sum_ha,l:'Rencana Drain (Σ Shape_Area, dedup) '+ha2(Ra.sum_ha)+' ha'};rows=At.timeline.map(x=>[x.t,x.add,x.cum]);und={n:At.tanpa_tanggal_n,ha:At.tanpa_tanggal_ha};note='Kumulatif Σ Shape_Area semua tipe (termasuk Cuci parit & Gorong Gorong). Target kurva = rencana '+ha2(Ra.sum_ha)+' ha setelah 2 poligon Perimeter Drain identik (OBJECTID 2 & 336) dihitung sekali (mentah '+ha2(Ra.sum_mentah_ha)+' ha). Tanpa tanggal dicatat terpisah.';break}}
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
 Vault.getJSON('data/progres.json?v=202611210300').then(P=>{K.P=P;K.F=figures(P);
  renderCards();A.renderTab();
  const d=P.meta.tanggal_data,[y,m]=d.split('-');const per=$('periode'),up=$('lastUpd');
  if(per)per.textContent=`Periode: ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][m-1]} ${y}`;if(up)up.textContent=tg(d).replace(/ (\w+) /,(a,b)=>' '+['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][BLN.indexOf(b)]+' ');
  if(window.DateRange&&!K._drBound){K._drBound=true;DateRange.onChange(()=>{K.refreshWeek();const a=ACT[K.sel];if(a)ensureAndApply(a,false).then(()=>genStats(a));if(window.UiState)UiState.save()})}
  K.ready=true;
  if(window.UiState){UiState.restoreKegiatan();UiState.hook()}
  document.dispatchEvent(new CustomEvent('kegiatan:ready'))}).catch(e=>{console.warn('progres gagal',e);($('actList')||$('kpis')).innerHTML='<div class="note" style="padding:12px">Ringkasan kegiatan gagal dimuat. Muat ulang halaman.</div>'})}
document.addEventListener('click',e=>{const z=e.target.closest('.act-zbtn');if(z){e.stopPropagation();if(window.Atlas&&Atlas.zoomToAct)Atlas.zoomToAct(z.dataset.zoom);return}const eye=e.target.closest('.act-eye');if(eye){e.stopPropagation();toggleEye(eye.dataset.eye);return}
 if(e.target.closest('.info')&&e.target.closest('.strip-item')){e.stopPropagation();return}
 const c=e.target.closest('.act, .strip-item');if(c&&c.dataset.act&&(c.closest('#actList')||c.closest('#strip'))){openAct(c.dataset.act,!!c.closest('#actList'))}});
document.addEventListener('keydown',e=>{const c=e.target.closest&&e.target.closest('.act, .strip-item');if(c&&c.dataset.act&&(e.key==='Enter'||e.key===' ')&&e.target===c){e.preventDefault();openAct(c.dataset.act,!!c.closest('#actList'))}});
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
if($('actBack'))$('actBack').onclick=closeAct;
boot();
})();
