/* Procedural animation: authored key poses -> clips, a per-tower state machine (idle stance, primed wind-ups held until the
   simulation actually attacks, strikes, follow-ups, power-up, stunned slump, landing), crossfades, an additive "alive" layer
   (breathing, bounce, weight shift), a critically-damped facing spring and a foot planter that keeps planted feet fixed on
   the ground and steps (with lift) whenever the body turns or the pose moves a foot. All buffers are preallocated. */
import { P, PN } from './rig.js';

// ---------------------------------------------------------------- authored poses
function pose(o, base) {
  const a = new Float32Array(PN);
  if (base) a.set(base);
  for (const k in o) {
    const v = o[k];
    if (k === 'lh') { a[P.lhx] = v[0]; a[P.lhy] = v[1]; a[P.lhz] = v[2]; }
    else if (k === 'rh') { a[P.rhx] = v[0]; a[P.rhy] = v[1]; a[P.rhz] = v[2]; }
    else if (k === 'lf') { a[P.lfx] = v[0]; a[P.lfz] = v[1]; a[P.lfyaw] = v[2]; }
    else if (k === 'rf') { a[P.rfx] = v[0]; a[P.rfz] = v[1]; a[P.rfyaw] = v[2]; }
    else if (P[k] !== undefined) a[P[k]] = v;
    else throw new Error('unknown pose key ' + k);
  }
  return a;
}
// orthodox fighting stance: lead (left) side forward, chin tucked, hands up, knees soft, rear foot turned out
export const STANCE = pose({
  hy: -0.07, hyaw: -0.42, hpitch: 0.05, syaw: -0.04, spitch: 0.05, cyaw: -0.04, cpitch: 0.04, nyaw: 0.42, npitch: 0.1,
  lh: [0.07, 1.41, 0.33], rh: [-0.1, 1.4, 0.2], lf: [0.12, 0.17, -0.25], rf: [-0.15, -0.2, -0.85], lelb: 0.3, relb: 0.3, fist: 1,
});
const S = (o) => pose(o, STANCE);
const JAB_LOAD = S({ hyaw: -0.34, hy: -0.09, lh: [0.08, 1.36, 0.27], cpitch: 0.08 });
const JAB_HIT = S({ hyaw: -0.66, cyaw: -0.14, hz: 0.05, hpitch: 0.1, nyaw: 0.68, lh: [0.05, 1.4, 0.7], rh: [-0.08, 1.43, 0.22], lf: [0.12, 0.25, -0.25], croll: 0.06, lelb: 0.05 });
const JAB_HOLD = pose({ lhz: 0.68 }, JAB_HIT);
const CROSS_LOAD = S({ hyaw: -0.52, hy: -0.095, rh: [-0.13, 1.36, 0.12], cpitch: 0.07 });
const CROSS_HIT = S({ hyaw: 0.3, cyaw: 0.12, syaw: 0.06, hz: 0.07, hpitch: 0.12, nyaw: -0.36, rh: [0.0, 1.38, 0.7], lh: [0.1, 1.43, 0.17], rf: [-0.15, -0.2, -0.35], rfheel: 0.55, relb: 0.05, croll: -0.06 });
const CROSS_HOLD = pose({ rhz: 0.68 }, CROSS_HIT);
const DIV_L = pose({ lhz: 0.75, hz: 0.08, cpitch: 0.13, lelb: 0, charge: 0.45 }, JAB_HIT), DIV_L2 = pose({ lhz: 0.66, charge: 0.2 }, DIV_L);
const DIV_R = pose({ rhz: 0.75, hz: 0.09, cpitch: 0.14, relb: 0, charge: 0.45 }, CROSS_HIT), DIV_R2 = pose({ rhz: 0.66, charge: 0.2 }, DIV_R);
const BF_COIL = S({ hy: -0.15, hyaw: -0.85, cyaw: -0.16, hpitch: 0.18, nyaw: 0.95, npitch: 0.05, rh: [-0.26, 1.2, -0.18], lh: [0.16, 1.37, 0.36], relb: 0.6, charge: 0.6 });
const BF_CHARGED = S({ hy: -0.19, hyaw: -0.98, cyaw: -0.2, hpitch: 0.22, nyaw: 1.05, npitch: 0.05, rh: [-0.3, 1.16, -0.24], lh: [0.17, 1.36, 0.38], relb: 0.7, charge: 1 });
const BF_HIT = S({ hy: -0.13, hz: 0.22, hyaw: 0.55, cyaw: 0.22, syaw: 0.08, hpitch: 0.24, nyaw: -0.62, npitch: 0, rh: [0.02, 1.3, 1.0], lh: [0.22, 1.12, -0.04], lf: [0.12, 0.47, -0.2], rf: [-0.15, -0.2, -0.25], rfheel: 0.75, relb: 0, charge: 1, croll: -0.1 });
const BF_SETTLE = S({ hy: -0.1, hz: 0.14, hyaw: 0.15, nyaw: -0.1, rh: [-0.04, 1.36, 0.58], lh: [0.12, 1.38, 0.22], lf: [0.12, 0.47, -0.2], rf: [-0.15, -0.2, -0.45], rfheel: 0.2, charge: 0.25 });
const UP_CROUCH = S({ hy: -0.16, hyaw: -0.2, syaw: 0, cyaw: 0, nyaw: 0.18, hpitch: 0.2, cpitch: 0.2, npitch: 0.35, lh: [0.2, 1.02, 0.1], rh: [-0.2, 1.02, 0.1], lelb: 0.9, relb: 0.9, aura: 0.4 });
const UP_FLEX = S({ hy: -0.02, hyaw: -0.1, syaw: 0, cyaw: 0, nyaw: 0.1, hpitch: -0.04, cpitch: -0.16, npitch: -0.18, lh: [0.3, 1.22, 0.16], rh: [-0.3, 1.22, 0.16], lelb: 1, relb: 1, aura: 1 });
const LAND_AIR = S({ lift: 0.9, hy: 0.02, hpitch: -0.05, lh: [0.24, 1.5, 0.1], rh: [-0.24, 1.5, 0.1], lelb: 1, relb: 1 });
const LAND_HIT = S({ lift: 0, hy: -0.26, hpitch: 0.22, cpitch: 0.15, npitch: 0.2, lh: [0.18, 1.08, 0.3], rh: [-0.2, 1.06, 0.18], aura: 0.6 });
export const DISABLED = S({ hy: -0.17, hyaw: -0.15, syaw: 0, cyaw: 0, nyaw: 0.15, hpitch: 0.32, cpitch: 0.25, npitch: 0.55, lh: [0.16, 0.98, 0.14], rh: [-0.16, 0.98, 0.1], lelb: 0.2, relb: 0.2, fist: 0 });

