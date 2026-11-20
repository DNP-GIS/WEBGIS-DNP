// LAPISAN API — memisahkan tampilan dari sumber data. Dua adapter dengan antarmuka sama:
//   MockAdapter   : pratinjau tanpa backend (simulasi lokal, data contoh)
//   WorkerAdapter : Cloudflare Worker sungguhan (kontrak: docs/API_KONTRAK.md)
// Antarmuka adapter:
//   login(password) -> {token, expiresAt}   logout()   isAuthed() -> bool
//   sync(since, authed) -> {bots, messages?, notModified?}   (authed: sertakan percakapan; since: updatedAt terakhir)
//   postCommand(botId, text, attachmentIds?) -> pesan pengguna (status 'waiting')
//   quota() -> {resetAt, limits, used}   uploadFile(file, botId, {onProgress(frac,phase), signal}) -> {id,name,size,type,sha256,warn?}
//   removeFile(id)   downloadFile(file) -> Blob (hash sudah diverifikasi)
// Skema pesan: {id, botId, role:'user'|'bot', text, ts, updatedAt, status?, sample?, replyTo?, files?:[{id,name,size,type,sha256,status:'ready'|'fetched'|'expired',warn?,expiresAt}]}
//   status perintah: 'waiting' (menunggu) | 'processing' (diproses) | 'answered' (dijawab)
// Kode error adapter (err.code): 'EMPTY' | 'BADPW' | 'RATE' (err.retryAfter detik) | 'NETWORK' | 'UNAUTH' | 'HTTP'
//   berkas: 'QUOTA' (err.reason, err.resetAt) | 'KVLIMIT' | 'TOOBIG' | 'ABORT' | 'INTEGRITY' | 'NOCRYPTO' | 'GONE'

