// Satu-satunya berkas konfigurasi klien. Aman dipublikasikan: TIDAK boleh berisi kata sandi/token/secret.
export const CONFIG = {
  // 'worker' = produksi: bicara dengan Cloudflare Worker (login sungguhan, data nyata dari Vision).
  // 'mock'   = pratinjau/screenshot tanpa backend (data & balasan SIMULASI, gerbang sandi tiruan).
  // Bila mode 'worker' tetapi workerUrl kosong, klien otomatis jatuh ke 'mock' (lihat bagian bawah).
  mode: 'worker',
  workerUrl: 'https://kantor3d-api.dnp-gis.workers.dev',   // Worker live (Cloudflare, akun DNP) — URL publik, bukan rahasia
  pollMs: 15000,            // interval polling mode 'worker' (≈15 detik; jeda saat tab tersembunyi; backoff saat error)
  maxBackoffMs: 120000,     // batas atas backoff saat server tak terjangkau
  mockPollMs: 1000,         // polling mock dipercepat agar demo terasa hidup

  bubbleMs: 14000,          // gelembung balasan memudar otomatis setelah ... ms
  maxCommandLen: 4000,      // batas panjang perintah (klien; Worker memvalidasi ulang: 4000)
  maxFileBytes: 20 * 1048576, // batas satu berkas (Worker memvalidasi ulang)
  maxFilesPerMessage: 10,   // lampiran per pesan
  mockUploadStepMs: 140,    // (mock) kecepatan simulasi unggah
  lockConversations: true,  // true = percakapan, riwayat & gelembung hanya diambil/ditampilkan setelah login

  // Hanya mode 'mock': gerbang sandi TIRUAN menerima input apa saja. Tidak ada kata sandi di sisi klien.
  mockGateAcceptsAnything: true,
  mockQueueDelayMs: [2500, 4000],   // (mock) menunggu -> diproses
  mockWorkDelayMs: [3500, 5500],    // (mock) diproses -> dijawab

  sessionKey: 'kantor3d.session',   // kunci sessionStorage untuk TOKEN SESI (bukan kata sandi)
  maxPixelRatio: 1.75,
  label: 'PROTOTIPE · DATA CONTOH', // hanya tampil di mode mock
};

// ---- Override lewat query string (pratinjau/uji) ----
// ?mode=mock            : boleh di mana saja (mock tidak mengirim apa pun ke luar).
// ?worker=<url> &poll=<ms> &lock=0 : HANYA di localhost/127.0.0.1 (mencegah tautan jahat mengarahkan form sandi ke server lain).
{
  const q = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (q.get('mode') === 'mock') CONFIG.mode = 'mock';
  if (local) {
    if (q.get('mode') === 'worker') CONFIG.mode = 'worker';
    const w = q.get('worker'); if (w && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(w)) CONFIG.workerUrl = w;
    const p = Number(q.get('poll')); if (p >= 500) CONFIG.pollMs = p;
  }
  if (CONFIG.mode === 'worker' && !CONFIG.workerUrl) { CONFIG.mode = 'mock'; CONFIG.fallbackMock = true; }   // belum dikonfigurasi => pratinjau
  if (CONFIG.mode === 'mock' && local && q.get('lock') === '0') CONFIG.lockConversations = false;          // hanya untuk screenshot desain
}