const K = (t, p, ease) => ({ t, p, ease: ease || 'inout' });
/** Clips: keys, an optional `hold` (primed wind-ups wait here for the real attack), `impact` time, footwork step speed. */
export const CLIPS = {
  jab: { keys: [K(0, STANCE), K(0.06, JAB_LOAD), K(0.12, JAB_HIT, 'out'), K(0.16, JAB_HOLD), K(0.34, STANCE)], hold: 0.06, impact: 0.12, step: 0.1, hand: 'L' },
  cross: { keys: [K(0, STANCE), K(0.06, CROSS_LOAD), K(0.12, CROSS_HIT, 'out'), K(0.17, CROSS_HOLD), K(0.36, STANCE)], hold: 0.06, impact: 0.12, step: 0.1, hand: 'R' },
  divL: { keys: [K(0, JAB_HIT), K(0.045, DIV_L, 'out'), K(0.1, DIV_L2), K(0.3, STANCE)], impact: 0.045, step: 0.1, hand: 'L' },
  divR: { keys: [K(0, CROSS_HIT), K(0.045, DIV_R, 'out'), K(0.1, DIV_R2), K(0.3, STANCE)], impact: 0.045, step: 0.1, hand: 'R' },
  blackflash: { keys: [K(0, STANCE), K(0.1, BF_COIL), K(0.24, BF_CHARGED), K(0.3, BF_HIT, 'out'), K(0.4, BF_HIT), K(0.54, BF_SETTLE), K(0.82, STANCE)], hold: 0.24, impact: 0.3, freeze: [0.3, 0.4], step: 0.065, hand: 'R' },
  upgrade: { keys: [K(0, STANCE), K(0.16, UP_CROUCH), K(0.4, UP_FLEX, 'out'), K(0.62, UP_FLEX), K(0.95, STANCE)], impact: 0.4, step: 0.12 },
  land: { keys: [K(0, LAND_AIR), K(0.16, LAND_HIT, 'in'), K(0.5, STANCE)], impact: 0.16, step: 0.12 },
};
const EASE = {
  inout: (x) => x * x * (3 - 2 * x),
  out: (x) => 1 - (1 - x) * (1 - x) * (1 - x),
  in: (x) => x * x * x,
  lin: (x) => x,
};
for (const c of Object.values(CLIPS)) c.dur = c.keys[c.keys.length - 1].t;

