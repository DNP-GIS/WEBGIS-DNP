// LAPISAN API — memisahkan tampilan dari sumber data. Dua adapter dengan antarmuka sama:
//   MockAdapter   : pratinjau tanpa backend (simulasi lokal, data contoh)
//   WorkerAdapter : Cloudflare Worker sungguhan (kontrak: docs/API_KONTRAK.md)
// Antarmuka adapter:
//   login(password) -> {token, expiresAt}   logout()   isAuthed() -> bool
//   sync(since, authed) -> {bots, messages?, notModified?}   (authed: sertakan percakapan; since: updatedAt terakhir)
//   postCommand(botId, text) -> pesan pengguna (status 'waiting')
// Skema pesan: {id, botId, role:'user'|'bot', text, ts, updatedAt, status?, sample?, replyTo?}
//   status perintah: 'waiting' (menunggu) | 'processing' (diproses) | 'answered' (dijawab)
// Kode error adapter (err.code): 'EMPTY' | 'BADPW' | 'RATE' (err.retryAfter detik) | 'NETWORK' | 'UNAUTH' | 'HTTP'

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
  async postCommand(botId, text) {
    if (!this.isAuthed()) { const e = new Error('Belum login.'); e.code = 'UNAUTH'; throw e; }
    const t = Date.now();
    const m = { id: 'c-' + uid(), botId, role: 'user', text: String(text).slice(0, this.config.maxCommandLen), ts: t, updatedAt: t, status: 'waiting', sample: true };
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
    if (r.status === 429) throw Object.assign(new Error((j && j.message) || 'Terlalu banyak percobaan.'), { code: 'RATE', retryAfter: Number(r.headers.get('Retry-After')) || 30 });
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: 'HTTP', status: r.status });
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
  async postCommand(botId, text) { return (await this._fetch('/command', { method: 'POST', body: { botId, text }, auth: true })).message; }
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
  async sendCommand(botId, text) {
    try { const m = await this.adapter.postCommand(botId, text); this._merge([m]); return m; }
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
