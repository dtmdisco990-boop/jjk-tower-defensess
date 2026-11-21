/* Rig analysis + procedural pose solver. Works on any humanoid skeleton (the stand-in or a supplied GLB, T-pose or A-pose):
   torso/head get delta rotations on top of their rest orientation, arms and legs are aimed with two-bone IK and twisted so
   elbows/knees hinge in the right plane, feet are placed flat (with heel raise) at targets supplied by the foot planter.
   Everything is expressed in the character's canonical space: +Z forward, +Y up, +X = the character's left; metres for a
   1.74 m reference figure (the solver rescales to the rig's own proportions). Zero allocations per frame. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { ROLES, STANDIN } from './assets.js';

// ---------------------------------------------------------------- pose vector layout (shared with the animator)
export const P = {
  hx: 0, hy: 1, hz: 2, hyaw: 3, hpitch: 4, hroll: 5,
  syaw: 6, spitch: 7, sroll: 8, cyaw: 9, cpitch: 10, croll: 11, nyaw: 12, npitch: 13, nroll: 14,
  lhx: 15, lhy: 16, lhz: 17, rhx: 18, rhy: 19, rhz: 20,
  lfx: 21, lfz: 22, lfyaw: 23, lflift: 24, lfheel: 25, rfx: 26, rfz: 27, rfyaw: 28, rflift: 29, rfheel: 30,
  lelb: 31, relb: 32, charge: 33, aura: 34, lift: 35, fist: 36,
};
export const PN = 40;

const R = STANDIN.REST;
const CAN = {
  armL: dist(R.upperArmL, R.foreArmL) + dist(R.foreArmL, R.handL), armR: dist(R.upperArmR, R.foreArmR) + dist(R.foreArmR, R.handR),
  legL: dist(R.thighL, R.shinL) + dist(R.shinL, R.footL), legR: dist(R.thighR, R.shinR) + dist(R.shinR, R.footR),
};
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
const FWD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0), LEFT = new THREE.Vector3(1, 0, 0);

/**
 * Analyse a rig in its rest pose. `space` is the Object3D whose local frame is the canonical character frame (feet at y=0,
 * hips over the origin, facing +Z); `bones` maps role -> Bone. Returns an immutable template shared by all instances of
 * the model; per-instance bones are looked up by name.
 */
