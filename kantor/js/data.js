// DATA & DEFINISI. Semua isi bagian "CONTOH" adalah SIMULASI — bukan data operasional nyata.
// Pemisahan: berkas ini tidak menyentuh DOM/THREE.

export const STATUS = {
  working:     { id: 'working',     label: 'Sedang bekerja',  color: '#22c55e', hint: 'Bot sedang memproses tugas/perintah.' },
  done:        { id: 'done',        label: 'Selesai',         color: '#3b82f6', hint: 'Tugas terakhir sudah selesai.' },
  standby:     { id: 'standby',     label: 'Siaga',           color: '#f59e0b', hint: 'Aktif (ada heartbeat) dan menunggu tugas.' },
  unmonitored: { id: 'unmonitored', label: 'Belum dipantau',  color: '#94a3b8', hint: 'Belum punya heartbeat — status tidak diketahui.' },
};
export const STATUS_ORDER = ['working', 'done', 'standby', 'unmonitored'];

export const TEAMS = {
  vision: { id: 'vision', name: 'Tim Vision', areaLabel: 'TIM VISION', rug: '#5fb3c4', accent: '#0e7490' },
  jarvis: { id: 'jarvis', name: 'Tim Jarvis', areaLabel: 'TIM JARVIS', rug: '#a58be0', accent: '#6d28d9' },
};

// Karakter chibi/voxel: tiap bot punya warna kulit/rambut/baju unik + ciri (rambut, kacamata, lencana orkestrator).
// lead = orkestrator (meja utama, paling menonjol). slot = urutan meja anggota tim.
export const BOTS = [
  { id: 'vision',     name: 'Vision',     role: 'Orkestrator (GIS Orchestrator)', short: 'Orkestrator',                team: 'vision', lead: true, color: '#0e7490', look: { skin: '#f1c9a5', hair: '#1f2937', shirt: '#0e7490', style: 'short', badge: true } },
  { id: 'atlas',      name: 'Atlas',      role: 'GIS Data Analyst',               short: 'GIS Data Analyst',           team: 'vision', slot: 0,    color: '#4f46e5', look: { skin: '#e3ac84', hair: '#3b2a20', shirt: '#4f46e5', style: 'short', glasses: true } },
  { id: 'meridian',   name: 'Meridian',   role: 'Web GIS Developer',              short: 'Web GIS Developer',          team: 'vision', slot: 1,    color: '#db2777', look: { skin: '#f3d2b3', hair: '#7c2d12', shirt: '#db2777', style: 'long' } },
  { id: 'forge',      name: 'Forge',      role: 'Automation & Scripting',         short: 'Automation & Scripting',     team: 'vision', slot: 2,    color: '#ea580c', look: { skin: '#c68a62', hair: '#111827', shirt: '#ea580c', style: 'cap', cap: '#f59e0b' } },
  { id: 'terra',      name: 'Terra',      role: 'Plantation Layout Designer',     short: 'Plantation Layout Designer', team: 'vision', slot: 3,    color: '#4d7c0f', look: { skin: '#8d5a3b', hair: '#0b0f19', shirt: '#4d7c0f', style: 'bun' } },
  { id: 'jarvis-gis', name: 'Jarvis-GIS', role: 'Orkestrator (GIS Orchestrator)', short: 'Orkestrator',                team: 'jarvis', lead: true, color: '#6d28d9', look: { skin: '#f1c9a5', hair: '#6b7280', shirt: '#6d28d9', style: 'short', badge: true, glasses: true } },
  { id: 'ultron',     name: 'Ultron',     role: 'GIS Data Analyst',               short: 'GIS Data Analyst',           team: 'jarvis', slot: 0,    color: '#0369a1', look: { skin: '#d9a47c', hair: '#92400e', shirt: '#0369a1', style: 'short' } },
  { id: 'meridian-j', name: 'Meridian-J', role: 'Web GIS Developer',              short: 'Web GIS Developer',          team: 'jarvis', slot: 1,    color: '#be185d', look: { skin: '#f3d2b3', hair: '#1f2937', shirt: '#be185d', style: 'long' } },
  { id: 'forge-j',    name: 'Forge-J',    role: 'Automation & Scripting',         short: 'Automation & Scripting',     team: 'jarvis', slot: 2,    color: '#c2410c', look: { skin: '#e3ac84', hair: '#111827', shirt: '#c2410c', style: 'cap', cap: '#38bdf8' } },
];
export const botById = (id) => BOTS.find((b) => b.id === id);

