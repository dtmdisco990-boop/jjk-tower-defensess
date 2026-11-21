/* 3D stage: one shared WebGL renderer (offscreen, 1280x720 like the battle canvas), an orthographic camera fixed at an angled
   top-down view, and per-battle-view scenes of 3D fighters. Each frame the active fighters are animated, rendered into a
   scissored dirty rectangle and composited into the battle's 2D context inside drawUnits, so they keep the game's layering,
   screen shake, selection rings and HUD. Render-only: nothing here writes to the simulation. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { clone as skClone } from '../../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import { createStandIn, celShade, STANDIN } from './assets.js';
import { analyseRig, RigSolver, P } from './rig.js';
import { Animator, CLIPS } from './animator.js';
import { CombatSync } from './sync.js';
import { Fx2D } from './fx2d.js';
import { ClipDriver, prepareClips, probeInstance, resolveClips } from './clipdriver.js';

export const W = 1280, H = 720;
export const CAMERA = { pitchDeg: 55, figurePx: 86 };
const TH = (CAMERA.pitchDeg * Math.PI) / 180, SIN = Math.sin(TH), COS = Math.cos(TH);
export const WORLD_PER_M = CAMERA.figurePx / COS / STANDIN.height; // world units are screen px on the ground plane's x axis
const FEET_DY = 18; // the 2D sprite's platter centre sits 18px below the unit position: feet go there

/** Screen (stage px) -> ground point; and world -> screen. Exact inverse pair for this camera. */
export function groundFromScreen(sx, sy, out) { out.x = sx; out.y = 0; out.z = sy / SIN; return out; }
export function screenFromWorld(x, y, z, out) { out.x = x; out.y = z * SIN - y * COS; return out; }

// ---------------------------------------------------------------- shared GL
let GL = null;
/** Quality is chosen once, from the GPU: software renderers (no GPU) get no MSAA and a smaller shadow map. Override with
    ?char3dq=high|low or JJK.Char3D.quality before the first battle. */
export const QUALITY = { level: null, aa: true, shadowMap: 1024, shadows: true };
function softwareGL() {
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return true;
    const ext = g.getExtension('WEBGL_debug_renderer_info'), name = ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    const lose = g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch (e) { return false; }
}
export function gl() {
  if (GL) return GL.ok ? GL : null;
  GL = { ok: false };
  try {
    let q = null; try { q = new URLSearchParams(location.search).get('char3dq'); } catch (e) {}
    if (!QUALITY.level) QUALITY.level = q === 'high' || q === 'low' ? q : softwareGL() ? 'low' : 'high';
    if (QUALITY.level === 'low') { QUALITY.aa = false; QUALITY.shadowMap = 512; }
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: QUALITY.aa, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false); r.setClearColor(0x000000, 0); r.autoClear = false;
    r.shadowMap.enabled = QUALITY.shadows; r.shadowMap.type = QUALITY.level === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); GL.ok = false; GL.lost = (GL.lost || 0) + 1; });
    canvas.addEventListener('webglcontextrestored', () => { GL.ok = true; });
    GL = { ok: true, r, canvas, lost: 0, quality: Object.assign({}, QUALITY) };
  } catch (e) {
    console.warn('[char3d] WebGL is unavailable here; characters keep their 2D art.');
    GL = { ok: false, err: String(e && e.message || e) };
  }
  return GL.ok ? GL : null;
}