export function analyseRig(space, bones) {
  space.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const m = new THREE.Matrix4(), info = {}, roles = ROLES.filter((r) => bones[r]);
  const rs = (b) => { m.multiplyMatrices(inv, b.matrixWorld); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, s }; };
  for (const r of roles) {
    const b = bones[r], w = rs(b);
    info[r] = { name: b.name, restP: w.p, restQ: w.q, restLocalQ: b.quaternion.clone(), restLocalP: b.position.clone(), anc: null, rrel: new THREE.Quaternion(), prel: new THREE.Vector3() };
  }
  // nearest mapped ancestor + fixed rest transforms through unmapped intermediate bones
  for (const r of roles) {
    const b = bones[r]; let p = b.parent, anc = null;
    while (p && !anc) { const hit = roles.find((x) => bones[x] === p); if (hit) anc = hit; else p = p.parent; }
    const I = info[r];
    const par = b.parent && b.parent.isObject3D ? rs(b.parent) : { q: new THREE.Quaternion(), p: new THREE.Vector3() };
    I.parentRestQ = par.q;
    if (anc) {
      I.anc = anc; const A = info[anc];
      I.rrel.copy(A.restQ).invert().multiply(par.q);
      I.prel.copy(I.restP).sub(A.restP).applyQuaternion(A.restQ.clone().invert());
    } else {
      // root of the mapped chain (hips): remember its parent's fixed transform
      m.multiplyMatrices(inv, b.parent.matrixWorld); I.parentM = m.clone(); I.parentMInv = m.clone().invert();
      const pq = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), pq, new THREE.Vector3()); I.parentQ = pq;
    }
  }
  const T = { info, roles, has: (r) => !!info[r] };
  // overall scale: hips height relative to the reference figure
  T.k = info.hips ? info.hips.restP.y / R.hips[1] : 1;
  const limb = (a, b, c, bendDir) => {
    if (!info[a] || !info[b] || !info[c]) return null;
    const A = info[a], B = info[b], C = info[c];
    const d0 = B.restP.clone().sub(A.restP), l1 = d0.length(); d0.normalize();
    const e0 = C.restP.clone().sub(B.restP), l2 = e0.length(); e0.normalize();
    // rest "bend toward" direction (perpendicular to the upper segment), stored in each segment's local frame
    const bend = bendDir.clone().addScaledVector(d0, -bendDir.dot(d0)).normalize();
    const bendF = bendDir.clone().addScaledVector(e0, -bendDir.dot(e0)).normalize();
    return {
      a, b, c, l1, l2,
      dirLocalA: d0.clone().applyQuaternion(A.restQ.clone().invert()), dirLocalB: e0.clone().applyQuaternion(B.restQ.clone().invert()),
      bendLocalA: bend.applyQuaternion(A.restQ.clone().invert()), bendLocalB: bendF.applyQuaternion(B.restQ.clone().invert()),
    };
  };
  T.armL = limb('upperArmL', 'foreArmL', 'handL', FWD); T.armR = limb('upperArmR', 'foreArmR', 'handR', FWD);
  T.legL = limb('thighL', 'shinL', 'footL', FWD.clone().negate()); T.legR = limb('thighR', 'shinR', 'footR', FWD.clone().negate());
  T.kArmL = T.armL ? (T.armL.l1 + T.armL.l2) / CAN.armL : T.k; T.kArmR = T.armR ? (T.armR.l1 + T.armR.l2) / CAN.armR : T.k;
  T.kLegL = T.legL ? (T.legL.l1 + T.legL.l2) / CAN.legL : T.k; T.kLegR = T.legR ? (T.legR.l1 + T.legR.l2) / CAN.legR : T.k;
  T.footLen = (s) => { const f = info['foot' + s], t = info['toe' + s]; return f && t ? Math.max(0.05 * T.k, Math.hypot(t.restP.x - f.restP.x, t.restP.z - f.restP.z)) : 0.12 * T.k; };
  T.footLenL = T.footLen('L'); T.footLenR = T.footLen('R');
  return T;
}

// ---------------------------------------------------------------- solver
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _Tg = new THREE.Vector3(), _pole = new THREE.Vector3(), _hoff = new THREE.Vector3(), _tgt = new THREE.Vector3(), _pl = new THREE.Vector3();

/** Rotation about `axis` taking a onto b (both perpendicular to axis); robust for opposite vectors. */
function twistOnto(out, a, b, axis) {
  const c = Math.max(-1, Math.min(1, a.dot(b))), sn = _v5.crossVectors(a, b).dot(axis);
  return out.setFromAxisAngle(axis, Math.atan2(sn, c));
}

export class RigSolver {
  constructor(template, bones) {
    this.T = template; this.bones = bones;
    const n = {}; for (const r of template.roles) n[r] = { q: new THREE.Quaternion(), p: new THREE.Vector3() }; // current canonical-space world transforms
    this.w = n;
    this.D = { h: new THREE.Quaternion(), s: new THREE.Quaternion(), c: new THREE.Quaternion(), n: new THREE.Quaternion(), nh: new THREE.Quaternion() };
    this.hand = { L: new THREE.Vector3(), R: new THREE.Vector3() }; // canonical-space fist positions after solving (for FX)
  }
  /** World (canonical) rotation of a role whose local rotation is still at rest. */
  carried(r, out) { const I = this.T.info[r], A = this.w[I.anc]; return out.copy(A.q).multiply(I.rrel).multiply(I.restLocalQ); }
  parentQ(r, out) { const I = this.T.info[r], A = this.w[I.anc]; return out.copy(A.q).multiply(I.rrel); }
  setWorld(r, q) {
    const I = this.T.info[r], W = this.w[r];
    W.q.copy(q);
    if (I.anc) { const A = this.w[I.anc]; W.p.copy(I.prel).applyQuaternion(A.q).add(A.p); this.parentQ(r, _q3); this.bones[r].quaternion.copy(_q3.invert()).multiply(q); }
  }
  /** Torso role with a canonical-space delta on top of its rest orientation. */
  delta(r, D) { if (!this.T.info[r]) return false; _q.copy(D).multiply(this.T.info[r].restQ); this.setWorld(r, _q); return true; }
  carry(r) { if (!this.T.info[r]) return; this.carried(r, _q); this.setWorld(r, _q); }

