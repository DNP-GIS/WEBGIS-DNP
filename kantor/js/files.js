// Pembantu berkas (klien). Tidak ada eksekusi/render isi berkas: semua berkas diperlakukan sebagai byte buram.
export const MiB = 1048576;
export const RISKY_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'psm1', 'jar', 'apk', 'dmg', 'app', 'sh', 'hta', 'html', 'htm', 'xhtml', 'svg', 'lnk', 'reg', 'dll', 'iso', 'scf']);
export const PREVIEW_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);     // svg SENGAJA tidak ada
export const extOf = (n) => { const d = String(n).lastIndexOf('.'); return d > 0 ? String(n).slice(d + 1).toLowerCase() : ''; };
export const isRisky = (n) => RISKY_EXT.has(extOf(n));
export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < MiB) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  return (b / MiB).toFixed(b < 10 * MiB ? 2 : 1) + ' MiB';
}
export async function sha256Hex(blob) {
  if (!(globalThis.crypto && crypto.subtle)) { const e = new Error('Peramban ini tidak mendukung pengamanan berkas (butuh HTTPS).'); e.code = 'NOCRYPTO'; throw e; }
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const WIB = { timeZone: 'Asia/Jakarta' };
export const fmtWib = (ts) => new Date(ts).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' }).replace(/\./g, '.') + ' WIB';
export function fmtDayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const k = (x) => x.toLocaleDateString('en-CA', WIB);
  if (k(d) === k(now)) return 'Hari ini';
  if (k(d) === k(new Date(now.getTime() - 86400000))) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { ...WIB, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA', WIB);