/** Sample a clip into `out` (no allocation). */
export function sample(clip, t, out) {
  const ks = clip.keys;
  if (t <= 0) { out.set(ks[0].p); return out; }
  for (let i = 1; i < ks.length; i++) {
    const b = ks[i];
    if (t <= b.t || i === ks.length - 1) {
      const a = ks[i - 1], span = b.t - a.t, x = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1, w = EASE[b.ease](x);
      const pa = a.p, pb = b.p;
      for (let j = 0; j < PN; j++) out[j] = pa[j] + (pb[j] - pa[j]) * w;
      return out;
    }
  }
  out.set(ks[ks.length - 1].p); return out;
}
function lerpInto(out, a, b, w) { for (let j = 0; j < PN; j++) out[j] = a[j] + (b[j] - a[j]) * w; return out; }
const TAU = Math.PI * 2;
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

// ---------------------------------------------------------------- facing
/** Critically damped spring on an angle (no overshoot), so turns ease in and out. */
export class Facing {
  constructor(yaw) { this.yaw = yaw || 0; this.vel = 0; this.target = this.yaw; }
  update(dt, omega) {
    if (dt <= 0) return this.yaw;
    const x = wrapAngle(this.yaw - this.target), w = omega, e = Math.exp(-w * dt);
    const tmp = (this.vel + w * x) * dt;
    this.vel = (this.vel - w * tmp) * e;
    this.yaw = wrapAngle(this.target + (x + tmp) * e);
    return this.yaw;
  }
}

// ---------------------------------------------------------------- foot planter
/** Keeps each foot fixed in the tower's ground frame; steps (lift arc) when the desired spot drifts, pivots in place on small yaw changes. */
export class FootPlanter {
  constructor() {
    this.f = [0, 1].map(() => ({ x: 0, z: 0, yaw: 0, sx: 0, sz: 0, syaw: 0, lx: 0, lz: 0, lyaw: 0, t: -1, dur: 0.12, init: false }));
    this.out = new Float32Array(10); // per foot: local x, z, yaw, lift(add), stepping
    this.steps = 0;
  }
  reset() { for (const f of this.f) f.init = false; }
  /** `pose` holds desired root-space feet; `yaw` is the body's facing; writes planted root-space feet back into the pose. */
  update(dt, pose, yaw, stepDur, airborne) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < 2; i++) {
      const f = this.f[i], o = i === 0 ? P.lfx : P.rfx;
      const lx = pose[o], lz = pose[o + 1], ly = pose[o + 2];
      // desired spot in the (unrotated) tower frame
      const dx = lx * c + lz * s, dz = -lx * s + lz * c, dyaw = ly + yaw;
      if (!f.init || airborne) { f.x = dx; f.z = dz; f.yaw = dyaw; f.init = true; f.t = -1; }
      const other = this.f[1 - i];
      const err = Math.hypot(dx - f.x, dz - f.z), yerr = wrapAngle(dyaw - f.yaw);
      let lift = 0;
      if (f.t < 0) {
        if (err > 0.045 && other.t < 0) { f.t = 0; f.dur = stepDur; f.sx = f.x; f.sz = f.z; f.syaw = f.yaw; this.steps++; }
        else if (Math.abs(yerr) > 1e-4) { const m = Math.min(Math.abs(yerr), 6 * dt + 0.6 * Math.abs(yerr) * Math.min(1, dt * 12)); f.yaw = wrapAngle(f.yaw + Math.sign(yerr) * m); } // pivot on the ball
      }
      if (f.t >= 0) {
        f.t += dt;
        // swing: travel over the first 80% of the step, then lower the foot straight down onto the landing spot
        const u = Math.min(1, f.t / f.dur), v = Math.min(1, u / 0.8), e = v * v * (3 - 2 * v);
        if (v < 1) { f.x = f.sx + (dx - f.sx) * e; f.z = f.sz + (dz - f.sz) * e; f.yaw = f.syaw + wrapAngle(dyaw - f.syaw) * e; f.lx = dx; f.lz = dz; f.lyaw = dyaw; }
        else { f.x = f.lx; f.z = f.lz; f.yaw = f.lyaw; }
        lift = u < 1 ? 4 * u * (1 - u) * Math.min(0.075, 0.025 + Math.hypot(f.lx - f.sx, f.lz - f.sz) * 0.5) : 0;
        if (u >= 1) f.t = -1;
      }
      // back to the rotated root frame
      pose[o] = f.x * c - f.z * s; pose[o + 1] = f.x * s + f.z * c; pose[o + 2] = wrapAngle(f.yaw - yaw);
      pose[o + 3] += lift;
    }
  }
}