// ---------------------------------------------------------------- templates (one per model; shared by every instance)
const TEMPLATES = new Map();
/** Template for the procedural stand-in rig. */
export function standInTemplate() {
  if (TEMPLATES.has('standin')) return TEMPLATES.get('standin');
  const probe = createStandIn(), holder = new THREE.Group(); holder.add(probe.root);
  const t = { kind: 'standin', label: STANDIN.label, rig: analyseRig(holder, probe.bones), height: STANDIN.height, scale: WORLD_PER_M };
  TEMPLATES.set('standin', t);
  return t;
}
/** Template for a supplied GLB (from assets.loadSupplied/parseSupplied). `cfg` may carry heightPx / yawDeg / animation. */
export function glbTemplate(id, sup, cfg) {
  cfg = cfg || {};
  const fix = new THREE.Group(), holder = new THREE.Group();
  const model = sup.scene; fix.add(model); holder.add(fix);
  holder.updateMatrixWorld(true);
  const bones = {}; for (const r in sup.map) { const b = model.getObjectByName(sup.map[r]); if (b) bones[r] = b; }
  // face +Z: a figure facing +Z has its left hand on +X
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  let yaw = ((cfg.yawDeg || 0) * Math.PI) / 180;
  if (!cfg.yawDeg && bones.handL && bones.handR && wp(bones.handL).x < wp(bones.handR).x) yaw += Math.PI;
  fix.rotation.y = yaw; holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), hp = bones.hips ? wp(bones.hips) : box.getCenter(new THREE.Vector3());
  fix.position.set(-hp.x, -box.min.y, -hp.z); holder.updateMatrixWorld(true);
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const figPx = cfg.heightPx || CAMERA.figurePx;
  const rig = analyseRig(holder, bones);
  // a file that brings its own ink outline keeps its materials exactly; otherwise cel-shade it (textures preserved) + outline hulls
  let ownOutline = false; model.traverse((o) => { if (o.isMesh && /outline/i.test(o.name + ' ' + (o.material && o.material.name))) ownOutline = true; });
  const toon = cfg.toon !== undefined ? !!cfg.toon : !ownOutline;
  if (toon) celShade(model, (cfg.outline || 0.012) * rig.k);
  const texInfo = capTextures(model, cfg.textureMax);
  const found = resolveClips(sup.clips || [], cfg.clips);
  const useClips = cfg.animation === 'procedural' ? false : !!(found.idle && (found.punchL || found.punchR));
  const t = {
    kind: 'glb', id, label: sup.label, sup, cfg, fixYaw: yaw, fixPos: fix.position.clone(),
    rig, height, scale: figPx / COS / height, bones: Object.keys(bones).length,
    clips: sup.clips || [], useClips, toon, ownOutline, textures: texInfo,
    light: cfg.lighting || (toon ? 'toon' : 'painted'),
  };
  if (useClips) { fix.remove(model); prepareClips(t, probeInstance(t)); }
  fix.remove(model); // the original scene stays a pristine template; instances are skeleton-clones
  TEMPLATES.set('glb:' + id, t);
  return t;
}

/** GPU copies of very large textures are resized (the file itself is untouched): a figure ~86px tall gains nothing from 4K maps,
    and three 4096^2 maps would need ~250 MB of video memory per model. `max` from the manifest (textureMax) overrides. */
function capTextures(model, max) {
  const mobile = typeof navigator !== 'undefined' && ((navigator.deviceMemory && navigator.deviceMemory <= 4) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
  const cap = max || (mobile ? 1024 : 2048), seen = new Set(), out = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
      const tex = m && m[k]; if (!tex || seen.has(tex) || !tex.image) continue; seen.add(tex);
      const img = tex.image, w = img.width || 0, h = img.height || 0;
      const rec = { slot: k, w, h, gpu: [w, h] };
      if (w > cap || h > cap) {
        const sc = cap / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        if (img.close) img.close();
        tex.image = c; tex.needsUpdate = true; rec.gpu = [c.width, c.height];
      }
      out.push(rec);
    }
  });
  return out;
}