  solve(pose) {
    const T = this.T, I = T.info, k = T.k, D = this.D;
    if (!I.hips) return;
    // hips: translate + rotate
    D.h.setFromEuler(_e.set(pose[P.hpitch], pose[P.hyaw], pose[P.hroll]));
    const H = this.w.hips;
    H.p.set(pose[P.hx] * k, pose[P.hy] * k, pose[P.hz] * k).add(I.hips.restP);
    H.q.copy(D.h).multiply(I.hips.restQ);
    const hb = this.bones.hips; _v.copy(H.p).applyMatrix4(I.hips.parentMInv); hb.position.copy(_v);
    hb.quaternion.copy(I.hips.parentQ).invert().multiply(H.q);
    // spine chain (missing roles fold their rotation into the next present one)
    _q2.setFromEuler(_e.set(pose[P.spitch], pose[P.syaw], pose[P.sroll]));
    D.s.copy(_q2).multiply(D.h);
    _q2.setFromEuler(_e.set(pose[P.cpitch], pose[P.cyaw], pose[P.croll]));
    if (I.spine) { this.delta('spine', D.s); D.c.copy(_q2).multiply(D.s); }
    else D.c.copy(_q2).multiply(D.s);
    if (!this.delta('chest', D.c) && I.spine) this.delta('spine', D.c);
    _q2.setFromEuler(_e.set(pose[P.npitch], pose[P.nyaw], pose[P.nroll]));
    D.n.copy(_q2).multiply(D.c);
    D.nh.copy(_q2).slerp(_q.identity(), 0.5).multiply(D.c);
    if (I.neck) this.delta('neck', D.nh);
    this.delta('head', D.n);
    this.carry('shoulderL'); this.carry('shoulderR');
    // arms
    const hoff = _hoff.set(pose[P.hx] * k, pose[P.hy] * k, pose[P.hz] * k);
    this.arm(T.armL, 'L', pose[P.lhx], pose[P.lhy], pose[P.lhz], pose[P.lelb], hoff, T.kArmL, 1);
    this.arm(T.armR, 'R', pose[P.rhx], pose[P.rhy], pose[P.rhz], pose[P.relb], hoff, T.kArmR, -1);
    // legs
    this.leg(T.legL, 'L', pose[P.lfx], pose[P.lfz], pose[P.lfyaw], pose[P.lflift], pose[P.lfheel], T.kLegL, T.footLenL, 1);
    this.leg(T.legR, 'R', pose[P.rfx], pose[P.rfz], pose[P.rfyaw], pose[P.rflift], pose[P.rfheel], T.kLegR, T.footLenR, -1);
  }

