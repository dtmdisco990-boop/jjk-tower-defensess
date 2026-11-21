/* Boots the 3D character layer into the existing 2D game without touching the simulation:
   - wraps BattleRenderer.drawUnits: 3D fighters are animated, rendered and composited at the tower layer;
   - wraps Art.unitSprite *only while drawUnits runs* so a 3D tower draws its rune platter but not its flat figure;
   - reads optional supplied models from assets/models/char3d.json (see docs/CHAR3D.md);
   - exposes JJK.Char3D (mode, status, settings panel, debug snapshot).
   Any failure (no WebGL, file:// without module support, a broken model) leaves the original 2D art in place. */
import { View, standInTemplate, glbTemplate, gl, CAMERA } from './stage.js';
import { parseSupplied } from './assets.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const G = window, JJK = G.JJK;
const KEY = 'jjk-td.char3d.mode';
const MODES = { auto: 'Auto — supplied 3D models only', preview: 'Preview — stand-in rig until a model is supplied', off: 'Off — classic 2D art' };
const MANIFEST = 'assets/models/char3d.json';
/** Developer tools (model picker, saved models, stand-in preview, URL overrides) exist only when Config.CHAR3D_DEV_TOOLS is true. */
const dev = () => !!(JJK.Config && JJK.Config.CHAR3D_DEV_TOOLS === true);
const allowed = (m) => m === 'auto' || m === 'off' || (m === 'preview' && dev());

function readMode() {
  if (dev()) { try { const q = new URLSearchParams(location.search).get('char3d'); if (q && MODES[q]) return q; } catch (e) {} }
  try { const m = localStorage.getItem(KEY); if (m && allowed(m)) return m; } catch (e) {}
  return 'auto';
}

const C3 = {
  version: 1, mode: readMode(), ready: false, errors: [],
  /** 3D-capable characters. Add an id here (and optionally a model in the manifest) to give another tower a 3D body. */
  registry: { yuji: { supplied: null, source: null, origin: null, saved: null, label: 'Yuji' } },
  views: new Set(), camera: CAMERA,
  dev,
  setMode(m) { if (!MODES[m] || !allowed(m)) return false; this.mode = m; try { localStorage.setItem(KEY, m); } catch (e) {} return true; },
  /** Template for a unit under the current mode, or null to keep the 2D sprite. */
  resolve(u) {
    if (!u || this.mode === 'off' || !this.ready) return null;
    const r = this.registry[u.id]; if (!r) return null;
    if (r.supplied) return r.supplied;
    return this.mode === 'preview' ? standInTemplate() : null;
  },
  handles(id) { const r = this.registry[id]; return !!r && this.mode !== 'off' && (!!r.supplied || this.mode === 'preview'); },
  status(id) {
    const r = this.registry[id || 'yuji'];
    if (!gl()) return 'WebGL is not available in this browser, so the 2D art is used.';
    if (r && r.supplied) {
      const how = r.supplied.useClips ? r.supplied.clipCount + ' animation clips found' : 'procedural animation';
      const from = r.origin === 'saved' ? 'the model saved in this browser (' + r.source + ')' : r.origin === 'session' ? r.source + ' (this session)' : 'bundled model ' + r.source;
      return 'Using ' + from + ' — ' + r.supplied.bones + ' rig bones matched, ' + how + '.';
    }
    if (!this.ready) return 'Looking for a ' + (r ? r.label : id) + ' model…';
    return 'No ' + (r ? r.label : id) + ' model found — ' + (this.mode === 'preview' ? 'showing the neutral stand-in rig.' : 'keeping the 2D art.');
  },
  /** Load a .glb for a character from an ArrayBuffer. Animation, materials, scale and facing are configured automatically. */
  async loadModel(id, buf, label, cfg, origin) {
    if (!dev()) throw new Error('3D model tools are developer-only (Config.CHAR3D_DEV_TOOLS)');
    return loadInto(id, buf, label, cfg, origin);
  },
  /** Remember a model file in this browser (IndexedDB) so it loads on every visit. Applied now unless a bundled model wins. */
  async saveModel(id, file) {
    if (!dev()) throw new Error('3D model tools are developer-only (Config.CHAR3D_DEV_TOOLS)');
    const buf = await file.arrayBuffer();
    const rec = { name: file.name, size: buf.byteLength, savedAt: Date.now(), buf };
    const reg = this.registry[id];
    const bundled = reg && reg.supplied && (reg.origin === 'bundled' || reg.origin === 'manifest');
    let t = null;
    if (!bundled) t = await loadInto(id, buf, file.name, {}, 'saved'); // validates the file before storing it
    else await parseSupplied(buf, GLTFLoader, file.name).then((ok) => { if (!ok) throw new Error('No rigged (skinned) mesh found in ' + file.name); });
    await idbPut(id, rec);
    if (reg) { reg.saved = { name: rec.name, size: rec.size }; }
    return { applied: !!t, bundled };
  },
  async forgetModel(id) {
    if (!dev()) throw new Error('3D model tools are developer-only (Config.CHAR3D_DEV_TOOLS)');
    await idbDel(id);
    const reg = this.registry[id];
    if (reg) { reg.saved = null; if (reg.origin === 'saved' || reg.origin === 'session') { reg.supplied = null; reg.source = null; reg.origin = null; } }
  },
  snapshot() { const out = []; for (const v of this.views) out.push(...v.snapshot()); return out; },
  stats() { const s = []; for (const v of this.views) s.push(Object.assign({ fx: Object.assign({}, v.fx.counts), sync: v.sync ? Object.assign({}, v.sync.stats) : null }, v.stats)); return s; },
};
JJK.Char3D = C3;
/** Builds a model template and registers it (used by the automatic loader; the dev tools go through the gated API). */
async function loadInto(id, buf, label, cfg, origin) {
  const sup = await parseSupplied(buf, GLTFLoader, label || id);
  if (!sup) throw new Error('No rigged (skinned) mesh found in ' + (label || 'the file'));
  const t = glbTemplate(id, sup, cfg);
  t.clipCount = t.clipInfo ? Object.keys(t.clipInfo).length : 0;
  const reg = C3.registry[id] || (C3.registry[id] = { label: id });
  reg.supplied = t; reg.source = label || 'a local file'; reg.origin = origin || 'session';
  return t;
}