// ---------------------------------------------------------------- one fighter on the field
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = { x: 0, y: 0 };
class Fighter {
  constructor(tpl, uid) {
    this.tpl = tpl; this.uid = uid;
    this.root = new THREE.Group(); this.root.name = 'char3d:' + uid;
    this.holder = new THREE.Group(); this.root.add(this.holder);
    let bones = {};
    if (tpl.kind === 'standin') {
      const inst = createStandIn(); this.holder.add(inst.root); bones = inst.bones; this.meshes = inst.meshes; this.skeletons = [inst.skeleton];
    } else {
      const fix = new THREE.Group(); fix.rotation.y = tpl.fixYaw; fix.position.copy(tpl.fixPos);
      const model = skClone(tpl.sup.scene); fix.add(model); this.holder.add(fix); this.model = model;
      for (const r of tpl.rig.roles) { const b = model.getObjectByName(tpl.rig.info[r].name); if (b) bones[r] = b; }
      this.meshes = []; this.skeletons = [];
      model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = !(o.userData.char3dOutline || /outline/i.test(o.name)); this.meshes.push(o); if (o.isSkinnedMesh && !this.skeletons.includes(o.skeleton)) this.skeletons.push(o.skeleton); } });
    }
    this.holder.scale.setScalar(tpl.scale);
    this.solver = new RigSolver(tpl.rig, bones);
    this.anim = new Animator(uid);
    this.driver = tpl.useClips ? new ClipDriver(tpl, this.holder, this.model, bones, this.solver, uid) : null;
    this.charge = 0; this.chargeHand = null; this.chargeBF = false;
    this.fist = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
    this.screen = { x: 0, y: 0 };
    this.lastTarget = null; this.lastAttackT = -9; this.level = 1;
  }
  dispose() {
    // geometry/materials/textures are shared with the template: only drop this instance's skeleton textures + mixer bindings
    for (const s of this.skeletons) if (s.boneTexture) s.dispose();
    if (this.driver) this.driver.dispose();
    this.root.removeFromParent();
  }
  get state() { return this.driver ? this.driver.state : this.anim.state; }
  get counts() { return this.driver ? this.driver.counts : this.anim.counts; }
  get yaw() { return this.driver ? this.driver.yaw || 0 : this.anim.facing.yaw; }
  get yawTarget() { return this.driver ? this.driver.facing.target : this.anim.facing.target; }
  get steps() { return this.driver ? this.driver.feet.steps : this.anim.feet.steps; }
}

