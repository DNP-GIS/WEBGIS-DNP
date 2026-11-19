// SCENE 3D (Three.js) — satu lantai kantor isometrik ala maket/diorama, karakter chibi/voxel.
// Tidak tahu apa pun tentang panel DOM/API; hanya menerima data bot + callback.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATUS, TEAMS, BOTS, AREAS, FLOOR, HUB_Z, DESTINATIONS, homeOf } from './data.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const rad = THREE.MathUtils.degToRad;

// ------------------------------------------------------------------ util geometri/material (dibagi pakai)
const UB = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
const M = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...o }));
  return matCache.get(k);
};
function B(parent, w, h, d, color, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(UB, typeof color === 'string' ? M(color) : color);
  m.scale.set(w, h, d); m.position.set(x, y, z); if (o && o.ry) m.rotation.y = o.ry; parent.add(m); return m;
}
function cyl(parent, rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? M(color) : color); m.position.set(x, y, z); parent.add(m); return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { c, ctx, tex, redraw: (fn) => { ctx.clearRect(0, 0, w, h); fn(ctx, w, h); tex.needsUpdate = true; } };
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

// ------------------------------------------------------------------ tekstur prosedural
function woodTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    const r = mulberry32(7), rows = 8, ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 160;
      while (x < w) {
        const len = 120 + r() * 160, l = 58 + r() * 8 + (i % 2) * 2, hue = 31 + r() * 6;
        ctx.fillStyle = `hsl(${hue} ${46 + r() * 8}% ${l - 2}%)`; ctx.fillRect(x, i * ph, len, ph);
        ctx.strokeStyle = 'rgba(90,50,20,.22)'; ctx.lineWidth = 2; ctx.strokeRect(x, i * ph, len, ph);
        ctx.strokeStyle = 'rgba(120,70,30,.10)'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const yy = i * ph + 8 + r() * (ph - 16); ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + len - 4, yy + (r() - .5) * 4); ctx.stroke(); }
        x += len;
      }
    }
  });
}
function skyTexture() {
  return canvasTex(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7fc4ee'); g.addColorStop(0.7, '#cfeaf8'); g.addColorStop(1, '#f4efe0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; [[80, 60, 70], [260, 40, 90], [400, 80, 60]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.32, 0, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#9db8cc'; const r = mulberry32(3); let x = 0; while (x < w) { const bw = 18 + r() * 30, bh = 20 + r() * 60; ctx.fillRect(x, h - bh, bw, bh); x += bw + 2; }
  }).tex;
}
function haloTexture() {
  return canvasTex(128, 128, (ctx, w, h) => { const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }).tex;
}
function blobTexture() {
  return canvasTex(64, 64, (ctx, w, h) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(40,25,10,.38)'); g.addColorStop(1, 'rgba(40,25,10,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }).tex;
}
// layar monitor: mati / siaga / bekerja (3 bingkai kode) / selesai
function screenTextures() {
  const mk = (draw) => canvasTex(128, 80, draw).tex;
  const off = mk((c, w, h) => { c.fillStyle = '#1f2937'; c.fillRect(0, 0, w, h); });
  const idle = mk((c, w, h) => { c.fillStyle = '#1e3a5f'; c.fillRect(0, 0, w, h); c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(w / 2, h / 2, 12, 0, 7); c.fill(); });
  const work = [0, 1, 2].map((f) => mk((c, w, h) => {
    c.fillStyle = '#0f2a1f'; c.fillRect(0, 0, w, h); const r = mulberry32(11 + f * 5);
    for (let i = 0; i < 8; i++) { c.fillStyle = ['#4ade80', '#86efac', '#38bdf8', '#fde68a'][Math.floor(r() * 4)]; c.fillRect(8 + r() * 14, 8 + i * 8.5, 20 + r() * 80, 4); }
  }));
  const done = mk((c, w, h) => { c.fillStyle = '#10243f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#60a5fa'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(42, 42); c.lineTo(58, 58); c.lineTo(90, 24); c.stroke(); });
  return { off, idle, work, done };
}
function bookTexture() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, w, h); const r = mulberry32(21);
    for (let s = 0; s < 4; s++) {
      const y0 = s * 64 + 6; ctx.fillStyle = '#5b3a1e'; ctx.fillRect(0, y0 + 54, w, 6);
      let x = 6; while (x < w - 10) { const bw = 10 + r() * 10, bh = 34 + r() * 18; ctx.fillStyle = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#f1f5f9', '#ec4899'][Math.floor(r() * 7)]; ctx.fillRect(x, y0 + 54 - bh, bw, bh); x += bw + 1; }
    }
  }).tex;
}
function boardTexture(title) {
  return canvasTex(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#b45309'; ctx.font = `800 34px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(title, 24, 52);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(30, 150); ctx.lineTo(180, 110); ctx.lineTo(300, 170); ctx.lineTo(470, 100); ctx.stroke();
    ctx.fillStyle = '#ef4444'; for (let i = 0; i < 4; i++) { ctx.fillRect(40 + i * 60, 230, 40, 14); ctx.fillRect(40 + i * 60, 256, 28, 14); }
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(400, 250, 34, 0, 7); ctx.fill();
  }).tex;
}

