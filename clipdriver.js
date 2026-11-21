/* Drives a supplied model with the animation clips embedded in its file (idle stance, left/right punches, Divergent Fist,
   Black Flash, 90-degree turns), synchronised to the simulation:
   - clips are prepared once per model: every clip is re-centred on its own stance so all of them share the platter centre,
     and turn clips are made "in place" (their yaw is extracted and drives the tower's facing instead, so the body turns
     about the platter, not about the file's origin);
   - strikes play an anticipation -> impact -> recovery *window* of each clip, time-warped so the clip's own impact frame
     lands on the simulation's hit and the recovery fits the attack interval (clips are far longer than one attack);
   - after the clips are blended, a foot planter + two-bone leg IK keep planted feet fixed on the ground while the tower
     rotates (the clips' foot motion becomes steps with lift instead of slides);
   - small procedural overlays add the power-up, landing and stunned reactions the file has no clips for.
   Times inside a clip are the file's own seconds; per-frame work allocates nothing. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { clone as skClone } from '../../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import { FootPlanter, Facing, wrapAngle } from './animator.js';
import { P, PN } from './rig.js';

const CLIP_PATTERNS = {
  idle: [/idle|stance|guard/i], turnL: [/turn[ _-]?l(eft)?\b|turn_?left/i], turnR: [/turn[ _-]?r(ight)?\b|turn_?right/i],
  blackflash: [/black[ _-]?flash/i, /heavy|special/i], divergent: [/divergent/i],
  punchL: [/punch[ _-]?l(eft)?\b|punch_?left|jab/i], punchR: [/punch[ _-]?r(ight)?\b|punch_?right|cross/i],
};
const ORDER = ['idle', 'turnL', 'turnR', 'blackflash', 'divergent', 'punchL', 'punchR'];
export function resolveClips(clips, override) {
  const out = {}, used = new Set();
  for (const k of ORDER) {
    const want = override && override[k];
    let c = want ? clips.find((x) => x.name === want) : null;
    if (!c) for (const re of CLIP_PATTERNS[k]) { c = clips.find((x) => !used.has(x) && re.test(x.name)); if (c) break; }
    if (c) { out[k] = c; used.add(c); }
  }
  return out;
}

const _m = new THREE.Matrix4(), _m3 = new THREE.Matrix3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
function yawOfQ(q) { _a.set(0, 0, 1).applyQuaternion(q); return Math.atan2(_a.x, _a.z); }

/**
 * One-time preparation of a template's clips (mutates the template's own AnimationClip data in memory, never the file).
 * `holderFactory()` returns { holder, model, bones } — a probe instance in the canonical frame.
 */