// ---------------------------------------------------------------- per battle-view scene
const PRED = { t: 0, interval: 0.5, bf: false, target: null };
export class View {
  constructor(resolve) {
    this.resolve = resolve; // (unit) -> template | null
    this.scene = new THREE.Scene();
    const D = 3000;
    this.camera = new THREE.OrthographicCamera(0, W, 0, -H, 1, 6000);
    this.camera.position.set(0, D * SIN, D * COS); this.camera.rotation.set(-TH, 0, 0); this.camera.updateMatrixWorld(true);
    this.hemi = new THREE.HemisphereLight(0xfff2e6, 0x3a3550, 1.15); this.scene.add(this.hemi);
    const key = (this.key = new THREE.DirectionalLight(0xffffff, 2.3));
    key.castShadow = true; key.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.8;
    this.scene.add(key, key.target);
    const rim = (this.rim = new THREE.DirectionalLight(0xc8d8ff, 0.7)); rim.position.set(200, 260, -600); this.scene.add(rim);
    this.lightPreset = 'toon';
    this.lightDir = new THREE.Vector3(-0.32, 0.86, 0.4).normalize();
    const ground = (this.ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.32 })));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2 / SIN); ground.receiveShadow = true; this.scene.add(ground);
    this.fighters = new Map(); this.pool = new Map();
    this.fx = new Fx2D(); this.fx.squash = SIN;
    this.battle = null; this.sync = null; this.lastT = null;
    this.rect = { x: 0, y: 0, w: 0, h: 0 };
    this.stats = { frames: 0, renderMs: 0, avgMs: 0, fighters: 0, created: 0, released: 0, reused: 0, aimN: 0, aimOk: 0 };
    this.handled = new Set();
    this.reduced = false;
  }
  attach(b) {
    if (this.battle === b) return;
    this.detach();
    this.battle = b; this.lastT = null; this.fx.clear();
    if (b) this.sync = new CombatSync(b, (u) => !!this.resolve(u));
  }
  detach() {
    if (this.sync) this.sync.dispose();
    this.sync = null;
    for (const f of this.fighters.values()) this.release(f);
    this.fighters.clear(); this.battle = null; this.fx.clear();
  }
  dispose() {
    this.detach();
    for (const list of this.pool.values()) for (const f of list) f.dispose();
    this.pool.clear();
    this.ground.geometry.dispose(); this.ground.material.dispose();
    if (this.key.shadow && this.key.shadow.map) this.key.shadow.map.dispose();
  }
  acquire(tpl, u) {
    const k = tpl.kind + ':' + (tpl.id || ''), list = this.pool.get(k);
    let f = list && list.pop();
    if (f) { f.uid = u.uid; f.anim = new Animator(u.uid); this.stats.reused++; }
    else { f = new Fighter(tpl, u.uid); this.stats.created++; }
    f.key = k; f.unit = u; f.level = u.level; f.lastTarget = null; f.pendingBF = f.pendingDivergent = null; f.pendingAura = false;
    const yaw0 = this.restYaw(u);
    f.anim.feet.reset(); f.anim.facing.yaw = f.anim.facing.target = yaw0;
    if (f.driver) f.driver.reset(yaw0);
    this.scene.add(f.root);
    return f;
  }
  /** Before any target: face the nearest stretch of enemy path (render-only read of the map geometry). */
  restYaw(u) {
    let best = null, bd = Infinity;
    try {
      const sets = this.battle && this.battle.geo ? [this.battle.geo.ground, this.battle.geo.air] : [];
      for (const set of sets) for (const path of set || []) {
        const pts = path.pts || path.points || path.p || null; if (!pts || !pts.length) continue;
        for (let i = 0; i < pts.length; i++) { const p = pts[i], x = p.x !== undefined ? p.x : p[0], y = p.y !== undefined ? p.y : p[1], d = (x - u.x) * (x - u.x) + (y - u.y) * (y - u.y); if (d < bd) { bd = d; best = { x, y }; } }
      }
    } catch (e) { best = null; }
    return best ? Math.atan2(best.x - u.x, (best.y - u.y) / SIN) : 0.35;
  }
  release(f) {
    f.root.removeFromParent(); f.unit = null; f.lastTarget = null;
    if (!this.pool.has(f.key)) this.pool.set(f.key, []);
    const list = this.pool.get(f.key);
    if (list.length < 24) list.push(f); else f.dispose();
    this.stats.released++;
  }
  active(b) { if (!b || !gl()) return false; for (const u of b.units) if (!u.removed && this.resolve(u)) return true; return this.fighters.size > 0 || this.fx.np > 0 || this.fx.nr > 0; }

  /** Advance animation by the renderer's own (speed-scaled) clock and render into the shared GL canvas. */
  update(renderer, b) {
    this.attach(b); this.renderer = renderer;
    const t = renderer.t, dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - this.lastT)); this.lastT = t;
    const set = renderer.view && renderer.view.settings;
    this.reduced = !!(set && set.reduced) || (typeof document !== 'undefined' && document.body && document.body.classList.contains('reduced'));
    this.fx.reduced = this.reduced;
    // 1. instances follow the unit list (placements, sells, battle restarts)
    this.handled.clear();
    const seen = this.seen || (this.seen = new Set()); seen.clear();
    for (const u of b.units) {
      if (u.removed) continue;
      const tpl = this.resolve(u); if (!tpl) continue;
      let f = this.fighters.get(u.uid);
      if (f && f.tpl !== tpl) { this.release(f); this.fighters.delete(u.uid); f = null; }
      if (!f) { f = this.acquire(tpl, u); this.fighters.set(u.uid, f); }
      f.unit = u; seen.add(u.uid); this.handled.add(u.id);
    }
    for (const [uid, f] of this.fighters) if (!seen.has(uid)) { this.release(f); this.fighters.delete(uid); }
    // 2. combat events -> animation triggers
    if (this.sync) this.sync.drain((e) => this.onEvent(e));
    // lighting: hand-painted textures (shading baked in) want soft, even light; toon materials want a strong key
    const first = this.fighters.values().next().value;
    if (first && first.tpl.light !== this.lightPreset) this.applyLight(first.tpl.light);
    // 3. animate + pose
    for (const f of this.fighters.values()) this.animate(f, dt, b);
    this.fx.update(dt);
    this.stats.fighters = this.fighters.size;
    return this.fighters.size > 0;
  }
  applyLight(p) {
    this.lightPreset = p;
    if (p === 'painted') { this.hemi.intensity = 2.6; this.key.intensity = 1.25; this.rim.intensity = 0.35; }
    else { this.hemi.intensity = 1.15; this.key.intensity = 2.3; this.rim.intensity = 0.7; }
  }
  onEvent(e) {
    const f = e.u && this.fighters.get(e.u.uid); if (!f) return;
    const u = e.u, D = f.driver, A = f.anim;
    if (e.type === 'placed') { if (D) D.land(); else A.play('land', 1); return; }
    if (e.type === 'upgraded') { if (D) D.upgrade(); else A.play('upgrade', 1); f.pendingAura = true; this.fx.aura(u.x, u.y + FEET_DY); return; }
    if (e.type === 'sold') return;
    f.lastTarget = f.lastTarget || { x: 0, y: 0 }; f.lastTarget.x = e.x; f.lastTarget.y = e.y; f.lastAttackT = this.battle.time;
    this.sync.predict(u, PRED);
    if (e.type === 'follow') { f.pendingDivergent = { x: e.x, y: e.y }; if (D) { this.fx.divergent(e.x, e.y - 8); f.pendingDivergent = null; } else A.strike('follow', this.rateFor(u, CLIPS.jab)); return; }
    if (e.type === 'blackflash') f.pendingBF = { x: e.x, y: e.y };
    if (D) D.strike(e.type === 'blackflash' ? 'blackflash' : 'punch', PRED.interval);
    else A.strike(e.type === 'blackflash' ? 'blackflash' : 'punch', this.rateFor(u, e.type === 'blackflash' ? CLIPS.blackflash : CLIPS.jab));
  }
  rateFor(u, clip) {
    this.sync.predict(u, PRED);
    return Math.max(1, Math.min(2.6, (clip.dur * 1.05) / Math.max(0.12, PRED.interval)));
  }
  animate(f, dt, b) {
    const u = f.unit, fl = u.flags || {}, D = f.driver, A = f.anim;
    // prediction: the cooldown says when the next hit lands, pickTarget says at whom (both pure reads)
    this.sync.predict(u, PRED);
    const tgt = PRED.target || (f.lastTarget && b.time - f.lastAttackT < 0.8 ? f.lastTarget : null);
    const want = tgt ? Math.atan2(tgt.x - u.x, (tgt.y - u.y) / SIN) : null;
    let yaw, lift, impact;
    if (D) {
      D.buffed = u.buffSpdT > 0; D.divergent = !!fl.divergent; D.setDisabled(u.disabledT > 0);
      if (PRED.target && u.disabledT <= 0 && PRED.t > 0) D.maybePrime(PRED.bf ? 'blackflash' : 'punch', PRED.t, PRED.interval);
      impact = D.update(dt, want);
      yaw = D.yaw; lift = D.lift;
      f.charge = Math.max(D.charge, Math.max(0, (u.level - 3) * 0.08) * (0.7 + 0.3 * Math.sin(D.time * 5))); f.chargeHand = D.chargeHand; f.chargeBF = D.chargeBF;
    } else {
      A.buffed = u.buffSpdT > 0;
      A.setDisabled(u.disabledT > 0);
      if (want !== null) A.facing.target = want;
      if (PRED.target && u.disabledT <= 0) {
        const clip = PRED.bf ? CLIPS.blackflash : CLIPS.jab, rate = this.rateFor(u, clip);
        if (PRED.t > 0 && PRED.t <= clip.hold / rate + 1 / 60) A.prime(PRED.bf ? 'blackflash' : 'punch', rate);
      }
      yaw = A.facing.update(dt, A.state === 'idle' ? 9 : 16);
      const pose = A.update(dt, 1);
      const lvlGlow = Math.max(0, (u.level - 3) * 0.08) * (0.7 + 0.3 * Math.sin(A.time * 5));
      if (pose[P.charge] < lvlGlow) pose[P.charge] = lvlGlow;
      const clip = A.clip, stepDur = clip ? clip.step / Math.max(1, A.rate) : 0.13;
      A.feet.update(dt, pose, yaw, stepDur, pose[P.lift] > 0.05);
      f.solver.solve(pose);
      lift = pose[P.lift]; impact = A.impact ? { key: A.impact.clip, hand: A.impact.hand } : null;
      f.charge = pose[P.charge]; f.chargeHand = A.clip && A.clip.hand ? A.clip.hand : null; f.chargeBF = A.clipName === 'blackflash' && !!A.clip;
    }
    // place on the field: feet on the platter, facing the target
    groundFromScreen(u.x, u.y + FEET_DY, _v);
    f.root.position.set(_v.x, lift * WORLD_PER_M, _v.z); f.root.rotation.y = yaw;
    f.root.updateMatrixWorld(true);
    // fist positions on screen (for the effects layer): taken from the posed hand bones
    for (const side of ['L', 'R']) {
      const hb = f.solver.bones['hand' + side];
      if (hb) { hb.getWorldPosition(_v2); screenFromWorld(_v2.x, _v2.y, _v2.z, _s); f.fist[side].x = _s.x; f.fist[side].y = _s.y; }
    }
    f.screen.x = u.x; f.screen.y = u.y + FEET_DY;
    if (impact) this.impactFx(f, impact, u);
    f.level = u.level;
  }
  /** Effects tied to the animation's own impact frames (not the sim's hit time), so they land where the fist lands. */
  impactFx(f, im, u) {
    const key = im.key || '', tg = f.lastTarget || f.fist.R, fist = f.fist[im.hand || 'R'];
    if (key !== 'land' && key !== 'upgrade' && f.lastTarget) { const want = Math.atan2(tg.x - u.x, (tg.y - u.y) / SIN), d = Math.abs(Math.atan2(Math.sin(f.yaw - want), Math.cos(f.yaw - want))); this.stats.aimN++; if (d < 0.35) this.stats.aimOk++; }
    if (key === 'land') { this.fx.dust(f.screen.x, f.screen.y); return; }
    if (key === 'upgrade') { if (f.pendingAura) { this.fx.aura(f.screen.x, f.screen.y); f.pendingAura = false; } return; }
    const bf = key === 'blackflash';
    this.fx.impact(fist.x, fist.y, bf ? 'blackflash' : key.startsWith('div') || key === 'divergent' ? 'divergent' : 'punch', tg.x - u.x, tg.y - u.y);
    if (bf) {
      const p = f.pendingBF || tg;
      this.fx.impact(p.x, p.y - 10, 'blackflash', tg.x - u.x, tg.y - u.y);
      this.fx.bolt(fist.x, fist.y, p.x, p.y - 10, 0.3); this.fx.bolt(fist.x, fist.y, p.x, p.y - 10, 0.22);
      const vfx = this.renderer && this.renderer.vfx;
      if (vfx) { vfx.shake(6, 0.22); vfx.flash('#ff1f3d', 0.16, 0.22); if (vfx.text) vfx.text(p.x, p.y - 56, 'BLACK FLASH', '#ff2448', 22, { bold: true, dur: 0.9 }); }
      f.pendingBF = null;
    }
    if ((key.startsWith('div') || key === 'divergent') && f.pendingDivergent) { this.fx.divergent(f.pendingDivergent.x, f.pendingDivergent.y - 8); f.pendingDivergent = null; }
  }
  /** Render the active fighters into the shared canvas; returns the dirty rectangle or null. */
  render() {
    const G = gl(); if (!G || this.fighters.size === 0) return null;
    const t0 = performance.now();
    let x0 = W, y0 = H, x1 = 0, y1 = 0, cx = 0, cz = 0, n = 0, ext = 0;
    for (const f of this.fighters.values()) {
      const sx = f.screen.x, sy = f.screen.y;
      x0 = Math.min(x0, sx - 120); x1 = Math.max(x1, sx + 130); y0 = Math.min(y0, sy - 165); y1 = Math.max(y1, sy + 60);
      cx += f.root.position.x; cz += f.root.position.z; n++;
    }
    cx /= n; cz /= n;
    for (const f of this.fighters.values()) ext = Math.max(ext, Math.abs(f.root.position.x - cx), Math.abs(f.root.position.z - cz));
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return null;
    // shadow camera hugs the fighters
    const key = this.key, L = this.lightDir, sc = key.shadow.camera, half = ext + 180;
    key.target.position.set(cx, 0, cz); key.position.set(cx + L.x * 1500, L.y * 1500, cz + L.z * 1500);
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 200; sc.far = 3200; sc.updateProjectionMatrix();
    key.target.updateMatrixWorld(); key.updateMatrixWorld();
    const r = G.r, R = this.rect;
    R.x = x0; R.y = y0; R.w = x1 - x0; R.h = y1 - y0;
    r.setRenderTarget(null);
    r.setViewport(0, 0, W, H);
    r.setScissor(x0, H - y1, R.w, R.h); r.setScissorTest(true);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    const ms = performance.now() - t0;
    this.stats.frames++; this.stats.renderMs = ms; this.stats.avgMs = this.stats.avgMs ? this.stats.avgMs * 0.95 + ms * 0.05 : ms;
    return R;
  }
  /** Copy the dirty rect into the battle canvas (inside the renderer's shake transform). */
  composite(ctx, R) {
    const G = gl(); if (!G || !R) return;
    ctx.drawImage(G.canvas, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h);
  }
  drawFx(ctx) {
    const t = this.lastT || 0;
    for (const f of this.fighters.values()) {
      const c = f.charge;
      if (c <= 0.02) continue;
      if (f.chargeHand) {
        this.fx.charge(ctx, f.fist[f.chargeHand].x, f.fist[f.chargeHand].y, c, f.chargeBF, t);
        if (f.chargeBF && c > 0.5 && !this.reduced && Math.random() < 0.35) { const h = f.fist[f.chargeHand]; this.fx.bolt(h.x, h.y, h.x + (Math.random() - 0.5) * 50, h.y - 10 - Math.random() * 40, 0.08); }
      } else { this.fx.charge(ctx, f.fist.L.x, f.fist.L.y, c, false, t); this.fx.charge(ctx, f.fist.R.x, f.fist.R.y, c, false, t); }
    }
    this.fx.draw(ctx);
  }
  /** Debug/test snapshot. */
  snapshot() {
    const out = [];
    for (const f of this.fighters.values()) out.push({ uid: f.uid, kind: f.tpl.kind, clips: !!f.driver, state: f.state, yaw: +f.yaw.toFixed(3), target: +f.yawTarget.toFixed(3), counts: Object.assign({}, f.counts), steps: f.steps, fist: { L: Object.assign({}, f.fist.L), R: Object.assign({}, f.fist.R) }, screen: Object.assign({}, f.screen), charge: +f.charge.toFixed(3) });
    return out;
  }
}
