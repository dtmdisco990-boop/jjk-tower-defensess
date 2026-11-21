/* Test fixture (browser, ES module): builds a rigged GLB *with embedded animation clips* from the original stand-in rig, so the
   supplied-model path (loader, bone mapping, clip preparation, impact sync, root-track baking, foot planting) can be tested
   without any third-party model. The file deliberately mimics awkward real-world exports:
   - Mixamo-style bone names (as GLTFLoader sanitises them) with misleading spine numbering (bottom spine named "Spine2", top named "Spine");
   - an animated root node above the armature (turn clips rotate it, and every clip carries a track for it);
   - an armature scale of 0.01 with bones in centimetres;
   - every clip offset sideways (stance not centred on the origin) and several times longer than one attack. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFExporter } from '../../vendor/three/examples/jsm/exporters/GLTFExporter.js';
import { createStandIn, ROLES } from '../../js/char3d/assets.js';
import { analyseRig, RigSolver, P } from '../../js/char3d/rig.js';
import { CLIPS, STANCE, sample } from '../../js/char3d/animator.js';

const NAMES = {
  hips: 'mixamorigHips', spine: 'mixamorigSpine2', chest: 'mixamorigSpine', neck: 'mixamorigNeck', head: 'mixamorigHead',
  shoulderL: 'mixamorigLeftShoulder', upperArmL: 'mixamorigLeftArm', foreArmL: 'mixamorigLeftForeArm', handL: 'mixamorigLeftHand',
  shoulderR: 'mixamorigRightShoulder', upperArmR: 'mixamorigRightArm', foreArmR: 'mixamorigRightForeArm', handR: 'mixamorigRightHand',
  thighL: 'mixamorigLeftUpLeg', shinL: 'mixamorigLeftLeg', footL: 'mixamorigLeftFoot', toeL: 'mixamorigLeftToeBase',
  thighR: 'mixamorigRightUpLeg', shinR: 'mixamorigRightLeg', footR: 'mixamorigRightFoot', toeR: 'mixamorigRightToeBase',
};

export async function buildClipGLB(opt) {
  opt = opt || {};
  const OFF = opt.offset || 0.3; // sideways stance offset baked into every clip (metres)
  const inst = createStandIn();
  // bake rest positions into centimetres under an armature scaled 0.01, under an animated orientation root
  const root = new THREE.Group(); root.name = 'Fixture_Orientation';
  const arm = new THREE.Group(); arm.name = 'Armature'; arm.scale.setScalar(0.01); root.add(arm);
  const holder = new THREE.Group(); holder.add(root);
  for (const r of ROLES) inst.bones[r].position.multiplyScalar(100);
  inst.root.remove(inst.bones.hips); arm.add(inst.bones.hips);
  const keep = inst.meshes.filter((m) => !m.userData.char3dOutline); // export the body only (the importer adds its own outline)
  for (const m of inst.meshes) m.removeFromParent();
  for (const m of keep) {
    m.geometry = m.geometry.clone(); m.geometry.scale(100, 100, 100); // metres -> centimetres under the 0.01 armature
    m.material = new THREE.MeshStandardMaterial({ color: m.material.color.clone(), roughness: 0.9, metalness: 0, name: 'fixture_' + m.material.color.getHexString() });
    arm.add(m);
  }
  holder.updateMatrixWorld(true);
  inst.skeleton.calculateInverses();
  for (const m of keep) m.bind(inst.skeleton);
  const solverSpace = holder;
  const restPos = {}; for (const r of ROLES) restPos[r] = inst.bones[r].position.clone();
  const rig = analyseRig(solverSpace, inst.bones), solver = new RigSolver(rig, inst.bones);
  const fps = 30, clips = [];
  const record = (name, dur, poseAt, rootYawAt) => {
    const n = Math.round(dur * fps) + 1, times = new Float32Array(n), tracks = [];
    const qv = {}, pv = {}; for (const r of ROLES) { qv[r] = new Float32Array(n * 4); pv[r] = new Float32Array(n * 3); }
    const rq = new Float32Array(n * 4), q = new THREE.Quaternion();
    const pose = new Float32Array(STANCE.length);
    for (let i = 0; i < n; i++) {
      const t = i / fps; times[i] = t;
      poseAt(t, pose); pose[P.hx] += OFF; pose[P.lfx] += OFF; pose[P.rfx] += OFF; pose[P.lhx] += OFF; pose[P.rhx] += OFF;
      solver.solve(pose);
      for (const r of ROLES) { const b = inst.bones[r]; b.quaternion.toArray(qv[r], i * 4); b.position.toArray(pv[r], i * 3); }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rootYawAt ? rootYawAt(t) : 0); q.toArray(rq, i * 4);
    }
    for (const r of ROLES) {
      tracks.push(new THREE.QuaternionKeyframeTrack(inst.bones[r].name + '.quaternion', times, qv[r]));
      tracks.push(new THREE.VectorKeyframeTrack(inst.bones[r].name + '.position', times, pv[r]));
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(root.name + '.quaternion', times, rq));
    clips.push(new THREE.AnimationClip(name, dur, tracks));
  };
  // long clips (like real exports): the authored procedural clips played at a quarter of their speed, padded with stance
  const slow = (clip, k, pad) => (t, out) => { const tt = (t - pad) / k; if (tt <= 0) out.set(STANCE); else sample(clip, Math.min(tt, clip.dur), out); };
  const idle = (t, out) => { out.set(STANCE); out[P.hy] += 0.012 * Math.sin(t * Math.PI * 2 / 1.6); out[P.cpitch] += 0.02 * Math.sin(t * Math.PI * 2 / 1.6); };
  record('Fixture_Idle', 1.6, idle);
  record('Fixture_Punch_Left', CLIPS.jab.dur * 4 + 0.3, slow(CLIPS.jab, 4, 0.15));
  record('Fixture_Punch_Right', CLIPS.cross.dur * 4 + 0.3, slow(CLIPS.cross, 4, 0.15));
  record('Fixture_Divergent', CLIPS.cross.dur * 4 + 0.3, slow(CLIPS.cross, 4, 0.15));
  record('Fixture_Black_Flash', CLIPS.blackflash.dur * 2.5 + 0.3, slow(CLIPS.blackflash, 2.5, 0.15));
  // turns: the stance stays still, the *root* rotates 90 degrees about the file origin (the stance is off-centre)
  const ease = (x) => x * x * (3 - 2 * x);
  record('Fixture_Turn_Left', 1.2, idle, (t) => (Math.PI / 2) * ease(Math.min(1, t / 1.1)));
  record('Fixture_Turn_Right', 1.2, idle, (t) => -(Math.PI / 2) * ease(Math.min(1, t / 1.1)));
  // back to rest + friendly names before export
  for (const r of ROLES) { inst.bones[r].quaternion.identity(); inst.bones[r].position.copy(restPos[r]); inst.bones[r].name = NAMES[r]; }
  for (const c of clips) for (const tr of c.tracks) { const node = tr.name.slice(0, tr.name.lastIndexOf('.')), prop = tr.name.slice(tr.name.lastIndexOf('.')); const role = ROLES.find((r) => r === node); if (role) tr.name = NAMES[role] + prop; }
  const scene = new THREE.Scene(); scene.add(root); scene.updateMatrixWorld(true);
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
  for (const m of keep) m.geometry.dispose();
  return buf;
}
export const FIXTURE_CLIPS = { idle: 'Fixture_Idle', punchL: 'Fixture_Punch_Left', punchR: 'Fixture_Punch_Right', divergent: 'Fixture_Divergent', blackflash: 'Fixture_Black_Flash', turnL: 'Fixture_Turn_Left', turnR: 'Fixture_Turn_Right' };
