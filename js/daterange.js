/* Pemilih rentang tanggal v7r3 — tanpa dependensi, sentuhan ramah HP.
   Minggu = Senin–Minggu, zona Asia/Jakarta (WIB). Tahun sah 2024–2030.
   "Semua" / tanpa rentang = SymbologiTanggal.clearRange() (noRange hatch-all).
   Tidak memakai field Code. Tidak menulis dnp_v5_layout / dnp_v6_legend / dnp_v7_basemap. */
(function(root){
'use strict';
const TZ='Asia/Jakarta';
const MIN_YEAR=2024, MAX_YEAR=2030;
const BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BLN_FULL=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const PRESETS=[
  {id:'minggu_ini',label:'Minggu ini'},
  {id:'minggu_lalu',label:'Minggu lalu'},
  {id:'2_minggu',label:'2 minggu terakhir'},
  {id:'bulan_ini',label:'Bulan ini'},
  {id:'bulan_lalu',label:'Bulan lalu'},
  {id:'semua',label:'Semua'}
];
const hosts=[];
const listeners=[];
const state={from:'',to:'',preset:'semua',pick:null,viewY:null,viewM:null,open:false};
let nowOverride=null;

function now(){return nowOverride!=null?+nowOverride:Date.now()}
function setNow(ms){nowOverride=ms==null?null:+ms;return todayYMD()}
function pad(n){return (n<10?'0':'')+n}
function ymd(y,m,d){return y+'-'+pad(m)+'-'+pad(d)}
function todayYMD(t){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t==null?now():t));
  const g=k=>+parts.find(p=>p.type===k).value;
  return ymd(g('year'),g('month'),g('day'));
}
function split(s){if(!s)return null;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;return{y:+m[1],m:+m[2],d:+m[3]}}
function validYMD(s){
  const p=split(s);if(!p)return false;
  if(p.y<MIN_YEAR||p.y>MAX_YEAR)return false;
  if(p.m<1||p.m>12||p.d<1||p.d>31)return false;
  const last=daysInMonth(p.y,p.m);
  return p.d<=last;
}
function daysInMonth(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate()}
function weekdayMon0(s){
  const p=split(s);if(!p)return null;
  const dt=new Date(Date.UTC(p.y,p.m-1,p.d,12,0,0));
  return (dt.getUTCDay()+6)%7; // Mon=0 … Sun=6
}
function addDays(s,n){
  const p=split(s);if(!p)return '';
  const dt=new Date(Date.UTC(p.y,p.m-1,p.d+n,12,0,0));
  return ymd(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());
}
function weekBounds(t){
  const today=todayYMD(t);
  const mon=addDays(today,-weekdayMon0(today));
  return {from:mon,to:addDays(mon,6)};
}
function monthBoundsFrom(s){
  const p=split(s);if(!p)return null;
  return {from:ymd(p.y,p.m,1),to:ymd(p.y,p.m,daysInMonth(p.y,p.m))};
}
function lastMonthBounds(s){
  const p=split(s);if(!p)return null;
  const m=p.m===1?12:p.m-1,y=p.m===1?p.y-1:p.y;
  return monthBoundsFrom(ymd(y,m,1));
}
function presetRange(id,t){
  const today=todayYMD(t);
  if(id==='minggu_ini')return weekBounds(t);
  if(id==='minggu_lalu'){const w=weekBounds(t);return {from:addDays(w.from,-7),to:addDays(w.to,-7)}}
  if(id==='2_minggu'){const w=weekBounds(t);return {from:addDays(w.from,-7),to:w.to}}
  if(id==='bulan_ini')return monthBoundsFrom(today);
  if(id==='bulan_lalu')return lastMonthBounds(today);
  if(id==='semua')return {from:'',to:''};
  return null;
}
function fmtRange(from,to){
  if(!from&&!to)return 'Semua';
  const a=split(from),b=split(to||from);
  if(!a||!b)return '';
  if(a.y===b.y&&a.m===b.m)return a.d+'\u2013'+b.d+' '+BLN[a.m-1]+' '+a.y;
  if(a.y===b.y)return a.d+' '+BLN[a.m-1]+'\u2013'+b.d+' '+BLN[b.m-1]+' '+a.y;
  return a.d+' '+BLN[a.m-1]+' '+a.y+'\u2013'+b.d+' '+BLN[b.m-1]+' '+b.y;
}
function normalizeRange(from,to,opts){
  opts=opts||{};
  from=from?String(from).trim():'';
  to=to?String(to).trim():'';
  if(!from&&!to)return {ok:true,from:'',to:'',preset:'semua'};
  if(from&&!validYMD(from))return {ok:false,error:'tahun/tanggal tidak sah',from:from,to:to};
  if(to&&!validYMD(to))return {ok:false,error:'tahun/tanggal tidak sah',from:from,to:to};
  if(from&&!to){
    const today=todayYMD();
    to=validYMD(today)?today:from;
    if(to<from)to=from;
  }
  if(!from&&to)from=to;
  if(from>to){const x=from;from=to;to=x}
  return {ok:true,from:from,to:to,preset:opts.preset||'kustom'};
}
function getRange(){return {from:state.from,to:state.to,preset:state.preset}}
function emit(){listeners.slice().forEach(fn=>{try{fn(getRange())}catch(e){if(typeof console!=='undefined')console.error('DateRange',e)}});applySym();paintAll()}
function applySym(){
  const SD=root.SymbologiTanggal;
  if(!SD)return;
  if(!state.from&&!state.to)SD.clearRange();
  else SD.setRange({from:state.from,to:state.to});
}
function setRange(r,opts){
  opts=opts||{};
  const n=normalizeRange(r&&r.from,r&&r.to,{preset:opts.preset||(r&&r.preset)||'kustom'});
  if(!n.ok)return n;
  const same=state.from===n.from&&state.to===n.to;
  state.from=n.from;state.to=n.to;state.preset=n.from?n.preset:'semua';state.pick=null;
  if(n.from){const p=split(n.from);state.viewY=p.y;state.viewM=p.m}
  if(!same||opts.force)emit();
  else paintAll();
  return n;
}
function clearRange(){return setRange({from:'',to:''},{preset:'semua',force:true})}
function applyPreset(id){
  const r=presetRange(id);
  if(!r)return {ok:false,error:'preset tidak dikenal'};
  state.pick=null;state.open=false;
  return setRange(r,{preset:id,force:true});
}
function onChange(fn){if(typeof fn==='function')listeners.push(fn);return ()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}}