export function prepareClips(tpl, probe) {
  if (tpl.clipInfo) return tpl.clipInfo;
  const map = resolveClips(tpl.clips, tpl.cfg && tpl.cfg.clips);
  const { holder, model, bones } = probe, rig = tpl.rig, k = rig.k;
  const hipsName = rig.info.hips.name, hipsBone = bones.hips;
  const mixer = new THREE.AnimationMixer(model);
  const inv = new THREE.Matrix4();
  const rs = (b, p, q) => { holder.updateMatrixWorld(true); inv.copy(holder.matrixWorld).invert(); _m.multiplyMatrices(inv, b.matrixWorld); _m.decompose(p, q || _q, _s); return p; };
  const evalAt = (clip, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clip); a.reset(); a.play(); a.time = t; a.setEffectiveWeight(1); mixer.update(0); holder.updateMatrixWorld(true); };
  // hips parent space <-> canonical space
  const PMinv = rig.info.hips.parentMInv, PQ = rig.info.hips.parentQ;
  const PQinv = PQ.clone().invert();
  // nodes above the hips (an "orientation"/armature root): files often animate these too (root yaw, root motion)
  const ancestors = new Set(); for (let n = hipsBone.parent; n && n !== holder; n = n.parent) if (n.name) ancestors.add(n.name);
  const info = {};
  const unwrapYaw = (q) => yawOfQ(q);
  for (const key in map) {
    const clip = map[key];
    const pos = clip.tracks.find((t) => t.name === hipsName + '.position'), rot = clip.tracks.find((t) => t.name === hipsName + '.quaternion');
    // stance centre at frame 0 = midpoint of the feet (with every root transform applied)
    evalAt(clip, 0);
    const fL = rs(bones.footL, new THREE.Vector3()), fR = rs(bones.footR, new THREE.Vector3());
    const C = new THREE.Vector3((fL.x + fR.x) / 2, 0, (fL.z + fR.z) / 2);
    const isTurn = key === 'turnL' || key === 'turnR';
    // canonical-space hips transform at every hips keyframe (bakes any animated root/armature transform into the hips)
    const P0 = pos ? new Float32Array(pos.times.length * 3) : null, Q0 = rot ? new Float32Array(rot.times.length * 4) : null;
    if (pos) for (let i = 0; i < pos.times.length; i++) { evalAt(clip, pos.times[i]); rs(bones.hips, _a); P0[i * 3] = _a.x; P0[i * 3 + 1] = _a.y; P0[i * 3 + 2] = _a.z; }
    if (rot) for (let i = 0; i < rot.times.length; i++) { evalAt(clip, rot.times[i]); rs(bones.hips, _a, _qa); Q0[i * 4] = _qa.x; Q0[i * 4 + 1] = _qa.y; Q0[i * 4 + 2] = _qa.z; Q0[i * 4 + 3] = _qa.w; }
    // yaw profile of the hips (turn clips): drives the tower's facing while the clip plays in place
    let times = null, theta = null, total = 0;
    if (isTurn && rot) {
      const n = rot.times.length; times = new Float32Array(n); theta = new Float32Array(n);
      let prev = 0, acc = 0;
      for (let i = 0; i < n; i++) {
        _qa.set(Q0[i * 4], Q0[i * 4 + 1], Q0[i * 4 + 2], Q0[i * 4 + 3]); const y = unwrapYaw(_qa);
        if (i === 0) prev = y;
        acc += wrapAngle(y - prev); prev = y; times[i] = rot.times[i]; theta[i] = acc;
      }
      total = theta[n - 1];
    }
    const thetaAt = (t) => { if (!times) return 0; const n = times.length; if (t <= times[0]) return theta[0]; if (t >= times[n - 1]) return theta[n - 1]; let i = 0; while (i < n - 2 && times[i + 1] < t) i++; const w = (t - times[i]) / Math.max(1e-6, times[i + 1] - times[i]); return theta[i] + (theta[i + 1] - theta[i]) * w; };
    // root tracks are now baked into the hips: drop them so the root node stays at rest
    clip.tracks = clip.tracks.filter((t) => { const node = t.name.slice(0, t.name.lastIndexOf('.')); return !ancestors.has(node); });
    // re-centre on the stance; turns additionally lose their yaw (it becomes the tower's facing instead)
    if (pos) {
      const v = pos.values;
      for (let i = 0; i < pos.times.length; i++) {
        _a.set(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]);
        if (isTurn) { _qy.setFromAxisAngle(Y, -thetaAt(pos.times[i])); _a.applyQuaternion(_qy); }
        _a.x -= C.x; _a.z -= C.z;
        _a.applyMatrix4(PMinv); v[i * 3] = _a.x; v[i * 3 + 1] = _a.y; v[i * 3 + 2] = _a.z;
      }
    }
    if (rot) {
      const v = rot.values;
      for (let i = 0; i < rot.times.length; i++) {
        _qb.set(Q0[i * 4], Q0[i * 4 + 1], Q0[i * 4 + 2], Q0[i * 4 + 3]);
        if (isTurn) { _qy.setFromAxisAngle(Y, -thetaAt(rot.times[i])); _qb.premultiply(_qy); }
        _qb.premultiply(PQinv);
        v[i * 4] = _qb.x; v[i * 4 + 1] = _qb.y; v[i * 4 + 2] = _qb.z; v[i * 4 + 3] = _qb.w;
      }
    }
    info[key] = { key, clip, dur: clip.duration, C, times, theta, total };
  }
  // strike analysis on the prepared clips: which fist travels furthest forward, and when (the impact frame)
  for (const key of ['punchL', 'punchR', 'divergent', 'blackflash']) {
    const I = info[key]; if (!I) continue;
    const n = Math.ceil(I.dur * 60) + 1, zL = new Float32Array(n), zR = new Float32Array(n);
    for (let i = 0; i < n; i++) { evalAt(I.clip, (I.dur * i) / (n - 1)); zL[i] = rs(bones.handL, _b).z; zR[i] = rs(bones.handR, _c).z; }
    const peak = (z) => { let m = 0; for (let i = 1; i < n; i++) if (z[i] > z[m]) m = i; return m; };
    const pL = peak(zL), pR = peak(zR), gainL = zL[pL] - zL[0], gainR = zR[pR] - zR[0];
    const hand = gainL >= gainR ? 'L' : 'R', z = hand === 'L' ? zL : zR, pi = hand === 'L' ? pL : pR;
    const ti = (I.dur * pi) / (n - 1), thr = z[0] + 0.35 * (z[pi] - z[0]);
    let back = n - 1; for (let i = pi; i < n; i++) if (z[i] < thr) { back = i; break; }
    const heavy = key === 'blackflash';
    I.hand = hand; I.ti = ti; I.reach = (z[pi] - z[0]) / k;
    I.a = Math.min(ti, heavy ? 0.5 : key === 'divergent' ? 0.32 : 0.3);
    I.r = Math.max(0.25, Math.min(heavy ? 0.85 : 0.7, (I.dur * back) / (n - 1) - ti + (heavy ? 0.15 : 0)));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  // reset probe to rest
  tpl.clipInfo = info; tpl.clipMap = Object.fromEntries(Object.entries(map).map(([k2, c]) => [k2, c.name]));
  void hipsBone;
  return info;
}