// ---------- TATA LETAK SATU LANTAI (satuan dunia ≈ meter; x kanan, z ke arah kamera, y atas) ----------
// Lantai: x -15..15, z -9..9. Dinding belakang (z=-9) & kanan (x=15) tinggi berjendela; dinding depan & kiri RENDAH.
// Kamera default isometrik dari sisi (-x,+z). Karakter tim duduk menghadap monitor (membelakangi kamera),
// orkestrator duduk di "kepala" area menghadap tim & kamera.
export const FLOOR = { x0: -15, x1: 15, z0: -9, z1: 9 };
export const HUB_Z = 1.3;     // koridor jalan utama (jalur waypoints)
export const AREAS = [
  { id: 'vision',  label: 'TIM VISION',  pos: [-9, 0.05, -0.2], aabb: [-15, -9, -3, 1.6],  color: '#0e7490' },
  { id: 'meeting', label: 'RUANG RAPAT', pos: [0, 0.05, -0.2],  aabb: [-3, -9, 3, -0.6],   color: '#475569' },
  { id: 'jarvis',  label: 'TIM JARVIS',  pos: [9, 0.05, -0.2],  aabb: [3, -9, 15, 1.6],    color: '#6d28d9' },
  { id: 'lounge',  label: 'LOUNGE',      pos: [-9.5, 0.05, 8.1], aabb: [-15, 1.8, -5, 9],  color: '#b45309' },
  { id: 'pantry',  label: 'PANTRY',      pos: [10.5, 0.05, 8.3], aabb: [6.5, 1.8, 15, 9],  color: '#b45309' },
];
// Posisi rumah tiap bot. desk=[x,z], seat=[x,z], face: sudut hadap karakter (rad, 0 = +z/ke kamera, π = -z/ke jendela), lane = x lorong keluar.
const TEAM_X = { vision: [-13.05, -10.35, -7.65, -4.95], jarvis: [5.7, 9.0, 12.3] };
const TEAM_LANE = { vision: [-11.7, -11.7, -6.3, -6.3], jarvis: [7.35, 10.65, 10.65] };
const LEAD_X = { vision: -9, jarvis: 9 }, LEAD_LANE = { vision: -11.7, jarvis: 7.35 };
export function homeOf(bot) {
  if (bot.lead) { const x = LEAD_X[bot.team]; return { desk: [x, -6.75], seat: [x, -7.7], face: 0, lane: LEAD_LANE[bot.team], deskW: 3.0, deskD: 1.2 }; }
  const x = TEAM_X[bot.team][bot.slot];
  return { desk: [x, -3.2], seat: [x, -2.25], face: Math.PI, lane: TEAM_LANE[bot.team][bot.slot], deskW: 2.0, deskD: 0.9 };
}
// Tujuan jalan-jalan bot berstatus selesai/siaga. via = titik antara dari koridor (x, HUB_Z). pose: 'stand' | 'drink' | 'sit'.
export const DESTINATIONS = [
  { id: 'pantry-kopi',  label: 'Pantry (mesin kopi)', pos: [13.2, 4.2], face: Math.PI / 2,  pose: 'drink', via: [[13.2, HUB_Z]] },
  { id: 'pantry-kulkas', label: 'Pantry (kulkas)',    pos: [13.2, 7.6], face: Math.PI / 2,  pose: 'stand', via: [[11.6, HUB_Z], [11.6, 7.6]] },
  { id: 'pantry-meja',  label: 'Pantry (meja)',       pos: [10.0, 6.3], face: -Math.PI / 2, pose: 'sit', seatH: 0.5, via: [[8.4, HUB_Z], [8.4, 6.3]] },
  { id: 'lounge-sofa-1', label: 'Lounge (sofa)',      pos: [-11.2, 3.9], face: 0,           pose: 'sit', seatH: 0.36, via: [[-6.3, HUB_Z], [-6.3, 5.4], [-11.2, 5.4]] },
  { id: 'lounge-sofa-2', label: 'Lounge (sofa)',      pos: [-9.7, 3.9], face: 0,            pose: 'sit', seatH: 0.36, via: [[-6.3, HUB_Z], [-6.3, 5.4], [-9.7, 5.4]] },
  { id: 'lounge-kursi',  label: 'Lounge (kursi)',     pos: [-7.5, 6.8], face: -Math.PI / 2, pose: 'sit', seatH: 0.36, via: [[-6.3, HUB_Z], [-6.3, 6.8]] },
  { id: 'rapat-1', label: 'Ruang rapat', pos: [-1.2, -3.95], face: Math.PI, pose: 'sit', seatH: 0.3, via: [[0, HUB_Z], [0, -2.0], [-1.2, -2.8]] },
  { id: 'rapat-2', label: 'Ruang rapat', pos: [0.2, -3.95],  face: Math.PI, pose: 'sit', seatH: 0.3, via: [[0, HUB_Z], [0, -2.0], [0.2, -2.8]] },
  { id: 'rapat-3', label: 'Ruang rapat', pos: [1.4, -3.95],  face: Math.PI, pose: 'sit', seatH: 0.3, via: [[0, HUB_Z], [0, -2.0], [1.4, -2.8]] },
  { id: 'rapat-4', label: 'Ruang rapat', pos: [-1.0, -6.45], face: 0, pose: 'sit', seatH: 0.3, via: [[0, HUB_Z], [0, -2.0], [2.3, -2.6], [2.3, -6.45]] },
];

// ---------- DATA CONTOH (simulasi) ----------
const now = () => Date.now();
const min = (n) => n * 60 * 1000;