// ------------------------------------------------------------------ papan nama meja (CanvasTexture)
function drawPlate(ctx, w, h, bot, status) {
  rrect(ctx, 4, 4, w - 8, h - 8, 24); ctx.fillStyle = '#0f172a'; ctx.fill();
  rrect(ctx, 4, 4, 22, h - 8, 11); ctx.fillStyle = bot.color; ctx.fill();
  ctx.fillStyle = '#f8fafc'; ctx.textBaseline = 'alphabetic'; let s = 92; ctx.font = `800 ${s}px ${FONT}`; while (ctx.measureText(bot.name).width > w - 90 && s > 30) { s -= 4; ctx.font = `800 ${s}px ${FONT}`; }
  ctx.fillText(bot.name, 50, 100);
  ctx.fillStyle = '#cbd5e1'; s = 44; ctx.font = `500 ${s}px ${FONT}`; while (ctx.measureText(bot.role).width > w - 90 && s > 22) { s -= 2; ctx.font = `500 ${s}px ${FONT}`; }
  ctx.fillText(bot.role, 50, 160);
  ctx.fillStyle = STATUS[status].color; ctx.beginPath(); ctx.arc(66, 212, 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#e2e8f0'; ctx.font = `600 38px ${FONT}`; ctx.fillText(STATUS[status].label, 92, 226);
}

// ================================================================== createScene
export function createScene({ container, bots, config, onPick, onFrame, onReady }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxPixelRatio || 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;      // tanpa shadow map (ringan); blob shadow palsu saja
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe6f2');
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
  scene.add(new THREE.HemisphereLight('#fff6e6', '#b9a888', 1.2));
  const sun = new THREE.DirectionalLight('#fff0d4', 1.45); sun.position.set(-14, 26, 16); scene.add(sun);

  const haloTex = haloTexture(), blobTex = blobTexture(), screens = screenTextures();
  const world = new THREE.Group(); scene.add(world);
  const tallWalls = { back: new THREE.Group(), right: new THREE.Group() }; world.add(tallWalls.back, tallWalls.right);
  const W = FLOOR.x1 - FLOOR.x0, D = FLOOR.z1 - FLOOR.z0;

  // ------------------------------------------------------------- luar gedung: rumput, jalan, pohon, alas maket
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M('#86b86a')); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.62; world.add(grass);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 5), M('#4b5058')); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.6, 19); world.add(road);
  for (let x = -60; x < 60; x += 4) B(world, 1.8, 0.01, 0.16, '#f1f5f9', x, -0.585, 19);
  B(world, 400, 0.05, 1.2, '#cbd0d6', 0, -0.6, 15.2);     // trotoar
  B(world, W + 1.4, 0.62, D + 1.4, '#efe6d2', 0, -0.31, 0);     // alas maket
  B(world, W + 1.8, 0.12, D + 1.8, '#d8ccb2', 0, -0.62, 0);
  function tree(x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, -0.6, z); world.add(g);
    B(g, 0.45 * s, 1.6 * s, 0.45 * s, '#7a5230', 0, 0.8 * s, 0);
    const leaf = (sz, y, dx, dz, c) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(sz * s, 0), M(c, { flatShading: true })); m.position.set(dx * s, y * s, dz * s); g.add(m); };
    leaf(1.25, 2.4, 0, 0, '#4c9a4a'); leaf(0.95, 3.3, 0.2, -0.1, '#5cae52'); leaf(0.8, 2.1, 0.9, 0.5, '#3f8a43');
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * s, 3.4 * s), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); bl.rotation.x = -Math.PI / 2; bl.position.set(0.3, 0.03, 0.2); g.add(bl);
  }
  [[-19, -12, 1.2], [-22, -2, 1], [-20, 9, 1.3], [-17, 14, 0.9], [-9, -15, 1.1], [3, -16, 1.3], [14, -14, 1], [19.5, -8, 1.2], [21, 3, 1], [19.5, 12, 1.3], [-4, 12.5, 0.8], [8, 12.6, 0.9], [-27, 5, 1.4], [26, -12, 1.4], [27, 7, 1.2], [-13, -19, 1.2], [22, -18, 1]].forEach((t) => tree(...t));

  // ------------------------------------------------------------- lantai kayu + karpet area
  const wood = woodTexture(); wood.tex.wrapS = wood.tex.wrapT = THREE.RepeatWrapping; wood.tex.repeat.set(W / 4, D / 4); wood.tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: wood.tex })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0; world.add(floor);
  const rug = (x0, z0, x1, z1, color, y = 0.012) => B(world, x1 - x0, 0.02, z1 - z0, color, (x0 + x1) / 2, y, (z0 + z1) / 2);
  rug(-14.6, -8.6, -3.4, 0.0, '#8fc5d1'); rug(-14.3, -8.3, -3.7, -0.3, '#a9d6df', 0.026);    // area Vision
  rug(3.4, -8.6, 14.6, 0.0, '#b9a5e8'); rug(3.7, -8.3, 14.3, -0.3, '#cdbdf0', 0.026);        // area Jarvis
  rug(-2.8, -8.8, 2.8, -1.2, '#7b8794'); rug(-2.6, -8.6, 2.6, -1.4, '#98a3af', 0.026);       // ruang rapat
  rug(-14.4, 2.4, -6.4, 8.6, '#d9a56b'); rug(-14.0, 2.8, -6.8, 8.2, '#e8c08a', 0.026);       // lounge
  rug(6.8, 2.2, 14.6, 8.7, '#e9e4d8'); rug(7.2, 2.6, 14.2, 8.3, '#f6f2e8', 0.026);           // pantry (ubin terang)

  // ------------------------------------------------------------- dinding
  const WALL = '#f3e8d4', CAP = '#4a4f57', TH = 0.3;
  // dinding RENDAH (dekat kamera): kiri & depan
  const lowH = 0.85;
  B(world, TH, lowH, D + TH, WALL, FLOOR.x0 - TH / 2, lowH / 2, 0); B(world, TH + 0.04, 0.07, D + TH + 0.04, CAP, FLOOR.x0 - TH / 2, lowH + 0.035, 0);
  B(world, W + TH * 2, lowH, TH, WALL, 0, lowH / 2, FLOOR.z1 + TH / 2); B(world, W + TH * 2 + 0.04, 0.07, TH + 0.04, CAP, 0, lowH + 0.035, FLOOR.z1 + TH / 2);
  // dinding TINGGI berjendela besar: belakang & kanan (hanya tampak dari dalam; disembunyikan bila kamera di luar)
  const skyT = skyTexture();
  const glassM = new THREE.MeshStandardMaterial({ color: '#bfe6f5', transparent: true, opacity: 0.2, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const WH = 3.4, SILL = 0.85, WIN_TOP = 3.0, FRAME = '#e9dcc3';
  function windowWall(group, len, along) {  // along: fungsi (u,v)->posisi dunia; dibangun dalam koordinat lokal lalu diputar
    const g = new THREE.Group(); group.add(g);
    B(g, len + TH * 2, SILL, TH, WALL, 0, SILL / 2, 0); B(g, len + TH * 2, WH - WIN_TOP, TH, WALL, 0, WIN_TOP + (WH - WIN_TOP) / 2, 0);
    B(g, len + TH * 2 + 0.04, 0.07, TH + 0.04, CAP, 0, WH + 0.035, 0);
    const n = Math.round(len / 3.6), step = len / n;
    for (let i = 0; i <= n; i++) B(g, i === 0 || i === n ? 0.5 : 0.28, WIN_TOP - SILL, TH, i === 0 || i === n ? WALL : FRAME, -len / 2 + i * step, (SILL + WIN_TOP) / 2, 0);
    for (let i = 0; i < n; i++) {
      const cx = -len / 2 + (i + 0.5) * step;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(step - 0.3, WIN_TOP - SILL), glassM); glass.position.set(cx, (SILL + WIN_TOP) / 2, 0); g.add(glass);
      B(g, step - 0.3, 0.06, 0.1, FRAME, cx, (SILL + WIN_TOP) / 2, 0.0);   // palang tengah
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(step - 0.3, WIN_TOP - SILL), new THREE.MeshBasicMaterial({ map: skyT })); sky.position.set(cx, (SILL + WIN_TOP) / 2, -0.14); g.add(sky);   // langit di balik kaca (hanya seukuran jendela)
    }
    return g;
  }
  const bw = windowWall(tallWalls.back, W, null); bw.position.set(0, 0, FLOOR.z0 - TH / 2);
  const rw = windowWall(tallWalls.right, D, null); rw.rotation.y = -Math.PI / 2; rw.position.set(FLOOR.x1 + TH / 2, 0, 0);
  // sky plane menghadap ke dalam: pada grup dinding belakang bidang sky berada di sisi -z (luar) menghadap +z => rotasi π agar terlihat dari dalam
  // (dibuat FrontSide; terlihat melalui kaca dari dalam)

  // ------------------------------------------------------------- furnitur
  function desk(g, w, d, accent, lead) {
    B(g, w, 0.07, d, '#e7d3ae', 0, 0.585, 0);
    B(g, 0.07, 0.55, d - 0.06, '#8a6a45', -w / 2 + 0.1, 0.28, 0); B(g, 0.07, 0.55, d - 0.06, '#8a6a45', w / 2 - 0.1, 0.28, 0);
    B(g, w - 0.2, 0.4, 0.05, '#a98558', 0, 0.38, -d / 2 + 0.06);   // panel belakang laci
    B(g, w, 0.04, 0.04, accent, 0, 0.64, d / 2);
    if (lead) B(g, 0.5, 0.45, d - 0.1, '#c9a874', w / 2 - 0.4, 0.34, 0);
  }
  function chair(g, x, z, ry, seatH, color) {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
    cyl(c, 0.04, 0.04, seatH - 0.08, '#55606c', 0, (seatH - 0.08) / 2, 0, 6);
    B(c, 0.46, 0.08, 0.46, color, 0, seatH - 0.04, 0);
    B(c, 0.46, 0.46, 0.07, color, 0, seatH + 0.25, -0.22);            // sandaran di belakang (-z lokal); karakter menghadap +z lokal
    B(c, 0.5, 0.05, 0.05, '#55606c', 0, 0.05, 0); B(c, 0.05, 0.05, 0.5, '#55606c', 0, 0.05, 0);
    return c;
  }
  function plant(x, z, s = 1, g = world) {
    const p = new THREE.Group(); p.position.set(x, 0, z); g.add(p);
    cyl(p, 0.2 * s, 0.15 * s, 0.34 * s, '#f1f5f9', 0, 0.17 * s, 0, 8);
    [['#3f9a4a', 0.42, 0.55, 0, 0], ['#58b653', 0.3, 0.85, 0.05, 0.03], ['#3f8a43', 0.26, 0.65, -0.12, 0.08]].forEach(([c, r, y, dx, dz]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), M(c, { flatShading: true })); m.position.set(dx * s, y * s + 0.2 * s, dz * s); p.add(m); });
    return p;
  }
  function bookshelf(x, z, ry = 0, w = 1.6) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g);
    B(g, w, 1.75, 0.38, '#8a5a32', 0, 0.875, 0);
    const bt = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, 1.6), new THREE.MeshBasicMaterial({ map: bookTex })); bt.position.set(0, 0.88, 0.2); g.add(bt);
  }
  function sofa(x, z, ry, w, color) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g);
    B(g, w, 0.28, 0.9, color, 0, 0.2, 0); B(g, w, 0.55, 0.2, color, 0, 0.55, -0.35);
    for (const s of [-1, 1]) B(g, 0.2, 0.45, 0.9, color, s * (w / 2 - 0.1), 0.4, 0);
    const n = Math.max(2, Math.round(w / 0.95)); for (let i = 0; i < n; i++) B(g, (w - 0.5) / n - 0.04, 0.12, 0.62, '#fff8ea', -((w - 0.5) / 2) + (i + 0.5) * ((w - 0.5) / n), 0.4, 0.06);
  }
  const bookTex = bookTexture();
  // ruang rapat kaca (di tengah antara kedua tim)
  (function meetingRoom() {
    const X0 = -3, X1 = 3, Z0 = -9, Z1 = -1, H = 2.4, FR = '#d6dde5';
    const gl = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H - 0.08), glassM); m.position.set(x, H / 2, z); m.rotation.y = ry; world.add(m); };
    gl(Z1 - Z0, X0, (Z0 + Z1) / 2, Math.PI / 2); gl(Z1 - Z0, X1, (Z0 + Z1) / 2, Math.PI / 2);
    gl(2.2, -1.9, Z1, 0); gl(2.2, 1.9, Z1, 0);
    for (const x of [X0, X1]) { B(world, 0.08, 0.08, Z1 - Z0, FR, x, H, (Z0 + Z1) / 2); B(world, 0.08, 0.1, Z1 - Z0, FR, x, 0.05, (Z0 + Z1) / 2); for (let z = Z0; z <= Z1 + 0.01; z += 2) B(world, 0.08, H, 0.08, FR, x, H / 2, z); }
    B(world, 3.0, 0.08, 0.08, FR, -1.5 - 0.2, H, Z1); B(world, 3.0, 0.08, 0.08, FR, 1.7, H, Z1);
    for (const x of [-3, -0.8, 0.8, 3]) B(world, 0.08, H, 0.08, FR, x, H / 2, Z1);
    B(world, 6.1, 0.1, 0.08, FR, 0, 0.05, Z1);
    const sign = canvasTex(512, 128, (c, w, h) => { rrect(c, 4, 4, w - 8, h - 8, 22); c.fillStyle = '#334155'; c.fill(); c.fillStyle = '#fff'; c.font = `800 62px ${FONT}`; c.textAlign = 'center'; c.fillText('RUANG RAPAT', w / 2, 84); });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: sign.tex })); sm.position.set(0, H + 0.38, Z1 + 0.05); world.add(sm);
    B(world, 2.0, 0.5, 0.04, '#334155', 0, H + 0.38, Z1 + 0.02);
    // meja panjang + kursi
    B(world, 3.6, 0.07, 1.1, '#6b4a2e', 0, 0.62, -5.2); B(world, 0.1, 0.58, 0.9, '#4a3220', -1.5, 0.3, -5.2); B(world, 0.1, 0.58, 0.9, '#4a3220', 1.5, 0.3, -5.2);
    for (let i = 0; i < 3; i++) { chair(world, -1.2 + i * 1.4, -3.95, Math.PI, 0.3, '#64748b'); chair(world, -1.2 + i * 1.4 - 0.2, -6.45, 0, 0.3, '#64748b'); }
    chair(world, 2.4, -5.2, -Math.PI / 2, 0.3, '#64748b'); chair(world, -2.4, -5.2, Math.PI / 2, 0.3, '#64748b');
    for (let i = 0; i < 4; i++) B(world, 0.3, 0.015, 0.22, '#ffffff', -1.2 + i * 0.8, 0.66, -5.2 + (i % 2 ? 0.2 : -0.2));
    cyl(world, 0.09, 0.09, 0.14, '#ef4444', 0.6, 0.7, -5.1, 8);
    // whiteboard berdiri
    const wb = new THREE.Group(); wb.position.set(-2.2, 0, -8.0); wb.rotation.y = rad(35); world.add(wb);
    B(wb, 1.5, 0.05, 0.05, '#64748b', 0, 0.05, 0); B(wb, 0.05, 1.6, 0.05, '#64748b', -0.6, 0.8, 0); B(wb, 0.05, 1.6, 0.05, '#64748b', 0.6, 0.8, 0);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88), new THREE.MeshBasicMaterial({ map: boardTexture('(papan contoh)'), side: THREE.DoubleSide })); bm.position.set(0, 1.15, 0.04); wb.add(bm);
    B(wb, 1.5, 0.98, 0.04, '#94a3b8', 0, 1.15, 0);
    plant(2.5, -8.4, 0.9);
  })();
  // lounge
  bookshelf(-13.2, 2.0, 0); bookshelf(-8.2, 2.0, 0);
  sofa(-10.45, 3.45, 0, 3.4, '#4f7cac'); B(world, 1.6, 0.06, 0.8, '#7a5230', -10.45, 0.36, 5.3); B(world, 0.1, 0.34, 0.6, '#5b3a1e', -11.1, 0.17, 5.3); B(world, 0.1, 0.34, 0.6, '#5b3a1e', -9.8, 0.17, 5.3);
  sofa(-7.4, 6.8, -Math.PI / 2, 2.0, '#c0603f');
  plant(-14.0, 8.0, 1.3); plant(-6.3, 8.2, 1.1); plant(-14.1, 3.2, 1.0);
  // pantry / dapur kecil di dinding kanan
  (function pantry() {
    B(world, 0.9, 0.85, 5.8, '#d7c3a1', 14.45, 0.425, 6.0); B(world, 1.0, 0.07, 5.9, '#f5f1e8', 14.42, 0.88, 6.0);
    B(world, 0.5, 0.9, 5.0, '#c9b28a', 14.7, 2.0, 6.0);  // lemari atas
    B(world, 1.0, 1.95, 1.0, '#e9eef2', 14.35, 0.975, 8.1); B(world, 0.05, 0.9, 0.08, '#94a3b8', 13.82, 1.2, 7.75);   // kulkas
    const cm = new THREE.Group(); cm.position.set(14.3, 0.92, 4.2); world.add(cm);
    B(cm, 0.45, 0.5, 0.4, '#2b2f36', 0, 0.25, 0); B(cm, 0.08, 0.08, 0.02, '#ef4444', -0.05, 0.38, -0.21); B(cm, 0.12, 0.1, 0.12, '#f8fafc', -0.12, 0.05, -0.22);
    B(world, 0.5, 0.3, 0.4, '#cbd5e1', 14.35, 1.07, 5.4);    // microwave
    cyl(world, 0.03, 0.03, 0.3, '#94a3b8', 14.2, 1.03, 6.8, 6); B(world, 0.5, 0.04, 0.4, '#94a3b8', 14.3, 0.92, 6.8);
    // meja bulat + bangku
    cyl(world, 0.55, 0.55, 0.06, '#e7d3ae', 10.0, 0.9, 6.3, 16); cyl(world, 0.06, 0.06, 0.88, '#64748b', 10.0, 0.45, 6.3, 6);
    cyl(world, 0.2, 0.2, 0.06, '#d97706', 9.2, 0.5, 6.3, 10); cyl(world, 0.04, 0.04, 0.46, '#64748b', 9.2, 0.25, 6.3, 6);
    cyl(world, 0.2, 0.2, 0.06, '#d97706', 10.8, 0.5, 6.3, 10); cyl(world, 0.04, 0.04, 0.46, '#64748b', 10.8, 0.25, 6.3, 6);
    cyl(world, 0.2, 0.2, 0.06, '#d97706', 10.0, 0.5, 7.1, 10); cyl(world, 0.04, 0.04, 0.46, '#64748b', 10.0, 0.25, 7.1, 6);
  })();
  // pohon indoor di tengah (planter bundar, ala ref3)
  (function centerTree() {
    const g = new THREE.Group(); g.position.set(0, 0, 5.2); world.add(g);
    cyl(g, 1.5, 1.6, 0.4, '#efe9dd', 0, 0.2, 0, 24); cyl(g, 1.3, 1.3, 0.05, '#6b4a2e', 0, 0.42, 0, 20);
    B(g, 0.3, 1.5, 0.3, '#7a5230', 0, 1.15, 0);
    [[0.95, 2.1, 0, 0, '#4c9a4a'], [0.75, 2.7, 0.15, 0.1, '#5cae52'], [0.65, 1.9, 0.7, -0.4, '#3f8a43'], [0.6, 2.0, -0.6, 0.4, '#58b653']].forEach(([r, y, x, z, c]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(c, { flatShading: true })); m.position.set(x, y, z); g.add(m); });
  })();
  plant(-3.4, 1.0, 0.9); plant(3.4, 1.0, 0.9); plant(-14.2, -8.4, 1.1); plant(14.2, -8.4, 1.1); plant(2.9, -0.4, 0.8);

  // ------------------------------------------------------------- meja kerja per bot (meja + monitor + kursi + lampu + papan nama)
  const stations = {};
  const pickables = [];
  function buildStation(bot) {
    const H = homeOf(bot), lead = !!bot.lead, T = TEAMS[bot.team];
    const g = new THREE.Group(); g.position.set(H.desk[0], 0, H.desk[1]); world.add(g);
    desk(g, H.deskW, H.deskD, bot.color, lead);
    const faceZ = H.face === 0 ? -1 : 1;      // arah monitor menghadap karakter: karakter menghadap +z => monitor menghadap -z
    // monitor (layar menghadap karakter) — tim: layar menghadap +z (terlihat kamera); orkestrator: layar membelakangi kamera
    const mon = new THREE.Group(); mon.position.set(lead ? -0.4 : 0.0, 0.62, -0.05); mon.rotation.y = H.face === 0 ? Math.PI : 0; g.add(mon);
    // catatan: karakter dengan face=π menghadap -z => monitor harus menghadap +z (rotasi 0)
    B(mon, 0.16, 0.2, 0.08, '#55606c', 0, 0.1, 0); B(mon, 0.34, 0.03, 0.2, '#55606c', 0, 0.02, 0);
    B(mon, 0.84, 0.5, 0.05, '#2b2f36', 0, 0.46, 0);
    const scrMat = new THREE.MeshBasicMaterial({ map: screens.off });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.43), scrMat); scr.position.set(0, 0.46, 0.028); mon.add(scr);
    if (lead) { const m2 = mon.clone(); m2.position.x = 0.7; m2.rotation.y = mon.rotation.y; g.add(m2); }
    B(g, 0.46, 0.015, 0.16, '#cbd5e1', 0, 0.63, H.face === 0 ? -0.28 : 0.28);   // keyboard
    // papan nama berdiri (menghadap kamera/+z)
    const pw = lead ? 1.05 : 0.8, plate = canvasTex(1024, 256, (c, w, h) => drawPlate(c, w, h, bot, 'unmonitored'));
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), new THREE.MeshBasicMaterial({ map: plate.tex, transparent: true }));
    const pg = new THREE.Group(); pg.position.set(lead ? 0.0 : -H.deskW / 2 + 0.55, 0.62, H.deskD / 2 - 0.12); pg.rotation.x = -0.45; pm.position.y = pw / 8; pg.add(pm); g.add(pg);
    B(pg, pw + 0.04, pw / 4 + 0.04, 0.02, '#0f172a', 0, pw / 8, -0.012);
    // lampu status
    const lamp = new THREE.Group(); lamp.position.set(H.deskW / 2 - 0.22, 0.62, H.deskD / 2 - 0.18); g.add(lamp);
    cyl(lamp, 0.08, 0.1, 0.04, '#55606c', 0, 0.02, 0, 12); cyl(lamp, 0.014, 0.014, 0.3, '#94a3b8', 0, 0.18, 0, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#94a3b8' }); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), bulbMat); bulb.position.y = 0.4; lamp.add(bulb);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: '#94a3b8', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(0.9, 0.9, 1); halo.position.y = 0.4; lamp.add(halo);
    // dais orkestrator (menonjol) + bendera
    if (lead) {
      B(world, H.deskW + 1.3, 0.1, 3.4, T.accent, H.desk[0], 0.05, H.desk[1] - 0.4); B(world, H.deskW + 1.1, 0.02, 3.2, '#ffffff', H.desk[0], 0.105, H.desk[1] - 0.4).material = M('#f6efe2');
      const pole = cyl(world, 0.02, 0.02, 1.6, '#e2e8f0', H.desk[0] + H.deskW / 2 + 0.4, 0.9, H.desk[1] - 1.2, 6);
      B(world, 0.7, 0.4, 0.02, bot.color, H.desk[0] + H.deskW / 2 + 0.75, 1.5, H.desk[1] - 1.2);
    }
    // kursi (rumah)
    const chairObj = chair(world, H.seat[0], H.seat[1], H.face, 0.3, T.accent);
    // volume klik meja (tak terlihat)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(H.deskW + 0.6, 1.4, H.deskD + 0.6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.7, 0); hit.userData.botId = bot.id; g.add(hit); pickables.push(hit);
    stations[bot.id] = { bot, home: H, group: g, scrMat, plate, bulb, bulbMat, halo, status: 'unmonitored', lampPos: lamp };
    return stations[bot.id];
  }
  bots.forEach(buildStation);

  // ------------------------------------------------------------- karakter chibi/voxel
  const HIP = 0.5;
  function makeChibi(bot) {
    const L = bot.look;
    const root = new THREE.Group();             // origin = pijakan (lantai/dudukan)
    const body = new THREE.Group(); root.add(body);   // turun naik saat duduk
    const own = (c) => new THREE.MeshLambertMaterial({ color: c });   // material per-karakter (agar efek pudar tidak menular ke bot lain)
    const skin = own(L.skin), shirt = own(L.shirt), pants = own('#2f3b52'), hairM = own(L.hair), capM = L.cap ? own(L.cap) : null, dark = M('#111827');
    const parts = { root, body, mats: [skin, shirt, pants, hairM, ...(capM ? [capM] : [])] };
    const limb = (x, y, w, h, d, mat, handMat) => {
      const pv = new THREE.Group(); pv.position.set(x, y, 0); body.add(pv);
      B(pv, w, h, d, mat, 0, -h / 2, 0); if (handMat) B(pv, w * 0.95, 0.1, d * 0.95, handMat, 0, -h - 0.03, 0);
      return pv;
    };
    parts.armL = limb(0.3, HIP + 0.4, 0.13, 0.34, 0.14, shirt, skin); parts.armR = limb(-0.3, HIP + 0.4, 0.13, 0.34, 0.14, shirt, skin);
    const leg = (x) => { const hp = new THREE.Group(); hp.position.set(x, HIP, 0); body.add(hp); B(hp, 0.16, 0.25, 0.18, pants, 0, -0.125, 0);
      const kn = new THREE.Group(); kn.position.y = -0.25; hp.add(kn); B(kn, 0.15, 0.25, 0.16, pants, 0, -0.125, 0); B(kn, 0.17, 0.07, 0.24, '#e5e7eb', 0, -0.235, 0.04); return { hp, kn }; };
    const lL = leg(0.1), lR = leg(-0.1); parts.hipL = lL.hp; parts.kneeL = lL.kn; parts.hipR = lR.hp; parts.kneeR = lR.kn;
    B(body, 0.46, 0.46, 0.28, shirt, 0, HIP + 0.23, 0);                                  // badan
    B(body, 0.48, 0.06, 0.3, '#1f2937', 0, HIP + 0.03, 0);                               // ikat pinggang
    if (L.badge) { B(body, 0.12, 0.12, 0.02, '#fbbf24', 0.1, HIP + 0.32, 0.15); B(body, 0.07, 0.3, 0.02, '#f8fafc', 0, HIP + 0.3, 0.145); }
    const head = new THREE.Group(); head.position.set(0, HIP + 0.46, 0); body.add(head); parts.head = head;
    B(head, 0.54, 0.54, 0.52, skin, 0, 0.28, 0);                                         // kepala besar (chibi)
    for (const s of [-1, 1]) { B(head, 0.07, 0.1, 0.02, dark, s * 0.13, 0.3, 0.265); B(head, 0.06, 0.03, 0.02, '#f9a8a8', s * 0.19, 0.2, 0.263); }
    B(head, 0.1, 0.025, 0.02, '#9b3b3b', 0, 0.16, 0.265);
    if (L.glasses) { for (const s of [-1, 1]) B(head, 0.14, 0.12, 0.015, '#1f2937', s * 0.13, 0.3, 0.272).material = M('#1f2937', { transparent: true, opacity: 0.55 }); B(head, 0.06, 0.02, 0.015, '#1f2937', 0, 0.31, 0.272); }
    const style = L.style;
    if (style === 'cap') { B(head, 0.58, 0.16, 0.56, capM, 0, 0.58, 0); B(head, 0.5, 0.04, 0.3, capM, 0, 0.5, 0.36); B(head, 0.58, 0.2, 0.14, L.hair, 0, 0.42, -0.24); }
    else { B(head, 0.58, 0.14, 0.56, hairM, 0, 0.58, 0); B(head, 0.58, 0.16, 0.1, hairM, 0, 0.52, 0.24); B(head, 0.1, 0.22, 0.54, hairM, 0.28, 0.43, 0); B(head, 0.1, 0.22, 0.54, hairM, -0.28, 0.43, 0); B(head, 0.58, 0.34, 0.12, hairM, 0, 0.4, -0.26);
      if (style === 'long') { B(head, 0.62, 0.5, 0.12, hairM, 0, 0.12, -0.27); B(head, 0.1, 0.4, 0.3, hairM, 0.29, 0.12, -0.08); B(head, 0.1, 0.4, 0.3, hairM, -0.29, 0.12, -0.08); }
      if (style === 'bun') B(head, 0.24, 0.22, 0.24, hairM, 0, 0.78, -0.1); }
    const hitC = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.9), new THREE.MeshBasicMaterial({ visible: false })); hitC.position.y = 0.85; hitC.userData.botId = bot.id; root.add(hitC); pickables.push(hitC);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.025; root.add(blob); parts.blob = blob;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), new THREE.MeshBasicMaterial({ color: bot.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; root.add(ring); parts.ring = ring;
    return parts;
  }

  // ------------------------------------------------------------- agen: pose + perilaku (duduk / berjalan / tujuan)
  const rng = mulberry32(20261119);
  const agents = {};
  const SPEED = 1.7;
  const occupied = new Map();       // destId -> botId
  function homeRoute(H) { return [[H.seat[0], H.seat[1]], [H.lane, H.seat[1]], [H.lane, HUB_Z]]; }
  function ghost(a, on) { for (const m of a.parts.mats) { m.transparent = on; m.opacity = on ? 0.5 : 1; } }
  const JOINTS = ['armL', 'armR', 'hipL', 'hipR', 'kneeL', 'kneeR'];
  function mkAgent(bot) {
    const parts = makeChibi(bot); world.add(parts.root);
    const H = homeOf(bot);
    const a = { bot, home: H, parts, mode: 'seated', x: H.seat[0], z: H.seat[1], y: 0, ry: H.face, path: [], dest: null, destId: null, pose: 'sit-type', seatH: 0.3, timer: 2 + rng() * 4, phase: rng() * 6, status: 'unmonitored',
      bodyY: 0, j: { armL: 0, armR: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, headX: 0, headY: 0 }, returning: false };
    parts.root.position.set(a.x, 0, a.z); parts.root.rotation.y = a.ry;
    agents[bot.id] = a; applyPose(a, true); return a;
  }
  bots.forEach(mkAgent);
  // sudut sendi target per pose
  function poseTarget(a, t) {
    const o = { armL: 0, armR: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, headX: 0, headY: 0, bodyY: 0 };
    const p = a.pose;
    if (p === 'sit-type' || p === 'sit-idle' || p === 'sit-still') {
      o.hipL = o.hipR = -1.5; o.kneeL = o.kneeR = 1.5; o.bodyY = a.seatH + 0.07 - HIP;
      if (p === 'sit-type') {
        o.armL = -1.25 + Math.sin(t * 13) * 0.1; o.armR = -1.25 + Math.sin(t * 13 + 2.2) * 0.1; o.headX = 0.12 + Math.sin(t * 2.2) * 0.05; o.headY = Math.sin(t * 0.8) * 0.12;
      } else if (p === 'sit-idle') { o.armL = o.armR = -0.55; o.headY = Math.sin(t * 0.7 + a.phase) * 0.35; o.headX = Math.sin(t * 0.5) * 0.05; }
      else { o.armL = o.armR = -0.5; o.headX = 0.1; }
    } else if (p === 'walk') {
      const s = Math.sin(a.phase * 7); o.hipL = s * 0.7; o.hipR = -s * 0.7; o.kneeL = Math.max(0, -s) * 0.8; o.kneeR = Math.max(0, s) * 0.8; o.armL = -s * 0.6; o.armR = s * 0.6; o.bodyY = Math.abs(Math.cos(a.phase * 7)) * 0.04;
    } else if (p === 'drink') { o.armR = -2.1 + Math.sin(t * 1.6) * 0.1; o.armL = 0.05; o.headX = -0.08; }
    else { o.armL = 0.05 + Math.sin(t * 1.3 + a.phase) * 0.03; o.armR = 0.05; o.headY = Math.sin(t * 0.6 + a.phase) * 0.3; }
    return o;
  }
  function applyPose(a, snap, dt = 0.016, t = 0) {
    const o = poseTarget(a, t), k = snap ? 1 : Math.min(1, dt * 12), P = a.parts;
    for (const key of JOINTS) { a.j[key] += (o[key] - a.j[key]) * k; P[key].rotation.x = a.j[key]; }
    a.j.headX += (o.headX - a.j.headX) * k; a.j.headY += (o.headY - a.j.headY) * k; P.head.rotation.x = a.j.headX; P.head.rotation.y = a.j.headY;
    a.bodyY += (o.bodyY - a.bodyY) * k; P.body.position.y = a.bodyY;
    P.root.position.set(a.x, a.y, a.z); P.root.rotation.y = a.ry;
  }
  function buildPath(a, d) {   // rumah -> koridor -> via -> tujuan
    return [...homeRoute(a.home).slice(1), ...d.via, d.pos];
  }
  function startRoam(a) {
    const free = DESTINATIONS.filter((d) => !occupied.has(d.id)); if (!free.length) return false;
    const d = free[Math.floor(rng() * free.length)];
    occupied.set(d.id, a.bot.id); a.dest = d; a.destId = d.id; a.path = buildPath(a, d); a.mode = 'walking'; a.returning = false; a.pose = 'walk'; return true;
  }
  function startReturn(a) {
    const hr = homeRoute(a.home).slice(1).reverse();        // [(lane,HUB) , (lane,seatZ)]
    let route;
    if (a.mode === 'atdest' && a.dest) route = [...[...a.dest.via].reverse(), ...hr];
    else if (a.z > -0.8) route = [[a.x, HUB_Z], ...hr];     // sedang di luar area tim: ke koridor dulu
    else route = [[a.home.lane, a.z], [a.home.lane, a.home.seat[1]]];
    a.path = [...route, a.home.seat];
    if (a.dest) { occupied.delete(a.destId); a.dest = null; a.destId = null; }
    a.mode = 'walking'; a.returning = true; a.pose = 'walk';
  }
  function placeAtDest(a, d) {
    occupied.set(d.id, a.bot.id); a.dest = d; a.destId = d.id; a.x = d.pos[0]; a.z = d.pos[1]; a.ry = d.face; a.mode = 'atdest'; a.pose = d.pose === 'sit' ? 'sit-idle' : d.pose === 'drink' ? 'drink' : 'stand'; a.seatH = d.seatH || 0.3; a.y = 0; a.timer = 6 + rng() * 10;
  }
  function arrive(a) {
    if (a.returning) { a.mode = 'seated'; a.x = a.home.seat[0]; a.z = a.home.seat[1]; a.ry = a.home.face; a.returning = false; a.seatH = 0.3; a.y = 0; setSeatedPose(a); a.timer = a.status === 'done' ? 4 + rng() * 6 : 12 + rng() * 14; }
    else { const d = a.dest; a.mode = 'atdest'; a.x = d.pos[0]; a.z = d.pos[1]; a.ry = d.face; a.seatH = d.seatH || 0.3; a.pose = d.pose === 'sit' ? 'sit-idle' : d.pose === 'drink' ? 'drink' : 'stand'; a.timer = 8 + rng() * 10; }
  }
  function setSeatedPose(a) { a.pose = a.status === 'working' ? 'sit-type' : a.status === 'unmonitored' ? 'sit-still' : 'sit-idle'; }
  function updateAgent(a, dt, t) {
    const st = a.status, away = st === 'done' || st === 'standby';
    a.phase += dt;
    if (!away && a.mode !== 'seated' && !a.returning) startReturn(a);      // bekerja/belum dipantau -> kembali ke meja
    if (a.mode === 'seated') {
      setSeatedPose(a);
      if (away) { a.timer -= dt; if (a.timer <= 0) { if (!startRoam(a)) a.timer = 5; } }
    } else if (a.mode === 'atdest') {
      if (a.dest && a.dest.pose === 'drink') a.pose = 'drink';
      a.timer -= dt; if (a.timer <= 0) { if (st === 'done' && rng() < 0.5) { const old = a.dest; occupied.delete(old.id); a.dest = null; if (!startRoamFromDest(a, old)) startReturn(a); } else startReturn(a); }
    } else if (a.mode === 'walking') {
      a.pose = 'walk';
      let move = SPEED * dt;
      while (move > 0 && a.path.length) {
        const [px, pz] = a.path[0], dx = px - a.x, dz = pz - a.z, dist = Math.hypot(dx, dz);
        if (dist < 1e-4) { a.path.shift(); continue; }
        a.ry = lerpAngle(a.ry, Math.atan2(dx, dz), Math.min(1, dt * 10));
        const s = Math.min(move, dist); a.x += dx / dist * s; a.z += dz / dist * s; move -= s; if (s >= dist - 1e-6) a.path.shift();
      }
      if (!a.path.length) arrive(a);
    }
    const sit = a.pose.startsWith('sit'); a.y = 0;
    applyPose(a, false, dt, t);
  }
  function startRoamFromDest(a, oldDest) {   // jalan dari tujuan lama ke tujuan baru lewat koridor
    const free = DESTINATIONS.filter((d) => !occupied.has(d.id) && d.id !== oldDest.id); if (!free.length) return false;
    const d = free[Math.floor(rng() * free.length)]; occupied.set(d.id, a.bot.id);
    a.path = [...[...oldDest.via].reverse(), ...d.via, d.pos]; a.dest = d; a.destId = d.id; a.mode = 'walking'; a.returning = false; a.pose = 'walk'; return true;
  }
  // bot yang awalnya berstatus selesai langsung dimulai di sebuah tujuan agar kantor tampak hidup sejak awal
  const startPlace = { atlas: 'pantry-kopi', ultron: 'lounge-sofa-1' };

  // ------------------------------------------------------------- status
  function setStatus(botId, status) {
    const st = stations[botId], a = agents[botId]; if (!st || !STATUS[status]) return;
    const prev = st.status; st.status = status; a.status = status;
    const c = new THREE.Color(STATUS[status].color); st.bulbMat.color.copy(c); st.halo.material.color.copy(c);
    if (prev !== status) st.plate.redraw((ctx, w, h) => drawPlate(ctx, w, h, st.bot, status));
    ghost(a, status === 'unmonitored');
    if (prev === 'unmonitored' && a.mode === 'seated') a.timer = 1.5;
    if (prev !== status && (status === 'done') && a.mode === 'seated') a.timer = 1.5 + rng() * 2;
    st.scrMat.map = status === 'working' ? screens.work[0] : status === 'done' ? screens.done : status === 'standby' ? screens.idle : screens.off; st.scrMat.needsUpdate = true;
    if (!a.placed && startPlace[botId] && status === 'done') { a.placed = true; const d = DESTINATIONS.find((x) => x.id === startPlace[botId]); if (d && !occupied.has(d.id)) placeAtDest(a, d); }
  }
  bots.forEach((b) => setStatus(b.id, 'unmonitored'));

  // ------------------------------------------------------------- kamera
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.minDistance = 5; controls.maxDistance = 150;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.42;
  controls.screenSpacePanning = false; controls.panSpeed = 0.8; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  let portrait = false, innerW = 1, innerH = 1;
  let tween = null, currentView = 'all', selected = null, hovered = null;
  const inset = { l: 0, r: 0, b: 0, t: 0, cl: 0, cr: 0, cb: 0, ct: 0 };

  function visFrac() { const Wd = innerW || 1, Hd = innerH || 1; return { fw: Math.max(0.25, (Wd - inset.l - inset.r) / Wd), fh: Math.max(0.25, (Hd - inset.b - inset.t) / Hd) }; }
  // Jarak kamera agar AABB dunia muat UTUH di area layar yang tidak tertutup UI/panel (dihitung dari aspek layar & 8 sudut kotak)
  function fitAABB(min, max, az, el, margin = 1.12) {
    const c = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right).normalize();
    let hw = 0, hh = 0;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) { const v = new THREE.Vector3(x, y, z).sub(c); hw = Math.max(hw, Math.abs(v.dot(right))); hh = Math.max(hh, Math.abs(v.dot(up))); }
    const tanV = Math.tan(rad(camera.fov / 2)), tanH = tanV * camera.aspect, { fw, fh } = visFrac();
    const depthHalf = Math.abs(max.clone().sub(min).dot(dir)) / 2;
    const d = Math.max(hw / (tanH * fw), hh / (tanV * fh)) * margin + depthHalf * 0.5;
    return { pos: c.clone().add(dir.multiplyScalar(d)), target: c };
  }
  const isoAz = () => (portrait ? rad(-62) : rad(-38)), isoEl = () => (portrait ? rad(50) : rad(40));
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function presetView(name) {
    const az = isoAz(), el = isoEl();
    if (name === 'all') return fitAABB(V3(FLOOR.x0 - 0.6, -0.6, FLOOR.z0 - 0.4), V3(FLOOR.x1 + 0.6, 3.2, FLOOR.z1 + 0.6), az, el, 1.04);
    const ar = AREAS.find((x) => x.id === name); const [x0, z0, x1, z1] = ar.aabb;
    return fitAABB(V3(x0 - 0.4, 0, z0), V3(x1 + 0.4, 3.0, z1 + 0.2), az, el, portrait ? 1.3 : 1.08);
  }
  function botBox(id) {
    const a = agents[id], st = stations[id], H = a.home;
    const away = a.mode !== 'seated';
    if (away) return { min: V3(a.x - 1.5, 0, a.z - 1.5), max: V3(a.x + 1.5, 3.0, a.z + 1.5) };
    const x0 = Math.min(H.desk[0] - H.deskW / 2, H.seat[0] - 0.6) - 0.7, x1 = Math.max(H.desk[0] + H.deskW / 2, H.seat[0] + 0.6) + 0.7;
    const z0 = Math.min(H.desk[1] - H.deskD / 2, H.seat[1] - 0.6) - 0.5, z1 = Math.max(H.desk[1] + H.deskD / 2, H.seat[1] + 0.6) + 0.5;
    return { min: V3(x0, 0, z0), max: V3(x1, 3.0, z1) };   // tinggi 3.0: karakter (±1.5) + ruang label & gelembung
  }
  function presetBot(id) {
    const { min, max } = botBox(id);
    return fitAABB(min, max, portrait ? rad(-50) : rad(-34), portrait ? rad(42) : rad(36), portrait ? 1.55 : 1.32);
  }
  function flyTo(p, dur = 1.0) { tween = { t: 0, dur, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), to: p }; }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  controls.addEventListener('start', () => { tween = null; currentView = 'free'; });
  function showView(name) { currentView = name; selected = null; flyTo(presetView(name)); }
  function focusBot(id) { if (!stations[id]) return false; selected = id; currentView = 'bot:' + id; flyTo(presetBot(id)); return true; }
  function clearSelection() { selected = null; }
  function refit(dur = 0.8) {
    if (currentView.startsWith('bot:')) flyTo(presetBot(currentView.slice(4)), dur);
    else if (currentView === 'all' || AREAS.some((x) => x.id === currentView)) flyTo(presetView(currentView), dur);
  }
  function setInset(o) {
    const n = { l: Math.round(o.left || 0), r: Math.round(o.right || 0), b: Math.round(o.bottom || 0), t: Math.round(o.top || 0) };
    const ch = n.l !== inset.l || n.r !== inset.r || n.b !== inset.b || n.t !== inset.t; Object.assign(inset, n); if (ch) refit(0.8);
  }
  function applyViewOffset() {
    const ox = (inset.cr - inset.cl) / 2, oy = (inset.cb - inset.ct) / 2;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(innerW, innerH, ox, oy, innerW, innerH);
  }
  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight; innerW = w; innerH = h;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; portrait = camera.aspect < 0.85; camera.fov = portrait ? 34 : 30; camera.updateProjectionMatrix(); applyViewOffset();
  }
  window.addEventListener('resize', () => { resize(); refit(0.01); });

  // ------------------------------------------------------------- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(pickables, false); return hits.length ? hits[0].object.userData.botId : null;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return; const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (mv < 7 && dt < 600) { const id = pickAt(e.clientX, e.clientY); if (id && onPick) onPick(id); }
  });
  renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' || e.buttons) return; hovered = pickAt(e.clientX, e.clientY); renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'; });
  renderer.domElement.addEventListener('pointerleave', () => { hovered = null; });

  // ------------------------------------------------------------- loop
  let simT = 0, frames = 0, ready = false, fpsN = 0, fpsT0 = performance.now(), fps = 0, manual = false;
  const anchors = [], tmp = new THREE.Vector3(), PAN = { x: 24, z: 18 };
  function update(dt) {
    simT += dt;
    if (tween) { tween.t += dt / tween.dur; const k = ease(Math.min(1, tween.t)); camera.position.lerpVectors(tween.fromPos, tween.to.pos, k); controls.target.lerpVectors(tween.fromTgt, tween.to.target, k); if (tween.t >= 1) tween = null; }
    // ikuti bot terfokus bila ia berjalan (kamera ikut bergeser)
    if (!tween && selected && currentView === 'bot:' + selected) {
      const a = agents[selected]; if (a.mode !== 'seated') { const dx = a.x - controls.target.x, dz = a.z - controls.target.z, k = Math.min(1, dt * 3); camera.position.x += dx * k; camera.position.z += dz * k; controls.target.x += dx * k; controls.target.z += dz * k; }
    }
    controls.update();
    const t = controls.target; const cx = THREE.MathUtils.clamp(t.x, -PAN.x, PAN.x), cz = THREE.MathUtils.clamp(t.z, -PAN.z, PAN.z);
    if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
    tallWalls.back.visible = camera.position.z > FLOOR.z0 - 0.2; tallWalls.right.visible = camera.position.x < FLOOR.x1 + 0.2;   // dinding tinggi hilang bila kamera di luar
    const k2 = Math.min(1, dt * 7); for (const key of ['l', 'r', 'b', 't']) inset['c' + key] += (inset[key] - inset['c' + key]) * k2; applyViewOffset();
    for (const a of Object.values(agents)) {
      updateAgent(a, dt, simT);
      const st = stations[a.bot.id];
      const pulse = st.status === 'working' ? 0.5 + 0.5 * Math.sin(simT * 6) : st.status === 'standby' ? 0.5 + 0.5 * Math.sin(simT * 2) : st.status === 'done' ? 1 : 0.35;
      st.bulb.scale.setScalar(st.status === 'working' ? 1 + pulse * 0.18 : 1); st.halo.material.opacity = st.status === 'unmonitored' ? 0.18 : 0.35 + pulse * 0.45;
      if (st.status === 'working') { const f = Math.floor(simT * 2.5 + a.phase) % 3; st.scrMat.map = screens.work[f]; }
      const rt = selected === a.bot.id ? 0.75 + Math.sin(simT * 4) * 0.2 : hovered === a.bot.id ? 0.5 : 0; a.parts.ring.material.opacity += (rt - a.parts.ring.material.opacity) * Math.min(1, dt * 9);
    }
  }
  function computeAnchors() {
    camera.updateMatrixWorld(); anchors.length = 0;
    const push = (kind, id, x, y, z, extra) => { tmp.set(x, y, z).project(camera); anchors.push({ kind, id, x: (tmp.x + 1) / 2 * innerW, y: (1 - tmp.y) / 2 * innerH, depth: tmp.z, visible: tmp.z < 1 && tmp.z > -1, ...extra }); };
    for (const a of Object.values(agents)) { const sit = a.pose.startsWith('sit'); push('bot', a.bot.id, a.x, (sit ? a.seatH + 0.07 - HIP + a.j.headX * 0 : 0) + 1.66 + 0.1, a.z, { walking: a.mode === 'walking', dest: a.destId }); }
    for (const ar of AREAS) push('area', ar.id, ar.pos[0], ar.pos[1], ar.pos[2], { label: ar.label, color: ar.color });
    return anchors;
  }
  function render() { renderer.render(scene, camera); }
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!manual) { update(dt); render(); }
    computeAnchors(); if (onFrame) onFrame(anchors);
    fpsN++; if (now - fpsT0 >= 1000) { fps = Math.round(fpsN * 1000 / (now - fpsT0) * 10) / 10; fpsN = 0; fpsT0 = now; }
    if (!ready && ++frames >= 3) { ready = true; onReady && onReady(); }
  }
  function step(sec, h = 1 / 30) { const n = Math.max(1, Math.round(sec / h)); for (let i = 0; i < n; i++) update(h); render(); computeAnchors(); if (onFrame) onFrame(anchors); }

  resize();
  { const init = presetView('all'); camera.position.copy(init.pos); controls.target.copy(init.target); controls.update(); }
  requestAnimationFrame(loop);

  return {
    renderer, camera, controls, stations, agents, setStatus, showView, focusBot, clearSelection, setInset, refit, step, resize, render,
    setManual: (v) => { manual = v; },
    get fps() { return fps; }, get ready() { return ready; }, get modelState() { return 'voxel'; }, get currentView() { return currentView; },
    get selected() { return selected; }, get hovered() { return hovered; }, get portrait() { return portrait; }, anchors: () => anchors,
    agentInfo: (id) => { const a = agents[id]; return { mode: a.mode, pose: a.pose, dest: a.destId, x: +a.x.toFixed(2), z: +a.z.toFixed(2) }; },
  };
}