// ---------------------------------------------------------------- per-instance driver
const MAXL = 3;
export class ClipDriver {
  constructor(tpl, holder, model, bones, solver, uid) {
    this.tpl = tpl; this.holder = holder; this.model = model; this.bones = bones; this.solver = solver;
    this.info = tpl.clipInfo; this.k = tpl.rig.k;
    this.mixer = new THREE.AnimationMixer(model);
    this.act = {};
    for (const key in this.info) { const a = this.mixer.clipAction(this.info[key].clip); a.play(); a.setEffectiveWeight(0); a.time = 0; this.act[key] = a; }
    this.layers = []; for (let i = 0; i < MAXL; i++) this.layers.push({ on: false, key: '', I: null, t: 0, w: 0, phase: 'off', rate: 1, rr: 1, hold: 0, freeze: 0, impact: false, kind: '' });
    this.base = 'idle'; this.baseT = 0; this.prevBase = ''; this.prevBaseT = 0; this.baseFade = 1;
    this.turn = null; // { key, t, yaw0, scale }
    this.facing = new Facing(0); this.feet = new FootPlanter();
    this.pose = new Float32Array(PN);
    this.nextHand = 'L'; this.divergent = false; this.buffed = false; this.disabled = false; this.disW = 0;
    this.upT = -1; this.landT = -1; this.lift = 0;
    this.impact = null; this.charge = 0; this.chargeHand = null; this.chargeBF = false;
    this.state = 'idle'; this.time = (uid || 0) * 0.37;
    this.counts = { punchL: 0, punchR: 0, divergent: 0, blackflash: 0, primed: 0, turnL: 0, turnR: 0, upgrade: 0, land: 0, holdTimeouts: 0 };
    this.inv = new THREE.Matrix4();
    this.cap = { L: { p: new THREE.Vector3(), q: new THREE.Quaternion(), knee: new THREE.Vector3(), hip: new THREE.Vector3(), yaw: 0 }, R: { p: new THREE.Vector3(), q: new THREE.Quaternion(), knee: new THREE.Vector3(), hip: new THREE.Vector3(), yaw: 0 } };
    this.footIK = !(tpl.cfg && tpl.cfg.footIK === false) && !!(tpl.rig.legL && tpl.rig.legR);
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
  reset(yaw) { this.facing.yaw = this.facing.target = yaw; this.facing.vel = 0; this.feet.reset(); for (const L of this.layers) { L.on = false; L.w = 0; } this.base = 'idle'; this.turn = null; this.baseFade = 1; }

  // ------------------------------------------------------------ triggers
  pick(kind) {
    if (kind === 'blackflash' && this.info.blackflash) return 'blackflash';
    if (this.nextHand === 'L' && this.info.punchL) return 'punchL';
    if (this.divergent && this.info.divergent) return 'divergent';
    return this.info.punchR ? 'punchR' : this.info.punchL ? 'punchL' : null;
  }
  windupRate(I, interval) { return Math.max(1, Math.min(3, I.a / ((I.key === 'blackflash' ? 0.75 : 0.5) * Math.max(0.1, interval)))); }
  recoverRate(I, interval) { return Math.max(1, Math.min(3, I.r / (0.55 * Math.max(0.1, interval)))); }
  active() { for (const L of this.layers) if (L.on && L.phase !== 'out') return L; return null; }
  _layer(key, t, rate, phase) {
    for (const L of this.layers) if (L.on) { if (L.key === key) { L.on = false; L.w = 0; } else L.phase = 'out'; } // one layer per action
    let slot = this.layers.find((L) => !L.on) || this.layers.reduce((m, L) => (L.w < m.w ? L : m));
    const I = this.info[key];
    slot.on = true; slot.key = key; slot.I = I; slot.t = t; slot.w = 0; slot.phase = phase; slot.rate = rate; slot.hold = 0; slot.freeze = 0; slot.impact = false;
    this.endTurn();
    return slot;
  }
  /** Predicted attack in `timeToAttack` seconds: start the clip's anticipation so its impact frame meets the hit. */
  maybePrime(kind, timeToAttack, interval) {
    if (this.disabled || this.landT >= 0) return false;
    const A = this.active(); if (A && (A.phase === 'windup' || A.phase === 'hold' || A.phase === 'release' || A.phase === 'freeze')) return false;
    if (A && A.phase === 'recover' && A.t < A.I.ti + A.I.r * 0.45) return false;
    const key = this.pick(kind); if (!key) return false;
    const I = this.info[key], rw = this.windupRate(I, interval);
    if (timeToAttack > I.a / rw + 1 / 60) return false;
    const L = this._layer(key, I.ti - I.a, Math.max(rw, I.a / Math.max(0.04, timeToAttack)), 'windup');
    L.kind = kind; this.counts.primed++;
    return true;
  }
  /** The simulation landed a hit: release the primed wind-up, or snap into the strike. */
  strike(kind, interval) {
    let L = this.active(), key = this.pick(kind);
    if (!key) return null;
    if (!(L && (L.phase === 'windup' || L.phase === 'hold') && L.key === key)) {
      const I = this.info[key];
      L = this._layer(key, Math.max(0, I.ti - 0.08), 1.6, 'release');
    } else L.phase = 'release';
    L.kind = kind;
    L.rate = Math.max(L.rate, (L.I.ti - L.t) / 0.05, 1);
    L.rr = this.recoverRate(L.I, interval);
    this.counts[key]++;
    if (key !== 'blackflash') this.nextHand = this.nextHand === 'L' ? 'R' : 'L'; else this.nextHand = 'L';
    return key;
  }
  upgrade() { this.upT = 0; this.counts.upgrade++; }
  land() { this.landT = 0; this.counts.land++; }
  setDisabled(on) {
    if (on && !this.disabled) for (const L of this.layers) if (L.on) L.phase = 'out';
    if (on) this.endTurn();
    this.disabled = on;
  }
  endTurn() {
    if (!this.turn) return;
    // keep the facing reached so far; idle takes over the (in-place) pose
    this.facing.yaw = this.turnYaw(); this.facing.vel = 0;
    this.prevBase = this.base; this.prevBaseT = this.baseT; this.baseFade = 0; this.base = 'idle'; this.baseT = 0; this.turn = null;
  }
  turnYaw() { const T = this.turn; if (!T) return this.facing.yaw; const I = this.info[T.key]; return T.yaw0 + this.thetaAt(I, T.t) * T.scale; }
  thetaAt(I, t) { const tm = I.times, th = I.theta; if (!tm) return 0; const n = tm.length; if (t <= 0) return 0; if (t >= tm[n - 1]) return th[n - 1]; const f = (t / tm[n - 1]) * (n - 1), i = Math.floor(f), w = f - i; return th[i] + (th[i + 1] - th[i]) * w; }

  // ------------------------------------------------------------ per frame
  update(dt, desiredYaw) {
    this.impact = null;
    this.time += dt;
    this.disW += ((this.disabled ? 1 : 0) - this.disW) * Math.min(1, dt * 7);
    // facing: big re-targets while free play a turn clip (in place; its yaw drives the tower), small ones use the spring
    if (desiredYaw !== null && desiredYaw !== undefined) this.facing.target = desiredYaw;
    const delta = wrapAngle(this.facing.target - (this.turn ? this.turnYaw() : this.facing.yaw));
    if (!this.turn && !this.active() && !this.disabled && this.landT < 0 && Math.abs(delta) > 1.2) {
      const key = delta > 0 ? (this.info.turnL && this.info.turnL.total > 0 ? 'turnL' : this.info.turnR && this.info.turnR.total > 0 ? 'turnR' : null) : (this.info.turnR && this.info.turnR.total < 0 ? 'turnR' : this.info.turnL && this.info.turnL.total < 0 ? 'turnL' : null);
      if (key) {
        const I = this.info[key], scale = Math.max(0.7, Math.min(1.3, Math.abs(delta) / Math.max(0.3, Math.abs(I.total))));
        this.turn = { key, t: 0, yaw0: this.facing.yaw, scale, rate: 1.45 };
        this.prevBase = this.base; this.prevBaseT = this.baseT; this.baseFade = 0; this.base = key; this.baseT = 0; this.counts[key]++;
      }
    }
    let yaw;
    if (this.turn) {
      const T = this.turn, I = this.info[T.key];
      T.t += dt * T.rate; this.baseT = T.t;
      if (T.t >= I.dur) { T.t = I.dur; yaw = this.turnYaw(); this.facing.yaw = yaw; this.facing.vel = 0; this.turn = null; this.prevBase = this.base; this.prevBaseT = I.dur; this.baseFade = 0; this.base = 'idle'; this.baseT = 0; }
      else yaw = this.turnYaw();
    } else yaw = this.facing.update(dt, this.active() ? 14 : 7);
    this.yaw = yaw;
    // base loop (idle slows right down when stunned; speeds up when buffed)
    if (this.base === 'idle' && this.info.idle) { this.baseT = (this.baseT + dt * (this.buffed ? 1.5 : 1) * (1 - 0.7 * this.disW)) % this.info.idle.dur; }
    if (this.baseFade < 1) this.baseFade = Math.min(1, this.baseFade + dt / 0.14);
    // strike layers
    let sum = 0; this.charge = 0; this.chargeHand = null; this.chargeBF = false;
    for (const L of this.layers) {
      if (!L.on) continue;
      const I = L.I, wind0 = I.ti - I.a;
      switch (L.phase) {
        case 'windup':
          L.t += dt * L.rate;
          if (L.t >= I.ti - 0.02) { L.t = I.ti - 0.02; L.phase = 'hold'; }
          break;
        case 'hold':
          L.hold += dt; if (L.hold > 0.45) { L.phase = 'out'; this.counts.holdTimeouts++; }
          break;
        case 'release':
          L.t += dt * L.rate;
          if (L.t >= I.ti) { L.t = I.ti; L.impact = true; this.impact = { key: L.key, hand: I.hand, kind: L.kind }; L.phase = L.key === 'blackflash' ? 'freeze' : 'recover'; L.freeze = 0; }
          break;
        case 'freeze': // Black Flash hit-stop
          L.freeze += dt; if (L.freeze >= 0.085) L.phase = 'recover';
          break;
        case 'recover':
          L.t += dt * L.rr;
          if (L.t >= Math.min(I.dur, I.ti + I.r)) L.phase = 'out';
          break;
        case 'out':
          L.t = Math.min(I.dur, L.t + dt * (L.rr || 1));
          break;
      }
      const target = L.phase === 'out' ? 0 : 1, sp = L.phase === 'out' ? 1 / 0.16 : 1 / 0.07;
      L.w += Math.sign(target - L.w) * Math.min(Math.abs(target - L.w), dt * sp);
      if (L.phase === 'out' && L.w <= 0.001) { L.on = false; L.w = 0; continue; }
      sum += L.w;
      // fist charge (FX): Black Flash builds through its anticipation; Divergent glows blue
      if (L.key === 'blackflash' || L.key === 'divergent') {
        const c = L.t < I.ti ? Math.max(0, (L.t - wind0) / Math.max(0.05, I.a)) : Math.max(0, 1 - (L.t - I.ti) / 0.35);
        const cc = c * L.w * (L.key === 'blackflash' ? 1 : 0.55);
        if (cc > this.charge) { this.charge = cc; this.chargeHand = I.hand; this.chargeBF = L.key === 'blackflash'; }
      }
    }
    if (sum > 1) { for (const L of this.layers) if (L.on) L.w /= sum; sum = 1; }
    // weights -> mixer (manual time control: update(0) samples every action at its set time)
    for (const key in this.act) this.act[key].setEffectiveWeight(0);
    const free = 1 - sum;
    const bw = free * this.baseFade, pw = free * (1 - this.baseFade);
    if (this.act[this.base]) { this.act[this.base].time = this.baseT; this.act[this.base].setEffectiveWeight(bw); }
    if (pw > 0 && this.prevBase && this.act[this.prevBase] && this.prevBase !== this.base) { this.act[this.prevBase].time = this.prevBaseT; this.act[this.prevBase].setEffectiveWeight(pw); }
    else if (pw > 0 && this.act[this.base]) this.act[this.base].setEffectiveWeight(bw + pw);
    for (const L of this.layers) if (L.on && L.w > 0) { const a = this.act[L.key]; a.time = L.t; a.setEffectiveWeight(a.getEffectiveWeight() + L.w); }
    this.mixer.update(0);
    // state label (debug/tests)
    const A = this.active();
    this.state = this.disabled ? 'disabled' : this.landT >= 0 ? 'land' : this.upT >= 0 ? 'upgrade' : A ? (A.phase === 'windup' || A.phase === 'hold' ? 'primed' : A.key === 'blackflash' ? 'blackflash' : 'strike') : this.turn ? 'turn' : 'idle';
    this.post(dt);
    return this.impact;
  }

  // ------------------------------------------------------------ post: reactions + planted feet
  rsOf(bone, p, q) { _m.multiplyMatrices(this.inv, bone.matrixWorld); _m.decompose(p, q || _q, _s); return p; }
  post(dt) {
    const B = this.bones, k = this.k, I = this.tpl.rig.info;
    this.holder.updateMatrixWorld(true);
    this.inv.copy(this.holder.matrixWorld).invert();
    // 1. capture the clip's own feet (desired spots) before any overlay moves the hips
    if (this.footIK) for (const s of ['L', 'R']) {
      const c = this.cap[s];
      this.rsOf(B['foot' + s], c.p, c.q); this.rsOf(B['shin' + s], c.knee); this.rsOf(B['thigh' + s], c.hip);
      if (B['toe' + s]) { this.rsOf(B['toe' + s], _d); c.yaw = Math.atan2(_d.x - c.p.x, _d.z - c.p.z); } else c.yaw = yawOfQ(c.q);
    }
    // 2. reactions the file has no clips for: power-up, landing, stun (hips dip + torso/head pitch)
    let dip = 0, chest = 0, head = 0; this.lift = 0;
    if (this.upT >= 0) {
      this.upT += dt; const t = this.upT;
      const e1 = t < 0.16 ? t / 0.16 : t < 0.4 ? 1 - (t - 0.16) / 0.24 : 0, e2 = t < 0.16 ? 0 : t < 0.4 ? (t - 0.16) / 0.24 : Math.max(0, 1 - (t - 0.62) / 0.33);
      dip += 0.1 * e1; chest += 0.3 * e1 - 0.22 * e2; head += -0.2 * e2;
      if (t > 0.95) this.upT = -1;
    }
    if (this.landT >= 0) {
      this.landT += dt; const t = this.landT;
      if (t < 0.16) this.lift = 0.9 * (1 - (t / 0.16) * (t / 0.16)); else { const e = Math.max(0, 1 - (t - 0.16) / 0.34); dip += 0.2 * e; chest += 0.25 * e; }
      if (t > 0.5) this.landT = -1;
      if (t >= 0.16 && t - dt < 0.16) this.impact = { key: 'land', hand: null, kind: 'land' };
    }
    if (this.disW > 0.001) { dip += 0.14 * this.disW; chest += 0.35 * this.disW; head += 0.5 * this.disW; }
    if (dip || chest || head) {
      if (dip) { _m3.setFromMatrix4(I.hips.parentMInv); _a.set(0, -dip * k, 0).applyMatrix3(_m3); B.hips.position.add(_a); }
      // pitch about the bone's *current* lateral axis (its rest-relative yaw applied to canonical X), expressed in its local frame
      const tilt = (role, ang) => {
        const b = B[role]; if (!b || !ang) return;
        this.holder.updateMatrixWorld(true); this.rsOf(b, _b, _qa);
        _qb.copy(_qa).multiply(_qy.copy(I[role].restQ).invert()); const yd = yawOfQ(_qb);
        _c.set(Math.cos(yd), 0, -Math.sin(yd)).applyQuaternion(_qb.copy(_qa).invert());
        b.quaternion.multiply(_qy.setFromAxisAngle(_c.normalize(), ang));
      };
      tilt(B.chest ? 'chest' : 'spine', chest); tilt('head', head);
      this.holder.updateMatrixWorld(true);
    }
    // 3. planted feet: clip feet are the *desired* spots; the planter keeps them fixed in the tower frame and steps
    if (!this.footIK) return;
    const pose = this.pose, L = this.cap.L, R = this.cap.R;
    pose[P.lfx] = L.p.x / k; pose[P.lfz] = L.p.z / k; pose[P.lfyaw] = L.yaw; pose[P.lflift] = 0;
    pose[P.rfx] = R.p.x / k; pose[P.rfz] = R.p.z / k; pose[P.rfyaw] = R.yaw; pose[P.rflift] = 0;
    const A = this.active();
    this.feet.update(dt, pose, this.yaw, A ? 0.09 : 0.13, this.lift > 0.05);
    const sv = this.solver;
    this.rsOf(B.hips, sv.w.hips.p, sv.w.hips.q);
    for (const s of ['L', 'R']) {
      const c = this.cap[s], o = s === 'L' ? P.lfx : P.rfx, Lm = s === 'L' ? this.tpl.rig.legL : this.tpl.rig.legR;
      _e.set(pose[o] * k, c.p.y + pose[o + 3] * k, pose[o + 1] * k);
      // knee pole from the clip's own knee (keeps the authored bend), fallback forward
      _d.copy(c.hip).add(c.p).multiplyScalar(0.5); _a.copy(c.knee).sub(_d);
      if (_a.lengthSq() < 1e-8) _a.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      sv.ik(Lm, _e, _a.normalize());
      _qy.setFromAxisAngle(Y, wrapAngle(pose[o + 2] - c.yaw));
      sv.setWorld('foot' + s, _qb.copy(c.q).premultiply(_qy));
    }
  }
  /** Canonical-space position of a hand (after posing). */
  hand(side, out) { this.holder.updateMatrixWorld(true); this.inv.copy(this.holder.matrixWorld).invert(); return this.rsOf(this.bones['hand' + side], out); }
}

/** Builds a probe instance of a GLB template for clip preparation. */
export function probeInstance(tpl) {
  const holder = new THREE.Group(), fix = new THREE.Group(); fix.rotation.y = tpl.fixYaw; fix.position.copy(tpl.fixPos);
  const model = skClone(tpl.sup.scene); fix.add(model); holder.add(fix); holder.updateMatrixWorld(true);
  const bones = {}; for (const r of tpl.rig.roles) { const b = model.getObjectByName(tpl.rig.info[r].name); if (b) bones[r] = b; }
  return { holder, model, bones };
}