  /** Two-bone IK: aims segment A at the elbow/knee and segment B at the target, with the hinge turned toward `bendDir`. */
  ik(L, target, poleDir) {
    const I = this.T.info, A = I[L.a];
    this.carried(L.a, _q); // where A points if left at rest relative to its parent
    this.w[L.a].p.copy(A.prel).applyQuaternion(this.w[A.anc].q).add(this.w[A.anc].p);
    _S.copy(this.w[L.a].p);
    _v.copy(target).sub(_S); let d = _v.length();
    const lo = Math.abs(L.l1 - L.l2) + 1e-4, hi = (L.l1 + L.l2) * 0.9995;
    if (d < 1e-6) { _v.set(0, -1, 0); d = lo; }
    const n = _v.multiplyScalar(1 / d); d = Math.min(hi, Math.max(lo, d));
    const ca = Math.min(1, Math.max(-1, (L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d)));
    const sa = Math.sqrt(1 - ca * ca);
    _pole.copy(poleDir).addScaledVector(n, -poleDir.dot(n));
    if (_pole.lengthSq() < 1e-8) _pole.set(0, 0, 1).addScaledVector(n, -n.z);
    _pole.normalize();
    _E.copy(_S).addScaledVector(n, L.l1 * ca).addScaledVector(_pole, L.l1 * sa);
    _Tg.copy(_S).addScaledVector(n, d);
    // segment A: swing rest direction onto S->E, then twist so its bend axis faces away from the pole (toward the hand)
    _v2.copy(L.dirLocalA).applyQuaternion(_q);           // current dir
    _v3.copy(_E).sub(_S).normalize();                   // desired dir
    _q2.setFromUnitVectors(_v2, _v3); _q.premultiply(_q2);
    _v2.copy(L.bendLocalA).applyQuaternion(_q);           // carried bend direction
    _v4.copy(_pole).negate().addScaledVector(_v3, _pole.dot(_v3)); // desired bend: -pole, perpendicular to segment A
    if (_v4.lengthSq() > 1e-8) { _v4.normalize(); _v2.addScaledVector(_v3, -_v2.dot(_v3)).normalize(); twistOnto(_q2, _v2, _v4, _v3); _q.premultiply(_q2); }
    this.setWorld(L.a, _q);
    // segment B
    this.carried(L.b, _q);
    _v2.copy(L.dirLocalB).applyQuaternion(_q);
    _v3.copy(_Tg).sub(_E).normalize();
    _q2.setFromUnitVectors(_v2, _v3); _q.premultiply(_q2);
    this.setWorld(L.b, _q);
  }

  arm(L, s, x, y, z, flare, hoff, ka, side) {
    if (!L) return;
    const I = this.T.info, U = I['upperArm' + s], rs = R['upperArm' + s];
    // target relative to the reference figure's rest shoulder, rescaled to this rig's arm length; follows the hips
    _tgt.set(x - rs[0], y - rs[1], z - rs[2]).multiplyScalar(ka).add(U.restP).add(hoff);
    // elbow pole: down and behind, flared outward by `flare`; it lives in the chest frame so elbows stay sensible when the torso twists
    _pl.set(side * (0.25 + 0.75 * flare), -1, -0.35 + 0.2 * flare).normalize().applyQuaternion(this.D.c);
    this.ik(L, _tgt, _pl);
    this.carry('hand' + s);
    if (I['hand' + s]) this.hand[s].copy(this.w['hand' + s].p);
  }

  leg(L, s, x, z, yaw, lift, heel, kl, flen, side) {
    if (!L) return;
    const I = this.T.info, F = I['foot' + s];
    if (!F) return;
    // ankle target: rest ankle moved by the planted offset; heel raise pivots around the ball of the foot
    const dx = (x - R['foot' + s][0]) * kl, dz = (z - R['foot' + s][2]) * kl;
    const ch = Math.cos(heel), sh = Math.sin(heel), back = flen * (1 - ch);
    const fy = Math.sin(yaw), fz = Math.cos(yaw);
    _tgt.set(F.restP.x + dx - fy * back, F.restP.y + lift * this.T.k + flen * sh, F.restP.z + dz - fz * back);
    _pl.set(fy + side * 0.12, 0.05, fz).normalize();
    this.ik(L, _tgt, _pl);
    // foot: flat on the ground with its own yaw, then heel raise about its lateral axis
    _q.setFromEuler(_e.set(-heel, yaw, 0)).multiply(F.restQ);
    this.setWorld('foot' + s, _q);
    if (I['toe' + s]) { _q2.setFromEuler(_e.set(0, yaw, 0)).multiply(I['toe' + s].restQ); this.setWorld('toe' + s, _q2); }
  }
}

/** Canonical-space position of a role in the solver's current pose (no allocation; writes to `out`). */
export function rolePos(solver, role, out) { const w = solver.w[role]; return w ? out.copy(w.p) : out.set(0, 0, 0); }