// ---------------------------------------------------------------- render hooks
const BR = JJK.BattleRenderer, Art = JJK.Art;
let SUPPRESS = null;
const platterCache = new Map();
const origSprite = Art.unitSprite;
/** The tower's rune platter without its flat figure (same canvas size/anchor as the full sprite). */
function platterSprite(id, px) {
  const k = id + ':' + px; if (platterCache.has(k)) return platterCache.get(k);
  const ck = 'us:' + id + ':' + px, saved = Art._cache[ck], had = Object.prototype.hasOwnProperty.call(Art._cache, ck);
  const keep = { cutout: Art.cutout, portrait: Art.portrait, token: Art.token };
  const blank = document.createElement('canvas'); blank.width = blank.height = 1;
  let out = null;
  try {
    delete Art._cache[ck];
    Art.cutout = () => null; Art.portrait = () => null; Art.token = () => blank;
    out = origSprite.call(Art, id, px);
  } finally {
    Art.cutout = keep.cutout; Art.portrait = keep.portrait; Art.token = keep.token;
    if (had) Art._cache[ck] = saved; else delete Art._cache[ck];
  }
  platterCache.set(k, out);
  return out;
}
Art.unitSprite = function (id, px) {
  if (SUPPRESS && SUPPRESS.has(id)) return platterSprite(id, px);
  return origSprite.apply(this, arguments);
};

const origDraw = BR.prototype.drawUnits;
BR.prototype.drawUnits = function (ctx, b) {
  if (!C3.ready || C3.mode === 'off' || this.__char3dFailed) return origDraw.call(this, ctx, b);
  let v = this.__char3d;
  try {
    if (!v) {
      let any = false; for (const u of b.units) if (!u.removed && C3.resolve(u)) { any = true; break; }
      if (!any || !gl()) return origDraw.call(this, ctx, b);
      v = this.__char3d = new View((u) => C3.resolve(u)); C3.views.add(v);
    }
    const live = v.update(this, b);
    if (!live && !v.fx.np && !v.fx.nr) return origDraw.call(this, ctx, b);
    const rect = live ? v.render() : null;
    SUPPRESS = v.handled;
    try { origDraw.call(this, ctx, b); } finally { SUPPRESS = null; }
    v.composite(ctx, rect);
    v.drawFx(ctx);
    // overlays that must stay readable above a figure
    for (const u of b.units) if (u.disabledT > 0 && v.handled.has(u.id) && !u.removed) this.label(ctx, 'DISABLED ' + u.disabledT.toFixed(1), u.x, u.y - 38, '#ff6ad0', 12);
  } catch (e) {
    SUPPRESS = null;
    this.__char3dFailed = true; C3.errors.push(String(e && e.stack || e));
    console.warn('[char3d] 3D layer disabled for this battle view after an error; 2D art restored.', e);
    if (v) { v.detach(); C3.views.delete(v); this.__char3d = null; }
    origDraw.call(this, ctx, b);
  }
};
const origDispose = BR.prototype.dispose;
BR.prototype.dispose = function () {
  if (this.__char3d) { this.__char3d.dispose(); C3.views.delete(this.__char3d); this.__char3d = null; }
  return origDispose.apply(this, arguments);
};
const origSet = BR.prototype.setBattle;
BR.prototype.setBattle = function (b) {
  if (this.__char3d) this.__char3d.detach(); // new battle: release fighters + event hooks
  this.__char3dFailed = false;
  const r = origSet.apply(this, arguments);
  // listen from the very first tick (so the first placement's landing is seen), as long as 3D could apply in this battle
  try {
    if (C3.ready && C3.mode !== 'off' && b && b.roster && Object.keys(b.roster).some((id) => C3.handles(id)) && gl()) {
      if (!this.__char3d) { this.__char3d = new View((u) => C3.resolve(u)); C3.views.add(this.__char3d); }
      this.__char3d.attach(b);
    }
  } catch (e) { C3.errors.push(String(e)); }
  return r;
};