import { sha256Hex, MiB, isRisky } from './files.js';
import { seedState, seedMessages, SAMPLE_TASKS, SAMPLE_REPLIES, BOTS } from './data.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- MockAdapter
export class MockAdapter {
  constructor(config) {
    this.config = config;
    this.name = 'mock';
    this.st = seedState();
    this.msgs = seedMessages();
    this.timers = new Set();
    this.files = new Map();          // id -> {name,size,type,sha256,blob}  (SIMULASI di memori; tidak ada yang dikirim ke mana pun)
    this.mockQuota = { files: 0, bytes: 0, exhausted: false };
  }
  async quota() {
    const q = this.mockQuota, midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);
    return { resetAt: midnight.getTime(), limits: { filesPerDay: 24, bytesPerDay: 120 * MiB, writesPerDay: 600, maxFileBytes: 20 * MiB, chunkBytes: 4 * MiB, ttlSeconds: 7 * 86400, maxPerMessage: 10 }, used: { files: q.exhausted ? 24 : q.files, bytes: q.bytes, writes: q.files * 4 } };
  }
  async uploadFile(file, botId, { onProgress = () => {}, signal } = {}) {
    if (!this.isAuthed()) { const e = new Error('Belum login.'); e.code = 'UNAUTH'; throw e; }
    onProgress(0, 'hash'); const sha = await sha256Hex(file);
    if (this.mockQuota.exhausted || this.mockQuota.files >= 24) { const q = await this.quota(); throw Object.assign(new Error('Batas jumlah berkas harian tercapai. Chat teks tetap bisa dipakai.'), { code: 'QUOTA', reason: 'files', resetAt: q.resetAt }); }
    const steps = Math.max(4, Math.min(12, Math.ceil(file.size / MiB) + 3));
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, this.config.mockUploadStepMs ?? 140));
      if (signal && signal.aborted) throw Object.assign(new Error('Dibatalkan.'), { code: 'ABORT' });
      onProgress(i / steps, 'upload');
    }
    const id = 'f-' + uid() + uid(); this.files.set(id, { name: file.name, size: file.size, type: file.type || 'application/octet-stream', sha256: sha, blob: file });
    this.mockQuota.files++; this.mockQuota.bytes += file.size;
    return { id, name: file.name, size: file.size, type: file.type || 'application/octet-stream', sha256: sha, ...(isRisky(file.name) ? { warn: 'risky_extension' } : {}) };
  }
  async removeFile(id) { this.files.delete(id); }
  async downloadFile(f) {
    const r = this.files.get(f.id); if (!r) throw Object.assign(new Error('Berkas tidak ditemukan.'), { code: 'GONE' });
    const h = await sha256Hex(r.blob); if (h !== f.sha256) throw Object.assign(new Error('Hash berkas tidak cocok.'), { code: 'INTEGRITY' });
    return r.blob;
  }
  // Gerbang TIRUAN: tidak ada kata sandi sungguhan. Menerima input apa saja (non-kosong).
  async login(password) {
    if (!this.config.mockGateAcceptsAnything) throw new Error('Mode mock: gerbang tiruan dinonaktifkan.');
    if (!password || !String(password).trim()) { const e = new Error('Kata sandi tidak boleh kosong.'); e.code = 'EMPTY'; throw e; }
    const session = { token: 'DEMO-TOKEN-BUKAN-RAHASIA', expiresAt: Date.now() + 8 * 3600 * 1000, mock: true };
    sessionStorage.setItem(this.config.sessionKey, JSON.stringify(session));
    return session;
  }
  logout() { sessionStorage.removeItem(this.config.sessionKey); }
  isAuthed() {
    try { const s = JSON.parse(sessionStorage.getItem(this.config.sessionKey) || 'null'); return !!(s && s.expiresAt > Date.now()); }
    catch { return false; }
  }
  async sync(since = 0, authed = false) {
    const out = { bots: JSON.parse(JSON.stringify(this.st.bots)), serverTime: Date.now(), sample: true };
    if (!this.config.lockConversations || authed) out.messages = this.msgs.filter((m) => m.updatedAt > since).map((m) => ({ ...m }));
    return out;
  }
  async postCommand(botId, text, attachments = []) {
    if (!this.isAuthed()) { const e = new Error('Belum login.'); e.code = 'UNAUTH'; throw e; }
    const t = Date.now();
    const m = { id: 'c-' + uid(), botId, role: 'user', text: String(text).slice(0, this.config.maxCommandLen), ts: t, updatedAt: t, status: 'waiting', sample: true };
    if (attachments.length) m.files = attachments.map((id) => { const f = this.files.get(id); return { id, name: f.name, size: f.size, type: f.type, sha256: f.sha256, status: 'ready', expiresAt: Date.now() + 7 * 86400000, ...(isRisky(f.name) ? { warn: 'risky_extension' } : {}) }; });
    this.msgs.push(m);
    this._simulate(m);
    return { ...m };
  }
  // --- simulasi: menunggu -> diproses (bekerja) -> dijawab (selesai)
  _later(ms, fn) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); }
  _simulate(cmd) {
    const bs = this.st.bots[cmd.botId];
    // bot tanpa heartbeat tidak pernah mengambil perintah -> tetap 'menunggu' (meniru produksi)
    if (!bs || bs.heartbeatAt == null) return;
    const [q0, q1] = this.config.mockQueueDelayMs, [w0, w1] = this.config.mockWorkDelayMs;
    this._later(rnd(q0, q1), () => {
      cmd.status = 'processing'; cmd.updatedAt = Date.now();
      this.setBotStatus(cmd.botId, 'working');
      this._later(rnd(w0, w1), () => this.injectReply(cmd.botId, null, { replyTo: cmd }));
    });
  }
  // Hook uji & simulasi: sisipkan balasan bot (teks null => balasan contoh)
  injectReply(botId, text, opts = {}) {
    const t = Date.now();
    const cmd = opts.replyTo || null;
    let body = text;
    if (!body) {
      body = SAMPLE_REPLIES[Math.floor(Math.random() * SAMPLE_REPLIES.length)];
      if (cmd) body += ` (Perintah: “${cmd.text.length > 60 ? cmd.text.slice(0, 60) + '…' : cmd.text}”)`;
    }
    const m = { id: 'b-' + uid(), botId, role: 'bot', text: body, ts: t, updatedAt: t, sample: true, replyTo: cmd ? cmd.id : undefined };
    this.msgs.push(m);
    if (cmd) { cmd.status = 'answered'; cmd.updatedAt = t; }
    if (opts.setStatus !== false) this.setBotStatus(botId, 'done');
    return { ...m };
  }
  setBotStatus(botId, status) {
    const b = this.st.bots[botId]; if (!b) return;
    b.status = status; b.updatedAt = Date.now();
    if (status !== 'unmonitored' && b.heartbeatAt == null) b.heartbeatAt = Date.now();
    if (status === 'unmonitored') b.heartbeatAt = null;
    b.task = (b.task + 1) % (SAMPLE_TASKS[botId] || [0]).length;
  }
  dispose() { this.timers.forEach(clearTimeout); this.timers.clear(); }
}