// ---------------------------------------------------------------- per-tower state machine
export const STATES = ['idle', 'primed', 'strike', 'follow', 'blackflash', 'upgrade', 'land', 'disabled'];
export class Animator {
  constructor(seed) {
    this.base = new Float32Array(PN); this.clipPose = new Float32Array(PN); this.from = new Float32Array(PN); this.out = new Float32Array(PN);
    this.base.set(STANCE); this.out.set(STANCE);
    this.clip = null; this.clipName = ''; this.ct = 0; this.rate = 1; this.fade = 1; this.fadeDur = 0.05;
    this.waiting = false; this.waitT = 0; this.released = false; this.boost = 1;
    this.nextHand = 'L'; this.lastHand = 'L';
    this.state = 'idle'; this.disabledW = 0; this.disabled = false; this.buffed = false;
    this.time = (seed || 0) * 1.7; this.facing = new Facing(0); this.feet = new FootPlanter();
    this.impact = null; // set for one update when a clip crosses its impact time
    this.freeze = false;
    this.counts = { jab: 0, cross: 0, divL: 0, divR: 0, blackflash: 0, upgrade: 0, land: 0, primed: 0 };
  }
  _start(name, t0, rate, fadeDur) {
    this.from.set(this.out); this.fade = 0; this.fadeDur = fadeDur || 0.05; // crossfade from whatever is showing now
    this.clip = CLIPS[name]; this.clipName = name; this.ct = t0 || 0; this.rate = rate || 1;
    this.waiting = false; this.waitT = 0; this.released = false; this.boost = 1;
    this.counts[name]++;
  }
  busy() { return !!this.clip && (this.state === 'upgrade' || this.state === 'land' || this.state === 'primed' || this.ct < this.clip.dur * 0.62); }
  /** The sim is about to attack (predicted from its cooldown): play the anticipation and hold it until strike(). */
  prime(kind, rate) {
    if (this.disabled || this.busy()) return false;
    const name = kind === 'blackflash' ? 'blackflash' : this.nextHand === 'L' ? 'jab' : 'cross';
    this._start(name, 0, rate, 0.06); this.state = 'primed'; this.counts.primed++;
    return true;
  }
  /** The sim attacked: release a primed wind-up, or snap straight into the strike. kind: 'punch' | 'blackflash' | 'follow'. */
  strike(kind, rate) {
    if (kind === 'follow') { const n = this.lastHand === 'L' ? 'divL' : 'divR'; this._start(n, 0, rate, 0.035); this.state = 'follow'; return n; }
    const name = kind === 'blackflash' ? 'blackflash' : this.nextHand === 'L' ? 'jab' : 'cross';
    if (this.state === 'primed' && this.clipName === name) { this.released = true; this.rate = Math.max(this.rate, rate || 1); }
    else { this._start(name, CLIPS[name].hold || 0, rate, 0.04); this.released = true; }
    this.boost = 2; // the sim already landed the hit: close the gap to the visual impact quickly
    this.state = name === 'blackflash' ? 'blackflash' : 'strike';
    this.lastHand = CLIPS[name].hand; if (name !== 'blackflash') this.nextHand = this.nextHand === 'L' ? 'R' : 'L';
    return name;
  }
  play(name, rate) { this._start(name, 0, rate, 0.06); this.state = name; }
  setDisabled(on) { this.disabled = on; if (on && this.clip && this.state !== 'land') { this.clip = null; this.state = 'disabled'; this.from.set(this.out); this.fade = 0; this.fadeDur = 0.12; } }