// ---------------------------------------------------------------- settings panel (rendered by js/ui/settings.js)
/** Settings section. Players see at most one graphics toggle (only when a 3D model is actually in use); the model picker,
    saved-model controls, stand-in preview and status text exist only with Config.CHAR3D_DEV_TOOLS. */
C3.settingsPanel = function (UI) {
  const wrap = UI.el('div', { class: 'col', 'data-char3d': 'section', style: 'gap:8px' });
  if (!dev()) {
    const fill = () => {
      wrap.textContent = '';
      const any = Object.values(C3.registry).some((r) => r.supplied) && !!gl();
      wrap.style.display = any ? '' : 'none';
      if (!any) return;
      const cb = UI.el('input', { type: 'checkbox', 'aria-label': '3D characters', 'data-char3d': 'toggle' }); cb.checked = C3.mode !== 'off';
      cb.addEventListener('change', () => { C3.setMode(cb.checked ? 'auto' : 'off'); });
      wrap.append(UI.el('div', { class: 'h2', text: 'Graphics' }), UI.el('label', { class: 'row', style: 'gap:10px' }, [cb, UI.el('div', { class: 'col' }, [UI.el('span', { text: '3D characters' }), UI.el('span', { class: 'dim', style: 'font-size:11.5px', text: 'Turn off on slower devices.' })])]));
    };
    fill(); if (!C3.ready && C3.loaded) C3.loaded.then(fill);
    return wrap;
  }
  const box = UI.el('div', { class: 'col', style: 'gap:8px' });
  wrap.append(UI.el('div', { class: 'h2', text: '3D characters · developer' }), box);
  const sel = UI.el('select', { 'aria-label': '3D characters', 'data-char3d': 'mode', style: 'flex:1' });
  for (const k in MODES) { const o = UI.el('option', { value: k, text: MODES[k] }); if (k === C3.mode) o.selected = true; sel.appendChild(o); }
  const st = UI.el('div', { class: 'dim', 'data-char3d': 'status', style: 'font-size:11.5px' });
  const saved = UI.el('div', { class: 'dim', 'data-char3d': 'saved', style: 'font-size:11.5px' });
  const forget = UI.btn('Forget saved model', async () => { try { await C3.forgetModel('yuji'); msg('Saved model removed from this browser.'); } catch (e) { msg('Could not remove it: ' + (e && e.message || e)); } }, 'small');
  forget.setAttribute('data-char3d', 'forget');
  const refresh = () => {
    st.textContent = C3.status('yuji');
    const r = C3.registry.yuji, sv = r && r.saved;
    saved.textContent = sv ? 'Saved in this browser: ' + sv.name + ' (' + (sv.size / 1048576).toFixed(1) + ' MB)' + (r.origin === 'bundled' || r.origin === 'manifest' ? ' — the bundled model takes priority while it exists.' : '') : 'No model saved in this browser.';
    forget.style.display = sv ? '' : 'none';
  };
  const msg = (t) => { refresh(); if (t) st.textContent = t + ' ' + st.textContent; };
  sel.addEventListener('change', () => { C3.setMode(sel.value); refresh(); });
  const file = UI.el('input', { type: 'file', accept: '.glb,model/gltf-binary', 'aria-label': 'Choose a Yuji .glb model', 'data-char3d': 'file', style: 'font-size:12px' });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return;
    st.textContent = 'Loading ' + f.name + '…';
    try {
      const r = await C3.saveModel('yuji', f);
      msg(r.applied ? 'Saved — ' + f.name + ' will load automatically on every visit (developer builds only).' : 'Saved for when no bundled model is present.');
    } catch (e) { msg('Could not use ' + f.name + ': ' + (e && e.message || e) + '.'); }
    file.value = '';
  });
  box.append(
    UI.el('label', { class: 'row', style: 'gap:10px' }, [UI.el('span', { style: 'width:110px', text: 'Mode' }), sel]),
    st,
    UI.el('label', { class: 'row', style: 'gap:10px' }, [UI.el('span', { class: 'dim', style: 'width:110px;font-size:11.5px', text: 'Test a model file' }), file]),
    UI.el('div', { class: 'row', style: 'gap:10px;align-items:center' }, [saved, forget]),
    UI.el('div', { class: 'dim', style: 'font-size:11px', text: 'Developer tools (Config.CHAR3D_DEV_TOOLS). A bundled assets/models/yuji.glb always takes priority; players never see these controls.' }),
  );
  refresh();
  if (!C3.ready && C3.loaded) C3.loaded.then(refresh);
  return wrap;
};