// ---------------------------------------------------------------- WorkerAdapter
// Endpoint (docs/API_KONTRAK.md):
//   POST /login {password}                       -> {token, expiresAt, ttl}      (sandi diverifikasi di Worker)
//   GET  /state            (publik, ETag)        -> {rev, bots:{id:{status,updatedAt}}}
//   GET  /messages?since=  (Bearer, ETag)        -> {rev, bots(+task), messages[]}
//   POST /command {botId,text} (Bearer)          -> {message}
// Token sesi disimpan di sessionStorage (hilang saat tab ditutup); kata sandi TIDAK pernah disimpan.
export class WorkerAdapter {
  constructor(config) { this.config = config; this.name = 'worker'; this.etags = {}; }
  _url(p) { return this.config.workerUrl.replace(/\/$/, '') + p; }
  _session() { try { return JSON.parse(sessionStorage.getItem(this.config.sessionKey) || 'null'); } catch { return null; } }
  isAuthed() { const s = this._session(); return !!(s && s.token && s.expiresAt > Date.now()); }
  logout() { sessionStorage.removeItem(this.config.sessionKey); this.etags = {}; }
  async _fetch(path, { method = 'GET', body, auth = false, etagKey } = {}) {
    const headers = {};
    if (auth) { const s = this._session(); if (!s) throw Object.assign(new Error('Belum login.'), { code: 'UNAUTH' }); headers.Authorization = 'Bearer ' + s.token; }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (etagKey && this.etags[etagKey]) headers['If-None-Match'] = this.etags[etagKey];
    let r;
    try { r = await fetch(this._url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
    catch { throw Object.assign(new Error('Tidak dapat terhubung ke server.'), { code: 'NETWORK' }); }
    if (r.status === 304) return { notModified: true };
    let j = null; try { j = await r.json(); } catch { /* tubuh kosong */ }
    if (r.status === 401) { if (auth) { this.logout(); throw Object.assign(new Error('Sesi berakhir. Masuk lagi.'), { code: 'UNAUTH' }); } throw Object.assign(new Error((j && j.message) || 'Kata sandi salah.'), { code: 'BADPW' }); }
    if (r.status === 429 && j && j.error === 'quota_exceeded') throw Object.assign(new Error(j.message), { code: 'QUOTA', reason: j.reason, resetAt: j.resetAt, status: 429 });
    if (r.status === 429) throw Object.assign(new Error((j && j.message) || 'Terlalu banyak percobaan.'), { code: 'RATE', retryAfter: Number(r.headers.get('Retry-After')) || 30 });
    if (r.status === 503 && j && j.error === 'kv_daily_limit') throw Object.assign(new Error(j.message), { code: 'KVLIMIT', status: 503 });
    if (r.status === 413 && j && j.error === 'file_too_large') throw Object.assign(new Error(j.message), { code: 'TOOBIG', status: 413 });
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: 'HTTP', status: r.status, apiCode: j && j.error });
    const et = r.headers.get('ETag'); if (etagKey && et) this.etags[etagKey] = et;
    return j;
  }
  async login(password) {
    if (!password) throw Object.assign(new Error('Kata sandi tidak boleh kosong.'), { code: 'EMPTY' });
    const s = await this._fetch('/login', { method: 'POST', body: { password } });
    this.etags = {};
    sessionStorage.setItem(this.config.sessionKey, JSON.stringify({ token: s.token, expiresAt: s.expiresAt }));
    return { expiresAt: s.expiresAt };
  }
  async sync(since = 0, authed = false) {
    return authed ? this._fetch('/messages?since=' + encodeURIComponent(since), { auth: true, etagKey: 'm' }) : this._fetch('/state', { etagKey: 's' });
  }
  async postCommand(botId, text, attachments = []) { return (await this._fetch('/command', { method: 'POST', body: { botId, text, ...(attachments.length ? { attachments } : {}) }, auth: true })).message; }
  async quota() { return this._fetch('/files/quota', { auth: true }); }
  async removeFile(id) { try { await this._fetch('/files/' + id, { method: 'DELETE', auth: true }); } catch (e) { if (!(e.status === 404)) throw e; } }
  // Unggah: SHA-256 dihitung DI BROWSER -> POST /files -> PUT potongan 4 MiB (XHR agar ada progres) -> POST finish.
  async uploadFile(file, botId, { onProgress = () => {}, signal } = {}) {
    const aborted = () => Object.assign(new Error('Dibatalkan.'), { code: 'ABORT' });
    if (signal && signal.aborted) throw aborted();
    onProgress(0, 'hash'); const sha = await sha256Hex(file);
    if (signal && signal.aborted) throw aborted();
    const init = await this._fetch('/files', { method: 'POST', auth: true, body: { botId, name: file.name, size: file.size, type: file.type || 'application/octet-stream', sha256: sha } });
    let sent = 0;
    try {
      for (let i = 0; i < init.chunks; i++) {
        const blob = file.slice(i * init.chunkSize, Math.min(file.size, (i + 1) * init.chunkSize));
        for (let attempt = 0; ; attempt++) {
          try { await this._putChunk(init.id, i, blob, (loaded) => onProgress((sent + loaded) / file.size, 'upload'), signal); break; }
          catch (e) {
            if (e.apiCode === 'chunk_exists') break;                                     // percobaan sebelumnya sebenarnya sukses
            if (e.code === 'ABORT' || e.code === 'UNAUTH' || attempt >= 2 || !(e.code === 'NETWORK' || (e.status >= 500))) throw e;
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
        }
        sent += blob.size; onProgress(sent / file.size, 'upload');
      }
      if (signal && signal.aborted) throw aborted();
      if (init.chunks > 0) await this._fetch('/files/' + init.id + '/finish', { method: 'POST', auth: true });
    } catch (e) { this.removeFile(init.id).catch(() => {}); throw e; }
    onProgress(1, 'done');
    return { id: init.id, name: init.name, size: init.size, type: init.type, sha256: sha, ...(init.warn ? { warn: init.warn } : {}) };
  }
  _putChunk(id, i, blob, onLoaded, signal) {
    const s = this._session(); if (!s) return Promise.reject(Object.assign(new Error('Belum login.'), { code: 'UNAUTH' }));
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('PUT', this._url(`/files/${id}/chunks/${i}`)); x.setRequestHeader('Authorization', 'Bearer ' + s.token); x.setRequestHeader('Content-Type', 'application/octet-stream'); x.timeout = 120000;
      x.upload.onprogress = (ev) => { if (ev.lengthComputable) onLoaded(ev.loaded); };
      const onAbort = () => x.abort(); if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const done = () => signal && signal.removeEventListener('abort', onAbort);
      x.onload = () => { done(); let j = null; try { j = JSON.parse(x.responseText); } catch { /* */ }
        if (x.status >= 200 && x.status < 300) return resolve(j);
        if (x.status === 401) { this.logout(); return reject(Object.assign(new Error('Sesi berakhir. Masuk lagi.'), { code: 'UNAUTH' })); }
        if (x.status === 503 && j && j.error === 'kv_daily_limit') return reject(Object.assign(new Error(j.message), { code: 'KVLIMIT', status: 503 }));
        reject(Object.assign(new Error((j && j.message) || 'HTTP ' + x.status), { code: 'HTTP', status: x.status, apiCode: j && j.error })); };
      x.onerror = () => { done(); reject(Object.assign(new Error('Tidak dapat terhubung ke server.'), { code: 'NETWORK' })); };
      x.ontimeout = x.onerror; x.onabort = () => { done(); reject(Object.assign(new Error('Dibatalkan.'), { code: 'ABORT' })); };
      x.send(blob);
    });
  }
  // Unduh (pengguna login): fetch + Authorization -> Blob -> verifikasi SHA-256 -> baru boleh disimpan. TIDAK pernah dibuka inline.
  async downloadFile(f) {
    const s = this._session(); if (!s) throw Object.assign(new Error('Belum login.'), { code: 'UNAUTH' });
    let r; try { r = await fetch(this._url('/files/' + f.id), { headers: { Authorization: 'Bearer ' + s.token }, cache: 'no-store' }); } catch { throw Object.assign(new Error('Tidak dapat terhubung ke server.'), { code: 'NETWORK' }); }
    if (r.status === 401) { this.logout(); throw Object.assign(new Error('Sesi berakhir. Masuk lagi.'), { code: 'UNAUTH' }); }
    if (r.status === 404 || r.status === 410) throw Object.assign(new Error('Berkas sudah kedaluwarsa atau sudah diambil Vision dan dibersihkan.'), { code: 'GONE' });
    if (!r.ok) throw Object.assign(new Error('Gagal mengunduh (HTTP ' + r.status + ').'), { code: 'HTTP', status: r.status });
    const blob = await r.blob(); const h = await sha256Hex(blob);
    if (h !== f.sha256 || blob.size !== f.size) throw Object.assign(new Error('Hash berkas TIDAK cocok — unduhan dibuang demi keamanan.'), { code: 'INTEGRITY' });
    return new Blob([blob], { type: 'application/octet-stream' });
  }
  dispose() {}
}

