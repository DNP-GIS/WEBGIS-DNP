// UI (DOM): label & gelembung terproyeksi, panel bot, kotak perintah, gerbang sandi, legenda.
// SEMUA teks dinamis dirender dengan textContent (bukan innerHTML) — mencegah XSS dari isi pesan.
import { STATUS, STATUS_ORDER, TEAMS, BOTS, botById, SAMPLE_TASKS } from './data.js';
import { fmtSize, isRisky, extOf, PREVIEW_TYPES, fmtWib, fmtDayLabel, dayKey, MiB } from './files.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const CMD_STATUS = { waiting: 'Menunggu', processing: 'Diproses', answered: 'Dijawab' };
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

export function createUI({ api, scene, config }) {
  const overlay = $('overlay');
  const botPanel = $('botPanel'), cmdPanel = $('cmdPanel');
  let selected = null, bubbleMs = config.bubbleMs, lastFocus = null;
  const agents = {};      // botId -> {root, tag, dot, bubble, timer}
  const shownBubbles = new Set();

  // ------------------------------------------------------------ legenda
  const legend = $('legend');
  legend.appendChild(el('span', 'ttl', 'Lampu status'));
  const legendN = {};
  STATUS_ORDER.forEach((k) => {
    const it = el('div', 'it'); it.title = STATUS[k].hint;
    const d = el('span', 'dot'); d.style.background = STATUS[k].color; d.style.color = STATUS[k].color;
    it.append(d, el('span', null, STATUS[k].label)); const n = el('span', 'n', '0'); legendN[k] = n; it.appendChild(n);
    legend.appendChild(it);
  });

  // ------------------------------------- label melayang di atas kepala (kartu: ikon + NAMA + jabatan + status) + chip area
  const stripC = (t) => String(t || '').replace(/^Contoh:\s*/i, '');
  const isMock = api.mode === 'mock';
  document.body.classList.toggle('mock', isMock);
  // Teks tugas: mock = DATA CONTOH dari data.js; worker = string 'task' dari Vision (hanya ada setelah login).
  function taskOf(id, st) {
    if (isMock) { const tasks = SAMPLE_TASKS[id] || []; return stripC(tasks[(st.task || 0) % (tasks.length || 1)]); }
    return typeof st.task === 'string' ? st.task : '';
  }
  function statusLine(id) {
    const st = api.bots[id] || { status: 'unmonitored' }, task = taskOf(id, st);
    switch (st.status) {
      case 'working': return ['⚙', task ? 'Mengerjakan ' + task : 'Sedang bekerja'];
      case 'done': return ['✓', task ? 'Selesai: ' + task : 'Selesai'];
      case 'standby': return ['☕', 'Siaga'];
      default: return ['○', 'Belum dipantau'];
    }
  }
  BOTS.forEach((b) => {
    const root = el('div', 'agent off m-full'); root.dataset.id = b.id;
    const tag = el('button', 'card-l'); tag.type = 'button'; tag.setAttribute('aria-label', `Fokus ke ${b.name}, ${b.role}`);
    const ic = el('span', 'ic', b.name[0]); ic.style.background = b.color;
    const ct = el('div', 'ct'), nm = el('div', 'nm', (b.lead ? '★ ' : '') + b.name), rl = el('div', 'rl', b.role);
    const stl = el('div', 'stl'), si = el('span', 'si', '○'), stx = el('span', 'stx', ''); stl.append(si, stx);
    ct.append(nm, rl, stl);
    const dot = el('span', 'd'); const mini = el('span', 'mini', 'CONTOH');
    tag.append(ic, ct, dot, mini);
    tag.addEventListener('click', () => selectBot(b.id));
    root.appendChild(tag); overlay.appendChild(root);
    agents[b.id] = { root, tag, dot, si, stx, bubble: null, timer: null, mode: 'full', bot: b };
  });
  const areaEls = {};
  [...new Set(['vision', 'meeting', 'jarvis', 'lounge', 'pantry'])].forEach((id) => { const e = el('div', 'area-chip'); overlay.appendChild(e); areaEls[id] = e; });
  const SIZE = { full: [172, 66], dot: [26, 26] };
  const sizeOf = (mode, ag) => (mode === 'compact' ? [30 + ag.bot.name.length * 7.4 + (ag.bot.lead ? 12 : 0), 24] : SIZE[mode]);
  const hit = (a, b) => !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
  function onFrame(anchors) {
    if (!anchors.length) return;
    const mob = isMobile(), hov = scene.hovered, W = window.innerWidth, H = window.innerHeight;
    const items = anchors.filter((a) => a.kind === 'bot');
    const prio = (a) => (a.id === selected ? 0 : a.id === hov ? 1 : botById(a.id).lead ? 2 : 3);
    items.sort((p, q) => prio(p) - prio(q) || q.y - p.y);
    const placed = [];
    overlay.style.setProperty('--bw', (mob ? 150 : 190) + 'px');
    for (const a of items) {
      const ag = agents[a.id]; if (!ag) continue;
      if (!a.visible || a.x < -80 || a.x > W + 80 || a.y < -40 || a.y > H + 160) { ag.root.classList.add('off'); continue; }
      ag.root.classList.remove('off');
      const force = a.id === selected || a.id === hov;
      const pref = force ? ['full'] : mob ? ['compact', 'dot'] : ['full', 'compact', 'dot'];
      let pick = null;
      const tryMode = (mode, lift) => { const [w, h] = sizeOf(mode, ag), r = { x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y - lift - h - 6, y1: a.y - lift }; if (force || !placed.some((p) => hit(p, r))) { pick = { mode, lift, r }; return true; } return false; };
      for (const m of pref) if (tryMode(m, 0)) break;
      if (!pick && !force) for (const lift of [26, 52]) if (tryMode(pref[pref.length - 1] === 'full' ? 'compact' : pref[0], lift)) break;
      if (!pick) { const [w, h] = sizeOf('dot', ag); pick = { mode: 'dot', lift: 0, r: { x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y - h - 6, y1: a.y } }; }
      placed.push(pick.r);
      if (ag.mode !== pick.mode) { ag.root.classList.remove('m-' + ag.mode); ag.root.classList.add('m-' + pick.mode); ag.mode = pick.mode; }
      ag.root.style.transform = `translate(${a.x.toFixed(1)}px, ${(a.y - pick.lift).toFixed(1)}px) translate(-50%, -100%)`;
      ag.root.style.zIndex = String(Math.round((1 - a.depth) * 1000) + (force ? 5000 : 0));
    }
    for (const a of anchors) if (a.kind === 'area') {
      const e = areaEls[a.id]; if (!e) continue;
      const show = a.visible && !selected && a.x > 0 && a.x < W && a.y > 0 && a.y < H;
      e.style.display = show ? '' : 'none'; if (!show) continue;
      if (!e.textContent) { e.textContent = a.label; e.style.setProperty('--ac', a.color); }
      e.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
  function refreshLabels() {
    BOTS.forEach((b) => { const ag = agents[b.id], [i, t] = statusLine(b.id), st = (api.bots[b.id] || {}).status || 'unmonitored';
      ag.si.textContent = i; ag.stx.textContent = t; ag.dot.style.setProperty('--sc', STATUS[st].color); ag.root.dataset.status = st; });
  }

  function clearBubbles() { Object.values(agents).forEach((ag) => { if (ag.bubble) { ag.bubble.remove(); ag.bubble = null; } clearTimeout(ag.timer); }); }
  // ---------------------------------------------------------- gelembung balasan
  function showBubble(msg, sticky = false) {
    const ag = agents[msg.botId]; if (!ag) return;
    if (config.lockConversations && !api.isAuthed()) return;
    shownBubbles.add(msg.id);
    if (ag.bubble) ag.bubble.remove(); clearTimeout(ag.timer);
    const b = el('div', 'bubble'); b.setAttribute('role', 'button'); b.tabIndex = 0;
    const bh = el('div', 'bh'); bh.append(el('b', null, botById(msg.botId).name), el('span', 't', fmtTime(msg.ts)));
    if (msg.sample) bh.appendChild(el('span', 'chip sample', 'CONTOH'));
    b.append(bh, el('div', 'bt', msg.text));
    b.addEventListener('click', () => selectBot(msg.botId));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectBot(msg.botId); });
    ag.root.insertBefore(b, ag.tag); ag.bubble = b;
    if (!sticky && Number.isFinite(bubbleMs)) {
      ag.timer = setTimeout(() => { b.classList.add('fade'); setTimeout(() => { if (ag.bubble === b) { b.remove(); ag.bubble = null; } }, 700); }, bubbleMs);
    }
  }

  // ----------------------------------------------------------------- panel bot
  function renderBotPanel() {
    if (!selected) return;
    const b = botById(selected), st = api.bots[selected] || { status: 'unmonitored' }, S = STATUS[st.status];
    $('bpAvatar').textContent = b.name[0]; $('bpAvatar').style.background = b.color;
    $('bpName').textContent = b.name; $('bpRole').textContent = b.role;
    const badge = $('bpStatus'); badge.textContent = S.label; badge.style.setProperty('--sc', S.color);
    $('bpTeam').textContent = TEAMS[b.team].name;
    const tasks = SAMPLE_TASKS[b.id] || [];
    const ul = $('bpTasks'); ul.replaceChildren();
    if (st.status === 'unmonitored') ul.appendChild(el('li', null, 'Belum ada data — bot ini belum punya heartbeat.'));
    else if (isMock) { const cur = st.task || 0; [tasks[cur], tasks[(cur + 1) % tasks.length]].filter(Boolean).forEach((t, i) => ul.appendChild(el('li', null, (i === 0 ? '▶ ' : '') + t))); }
    else if (st.task) ul.appendChild(el('li', null, '▶ ' + st.task));
    else ul.appendChild(el('li', null, api.isAuthed() ? 'Belum ada ringkasan tugas dari Vision.' : '🔒 Rincian tugas tersedia setelah login.'));
    $('bpHeartbeat').textContent = st.heartbeatAt ? `Heartbeat terakhir${isMock ? ' (contoh)' : ''}: ${fmtTime(st.heartbeatAt)}`
      : (!isMock && !api.isAuthed() ? 'Waktu heartbeat tersedia setelah login.' : 'Heartbeat: belum ada → status "belum dipantau".');
    $('bpCmdName').textContent = b.name;
    renderThread();
  }
  function renderThread() {
    const box = $('bpThread'); if (!selected) return;
    box.replaceChildren();
    if (config.lockConversations && !api.isAuthed()) {
      const n = el('div', 'lock-note'); n.appendChild(el('div', null, '🔒 Percakapan terkunci. Masuk dengan kata sandi untuk melihatnya.'));
      const bt = el('button', 'btn small', 'Masuk'); bt.type = 'button'; bt.addEventListener('click', () => openGate(selected)); n.appendChild(bt);
      box.appendChild(n); return;
    }
    api.thread(selected).forEach((m) => {
      const d = el('div', 'msg ' + m.role);
      const meta = el('div', 'meta', (m.role === 'user' ? 'Anda' : botById(m.botId).name) + ' · ' + fmtTime(m.ts));
      if (m.sample) meta.appendChild(el('span', 'chip sample', 'CONTOH'));
      if (m.role === 'user' && m.status) meta.appendChild(el('span', 'chip st-' + m.status, CMD_STATUS[m.status]));
      d.append(meta, el('div', null, m.text)); if (m.files && m.files.length) d.appendChild(el('div', 'meta', '📎 ' + m.files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(', '))); box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  }

  function selectBot(id) {
    if (!botById(id)) return;
    lastFocus = document.activeElement;
    selected = id;
    if (isMobile()) closeCommand(false);
    renderBotPanel();
    botPanel.classList.add('open'); botPanel.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('#toolbar [data-view]').forEach((b) => b.classList.remove('active'));
    markSelected(); updateInset();   // hitung area terlihat (di luar panel) SEBELUM kamera difokuskan
    scene.focusBot(id);
  }
  function closeBot(restore = true) {
    if (!selected && !botPanel.classList.contains('open')) return;
    selected = null; scene.clearSelection();
    botPanel.classList.remove('open'); botPanel.setAttribute('aria-hidden', 'true');
    markSelected(); updateInset();
    if (restore && lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch { /* */ }
  }
  function markSelected() { Object.entries(agents).forEach(([id, ag]) => ag.tag.classList.toggle('sel', id === selected)); }
  $('bpClose').addEventListener('click', () => closeBot());
  $('bpCmd').addEventListener('click', () => openCommand(selected));

  // --------------------------------------------------------- toolbar / view
  document.querySelectorAll('#toolbar [data-view]').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  function showView(name) {
    closeBot(false); scene.showView(name);
    document.querySelectorAll('#toolbar [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  }

  // ------------------------------------------------------------ kotak perintah
  const sel = $('cmdTarget');
  Object.values(TEAMS).forEach((T) => {
    const g = document.createElement('optgroup'); g.label = T.name;
    BOTS.filter((b) => b.team === T.id).forEach((b) => { const o = document.createElement('option'); o.value = b.id; o.textContent = `${b.name} — ${b.short}`; g.appendChild(o); });
    sel.appendChild(g);
  });
  const text = $('cmdText'), send = $('cmdSend'), tray = $('attTray'), scroller = $('cmdScroll');
  text.maxLength = config.maxCommandLen;
  const MAXF = config.maxFileBytes || 20 * MiB, MAXN = config.maxFilesPerMessage || 10;
  let scope = 'all', atts = [], outbox = [], quota = null, quotaBlock = null, uploading = false, sending = false, manualH = false, lastAutoH = 0;
  const FILE_ST = { ready: 'Tersedia', fetched: 'Sudah diambil Vision', expired: 'Kedaluwarsa' };
  const fileIcon = (n, t) => ((t || '').startsWith('image/') ? '🖼' : /^(zip|rar|7z|gz|tar)$/.test(extOf(n)) ? '🗜' : /^(xlsx?|csv)$/.test(extOf(n)) ? '📊' : extOf(n) === 'pdf' ? '📕' : '📄');

  // ---------- area teks: tumbuh otomatis (dan bisa ditarik manual), hitung karakter
  function autoGrow() {
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight, kbd = document.body.classList.contains('kb-open'), max = Math.round(vh * (isMobile() ? (kbd ? 0.3 : 0.32) : 0.36));
    if (manualH && Math.abs(text.offsetHeight - lastAutoH) > 4) { text.style.maxHeight = 'none'; return; }
    text.style.height = 'auto'; const h = Math.min(Math.max(text.scrollHeight + 2, 0), max); text.style.height = h + 'px'; lastAutoH = h; manualH = false;
  }
  text.addEventListener('pointerup', () => { if (Math.abs(text.offsetHeight - lastAutoH) > 4) manualH = true; });
  function setBusy() { uploading = atts.some((a) => a.state === 'queued' || a.state === 'hashing' || a.state === 'uploading'); }
  function updateForm() {
    const n = text.value.length, cnt = $('cmdCount'); cnt.textContent = `${n}/${config.maxCommandLen}`; cnt.classList.toggle('near', n > config.maxCommandLen * 0.9 && n <= config.maxCommandLen); cnt.classList.toggle('over', n > config.maxCommandLen);
    setBusy(); const ready = atts.filter((a) => a.state === 'ready'), bad = atts.some((a) => a.state === 'error');
    send.disabled = sending || uploading || bad || n > config.maxCommandLen || (!text.value.trim() && !ready.length);
    send.title = uploading ? 'Menunggu unggahan selesai…' : bad ? 'Hapus lampiran yang gagal dulu' : '';
    sel.disabled = atts.length > 0; sel.title = atts.length ? 'Bot tujuan dikunci selama ada lampiran' : '';
    const st = api.bots[sel.value]; const w = $('cmdWarn');
    if (st && st.status === 'unmonitored') { w.hidden = false; w.textContent = '⚠ Bot ini belum dipantau (belum ada heartbeat): perintah akan tetap menunggu di antrean sampai bot aktif.'; } else w.hidden = true;
    $('cmdAttach').disabled = !!quotaBlock || atts.length >= MAXN || sending;
    $('cmdAttach').title = quotaBlock ? 'Kuota berkas harian habis' : 'Lampirkan berkas (maks. 20 MiB per berkas)';
    autoGrow();
  }
  text.addEventListener('input', updateForm); sel.addEventListener('change', () => { updateForm(); renderHistory(); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('cmdForm').requestSubmit(); } });

  // ---------- kuota berkas (info untuk pengguna; server tetap yang memutuskan)
  const resetTxt = (ts) => fmtWib(ts);
  function showQuota(q, blocked) {
    const n = $('quotaNote');
    if (blocked) { quotaBlock = blocked; const m = (blocked.message || 'Kuota berkas harian habis.').replace(/\s*Chat teks tetap bisa dipakai\.?/, '').trim(); n.hidden = false; n.textContent = `📎 ${m} Berkas bisa dikirim lagi setelah ${resetTxt(blocked.resetAt)}. Chat teks tetap bisa dipakai.`; return; }
    quotaBlock = null; n.hidden = true; if (!q) return;
    const left = q.limits.filesPerDay - q.used.files;
    if (left <= 0 || q.used.bytes >= q.limits.bytesPerDay || q.used.writes >= q.limits.writesPerDay) { showQuota(null, { message: 'Kuota berkas harian habis.', resetAt: q.resetAt }); return; }
    if (left <= 4) { n.hidden = false; n.textContent = `📎 Sisa kuota berkas hari ini: ${left} berkas · ${fmtSize(Math.max(0, q.limits.bytesPerDay - q.used.bytes))}.`; }
  }
  async function refreshQuota() { if (isMock && !api.adapter.quota) return; try { quota = await api.quota(); showQuota(quota); updateForm(); } catch { /* informasi saja */ } }

  // ---------- lampiran: antrean unggah satu per satu (hash di browser -> potongan -> selesai)
  let pumping = false;
  function addFiles(list) {
    if (!api.isAuthed()) { toast('Masuk dulu untuk melampirkan berkas.'); return; }
    if (quotaBlock) { toast('Kuota berkas harian habis. Chat teks tetap bisa dipakai.'); return; }
    let added = 0;
    for (const f of list) {
      if (atts.length >= MAXN) { toast(`Maksimal ${MAXN} lampiran per pesan.`); break; }
      const a = { key: 'a' + Math.random().toString(36).slice(2, 9), file: f, name: f.name || 'berkas', size: f.size, state: 'queued', progress: 0, phase: '', risky: isRisky(f.name), ac: new AbortController() };
      if (f.size > MAXF) { a.state = 'error'; a.error = `Terlalu besar (${fmtSize(f.size)}). Maksimal ${fmtSize(MAXF)} per berkas.`; }
      if (PREVIEW_TYPES.has(f.type) && f.size <= 8 * MiB && a.state !== 'error') { try { a.preview = URL.createObjectURL(f); } catch { /* */ } }   // hanya blob lokal di tray
      atts.push(a); added++;
    }
    if (added) { renderTray(); updateForm(); pump(); }
  }
  async function pump() {
    if (pumping) return; pumping = true;
    try {
      for (;;) {
        const a = atts.find((x) => x.state === 'queued'); if (!a) break;
        a.state = 'hashing'; renderTray(); updateForm();
        try {
          const r = await api.uploadFile(a.file, sel.value, { signal: a.ac.signal, onProgress: (fr, ph) => { if (a.state === 'canceled') return; a.progress = fr; a.phase = ph; if (ph === 'upload') a.state = 'uploading'; paintAtt(a); } });
          if (a.state === 'canceled') { api.removeFile(r.id).catch(() => {}); continue; }
          Object.assign(a, { state: 'ready', id: r.id, serverName: r.name, sha256: r.sha256, progress: 1, risky: !!r.warn || a.risky });
        } catch (e) {
          if (a.state === 'canceled') continue;
          if (e.code === 'QUOTA') { showQuota(null, { message: e.message, resetAt: e.resetAt }); atts.filter((x) => x.state === 'queued').forEach((x) => { x.state = 'error'; x.error = 'Tidak diunggah: kuota harian habis.'; }); }
          if (e.code === 'KVLIMIT') showQuota(null, { message: e.message, resetAt: Date.now() + 3600000 });
          if (e.code === 'UNAUTH') { atts.forEach((x) => x.preview && URL.revokeObjectURL(x.preview)); atts = []; renderTray(); updateForm(); closeCommand(); openGate(null, 'Sesi berakhir. Masuk lagi untuk melanjutkan.'); break; }
          a.state = 'error'; a.error = e.message || 'Gagal mengunggah.';
        }
        renderTray(); updateForm();
      }
    } finally { pumping = false; }
  }
  function removeAtt(a) {
    if (a.state === 'hashing' || a.state === 'uploading' || a.state === 'queued') { a.state = 'canceled'; a.ac.abort(); }
    else if (a.state === 'ready' && a.id) api.removeFile(a.id).catch(() => {});      // batal = hapus dari server (tidak menambah tulis KV)
    if (a.preview) URL.revokeObjectURL(a.preview);
    atts = atts.filter((x) => x !== a); renderTray(); updateForm();
  }
  function paintAtt(a) {
    const li = tray.querySelector(`[data-k="${a.key}"]`); if (!li) return;
    const pr = li.querySelector('progress'); if (pr) pr.value = Math.round(a.progress * 100);
    const st = li.querySelector('.as .pt'); if (st) st.textContent = attText(a);
  }
  const attText = (a) => a.state === 'queued' ? 'Menunggu antrean…' : a.state === 'hashing' ? 'Menghitung hash SHA-256…' : a.state === 'uploading' ? `Mengunggah ${Math.round(a.progress * 100)}%` : a.state === 'ready' ? 'Siap dikirim' : a.error || 'Gagal';
  function renderTray() {
    tray.replaceChildren(); tray.hidden = !atts.length;
    for (const a of atts) {
      const li = el('div', 'att' + (a.state === 'error' ? ' err' : '')); li.dataset.k = a.key; li.dataset.state = a.state;
      const ic = el('div', 'ai'); if (a.preview) { const im = document.createElement('img'); im.src = a.preview; im.alt = ''; ic.appendChild(im); } else ic.textContent = fileIcon(a.name, a.file.type);
      const b = el('div', 'ab'); b.appendChild(el('div', 'an', a.name)); b.lastChild.title = a.name;
      const meta = el('div', 'as' + (a.state === 'error' ? ' bad' : '')); meta.append(el('span', null, fmtSize(a.size)), el('span', 'pt', attText(a)));
      if (a.risky) meta.appendChild(el('span', 'chip f-risk', '⚠ jenis berisiko'));
      b.appendChild(meta);
      if (a.state === 'hashing' || a.state === 'uploading' || a.state === 'queued') { const pr = document.createElement('progress'); pr.max = 100; pr.value = Math.round(a.progress * 100); pr.setAttribute('aria-label', 'Progres unggah ' + a.name); b.appendChild(pr); }
      const rm = el('button', 'icon-btn rm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', (a.state === 'ready' || a.state === 'error' ? 'Hapus lampiran ' : 'Batalkan unggahan ') + a.name); rm.title = a.state === 'ready' || a.state === 'error' ? 'Hapus lampiran' : 'Batalkan';
      rm.addEventListener('click', () => removeAtt(a));
      li.append(ic, b, rm); tray.appendChild(li);
    }
  }
  $('cmdAttach').addEventListener('click', () => $('cmdFile').click());
  $('cmdFile').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  text.addEventListener('paste', (e) => {
    const cd = e.clipboardData; if (!cd || !cd.files || !cd.files.length) return;
    if (cd.getData('text/plain')) return;                                          // ada teks: tempel sebagai teks biasa
    e.preventDefault(); addFiles([...cd.files].map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], 'tempel-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.' + (extOf(f.type.replace('/', '.')) || 'bin'), { type: f.type }))));
  });
  const veil = $('dropVeil'); let dragN = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  cmdPanel.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; veil.hidden = false; });
  cmdPanel.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  cmdPanel.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragN = Math.max(0, dragN - 1); if (!dragN) veil.hidden = true; });
  cmdPanel.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; veil.hidden = true; addFiles([...e.dataTransfer.files]); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e) && !cmdPanel.contains(e.target)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (hasFiles(e) && !cmdPanel.contains(e.target)) e.preventDefault(); });   // jangan biarkan peramban MEMBUKA berkas yang dijatuhkan di luar kotak

  // ---------- kirim
  $('cmdForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = text.value.trim(); const ready = atts.filter((a) => a.state === 'ready'); if ((!t && !ready.length) || sending || uploading) return;
    sending = true; updateForm();
    const botId = sel.value, item = { key: 'o' + Date.now(), botId, text: t, files: ready.map((a) => ({ name: a.serverName || a.name, size: a.size, type: a.file.type, status: 'ready', risky: a.risky })), ts: Date.now(), state: 'sending', ids: ready.map((a) => a.id) };
    outbox.push(item); text.value = ''; manualH = false; text.style.height = ''; atts.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)); atts = []; renderTray(); renderHistory(true);
    try {
      await api.sendCommand(botId, t, item.ids); outbox = outbox.filter((o) => o !== item);
      toast(isMock ? 'Perintah masuk antrean (SIMULASI lokal).' : 'Perintah terkirim · menunggu diproses Vision.');
    } catch (err) {
      if (err.code === 'UNAUTH') { outbox = []; closeCommand(); openGate(null, 'Sesi berakhir. Masuk lagi untuk melanjutkan.'); }
      else { item.state = 'failed'; item.error = err.message; toast('Gagal mengirim: ' + err.message); text.value = text.value || t; }
    }
    sending = false; updateForm(); renderHistory(true); refreshQuota();
  });

  // ---------- riwayat: obrolan kronologis (lama di atas, baru di bawah), pemisah tanggal, kartu berkas
  const expanded = new Set();
  async function download(f, btn) {
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Mengunduh…';
    try {
      const blob = await api.downloadFile(f); const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = f.name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast('Berkas diunduh · hash SHA-256 cocok ✓');
    } catch (err) {
      if (err.code === 'UNAUTH') { closeCommand(); openGate(null, 'Sesi berakhir. Masuk lagi untuk melanjutkan.'); } else toast(err.message);
    }
    btn.disabled = false; btn.textContent = old;
  }
  function fileCard(f, canDl) {
    const st = f.status === 'ready' && f.expiresAt && f.expiresAt < Date.now() ? 'expired' : f.status;
    const c = el('div', 'fcard'); c.dataset.status = st; c.append(el('div', 'fi', fileIcon(f.name, f.type)));
    const b = el('div', 'fb'); const n = el('div', 'fn', f.name); n.title = f.name; const m = el('div', 'fs'); m.append(el('span', null, fmtSize(f.size)), el('span', 'chip f-' + st, FILE_ST[st] || st));
    if (f.warn || f.risky) m.appendChild(el('span', 'chip f-risk', '⚠ jenis berisiko')); b.append(n, m); c.appendChild(b);
    if (canDl && st === 'ready' && f.id) { const d = el('button', 'btn dl', '⬇ Unduh'); d.type = 'button'; d.setAttribute('aria-label', 'Unduh ' + f.name); d.addEventListener('click', () => download(f, d)); c.appendChild(d); }
    return c;
  }
  function bubble(m, own) {
    const wrap = el('li', 'cm ' + (own ? 'user' : 'bot') + (m.state === 'sending' ? ' pending' : '') + (m.state === 'failed' ? ' failed' : '')); wrap.dataset.id = m.id || m.key || '';
    const mh = el('div', 'mh');
    if (own) { mh.append(el('span', null, fmtWib(m.ts)), el('span', null, '→'), el('b', null, botById(m.botId).name)); const stt = m.state || m.status; mh.appendChild(el('span', 'chip st-' + stt, CMD_STATUS[stt] || (stt === 'sending' ? 'Mengirim…' : stt === 'failed' ? 'Gagal' : stt))); }
    else mh.append(el('b', null, botById(m.botId).name), el('span', null, fmtWib(m.ts)));
    if (m.sample) mh.appendChild(el('span', 'chip sample', 'CONTOH'));
    wrap.appendChild(mh);
    if (m.text) {
      const key = m.id || m.key, long = m.text.length > 700 || m.text.split('\n').length > 14, bb = el('div', 'bub' + (long && !expanded.has(key) ? ' clamp' : ''), m.text); wrap.appendChild(bb);
      if (long) { const mo = el('button', 'more', expanded.has(key) ? 'Ringkas' : 'Selengkapnya'); mo.type = 'button'; mo.addEventListener('click', () => { expanded.has(key) ? expanded.delete(key) : expanded.add(key); renderHistory(); }); wrap.appendChild(mo); }
    }
    if (m.files && m.files.length) { const fc = el('div', 'fcards'); m.files.forEach((f) => fc.appendChild(fileCard(f, own && m.state == null))); wrap.appendChild(fc); }
    if (m.state === 'failed') { const r = el('button', 'more', '⚠ ' + (m.error || 'Gagal') + ' — hapus dari daftar'); r.type = 'button'; r.addEventListener('click', () => { outbox = outbox.filter((o) => o !== m); renderHistory(); }); wrap.appendChild(r); }
    return wrap;
  }
  function renderHistory(stick) {
    const ul = $('cmdHistory'); const near = stick || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    ul.replaceChildren();
    const all = [...api.messages.values()].filter((m) => scope === 'all' || m.botId === sel.value).sort((a, b) => a.ts - b.ts || (a.role === 'user' ? -1 : 1)).slice(-120);
    const rows = [...all.map((m) => ({ m, own: m.role === 'user' })), ...outbox.filter((o) => scope === 'all' || o.botId === sel.value).map((o) => ({ m: o, own: true }))];
    let last = null;
    for (const { m, own } of rows) {
      const k = dayKey(m.ts); if (k !== last) { ul.appendChild(el('li', 'day-sep', fmtDayLabel(m.ts))); last = k; }
      ul.appendChild(bubble(m, own));
    }
    if (near) scroller.scrollTop = scroller.scrollHeight;
  }
  $('scopeAll').addEventListener('click', () => setScope('all')); $('scopeBot').addEventListener('click', () => setScope('bot'));
  function setScope(v) { scope = v; $('scopeAll').classList.toggle('on', v === 'all'); $('scopeBot').classList.toggle('on', v === 'bot'); $('scopeAll').setAttribute('aria-pressed', v === 'all'); $('scopeBot').setAttribute('aria-pressed', v === 'bot'); renderHistory(true); }
  // ---------- perluas / kecilkan
  function setWide(on) { cmdPanel.classList.toggle('wide', on); const b = $('cmdExpand'); b.textContent = on ? '⤡' : '⤢'; b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Kecilkan kotak perintah' : 'Perluas kotak perintah'); updateInset(); updateForm(); renderHistory(true); }
  $('cmdExpand').addEventListener('click', () => setWide(!cmdPanel.classList.contains('wide')));
  // ---------- papan ketik virtual (mobile): ikuti visualViewport agar kolom ketik tidak tertutup
  function syncViewport() {
    const vv = window.visualViewport; if (!vv) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px'); document.documentElement.style.setProperty('--kb', kb + 'px'); document.body.classList.toggle('kb-open', kb > 80 || vv.height < window.innerHeight * 0.75); autoGrow();
    if (kb > 80 && document.activeElement === text) setTimeout(() => { text.scrollIntoView({ block: 'nearest' }); }, 30);
    updateInset();
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
  window.addEventListener('resize', () => { if (cmdPanel.classList.contains('open')) autoGrow(); });
  // hook uji: meniru papan ketik virtual (Playwright tidak punya papan ketik nyata)
  function simulateKeyboard(px) {
    const vh = window.innerHeight, h = px ? vh - px : vh;
    document.documentElement.style.setProperty('--vvh', h + 'px'); document.documentElement.style.setProperty('--kb', px + 'px'); document.body.classList.toggle('kb-open', px > 80); autoGrow(); updateInset();
  }
  function openCommand(botId) {
    if (!api.isAuthed()) { openGate(botId); return; }
    if (botId) sel.value = botId; else if (selected) sel.value = selected;
    if (isMobile()) closeBot(false);
    cmdPanel.classList.add('open'); cmdPanel.setAttribute('aria-hidden', 'false');
    $('cmdLock').textContent = '🔓'; updateForm(); renderHistory(true); updateInset(); refreshQuota();
    if (!isMobile()) setTimeout(() => text.focus({ preventScroll: true }), 50);
  }
  function closeCommand(upd = true) { cmdPanel.classList.remove('open'); cmdPanel.setAttribute('aria-hidden', 'true'); if (upd) updateInset(); }
  $('cmdBtn').addEventListener('click', () => (cmdPanel.classList.contains('open') ? closeCommand() : openCommand()));
  $('cmdClose').addEventListener('click', () => closeCommand());
  $('cmdLockBtn').addEventListener('click', () => { closeCommand(); api.logout(); toast(isMock ? 'Kotak perintah dikunci kembali.' : 'Anda sudah keluar. Percakapan terkunci.'); });
  api.on('auth', ({ ok, reason }) => {
    $('cmdLock').textContent = ok ? '🔓' : '🔒';
    if (!ok) { clearBubbles(); closeCommand(); atts.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)); atts = []; outbox = []; renderTray(); if (reason === 'expired') { toast('Sesi berakhir. Masuk lagi untuk melihat percakapan.'); } }
    renderThread(); renderConn(); if (selected) renderBotPanel();
  });

  // ------------------------------------------------------------ gerbang sandi
  const gate = $('gate'), gatePw = $('gatePw'), gateErr = $('gateErr'), gateOk = gate.querySelector('button[type=submit]');
  let gateTarget = null, gateOpener = null, gateTimer = null;
  function gateMsg(msg) { gateErr.hidden = !msg; gateErr.textContent = msg || ''; }
  function openGate(botId, notice) {
    gateTarget = botId || null; gateOpener = document.activeElement; gatePw.value = ''; gateMsg(notice || ''); gate.hidden = false;
    setTimeout(() => gatePw.focus({ preventScroll: true }), 30);
  }
  function closeGate() { gate.hidden = true; clearInterval(gateTimer); gateOk.disabled = false; gatePw.value = ''; if (gateOpener && gateOpener.focus) try { gateOpener.focus(); } catch { /* */ } }
  $('gateCancel').addEventListener('click', closeGate);
  gate.addEventListener('mousedown', (e) => { if (e.target === gate) closeGate(); });
  function lockout(sec) {            // tombol dinonaktifkan selama hitung mundur Retry-After
    clearInterval(gateTimer); let left = Math.max(1, sec); gateOk.disabled = true;
    const tick = () => { if (left <= 0) { clearInterval(gateTimer); gateOk.disabled = false; gateMsg(''); return; } gateMsg(`Terlalu banyak percobaan. Coba lagi dalam ${left} detik.`); left--; };
    tick(); gateTimer = setInterval(tick, 1000);
  }
  $('gateForm').addEventListener('submit', async (e) => {
    e.preventDefault(); if (gateOk.disabled) return; gateOk.disabled = true; gateMsg('');
    try {
      await api.login(gatePw.value); gatePw.value = ''; gate.hidden = true; clearInterval(gateTimer); gateOk.disabled = false; openCommand(gateTarget);
    } catch (err) {
      gateOk.disabled = false;
      if (err.code === 'RATE') lockout(err.retryAfter || 30);
      else if (err.code === 'NETWORK') gateMsg('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
      else if (err.code === 'BADPW') gateMsg('Kata sandi salah.');
      else gateMsg(err.message || 'Gagal masuk.');
      gatePw.select();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!gate.hidden) closeGate(); else if (cmdPanel.classList.contains('open')) closeCommand(); else closeBot();
  });

  // --------------------------------------------------- indikator koneksi (mode worker)
  let conn = { ok: null, lastSync: null, errors: 0 };
  function renderConn() {
    const c = $('conn'); if (!c) return;
    const t = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let cls, txt;
    if (isMock) { cls = 'mock'; txt = config.fallbackMock ? 'Mode contoh · backend belum dikonfigurasi' : 'Mode contoh (tanpa server)'; }
    else if (conn.ok === null) { cls = 'wait'; txt = 'Menyambung…'; }
    else if (conn.ok) { cls = 'ok'; txt = `Terhubung · sinkron ${t(conn.lastSync)}`; }
    else { cls = 'bad'; txt = conn.code === 'HTTP' ? 'Server bermasalah · mencoba lagi…' : 'Terputus · mencoba lagi…'; if (conn.lastSync) txt += ` (terakhir ${t(conn.lastSync)})`; }
    c.className = 'conn ' + cls; c.dataset.state = cls;
    c.replaceChildren(el('span', 'cd'), el('span', null, txt), el('span', 'cl', api.isAuthed() ? '🔓 masuk' : '🔒 terkunci'));
  }
  api.on('online', (o) => { conn = o; renderConn(); });
  renderConn();

  // ------------------------------------------------------------------ toast
  let toastT = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }

  // ------------------------------------------------- inset kamera (ruang tertutup panel)
  // Area layar yang tertutup UI: toolbar (atas), legenda/bottom sheet (bawah), panel (kiri/kanan di desktop).
  // Kamera memakai angka ini agar bot yang difokus tampil utuh & tidak tertutup panel.
  function updateInset() {
    const mob = isMobile(); const open = (p) => p.classList.contains('open');
    document.body.classList.toggle('sheet-open', mob && (open(botPanel) || open(cmdPanel)));
    const vh = window.innerHeight;
    const top = Math.ceil($('toolbar').getBoundingClientRect().bottom + 6);
    const lg = $('legend').getBoundingClientRect(); const legendH = lg.height ? vh - lg.top + 6 : 0;
    if (mob) {
      const p = open(botPanel) ? botPanel : open(cmdPanel) ? cmdPanel : null;
      scene.setInset({ top, bottom: p ? Math.min(vh * 0.52, p.offsetHeight) + 6 : legendH });
    } else {
      scene.setInset({ top, bottom: legendH, right: open(botPanel) ? botPanel.offsetWidth + 24 : 0, left: open(cmdPanel) ? Math.min(cmdPanel.offsetWidth + 24, window.innerWidth * 0.55) : 0 });
    }
  }
  window.addEventListener('resize', updateInset);

  // ----------------------------------------------------------- event API -> UI
  function applyState() {
    const counts = { working: 0, done: 0, standby: 0, unmonitored: 0 };
    BOTS.forEach((b) => {
      const st = (api.bots[b.id] || {}).status || 'unmonitored'; counts[st]++;
      scene.setStatus(b.id, st);
    });
    STATUS_ORDER.forEach((k) => { legendN[k].textContent = counts[k]; });
    refreshLabels();
    if (selected) renderBotPanel();
    if (cmdPanel.classList.contains('open')) updateForm();
  }
  api.on('state', applyState);
  api.on('messages', ({ changed, fresh, initial, cleared }) => {
    if (cleared) { renderThread(); if (cmdPanel.classList.contains('open')) renderHistory(); return; }
    if (initial) fresh.forEach((m) => shownBubbles.add(m.id));
    else fresh.forEach((m) => showBubble(m));
    if (selected && changed.some((m) => m.botId === selected)) renderThread();
    if (cmdPanel.classList.contains('open')) renderHistory();
  });

  return {
    onFrame, selectBot, closeBot, showView, openCommand, closeCommand, openGate, closeGate, toast, showBubble, updateInset,
    setBubbleMs: (ms) => { bubbleMs = ms; },
    clearBubbles,
    get selected() { return selected; },
    get commandOpen() { return cmdPanel.classList.contains('open'); },
    get gateOpen() { return !gate.hidden; },
    applyState,
    simulateKeyboard, addFiles, setWide, get attachments() { return atts.map((a) => ({ name: a.name, size: a.size, state: a.state, progress: a.progress, id: a.id, error: a.error })); },
  };
}