// ---------------------------------------------------------------- browser storage for a chosen model (IndexedDB)
const IDB_NAME = 'jjk-td-char3d', IDB_STORE = 'models';
function idbOpen() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('browser storage is unavailable')); return; }
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('browser storage is unavailable'));
  });
}
function idbTx(mode, fn) {
  return idbOpen().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, mode), st = tx.objectStore(IDB_STORE), req = fn(st);
    tx.oncomplete = () => { db.close(); res(req && req.result); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error || new Error('storage error (the browser may be out of space or in private mode)')); };
  }));
}
const idbGet = (k) => idbTx('readonly', (s) => s.get(k));
const idbPut = (k, v) => idbTx('readwrite', (s) => s.put(v, k));
const idbDel = (k) => idbTx('readwrite', (s) => s.delete(k));
C3.storage = { get: idbGet, del: idbDel };

// ---------------------------------------------------------------- supplied models
/** Model sources, in priority order: an explicit manifest entry, a bundled assets/models/<id>.glb, then a model remembered in
    this browser. Anything that fails to load falls through to the next source; with none, the 2D art stays. */
async function loadModels() {
  let man = null;
  try { const r = await fetch(MANIFEST, { cache: 'no-cache' }); if (r.ok) man = await r.json(); } catch (e) { man = null; }
  const models = (man && man.models) || {};
  const tryUrl = async (id, url, cfg, origin) => {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return false;
      const buf = await r.arrayBuffer();
      // some hosts answer a missing file with 200 + an HTML page, and Git LFS can publish a text pointer instead of the file:
      // only a real binary glTF ("glTF" magic) counts as a model
      const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
      if (head.length < 4 || head[0] !== 0x67 || head[1] !== 0x6c || head[2] !== 0x54 || head[3] !== 0x46) {
        if (buf.byteLength > 0 && buf.byteLength < 2048 && /git-lfs/.test(new TextDecoder().decode(buf))) { C3.errors.push(url + ' is a Git LFS pointer'); console.warn('[char3d] ' + url + ' is a Git LFS pointer, not the model: commit the .glb normally (GitHub Pages does not serve LFS files).'); }
        return false;
      }
      await loadInto(id, buf, url, cfg, origin);
      return true;
    } catch (e) { C3.errors.push(url + ': ' + (e && e.message || e)); console.warn('[char3d] could not use ' + url, e); return false; }
  };
  for (const id in C3.registry) {
    const reg = C3.registry[id], m = models[id];
    let done = false;
    if (m && m.file && m.enabled !== false) done = await tryUrl(id, 'assets/models/' + m.file, m, 'manifest');
    if (!done && !(m && m.enabled === false)) done = await tryUrl(id, 'assets/models/' + id + '.glb', m || {}, 'bundled');
    // a model remembered by the developer picker is only ever used when the dev tools are on
    let rec = null; if (dev()) { try { rec = await idbGet(id); } catch (e) { rec = null; } }
    reg.saved = rec ? { name: rec.name, size: rec.size } : null;
    if (!done && rec && rec.buf) {
      try { await loadInto(id, rec.buf, rec.name, {}, 'saved'); done = true; }
      catch (e) { C3.errors.push('saved model ' + rec.name + ': ' + (e && e.message || e)); console.warn('[char3d] the model saved in this browser could not be used', e); }
    }
  }
}

C3.loaded = loadModels().catch((e) => { C3.errors.push(String(e)); }).finally(() => { C3.ready = true; });