// ------------------------------------------------------------------- ApiClient
// Menyimpan state + pesan di klien, polling berkala (jeda saat tab tersembunyi, backoff saat error), dan memancarkan event:
//   'state' (bots), 'messages' ({changed,fresh,initial,cleared}), 'online' ({ok,lastSync,errors}), 'auth' ({ok,reason})
export class ApiClient {
  constructor(config) {
    this.config = config;
    this.adapter = config.mode === 'worker' ? new WorkerAdapter(config) : new MockAdapter(config);
    this.bots = {};              // id -> {status, task?, updatedAt, heartbeatAt?}
    this.messages = new Map();   // id -> pesan
    this.since = 0;
    this.listeners = {};
    this.timer = null; this.inflight = null;
    this.errors = 0; this.lastSync = null; this.needInitial = false;
    this.wasAuthed = this.adapter.isAuthed();
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }; }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); }
  get mode() { return this.adapter.name; }
  isAuthed() { return this.adapter.isAuthed(); }
  async login(pw) {
    const s = await this.adapter.login(pw);
    this.wasAuthed = true; this.since = 0; this.needInitial = true;
    this.emit('auth', { ok: true });
    if (this.inflight) { try { await this.inflight; } catch { /* */ } }       // v3: jangan memakai polling tanpa-login yang sedang berjalan (riwayat bisa kosong sampai polling berikutnya)
    await this.poll();
    return s;
  }
  logout(reason = 'logout') {
    this.adapter.logout(); this._authLost(reason);
    return this.poll();
  }
  _authLost(reason) {
    this.wasAuthed = false; this.messages.clear(); this.since = 0;
    this.emit('messages', { changed: [], fresh: [], initial: true, cleared: true });
    this.emit('auth', { ok: false, reason });
  }
  thread(botId) { return [...this.messages.values()].filter((m) => m.botId === botId).sort((a, b) => a.ts - b.ts || (a.role === 'user' ? -1 : 1)); }
  allCommands() { return [...this.messages.values()].filter((m) => m.role === 'user').sort((a, b) => b.ts - a.ts); }
  quota() { return this.adapter.quota(); }
  uploadFile(file, botId, opts) { return this.adapter.uploadFile(file, botId, opts); }
  removeFile(id) { return this.adapter.removeFile(id); }
  downloadFile(f) { return this.adapter.downloadFile(f); }
  async sendCommand(botId, text, attachments = []) {
    try { const m = await this.adapter.postCommand(botId, text, attachments); this._merge([m]); return m; }
    catch (e) { if (e.code === 'UNAUTH') this._authLost('expired'); throw e; }
  }
  _merge(list, isInitial = false) {
    const changed = [], fresh = [];
    for (const m of list) {
      const old = this.messages.get(m.id);
      if (!old || m.updatedAt > old.updatedAt || m.status !== old.status) {
        this.messages.set(m.id, m); changed.push(m);
        if (!old && m.role === 'bot') fresh.push(m);
      }
      this.since = Math.max(this.since, m.updatedAt || 0);
    }
    if (changed.length) this.emit('messages', { changed, fresh, initial: isInitial });
  }
  poll(isInitial = false) {
    if (!this.inflight) this.inflight = this._poll(isInitial).finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async _poll(isInitial) {
    if (this.wasAuthed && !this.adapter.isAuthed()) this._authLost('expired');   // token kedaluwarsa di sisi klien
    try {
      const r = await this.adapter.sync(this.since, this.adapter.isAuthed());
      if (!r.notModified) {
        if (r.bots) { this.bots = r.bots; this.emit('state', this.bots); }
        if (r.messages) { this._merge(r.messages, isInitial || this.needInitial); }
        this.needInitial = false;
      }
      this.errors = 0; this.lastSync = Date.now(); this.emit('online', { ok: true, lastSync: this.lastSync, errors: 0 });
    } catch (e) {
      if (e.code === 'UNAUTH') { this._authLost('expired'); this.errors = 0; return this._poll(false); }   // ambil ulang status publik
      this.errors++; this.emit('online', { ok: false, lastSync: this.lastSync, errors: this.errors, code: e.code });
      console.debug('[api] polling gagal:', e.code || e.message);
    }
  }
  _delay() {
    const base = this.mode === 'mock' ? this.config.mockPollMs : this.config.pollMs;
    const ms = this.errors ? Math.min(base * 2 ** this.errors, this.config.maxBackoffMs) : base;
    return ms * (0.9 + Math.random() * 0.2);
  }
  _schedule() {
    clearTimeout(this.timer); this.timer = null;
    if (typeof document !== 'undefined' && document.hidden) return;        // jeda saat tab tersembunyi
    this.timer = setTimeout(async () => { await this.poll(); this._schedule(); }, this._delay());
  }
  async start() {
    await this.poll(true); this._schedule();
    this._onVis = async () => { if (document.hidden) { clearTimeout(this.timer); this.timer = null; } else { await this.poll(); this._schedule(); } };
    document.addEventListener('visibilitychange', this._onVis);
  }
  stop() { clearTimeout(this.timer); document.removeEventListener('visibilitychange', this._onVis); this.adapter.dispose && this.adapter.dispose(); }
}
export function createApi(config) { return new ApiClient(config); }
