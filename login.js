// Login sisi-klien + dekripsi data (WebCrypto). Tidak ada data yang diambil/didekripsi/ditampilkan sebelum login berhasil.
// Skema (identik dengan tools/dnpcrypto.py):
//   KEK = PBKDF2-SHA256(password NFKC, salt per-user, iter) ; DEK(256 bit) di-wrap AES-GCM(KEK, iv, AAD="dnp-webgis|v1|wrap|<user>")
//   File data/<nama>.enc = "DNPE\x01" + iv(12) + AES-GCM(DEK, iv, AAD="dnp-webgis|v1|file|<nama>")
// Verifikasi password = keberhasilan unwrap (tag GCM). DEK hanya ada di memori sebagai CryptoKey non-extractable;
// DEK/password/token tidak pernah disimpan di sessionStorage/localStorage (reload = login ulang).
// State tampilan & filter (bukan kredensial) disimpan di localStorage dnp_v7_state_<user> dan tetap ada setelah logout.
// Penghitung throttling gagal-login disimpan di sessionStorage (dnp_f).
(function(){
'use strict';
const VER='202611210600',ITER_DUMMY=600000,THROTTLE_KEY='dnp_f';
const MSG_BAD='User atau password salah';
const te=new TextEncoder();
const $=id=>document.getElementById(id);
const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const normUser=u=>String(u).normalize('NFKC').trim().toLowerCase();
class AuthError extends Error{}
let DEK=null,USER=null;

async function deriveKEK(pw,salt,iter){
 const base=await crypto.subtle.importKey('raw',te.encode(String(pw).normalize('NFKC')),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},base,{name:'AES-GCM',length:256},false,['unwrapKey']);
}
async function login(user,pw){
 if(!window.isSecureContext||!window.crypto||!crypto.subtle)throw new Error('Peramban ini tidak mendukung enkripsi (WebCrypto). Buka situs lewat HTTPS dengan peramban modern.');
 const u=normUser(user);let users;
 try{const r=await fetch('users.json?v='+VER,{cache:'no-store'});if(!r.ok)throw 0;users=await r.json();if(!Array.isArray(users))throw 0}
 catch(e){throw new Error('Gagal memuat daftar pengguna. Periksa koneksi lalu coba lagi.')}
 const e=users.find(x=>x&&x.user===u);
 if(!e){await deriveKEK(pw,crypto.getRandomValues(new Uint8Array(16)),ITER_DUMMY);throw new AuthError(MSG_BAD)}   // waktu mirip user yang ada
 try{
  const kek=await deriveKEK(pw,b64d(e.salt),+e.iter);
  DEK=await crypto.subtle.unwrapKey('raw',b64d(e.wrappedDEK),kek,{name:'AES-GCM',iv:b64d(e.iv),additionalData:te.encode('dnp-webgis|v1|wrap|'+u)},{name:'AES-GCM'},false,['decrypt']);
  USER=u;
 }catch(err){DEK=null;throw new AuthError(MSG_BAD)}
}

// ---------- Ambil + dekripsi + parse ----------
function banner(msg){
 let b=$('vaultErr');if(!b){b=document.createElement('div');b.id='vaultErr';b.setAttribute('role','alert');b.innerHTML='<span></span><button type="button" id="vaultErrOut">Keluar</button>';document.body.appendChild(b);$('vaultErrOut').onclick=logout}
 b.firstChild.textContent=msg;b.hidden=false}
async function getJSON(path){
 const name=String(path).split('?')[0].split('/').pop();
 if(!DEK)throw new Error('Belum login');
 try{
  const r=await fetch('data/'+name+'.enc?v='+VER,{cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status);
  const buf=new Uint8Array(await r.arrayBuffer());
  if(buf.length<33||buf[0]!==68||buf[1]!==78||buf[2]!==80||buf[3]!==69||(buf[4]!==1&&buf[4]!==2))throw new Error('format');
  const gz=buf[4]===2;   // v2 = gzip dulu, baru enkripsi (AAD diberi akhiran |gz sehingga versi ikut terautentikasi)
  let plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(5,17),additionalData:te.encode('dnp-webgis|v1|file|'+name+(gz?'|gz':''))},DEK,buf.slice(17));
  if(gz){
   if(typeof DecompressionStream==='undefined')throw new Error('nodecomp');
   try{plain=await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()}catch(e){throw new Error('format')}
  }
  return JSON.parse(new TextDecoder().decode(plain));
 }catch(err){
  if(err&&err.message==='nodecomp'){const m='Peramban Anda terlalu lama untuk membuka data ini (butuh DecompressionStream). Perbarui peramban lalu muat ulang.';banner(m);throw new Error(m)}
  const bad=err&&(err.name==='OperationError'||err.message==='format'||err instanceof SyntaxError);
  const m=bad?`Berkas data "${name}" gagal diverifikasi (rusak atau telah diubah). Muat ulang halaman; bila masih terjadi hubungi admin.`:`Berkas data "${name}" gagal dimuat. Periksa koneksi lalu muat ulang halaman.`;
  banner(m);throw new Error(m);
 }
}
function logout(){
 try{if(window.UiState&&UiState.saveNow)UiState.saveNow()}catch(e){}
 DEK=null;USER=null;
 try{Object.keys(sessionStorage).forEach(k=>{if(k!==THROTTLE_KEY)sessionStorage.removeItem(k)})}catch(e){}
 location.reload();
}
window.Vault={getJSON,logout,get user(){return USER},get loggedIn(){return !!DEK}};

