// UI (DOM): label & gelembung terproyeksi, panel bot, kotak perintah, gerbang sandi, legenda.
// SEMUA teks dinamis dirender dengan textContent (bukan innerHTML) — mencegah XSS dari isi pesan.
import { STATUS, STATUS_ORDER, TEAMS, BOTS, botById, SAMPLE_TASKS } from './data.js';

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
      d.append(meta, el('div', null, m.text)); box.appendChild(d);
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
  const text = $('cmdText'), send = $('cmdSend');
  text.maxLength = config.maxCommandLen;
  function updateForm() {
    const n = text.value.length; $('cmdCount').textContent = `${n}/${config.maxCommandLen}`; send.disabled = !text.value.trim();
    const st = api.bots[sel.value]; const w = $('cmdWarn');
    if (st && st.status === 'unmonitored') { w.hidden = false; w.textContent = '⚠ Bot ini belum dipantau (belum ada heartbeat): perintah akan tetap menunggu di antrean sampai bot aktif.'; } else w.hidden = true;
  }
  text.addEventListener('input', updateForm); sel.addEventListener('change', updateForm);
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('cmdForm').requestSubmit(); } });
  $('cmdForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = text.value.trim(); if (!t) return;
    send.disabled = true;
    try {
      await api.sendCommand(sel.value, t); text.value = ''; updateForm();
      toast(isMock ? 'Perintah masuk antrean (SIMULASI lokal).' : 'Perintah terkirim · menunggu diproses Vision.');
      $('cmdHistory').scrollTop = 0;
    } catch (err) {
      if (err.code === 'UNAUTH') { closeCommand(); openGate(null, 'Sesi berakhir. Masuk lagi untuk melanjutkan.'); } else toast('Gagal mengirim: ' + err.message);
      updateForm();
    }
  });
  function renderHistory() {
    const ul = $('cmdHistory'); ul.replaceChildren();
    api.allCommands().slice(0, 30).forEach((m) => {
      const li = el('li'); li.tabIndex = 0;
      const hh = el('div', 'hh'); hh.append(el('span', null, fmtTime(m.ts)), el('span', null, '→'), el('b', null, botById(m.botId).name), el('span', 'chip st-' + m.status, CMD_STATUS[m.status] || m.status));
      if (m.sample) hh.appendChild(el('span', 'chip sample', 'CONTOH'));
      li.append(hh, el('div', 'ht', m.text));
      const rep = [...api.messages.values()].find((r) => r.replyTo === m.id);
      if (rep) li.appendChild(el('div', 'hr', '↳ ' + rep.text));
      const go = () => selectBot(m.botId); li.addEventListener('click', go); li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      ul.appendChild(li);
    });
  }
  function openCommand(botId) {
    if (!api.isAuthed()) { openGate(botId); return; }
    if (botId) sel.value = botId; else if (selected) sel.value = selected;
    if (isMobile()) closeBot(false);
    cmdPanel.classList.add('open'); cmdPanel.setAttribute('aria-hidden', 'false');
    $('cmdLock').textContent = '🔓'; updateForm(); renderHistory(); updateInset();
    if (!isMobile()) setTimeout(() => text.focus({ preventScroll: true }), 50);
  }
  function closeCommand(upd = true) { cmdPanel.classList.remove('open'); cmdPanel.setAttribute('aria-hidden', 'true'); if (upd) updateInset(); }
  $('cmdBtn').addEventListener('click', () => (cmdPanel.classList.contains('open') ? closeCommand() : openCommand()));
  $('cmdClose').addEventListener('click', () => closeCommand());
  $('cmdLockBtn').addEventListener('click', () => { closeCommand(); api.logout(); toast(isMock ? 'Kotak perintah dikunci kembali.' : 'Anda sudah keluar. Percakapan terkunci.'); });
  api.on('auth', ({ ok, reason }) => {
    $('cmdLock').textContent = ok ? '🔓' : '🔒';
    if (!ok) { clearBubbles(); closeCommand(); if (reason === 'expired') { toast('Sesi berakhir. Masuk lagi untuk melihat percakapan.'); } }
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
      scene.setInset({ top, bottom: legendH, right: open(botPanel) ? botPanel.offsetWidth + 24 : 0, left: open(cmdPanel) ? cmdPanel.offsetWidth + 24 : 0 });
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
  };
}
