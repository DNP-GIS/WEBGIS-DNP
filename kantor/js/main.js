// Titik masuk: merangkai config + data + api + scene + ui, dan memasang kait uji window.__kantor.
import { CONFIG } from './config.js';
import { BOTS } from './data.js';
import { createApi } from './api.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';

const errors = [];
window.addEventListener('error', (e) => errors.push('error: ' + e.message));
window.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));

const api = createApi(CONFIG);
if (api.mode !== 'mock') document.title = 'Kantor AI 3D · PT Dwi Nagarta Palma';
let ui = null, started = false;
const loading = document.getElementById('loading');

const scene = createScene({
  container: document.getElementById('scene'), bots: BOTS, config: CONFIG,
  onPick: (id) => ui && ui.selectBot(id),
  onFrame: (a) => ui && ui.onFrame(a),
  onReady: () => { loading.classList.add('hide'); },
});
ui = createUI({ api, scene, config: CONFIG });
await api.start(); ui.applyState(); ui.updateInset(); started = true;

// ---- kait uji / demo (deterministik) ----
const K = {
  get ready() { return scene.ready && started; },
  get fps() { return scene.fps; },
  get errors() { return errors.slice(); },
  get modelState() { return scene.modelState; },
  api, scene, ui,
  focusAgent: (id) => ui.selectBot(id),
  showView: (v) => ui.showView(v),
  resetView: () => ui.showView('all'),
  closePanels: () => { ui.closeBot(false); ui.closeCommand(); },
  openCommand: (botId) => ui.openCommand(botId),   // meminta gerbang sandi bila belum terbuka
  unlock: (pw = 'apa-saja') => api.login(pw),     // mock: terima apa saja; worker: kata sandi sungguhan
  lock: () => api.logout(),
  setBubbleMs: (ms) => ui.setBubbleMs(ms),
  clearBubbles: () => ui.clearBubbles(),
  step: (sec = 1) => scene.step(sec),
  settle: (sec = 2.5) => { scene.step(sec); document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* */ } }); scene.step(0.1); },
  sendCommand: async (botId, text) => { const m = await api.sendCommand(botId, text); return m; },
  // mode mock: sisipkan balasan bot sekarang juga (teks null => balasan contoh)
  simulateReply: async (botId, text = null, opts = {}) => {
    if (!api.adapter.injectReply) throw new Error('simulateReply hanya untuk mode mock');
    const m = api.adapter.injectReply(botId, text, opts); await api.poll(); return m;
  },
  setStatus: async (botId, status) => { api.adapter.setBotStatus(botId, status); await api.poll(); },
};
window.__kantor = K;
document.body.dataset.ready = '1';