// Status awal contoh. heartbeatAt:null = belum punya heartbeat => 'belum dipantau'.
export function seedState() {
  const t = now();
  return {
    sample: true,
    bots: {
      'vision':     { status: 'working',     task: 0, updatedAt: t - min(2),  heartbeatAt: t - min(1) },
      'atlas':      { status: 'done',        task: 0, updatedAt: t - min(11), heartbeatAt: t - min(1) },
      'meridian':   { status: 'working',     task: 0, updatedAt: t - min(4),  heartbeatAt: t - min(1) },
      'forge':      { status: 'standby',     task: 0, updatedAt: t - min(30), heartbeatAt: t - min(2) },
      'terra':      { status: 'standby',     task: 0, updatedAt: t - min(45), heartbeatAt: t - min(2) },
      'jarvis-gis': { status: 'standby',     task: 0, updatedAt: t - min(20), heartbeatAt: t - min(3) },
      'ultron':     { status: 'done',        task: 0, updatedAt: t - min(8),  heartbeatAt: t - min(3) },
      'meridian-j': { status: 'unmonitored', task: 0, updatedAt: 0,           heartbeatAt: null },
      'forge-j':    { status: 'unmonitored', task: 0, updatedAt: 0,           heartbeatAt: null },
    },
  };
}

// Ringkasan tugas CONTOH per bot (generik, sengaja tanpa angka/nama blok nyata).
export const SAMPLE_TASKS = {
  'vision':     ['Contoh: membagi permintaan ke anggota tim', 'Contoh: memantau kemajuan tugas tim', 'Contoh: menyusun ringkasan untuk Pak Dwi'],
  'atlas':      ['Contoh: memeriksa kerapian layer data', 'Contoh: menyiapkan tabel ringkasan atribut', 'Contoh: validasi sistem koordinat'],
  'meridian':   ['Contoh: merapikan tampilan peta web', 'Contoh: menambah popup pada layer', 'Contoh: menguji tampilan di ponsel'],
  'forge':      ['Contoh: merapikan skrip konversi data', 'Contoh: menjadwalkan tugas otomatis', 'Contoh: membuat laporan log skrip'],
  'terra':      ['Contoh: menyusun draf tata letak blok', 'Contoh: memeriksa konsistensi penomoran', 'Contoh: menyiapkan sketsa jalan akses'],
  'jarvis-gis': ['Contoh: membagi permintaan ke anggota tim', 'Contoh: memantau kemajuan tugas tim', 'Contoh: menyusun ringkasan untuk Pak Dwi'],
  'ultron':     ['Contoh: memeriksa kerapian layer data', 'Contoh: membersihkan atribut ganda', 'Contoh: validasi sistem koordinat'],
  'meridian-j': ['Contoh: merapikan tampilan peta web', 'Contoh: menambah legenda peta', 'Contoh: menguji tampilan di ponsel'],
  'forge-j':    ['Contoh: merapikan skrip konversi data', 'Contoh: menjadwalkan tugas otomatis', 'Contoh: membuat laporan log skrip'],
};

// Balasan CONTOH (dipilih acak oleh MockAdapter). Selalu menegaskan bahwa ini simulasi.
export const SAMPLE_REPLIES = [
  'Contoh balasan: perintah diterima dan sudah dikerjakan. Ini jawaban SIMULASI, bukan hasil kerja nyata.',
  'Contoh balasan: ringkasan sudah disiapkan. (Teks ini hanya demonstrasi tampilan gelembung chat.)',
  'Contoh balasan: tugas selesai, tidak ada kendala. Catatan: ini data contoh prototipe.',
  'Contoh balasan: saya butuh sedikit klarifikasi sebelum lanjut. (Simulasi — tidak ada permintaan nyata.)',
];

// Riwayat awal CONTOH: [botId, perintah, balasan, menit lalu]
export function seedMessages() {
  const t = now();
  const rows = [
    ['meridian', 'Contoh perintah: tampilkan ringkasan status peta.',            'Contoh balasan: ringkasan status contoh sudah siap (data contoh).',               38],
    ['atlas',    'Contoh perintah: periksa kerapian layer data.',                'Contoh balasan: pemeriksaan contoh selesai, tidak ada temuan (data contoh).',     26],
    ['vision',   'Contoh perintah: rangkum kemajuan tim hari ini.',              'Contoh balasan: ringkasan kemajuan tim contoh sedang disusun (data contoh).',     14],
  ];
  const out = [];
  rows.forEach(([botId, cmd, rep, ago], i) => {
    const tc = t - min(ago), tr = tc + 40 * 1000;
    out.push({ id: `seed-u${i}`, botId, role: 'user', text: cmd, ts: tc, updatedAt: tr, status: 'answered', sample: true });
    out.push({ id: `seed-b${i}`, botId, role: 'bot', text: rep, ts: tr, updatedAt: tr, sample: true, replyTo: `seed-u${i}` });
  });
  return out;
}