function mk(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function monthTitle(y,m){return BLN_FULL[m-1]+' '+y}

function renderGrid(box){
  const grid=box.querySelector('.dr-grid');
  const lab=box.querySelector('.dr-month');
  let y=state.viewY,m=state.viewM;
  if(!y||!m){const t=split(todayYMD());y=t.y;m=t.m;state.viewY=y;state.viewM=m}
  if(y<MIN_YEAR){y=MIN_YEAR;m=1}if(y>MAX_YEAR){y=MAX_YEAR;m=12}
  state.viewY=y;state.viewM=m;
  lab.textContent=monthTitle(y,m);
  const prev=box.querySelector('.dr-prev'),next=box.querySelector('.dr-next');
  prev.disabled=(y===MIN_YEAR&&m===1);next.disabled=(y===MAX_YEAR&&m===12);
  const first=ymd(y,m,1),lead=weekdayMon0(first),n=daysInMonth(y,m);
  const from=state.pick||state.from,to=state.pick?state.pick:state.to;
  const today=todayYMD();
  grid.textContent='';
  for(let i=0;i<lead;i++)grid.appendChild(mk('span','dr-empty'));
  for(let d=1;d<=n;d++){
    const s=ymd(y,m,d);
    const b=mk('button','dr-day',String(d));
    b.type='button';b.setAttribute('data-ymd',s);b.setAttribute('aria-label',s);
    if(s===today)b.classList.add('is-today');
    if(from&&s===from)b.classList.add('is-start');
    if(to&&s===to)b.classList.add('is-end');
    if(from&&to&&s>from&&s<to)b.classList.add('is-in');
    if(state.pick&&s===state.pick)b.classList.add('is-pick');
    grid.appendChild(b);
  }
}
function updateLabels(box){
  const lab=box.querySelector('.dr-label');
  if(lab)lab.textContent=fmtRange(state.from,state.to);
  const btn=box.querySelector('.dr-btn');
  if(btn)btn.setAttribute('aria-expanded',state.open?'true':'false');
  box.querySelectorAll('[data-preset]').forEach(b=>{
    b.classList.toggle('is-on',b.getAttribute('data-preset')===(state.from?state.preset:'semua'));
  });
  const sum=box.querySelector('.sd-sum, #sdSum, .dr-sum');
  if(sum){
    sum.textContent=state.from||state.to
      ?('Rentang: '+fmtRange(state.from,state.to)+' \u2014 di luar rentang diarsir')
      :'Tanpa rentang: semua fitur arsir (gaya Code 0)';
  }
  const pop=box.querySelector('.dr-pop');
  if(pop){pop.hidden=!state.open;box.classList.toggle('is-open',state.open)}
  if(state.open)renderGrid(box);
}
function paintAll(){hosts.forEach(h=>{if(h.isConnected)updateLabels(h)})}

function shiftMonth(box,dir){
  let y=state.viewY,m=state.viewM+dir;
  if(m<1){m=12;y--}if(m>12){m=1;y++}
  if(y<MIN_YEAR||y>MAX_YEAR)return;
  state.viewY=y;state.viewM=m;renderGrid(box);
}
function onDay(s){
  if(!validYMD(s))return {ok:false,error:'tahun/tanggal tidak sah'};
  if(!state.pick){
    state.pick=s;state.preset='kustom';paintAll();
    return {ok:true,picking:true,from:s,to:''};
  }
  const a=state.pick,b=s;
  state.pick=null;state.open=false;
  return setRange({from:a,to:b},{preset:'kustom',force:true});
}
function placePop(box){
  const pop=box.querySelector('.dr-pop');if(!pop||pop.hidden)return;
  pop.style.left='0';pop.style.right='auto';pop.style.top='';
  const r=pop.getBoundingClientRect();
  const vw=window.innerWidth,vh=window.innerHeight;
  if(r.right>vw-6){pop.style.left='auto';pop.style.right='0'}
  if(r.left<6){pop.style.left='0';pop.style.right='auto'}
  if(r.bottom>vh-6){
    const btn=box.querySelector('.dr-btn');
    if(btn){
      const br=btn.getBoundingClientRect();
      const up=br.top-(r.height+8);
      if(up>6)pop.style.top='auto',pop.style.bottom=(box.getBoundingClientRect().height-br.height+box.getBoundingClientRect().bottom-br.bottom+8)+'px';
    }
  }
  const r2=pop.getBoundingClientRect();
  if(r2.right>vw){pop.style.maxWidth=Math.max(240,vw-12)+'px'}
}

function mount(host,opts){
  if(!host||typeof document==='undefined')return null;
  opts=opts||{};
  host.textContent='';
  host.classList.add('dr-host');
  if(opts.variant)host.classList.add('dr-host-'+opts.variant);
  const box=mk('div','dr');
  box.setAttribute('data-dr','1');
  if(opts.variant==='legend'){
    box.appendChild(mk('div','sd-title','Simbologi tanggal'));
  }
  const presets=mk('div','dr-presets');
  presets.setAttribute('role','group');
  presets.setAttribute('aria-label','Preset rentang tanggal');
  PRESETS.forEach(p=>{
    const b=mk('button','dr-pre',p.label);
    b.type='button';b.setAttribute('data-preset',p.id);
    presets.appendChild(b);
  });
  box.appendChild(presets);
  const btn=mk('button','dr-btn');btn.type='button';
  btn.setAttribute('aria-haspopup','dialog');
  btn.setAttribute('aria-expanded','false');
  btn.appendChild(mk('span','dr-label',fmtRange(state.from,state.to)));
  box.appendChild(btn);
  const pop=mk('div','dr-pop');pop.hidden=true;pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Pilih rentang tanggal');
  const nav=mk('div','dr-nav');
  const prev=mk('button','dr-prev','\u2039');prev.type='button';prev.setAttribute('aria-label','Bulan sebelumnya');
  const next=mk('button','dr-next','\u203A');next.type='button';next.setAttribute('aria-label','Bulan berikutnya');
  const month=mk('div','dr-month');
  nav.appendChild(prev);nav.appendChild(month);nav.appendChild(next);
  pop.appendChild(nav);
  const dow=mk('div','dr-dow');
  ['Sen','Sel','Rab','Kam','Jum','Sab','Min'].forEach(x=>dow.appendChild(mk('span',null,x)));
  pop.appendChild(dow);
  pop.appendChild(mk('div','dr-grid'));
  pop.appendChild(mk('div','dr-foot','Klik tanggal awal, lalu tanggal akhir'));
  box.appendChild(pop);
  const sum=mk('div',opts.variant==='legend'?'sd-sum':'dr-sum');
  if(opts.variant==='legend'||opts.sumId==='sdSum')sum.id='sdSum';
  sum.setAttribute('aria-live','polite');
  box.appendChild(sum);
  host.appendChild(box);
  if(!hosts.includes(host))hosts.push(host);

  presets.addEventListener('click',e=>{
    const b=e.target.closest('[data-preset]');if(!b)return;
    applyPreset(b.getAttribute('data-preset'));
  });
  btn.addEventListener('click',e=>{
    e.preventDefault();
    state.open=!state.open;
    if(state.open){if(!state.viewY){const t=split(state.from||todayYMD());state.viewY=t.y;state.viewM=t.m}}
    paintAll();
    if(state.open)placePop(box);
  });
  prev.addEventListener('click',()=>shiftMonth(box,-1));
  next.addEventListener('click',()=>shiftMonth(box,1));
  box.querySelector('.dr-grid').addEventListener('click',e=>{
    const b=e.target.closest('[data-ymd]');if(!b)return;
    onDay(b.getAttribute('data-ymd'));
  });
  updateLabels(box);
  return {el:box,destroy(){const i=hosts.indexOf(host);if(i>=0)hosts.splice(i,1);host.textContent=''}};
}

function close(){if(!state.open)return;state.open=false;paintAll()}
if(typeof document!=='undefined'){
  document.addEventListener('pointerdown',e=>{
    if(!state.open)return;
    if(e.target.closest&&e.target.closest('.dr'))return;
    close();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}

const api={
  TZ,MIN_YEAR,MAX_YEAR,PRESETS,
  now,setNow,todayYMD,addDays,weekdayMon0,daysInMonth,validYMD,validateYMD:validYMD,
  weekBounds,monthBoundsFrom,lastMonthBounds,presetRange,fmtRange,normalizeRange,
  getRange,setRange,clearRange,applyPreset,onChange,mount,close,openCalendar(){
    state.open=true;if(!state.viewY){const t=split(state.from||todayYMD());state.viewY=t.y;state.viewM=t.m}
    paintAll();
  },
  applySym,onDay,shiftMonth,
  get state(){return {from:state.from,to:state.to,preset:state.preset,pick:state.pick,open:state.open,viewY:state.viewY,viewM:state.viewM}}
};
root.DateRange=api;
})(typeof window!=='undefined'?window:this);