// ---------- Throttling gagal-login (sisi klien; hanya memperlambat percobaan manual) ----------
const getF=()=>{try{return JSON.parse(sessionStorage.getItem(THROTTLE_KEY))||{n:0,until:0}}catch(e){return{n:0,until:0}}};
const setF=f=>{try{sessionStorage.setItem(THROTTLE_KEY,JSON.stringify(f))}catch(e){}};
let tick;
function applyLock(){
 clearInterval(tick);const go=$('lgGo'),m=$('lgWait');
 const upd=()=>{const left=Math.ceil((getF().until-Date.now())/1000);
  if(left>0){go.disabled=true;m.textContent=`Terlalu banyak percobaan. Coba lagi dalam ${left} detik.`}
  else{clearInterval(tick);go.disabled=false;m.textContent=''}};
 upd();if(getF().until>Date.now())tick=setInterval(upd,500)}

// ---------- UI login ----------
const form=$('loginForm'),msg=$('lgMsg');let busy=false;
const SCRIPTS=['atlas_cfg.js','p17_cfg.js','js/basemap_cfg.js','js/basemap.js','js/daterange.js','js/kpi_tanggal.js','js/symbology_date.js','js/state.js','app.js','analytics.js','atlas.js','kegiatan.js','locate.js','layout.js'];
let extrasDone;window.EXTRAS_READY=new Promise(r=>extrasDone=r);   // app.js menunggu analytics.js & locate.js agar hook Analytics tersedia saat data tiba
function loadScripts(){return SCRIPTS.reduce((p,s)=>p.then(()=>new Promise((res,rej)=>{const e=document.createElement('script');e.src=s+'?v='+VER;e.onload=res;e.onerror=()=>rej(new Error('Gagal memuat '+s));document.head.appendChild(e)})),Promise.resolve())}
function showMsg(t,cls){msg.textContent=t;msg.className='lg-msg '+(cls||'')}
form.addEventListener('submit',async ev=>{
 ev.preventDefault();if(busy||getF().until>Date.now())return;
 const u=$('lgUser').value,p=$('lgPass').value;
 if(!u.trim()||!p){showMsg('Isi user dan password','err');return}
 busy=true;$('lgGo').disabled=true;form.classList.add('busy');showMsg('Memverifikasi…','');
 try{
  await login(u,p);
  $('lgPass').value='';setF({n:0,until:0});
  showMsg('Membuka data…','');
  document.body.classList.remove('locked');
  try{await loadScripts()}finally{extrasDone()}
  const t0=Date.now(),w=setInterval(()=>{if(window.APP_OK||Date.now()-t0>40000||$('vaultErr')&&!$('vaultErr').hidden){clearInterval(w);$('login').hidden=true;document.body.classList.add('authed')}},120);
 }catch(err){
  busy=false;form.classList.remove('busy');$('lgPass').value='';
  if(err instanceof AuthError){const f=getF();f.n++;f.until=Date.now()+Math.min(1000*Math.pow(2,f.n-1),30000);setF(f);showMsg(MSG_BAD,'err');$('lgPass').focus()}
  else showMsg(err.message||'Terjadi kesalahan','err');
  document.body.classList.add('locked');applyLock();
 }
});
$('lgShow').addEventListener('click',()=>{const i=$('lgPass'),s=i.type==='password';i.type=s?'text':'password';$('lgShow').setAttribute('aria-pressed',s);$('lgShow').setAttribute('aria-label',s?'Sembunyikan password':'Tampilkan password');i.focus()});
$('logoutBtn').addEventListener('click',logout);
applyLock();$('lgUser').focus();
})();