  update(dt, phaseSpeed) {
    this.impact = null; this.freeze = false;
    const tScale = phaseSpeed || 1;
    this.time += dt * tScale;
    this.disabledW += ((this.disabled ? 1 : 0) - this.disabledW) * Math.min(1, dt * 7);
    // base pose: stance, blended toward the stunned slump
    lerpInto(this.base, STANCE, DISABLED, this.disabledW);
    let target = this.base;
    if (this.clip) {
      const c = this.clip, prev = this.ct;
      if (this.state === 'primed' && !this.released) {
        if (this.ct < c.hold) this.ct = Math.min(c.hold, this.ct + dt * this.rate);
        else { this.waiting = true; this.waitT += dt; if (this.waitT > 0.6) { this.clip = null; this.state = 'idle'; this.waitT = 0; this.from.set(this.out); this.fade = 0; this.fadeDur = 0.14; } }
      } else {
        const boosted = c.impact !== undefined && this.ct < c.impact ? this.boost : 1;
        const inFreeze = c.freeze && this.ct >= c.freeze[0] && this.ct < c.freeze[1];
        this.ct += dt * this.rate * boosted;
        if (inFreeze) this.freeze = true;
        this.waitT = 0;
      }
      if (this.clip) {
        if (c.impact !== undefined && prev < c.impact && this.ct >= c.impact) this.impact = { clip: this.clipName, hand: c.hand };
        if (this.ct >= c.dur) { this.clip = null; this.state = this.disabled ? 'disabled' : 'idle'; this.from.set(this.out); this.fade = 0; this.fadeDur = 0.08; }
        else {
          sample(c, this.ct, this.clipPose);
          // clips are authored over the stance; carry the stun blend through them
          if (this.disabledW > 0.001) for (let j = 0; j < PN; j++) this.clipPose[j] += (this.base[j] - STANCE[j]);
          target = this.clipPose;
        }
      }
    }
    if (!this.clip && this.state !== 'disabled') this.state = this.disabled ? 'disabled' : 'idle';
    // crossfade
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt / this.fadeDur); lerpInto(this.out, this.from, target, EASE.inout(this.fade)); }
    else this.out.set(target);
    this.additive(this.clip ? 0.35 : 1);
    return this.out;
  }
  /** Breathing, fighter's bounce and slow weight shift (never fully off, so he never freezes like a statue). */
  additive(w) {
    const o = this.out, t = this.time, live = 1 - this.disabledW * 0.7;
    const br = Math.sin(TAU * 0.32 * t), bo = Math.sin(TAU * (this.buffed ? 2.0 : 1.25) * t), sh = Math.sin(TAU * 0.21 * t), g = TAU * 0.9 * t;
    const k = w * live;
    o[P.hy] += (0.01 * bo + 0.004 * br) * k + 0.004 * br * (1 - k);
    o[P.cpitch] += -0.022 * br;
    o[P.hx] += 0.022 * sh * k; o[P.hroll] += -0.035 * sh * k; o[P.nroll] += 0.025 * sh * k;
    o[P.lhx] += 0.008 * Math.cos(g) * k; o[P.lhy] += (0.01 * Math.sin(g) + 0.006 * bo) * k;
    o[P.rhx] += 0.008 * Math.cos(g + 1.7) * k; o[P.rhy] += (0.01 * Math.sin(g + 1.7) + 0.006 * bo) * k;
  }
}
