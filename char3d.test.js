/* Unit tests for the 3D character layer's pure logic (rig solver, animation state machine, facing spring, foot planter,
   bone-name mapping, clip resolution, combat sync). Runs in Node with the vendored three.js; no browser or WebGL needed.
   run: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const url = (p) => 'file://' + path.join(__dirname, '..', p);

let THREE, A, R, AN, S, CD;
test.before(async () => {
  THREE = await import(url('vendor/three/three.module.min.js'));
  A = await import(url('js/char3d/assets.js'));
  R = await import(url('js/char3d/rig.js'));
  AN = await import(url('js/char3d/animator.js'));
  S = await import(url('js/char3d/sync.js'));
  CD = await import(url('js/char3d/clipdriver.js'));
});

function rig() {
  const inst = A.createStandIn(), holder = new THREE.Group(); holder.add(inst.root);
  const T = R.analyseRig(holder, inst.bones);
  return { inst, holder, T, solver: new R.RigSolver(T, inst.bones) };
}
const wp = (b) => b.getWorldPosition(new THREE.Vector3());

test('stand-in rig: 21 bones, shared geometry/materials across instances, real skinning data', () => {
  const a = A.createStandIn(), b = A.createStandIn();
  assert.equal(Object.keys(a.bones).length, 21);
  assert.equal(a.skeleton.bones.length, 21);
  assert.ok(a.meshes.length >= 10);
  for (let i = 0; i < a.meshes.length; i++) {
    assert.equal(a.meshes[i].geometry, b.meshes[i].geometry, 'geometry shared');
    assert.equal(a.meshes[i].material, b.meshes[i].material, 'material shared');
    assert.notEqual(a.meshes[i].skeleton, b.meshes[i].skeleton, 'skeleton per instance');
  }
  const g = a.meshes[0].geometry, w = g.attributes.skinWeight;
  for (let i = 0; i < w.count; i += 97) { const s = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i); assert.ok(Math.abs(s - 1) < 1e-4, 'weights normalised'); }
});

test('rig solver: hands and feet reach their IK targets; limbs keep their lengths', () => {
  const { holder, T, solver, inst } = rig();
  const pose = new Float32Array(R.PN); pose.set(AN.STANCE);
  solver.solve(pose); holder.updateMatrixWorld(true);
  const hL = wp(inst.bones.handL), fL = wp(inst.bones.footL), fR = wp(inst.bones.footR);
  const tgt = [pose[R.P.lhx] + pose[R.P.hx], pose[R.P.lhy] + pose[R.P.hy], pose[R.P.lhz] + pose[R.P.hz]];
  assert.ok(Math.hypot(hL.x - tgt[0], hL.y - tgt[1], hL.z - tgt[2]) < 0.01, 'left fist on target');
  assert.ok(Math.abs(fL.x - pose[R.P.lfx]) < 0.01 && Math.abs(fL.z - pose[R.P.lfz]) < 0.01, 'left foot planted');
  assert.ok(Math.abs(fR.y - 0.085) < 0.01, 'right ankle at rest height');
  const up = wp(inst.bones.upperArmL).distanceTo(wp(inst.bones.foreArmL));
  assert.ok(Math.abs(up - T.armL.l1) < 1e-4, 'upper arm length preserved');
  // knees bend forward (over the toes), never backward
  const kL = wp(inst.bones.shinL), hipL = wp(inst.bones.thighL);
  assert.ok(kL.z > (hipL.z + fL.z) / 2 - 0.01, 'knee in front of the hip-ankle line');
});

test('rig solver: unreachable targets clamp to full extension without NaNs', () => {
  const { holder, solver, inst } = rig();
  const pose = new Float32Array(R.PN); pose.set(AN.STANCE);
  pose[R.P.lhz] = 5; pose[R.P.rfx] = -3;
  solver.solve(pose); holder.updateMatrixWorld(true);
  for (const r of A.ROLES) { const p = wp(inst.bones[r]); assert.ok(Number.isFinite(p.x + p.y + p.z), r); }
});

test('animator: primed wind-up holds until the hit, then strikes; hands alternate; Black Flash freezes on impact', () => {
  const an = new AN.Animator(1), dt = 1 / 60;
  for (let i = 0; i < 30; i++) an.update(dt);
  assert.equal(an.state, 'idle');
  assert.ok(an.prime('punch', 1));
  for (let i = 0; i < 20; i++) an.update(dt);
  assert.equal(an.state, 'primed'); assert.ok(an.waiting, 'held at the end of the anticipation');
  assert.equal(an.strike('punch', 1), 'jab');
  let impact = null; for (let i = 0; i < 10 && !impact; i++) { an.update(dt); impact = an.impact; }
  assert.ok(impact && impact.clip === 'jab' && impact.hand === 'L', 'jab impact frame reached quickly after the hit');
  for (let i = 0; i < 40; i++) an.update(dt);
  assert.equal(an.strike('punch', 1), 'cross', 'second punch uses the other hand');
  for (let i = 0; i < 60; i++) an.update(dt);
  an.prime('blackflash', 1); for (let i = 0; i < 30; i++) an.update(dt);
  assert.equal(an.strike('blackflash', 1), 'blackflash');
  let frz = 0; for (let i = 0; i < 60; i++) { an.update(dt); if (an.freeze) frz++; }
  assert.ok(frz >= 4, 'impact freeze frames: ' + frz);
  assert.ok(an.counts.blackflash === 1 && an.counts.jab === 1 && an.counts.cross === 1);
});

test('animator: Divergent follow-up, stun slump and upgrade are distinct clips/poses', () => {
  const an = new AN.Animator(2), dt = 1 / 60;
  an.strike('punch', 1); for (let i = 0; i < 12; i++) an.update(dt);
  assert.equal(an.strike('follow', 1), 'divL');
  for (let i = 0; i < 40; i++) an.update(dt);
  an.setDisabled(true); for (let i = 0; i < 60; i++) an.update(dt);
  assert.equal(an.state, 'disabled'); assert.ok(an.out[R.P.npitch] > 0.4, 'head drops when stunned');
  assert.equal(an.prime('punch', 1), false, 'no wind-ups while stunned');
  an.setDisabled(false); for (let i = 0; i < 60; i++) an.update(dt);
  an.play('upgrade'); let aura = 0; for (let i = 0; i < 60; i++) { an.update(dt); aura = Math.max(aura, an.out[R.P.aura]); }
  assert.ok(aura > 0.9);
  const keys = Object.keys(AN.CLIPS); assert.ok(['jab', 'cross', 'divL', 'divR', 'blackflash', 'upgrade', 'land'].every((k) => keys.includes(k)));
});

test('facing spring: smooth, no overshoot, takes the short way round', () => {
  const f = new AN.Facing(3.0); f.target = -3.0; // 0.28 rad apart across the wrap
  let prev = 3.0, maxStep = 0;
  for (let i = 0; i < 120; i++) { const y = f.update(1 / 60, 10); maxStep = Math.max(maxStep, Math.abs(AN.wrapAngle(y - prev))); prev = y; }
  assert.ok(Math.abs(AN.wrapAngle(f.yaw - -3.0)) < 0.01, 'arrived');
  assert.ok(maxStep < 0.05, 'turned across the seam, not the long way');
});

test('foot planter: feet stay fixed while the body turns, then step with lift (never slide)', () => {
  const fp = new AN.FootPlanter(), pose = new Float32Array(R.PN); const dt = 1 / 60;
  let yaw = 0; const tower = []; let lifted = 0, slid = 0;
  for (let i = 0; i < 120; i++) {
    pose.set(AN.STANCE); yaw = Math.min(1.2, i * 0.02);
    fp.update(dt, pose, yaw, 0.12, false);
    // planted foot position in the tower frame
    const c = Math.cos(yaw), s = Math.sin(yaw), x = pose[R.P.lfx] * c + pose[R.P.lfz] * s, z = -pose[R.P.lfx] * s + pose[R.P.lfz] * c;
    if (tower.length) { const d = Math.hypot(x - tower[tower.length - 1][0], z - tower[tower.length - 1][1]); if (d > 1e-6 && pose[R.P.lflift] <= 1e-6) slid++; }
    if (pose[R.P.lflift] > 0.005) lifted++;
    tower.push([x, z]);
  }
  assert.ok(fp.steps >= 2, 'stepped ' + fp.steps);
  assert.ok(lifted > 0, 'feet lift while stepping');
  assert.equal(slid, 0, 'a foot on the ground never moves');
});

test('bone mapping: Mixamo, Blender and VRM-style names; spine order comes from the hierarchy', () => {
  const mx = A.mapBones(['mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigNeck', 'mixamorigHead', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand', 'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot']);
  assert.equal(mx.hips, 'mixamorigHips'); assert.equal(mx.upperArmL, 'mixamorigLeftArm'); assert.equal(mx.shinR, 'mixamorigRightLeg');
  const bl = A.mapBones(['pelvis', 'upper_arm.L', 'forearm.L', 'hand.L', 'thigh.R', 'shin.R', 'foot.R']);
  assert.equal(bl.hips, 'pelvis'); assert.equal(bl.upperArmL, 'upper_arm.L'); assert.equal(bl.shinR, 'shin.R');
  const vr = A.mapBones(['J_Bip_C_Hips', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperLeg', 'rightLowerLeg']);
  assert.equal(vr.upperArmL, 'leftUpperArm'); assert.equal(vr.shinR, 'rightLowerLeg');
  // misleading numbering: bottom spine "Spine2", top "Spine" -> hierarchy wins
  const sc = new THREE.Group(), mk = (n, p) => { const b = new THREE.Bone(); b.name = n; (p || sc).add(b); return b; };
  const h = mk('Hips'), s2 = mk('Spine2', h), s1 = mk('Spine1', s2), s0 = mk('Spine', s1); mk('Neck', s0);
  const m = A.mapBones(['Hips', 'Spine2', 'Spine1', 'Spine', 'Neck']); A.orderSpine(m, sc);
  assert.equal(m.spine, 'Spine2'); assert.equal(m.chest, 'Spine');
});

test('clip resolution: names map to roles; turn clips are not mistaken for punches', () => {
  const c = (n) => ({ name: n });
  const m = CD.resolveClips([c('Turn_Left'), c('Turn_Right'), c('Punch_Left'), c('Punch_Right'), c('Idle_Fighting'), c('Black_Flash'), c('Divergent_Fist')]);
  assert.equal(m.turnL.name, 'Turn_Left'); assert.equal(m.punchL.name, 'Punch_Left'); assert.equal(m.punchR.name, 'Punch_Right');
  assert.equal(m.idle.name, 'Idle_Fighting'); assert.equal(m.blackflash.name, 'Black_Flash'); assert.equal(m.divergent.name, 'Divergent_Fist');
  const o = CD.resolveClips([c('A'), c('B')], { idle: 'B', punchL: 'A' });
  assert.equal(o.idle.name, 'B'); assert.equal(o.punchL.name, 'A');
});

test('combat sync: maps slash fx to the right tower, detects Black Flash and the Divergent echo, never writes to the battle', () => {
  const handlers = {};
  const units = [{ uid: 7, id: 'yuji', x: 100, y: 200, hits: 0, removed: false, cdT: 0.3, baseSpa: 0.5, flags: { bfEvery: 3 } }, { uid: 8, id: 'panda', x: 100, y: 200, hits: 0, removed: false }];
  const battle = { time: 0, units, events: { on: (n, f) => { handlers[n] = f; return () => delete handlers[n]; } }, spdMul: () => 2, pickTarget: () => ({ x: 150, y: 200 }) };
  const snap = JSON.stringify(units);
  const sync = new S.CombatSync(battle, (u) => u.id === 'yuji');
  units[0].hits = 1; handlers.fx({ type: 'slash', x1: 100, y1: 200, x2: 150, y2: 200 });
  handlers.fx({ type: 'slash', x1: 100, y1: 200, x2: 150, y2: 200 }); // scheduled echo: same hit count
  units[0].hits = 2; handlers.fx({ type: 'slash', x1: 100, y1: 200, x2: 150, y2: 200, bf: true });
  handlers.fx({ type: 'shock', x: 0, y: 0 });
  const got = []; sync.drain((e) => got.push(e.type + ':' + e.u.uid));
  assert.deepEqual(got, ['punch:7', 'follow:7', 'blackflash:7']);
  const p = sync.predict(units[0], {});
  assert.ok(Math.abs(p.t - 0.15) < 1e-9 && Math.abs(p.interval - 0.25) < 1e-9 && p.bf === true && p.target.x === 150);
  units[0].hits = 0; assert.equal(JSON.stringify(units), snap.replace('"hits":0', '"hits":0'), 'read-only');
  sync.dispose(); assert.equal(Object.keys(handlers).length, 0, 'listeners removed');
});
