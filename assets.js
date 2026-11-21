/* 3D character assets: the procedural STAND-IN RIG (an original sparring-mannequin design, used only to demonstrate the 3D
   system until a model is supplied), shared cel-shading materials with inverted-hull outlines, and loading of an externally
   supplied rigged GLB (e.g. assets/models/yuji.glb). Geometry, materials and textures are shared by every instance; each
   tower gets its own skeleton only. */
import * as THREE from '../../vendor/three/three.module.min.js';

export const ROLES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'foreArmL', 'handL', 'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
const PARENT = { spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shoulderL: 'chest', upperArmL: 'shoulderL', foreArmL: 'upperArmL', handL: 'foreArmL',
  shoulderR: 'chest', upperArmR: 'shoulderR', foreArmR: 'upperArmR', handR: 'foreArmR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR' };
// rest (T-pose) joint positions in metres; the figure faces +Z
const REST = {
  hips: [0, 0.95, 0], spine: [0, 1.05, 0], chest: [0, 1.22, 0], neck: [0, 1.45, 0], head: [0, 1.53, 0],
  shoulderL: [0.06, 1.40, 0], upperArmL: [0.17, 1.40, 0], foreArmL: [0.45, 1.40, 0], handL: [0.70, 1.40, 0],
  shoulderR: [-0.06, 1.40, 0], upperArmR: [-0.17, 1.40, 0], foreArmR: [-0.45, 1.40, 0], handR: [-0.70, 1.40, 0],
  thighL: [0.095, 0.92, 0], shinL: [0.095, 0.50, 0], footL: [0.095, 0.085, 0], toeL: [0.095, 0.03, 0.12],
  thighR: [-0.095, 0.92, 0], shinR: [-0.095, 0.50, 0], footR: [-0.095, 0.085, 0], toeR: [-0.095, 0.03, 0.12],
};
export const STANDIN = { REST, PARENT, height: 1.74, label: 'STAND-IN RIG' };

// ---------------------------------------------------------------- shared cel shading
let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  const d = new Uint8Array([70, 70, 70, 255, 165, 165, 165, 255, 255, 255, 255, 255]); // three hard bands
  gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.generateMipmaps = false; gradient.needsUpdate = true;
  return gradient;
}
const matCache = new Map();
export function toon(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: toonGradient() }));
  return matCache.get(hex);
}
const outlineMats = new Map();
/** Inverted-hull outline (back faces pushed out along the normal) that follows skinning. `w` is the width in model units. */
export function outline(w) {
  w = w || 0.012;
  const key = w.toFixed(5);
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0b10, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: w };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <skinning_vertex>',
      '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  transformed += normalize(objectNormal) * uOutline;\n#else\n  transformed += normalize(normal) * uOutline;\n#endif');
  };
  m.customProgramCacheKey = () => 'char3d-outline-' + key;
  outlineMats.set(key, m);
  return m;
}
/** Cel-shades a supplied model in place: toon materials keep each original colour/texture; adds outline hulls. */
export function celShade(scene, outlineW) {
  const conv = new Map(), meshes = [];
  scene.traverse((o) => { if (o.isMesh && !o.userData.char3dOutline) meshes.push(o); });
  for (const o of meshes) {
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const out = src.map((m) => {
      if (!m) return m;
      if (!conv.has(m.uuid)) {
        const t = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null, gradientMap: toonGradient(), transparent: !!m.transparent, alphaTest: m.alphaTest || 0, side: m.side, opacity: m.opacity === undefined ? 1 : m.opacity });
        if (m.emissive) { t.emissive = m.emissive.clone(); t.emissiveMap = m.emissiveMap || null; t.emissiveIntensity = m.emissiveIntensity || 1; }
        t.name = (m.name || 'mat') + ':toon'; conv.set(m.uuid, t);
      }
      return conv.get(m.uuid);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    if (!o.geometry.attributes.normal) continue;
    const hull = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, outline(outlineW)) : new THREE.Mesh(o.geometry, outline(outlineW));
    hull.name = o.name + ':outline'; hull.userData.char3dOutline = true; hull.renderOrder = -1; hull.frustumCulled = false; hull.castShadow = false;
    if (o.isSkinnedMesh) { hull.bindMode = o.bindMode; hull.bind(o.skeleton, o.bindMatrix); }
    hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale);
    o.parent.add(hull);
  }
  return conv.size;
}

// ---------------------------------------------------------------- the procedural stand-in rig
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function segDist(p, a, b) { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); }
const CHILD = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', shoulderL: 'upperArmL', upperArmL: 'foreArmL', foreArmL: 'handL', shoulderR: 'upperArmR', upperArmR: 'foreArmR', foreArmR: 'handR', thighL: 'shinL', shinL: 'footL', footL: 'toeL', thighR: 'shinR', shinR: 'footR', footR: 'toeR' };
function boneSeg(role) {
  const a = V(REST[role]);
  if (CHILD[role]) return [a, V(REST[CHILD[role]])];
  const tip = { head: [0, 0.2, 0], handL: [0.09, 0, 0], handR: [-0.09, 0, 0], toeL: [0, 0, 0.05], toeR: [0, 0, 0.05] }[role] || [0, 0.05, 0];
  return [a, a.clone().add(V(tip))];
}
/** Smooth skin weights: inverse-distance to the allowed bone segments (top 4, normalised). */
function weigh(pos, allowed, idx, out) {
  const cand = allowed.map((r) => { const s = boneSeg(r), d = segDist(pos, s[0], s[1]); return [idx[r], 1 / (Math.pow(d + 0.01, 6))]; }).sort((x, y) => y[1] - x[1]).slice(0, 4);
  let sum = 0; for (const c of cand) sum += c[1];
  for (let k = 0; k < 4; k++) { out.i[k] = cand[k] ? cand[k][0] : 0; out.w[k] = cand[k] ? cand[k][1] / sum : 0; }
}
/** A tube along a polyline with per-point radii (rx, rz), capped; each vertex skinned to `allowed` bones. */
function tube(G, pts, radii, allowed, opt) {
  opt = opt || {};
  const seg = opt.seg || 14, base = G.pos.length / 3, n = pts.length;
  const up = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = V(pts[i]), dir = V(pts[Math.min(n - 1, i + 1)]).sub(V(pts[Math.max(0, i - 1)])).normalize();
    const ref = Math.abs(dir.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
    const s1 = new THREE.Vector3().crossVectors(dir, ref).normalize(), s2 = new THREE.Vector3().crossVectors(dir, s1).normalize();
    const [ra, rb] = Array.isArray(radii[i]) ? radii[i] : [radii[i], radii[i]];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      tmp.copy(p).addScaledVector(s1, c * ra).addScaledVector(s2, s * rb);
      G.pos.push(tmp.x, tmp.y, tmp.z);
      const nrm = new THREE.Vector3().addScaledVector(s1, c / ra).addScaledVector(s2, s / rb).normalize();
      G.nrm.push(nrm.x, nrm.y, nrm.z);
      weigh(tmp, allowed, G.idx, G.wt); G.si.push(...G.wt.i); G.sw.push(...G.wt.w);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = base + i * (seg + 1) + k, b = a + seg + 1;
    G.ind.push(a, a + 1, b, a + 1, b + 1, b); // counter-clockwise seen from outside
  }
  // end caps (fan to an offset centre point)
  for (const [ii, sign] of [[0, -1], [n - 1, 1]]) {
    if (opt.noCap === true) continue;
    const p = V(pts[ii]), dir = V(pts[Math.min(n - 1, ii + 1)]).sub(V(pts[Math.max(0, ii - 1)])).normalize();
    const r = Array.isArray(radii[ii]) ? Math.min(...radii[ii]) : radii[ii];
    const c = p.clone().addScaledVector(dir, sign * r * 0.6), ci = G.pos.length / 3;
    G.pos.push(c.x, c.y, c.z); const nn = dir.clone().multiplyScalar(sign); G.nrm.push(nn.x, nn.y, nn.z);
    weigh(c, allowed, G.idx, G.wt); G.si.push(...G.wt.i); G.sw.push(...G.wt.w);
    const ring = base + ii * (seg + 1);
    for (let k = 0; k < seg; k++) sign < 0 ? G.ind.push(ci, ring + k + 1, ring + k) : G.ind.push(ci, ring + k, ring + k + 1);
  }
}
function ellipsoid(G, c, r, allowed, seg) {
  seg = seg || 16; const base = G.pos.length / 3, tmp = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const v = i / seg, th = v * Math.PI;
    for (let k = 0; k <= seg; k++) {
      const ph = (k / seg) * Math.PI * 2, nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      tmp.set(c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2]);
      G.pos.push(tmp.x, tmp.y, tmp.z);
      const nn = new THREE.Vector3(nx / r[0], ny / r[1], nz / r[2]).normalize(); G.nrm.push(nn.x, nn.y, nn.z);
      weigh(tmp, allowed, G.idx, G.wt); G.si.push(...G.wt.i); G.sw.push(...G.wt.w);
    }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < seg; k++) { const a = base + i * (seg + 1) + k, b = a + seg + 1; G.ind.push(a, a + 1, b, a + 1, b + 1, b); }
}
function newG(idx) { return { pos: [], nrm: [], ind: [], si: [], sw: [], idx, wt: { i: [0, 0, 0, 0], w: [0, 0, 0, 0] } }; }
function toGeometry(G) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(G.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(G.sw, 4));
  g.setIndex(G.ind);
  g.computeBoundingSphere();
  return g;
}
const COL = { suit: 0x4c5a3a, suitDark: 0x3a4630, trim: 0xd8cfb0, pants: 0x2c2d31, skin: 0xc99474, wrap: 0xece4d2, shoe: 0x31343a, sole: 0xe9e4d8, band: 0x2a9d8f, hair: 0x1d1b19, eye: 0x101014 };
let standInGeo = null;
/** Builds (once) the stand-in's shared geometries: one skinned mesh per material. */
function standInParts() {
  if (standInGeo) return standInGeo;
  const idx = {}; ROLES.forEach((r, i) => (idx[r] = i));
  const P = (r, dx, dy, dz) => { const p = REST[r]; return [p[0] + (dx || 0), p[1] + (dy || 0), p[2] + (dz || 0)]; };
  const parts = {};
  const part = (key, color) => (parts[key] = parts[key] || { G: newG(idx), color });
  // tracksuit top: torso + collar + long sleeves
  const top = part('suit', COL.suit).G;
  tube(top, [P('hips', 0, -0.02), P('hips', 0, 0.06), P('spine', 0, 0.04), P('chest', 0, 0.02), P('chest', 0, 0.12), P('neck', 0, -0.04)],
    [[0.155, 0.11], [0.15, 0.105], [0.145, 0.10], [0.17, 0.11], [0.175, 0.105], [0.07, 0.065]], ['hips', 'spine', 'chest', 'neck', 'upperArmL', 'upperArmR'], { seg: 20 });
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    tube(top, [P('shoulder' + s, 0.0 * sx, -0.01), P('upperArm' + s), P('upperArm' + s, 0.13 * sx), P('foreArm' + s), P('foreArm' + s, 0.17 * sx)],
      [0.06, 0.062, 0.058, 0.052, 0.046], ['chest', 'shoulder' + s, 'upperArm' + s, 'foreArm' + s]);
  }
  const trim = part('trim', COL.trim).G; // sleeve cuffs and the collar band
  for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1; tube(trim, [P('foreArm' + s, 0.17 * sx), P('foreArm' + s, 0.205 * sx)], [0.049, 0.047], ['foreArm' + s], { noCap: true }); }
  tube(trim, [P('neck', 0, -0.05), P('neck', 0, 0.01)], [[0.075, 0.07], [0.068, 0.064]], ['chest', 'neck'], { noCap: true });
  // trousers
  const pants = part('pants', COL.pants).G;
  for (const s of ['L', 'R']) tube(pants, [P('thigh' + s, 0, 0.06), P('thigh' + s), P('thigh' + s, 0, -0.2), P('shin' + s), P('shin' + s, 0, -0.2), P('foot' + s, 0, 0.06)],
    [0.085, 0.085, 0.072, 0.06, 0.055, 0.05], ['hips', 'thigh' + s, 'shin' + s, 'foot' + s]);
  tube(pants, [P('hips', 0, -0.08), P('hips', 0, 0.02)], [[0.16, 0.112], [0.158, 0.11]], ['hips', 'thighL', 'thighR'], { seg: 20 });
  // skin: neck, head, ears
  const skin = part('skin', COL.skin).G;
  tube(skin, [P('neck', 0, -0.02), P('head', 0, 0.02)], [0.05, 0.048], ['neck', 'head']);
  ellipsoid(skin, P('head', 0, 0.105, 0.01), [0.098, 0.118, 0.105], ['head'], 20);
  for (const sx of [1, -1]) ellipsoid(skin, P('head', 0.098 * sx, 0.1, -0.005), [0.016, 0.03, 0.02], ['head'], 8);
  // close-cropped dark hair cap and a teal headband (with two short tails)
  const hair = part('hair', COL.hair).G;
  ellipsoid(hair, P('head', 0, 0.15, -0.012), [0.102, 0.085, 0.104], ['head'], 18);
  const band = part('band', COL.band).G;
  tube(band, [P('head', 0, 0.13), P('head', 0, 0.165)], [[0.106, 0.112], [0.104, 0.11]], ['head'], { seg: 20, noCap: true });
  tube(band, [P('head', 0.02, 0.15, -0.11), P('head', 0.05, 0.11, -0.18), P('head', 0.07, 0.07, -0.22)], [0.016, 0.014, 0.01], ['head']);
  tube(band, [P('head', -0.02, 0.15, -0.11), P('head', -0.03, 0.1, -0.17), P('head', -0.035, 0.06, -0.2)], [0.016, 0.014, 0.01], ['head']);
  // face: eyes, brows, mouth (small dark shapes on the head bone)
  const face = part('face', COL.eye).G;
  for (const sx of [1, -1]) {
    ellipsoid(face, P('head', 0.036 * sx, 0.105, 0.095), [0.012, 0.018, 0.008], ['head'], 8);
    tube(face, [P('head', 0.018 * sx, 0.137, 0.098), P('head', 0.056 * sx, 0.142, 0.09)], [0.006, 0.005], ['head']);
  }
  tube(face, [P('head', -0.022, 0.05, 0.098), P('head', 0.022, 0.05, 0.098)], [0.004, 0.004], ['head']);
  // wrapped fists: palm block + four finger knuckles + thumb
  const wrap = part('wrap', COL.wrap).G;
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1, h = REST['hand' + s];
    tube(wrap, [P('foreArm' + s, 0.2 * sx), P('hand' + s), P('hand' + s, 0.05 * sx)], [[0.044, 0.04], [0.048, 0.04], [0.05, 0.042]], ['foreArm' + s, 'hand' + s]);
    for (let f = 0; f < 4; f++) ellipsoid(wrap, [h[0] + 0.08 * sx, h[1] + 0.024 - f * 0.016, h[2] + 0.018], [0.022, 0.009, 0.024], ['hand' + s], 8);
    tube(wrap, [[h[0] + 0.03 * sx, h[1] - 0.03, h[2] + 0.035], [h[0] + 0.07 * sx, h[1] - 0.035, h[2] + 0.04]], [0.012, 0.011], ['hand' + s]);
  }
  // trainers with white soles
  const shoe = part('shoe', COL.shoe).G, sole = part('sole', COL.sole).G;
  for (const s of ['L', 'R']) {
    tube(shoe, [P('foot' + s, 0, 0.02, -0.05), P('foot' + s, 0, -0.01, 0.04), P('toe' + s, 0, 0.0, 0.03)], [[0.05, 0.05], [0.052, 0.045], [0.04, 0.032]], ['foot' + s, 'toe' + s]);
    tube(sole, [P('foot' + s, 0, -0.06, -0.08), P('toe' + s, 0, -0.022, 0.07)], [[0.052, 0.014], [0.042, 0.012]], ['foot' + s, 'toe' + s]);
  }
  standInGeo = Object.entries(parts).map(([k, v]) => ({ key: k, geo: toGeometry(v.G), mat: toon(v.color) }));
  return standInGeo;
}
function makeBones() {
  const bones = {};
  for (const r of ROLES) { const b = new THREE.Bone(); b.name = r; bones[r] = b; }
  for (const r of ROLES) {
    const p = REST[r], par = PARENT[r];
    if (par) { const pp = REST[par]; bones[r].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); bones[par].add(bones[r]); }
    else bones[r].position.set(p[0], p[1], p[2]);
  }
  return bones;
}
/** A new stand-in instance: own skeleton, shared geometry/materials. Returns { root, bones, meshes, height, kind }. */
export function createStandIn() {
  const bones = makeBones(), list = ROLES.map((r) => bones[r]);
  const skeleton = new THREE.Skeleton(list);
  const root = new THREE.Group(); root.name = 'char3d-standin';
  root.add(bones.hips); root.updateMatrixWorld(true);
  const meshes = [];
  for (const pt of standInParts()) {
    const m = new THREE.SkinnedMesh(pt.geo, pt.mat); m.bind(skeleton); m.frustumCulled = false; m.castShadow = true; root.add(m); meshes.push(m);
    const o = new THREE.SkinnedMesh(pt.geo, outline(0.012)); o.bind(skeleton); o.userData.char3dOutline = true; o.frustumCulled = false; o.renderOrder = -1; root.add(o); meshes.push(o);
  }
  return { root, bones, skeleton, meshes, height: STANDIN.height, kind: 'standin', rest: REST };
}

// ---------------------------------------------------------------- supplied GLB models
// bone-name patterns per role (Mixamo, Blender/Rigify, VRM/humanoid, generic)
const PATTERNS = {
  hips: [/hips$/i, /pelvis/i, /^root_?hips/i], spine: [/spine$/i, /spine_?0?1$/i, /spine1$/i], chest: [/spine2$/i, /chest$/i, /upper_?chest/i, /spine_?0?3$/i, /spine_?0?2$/i], neck: [/neck$/i, /neck_?0?1/i], head: [/head$/i],
  shoulderL: [/left_?shoulder/i, /shoulder[._]?l$/i, /l[._]?shoulder/i, /clavicle[._]?l/i], upperArmL: [/left_?arm$/i, /upper_?arm[._]?l$/i, /l[._]?upper_?arm/i, /leftupperarm/i],
  foreArmL: [/left_?fore_?arm$/i, /fore_?arm[._]?l$/i, /lower_?arm[._]?l$/i, /leftlowerarm/i], handL: [/left_?hand$/i, /hand[._]?l$/i, /l[._]?hand$/i],
  shoulderR: [/right_?shoulder/i, /shoulder[._]?r$/i, /r[._]?shoulder/i, /clavicle[._]?r/i], upperArmR: [/right_?arm$/i, /upper_?arm[._]?r$/i, /r[._]?upper_?arm/i, /rightupperarm/i],
  foreArmR: [/right_?fore_?arm$/i, /fore_?arm[._]?r$/i, /lower_?arm[._]?r$/i, /rightlowerarm/i], handR: [/right_?hand$/i, /hand[._]?r$/i, /r[._]?hand$/i],
  thighL: [/left_?up_?leg$/i, /thigh[._]?l$/i, /upper_?leg[._]?l$/i, /leftupperleg/i], shinL: [/left_?leg$/i, /shin[._]?l$/i, /calf[._]?l$/i, /lower_?leg[._]?l$/i, /leftlowerleg/i],
  footL: [/left_?foot$/i, /foot[._]?l$/i], toeL: [/left_?toe_?base$/i, /toe[s]?[._]?l$/i, /lefttoes?$/i],
  thighR: [/right_?up_?leg$/i, /thigh[._]?r$/i, /upper_?leg[._]?r$/i, /rightupperleg/i], shinR: [/right_?leg$/i, /shin[._]?r$/i, /calf[._]?r$/i, /lower_?leg[._]?r$/i, /rightlowerleg/i],
  footR: [/right_?foot$/i, /foot[._]?r$/i], toeR: [/right_?toe_?base$/i, /toe[s]?[._]?r$/i, /righttoes?$/i],
};
export function mapBones(names) {
  const clean = (n) => n.replace(/^mixamorig[0-9]*[:_]?/i, '').replace(/^(armature|rig|root)[|:_.]/i, '');
  const out = {};
  for (const role of ROLES) for (const re of PATTERNS[role]) { const hit = names.find((n) => re.test(clean(n)) && !Object.values(out).includes(n)); if (hit) { out[role] = hit; break; } }
  return out;
}
/** Names can mislead (e.g. Spine02 at the bottom, Spine at the top): re-derive spine/chest from the hierarchy between hips and neck. */
export function orderSpine(map, scene) {
  const top = map.neck || map.head, by = (n) => n && scene.getObjectByName(n);
  const hips = by(map.hips); let b = by(top); if (!hips || !b) return map;
  const chain = []; b = b.parent;
  while (b && b !== hips) { if (b.isBone) chain.unshift(b.name); b = b.parent; }
  if (b !== hips || !chain.length) return map;
  map.spine = chain[0];
  if (chain.length > 1) map.chest = chain[chain.length - 1]; else delete map.chest;
  // the clavicles hang off the chest: prefer whatever bone the upper arms' chain actually starts from
  return map;
}
/** Loads a supplied rigged GLB. Resolves to a template (or null when the file is absent or unusable). */
export async function loadSupplied(url, GLTFLoader) {
  let res;
  try { res = await fetch(url, { cache: 'no-cache' }); } catch (e) { return null; }
  if (!res || !res.ok) return null;
  const buf = await res.arrayBuffer();
  return parseSupplied(buf, GLTFLoader, url);
}
export function parseSupplied(buf, GLTFLoader, label) {
  return new Promise((resolve) => {
    new GLTFLoader().parse(buf, '', (gltf) => {
      const scene = gltf.scene || gltf.scenes[0]; let skinned = null;
      scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
      if (!skinned) { console.warn('[char3d] ' + label + ': no skinned mesh, ignoring'); resolve(null); return; }
      const names = skinned.skeleton.bones.map((b) => b.name), map = mapBones(names);
      orderSpine(map, scene);
      const missing = ['hips', 'spine', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'].filter((r) => !map[r]);
      if (missing.length) console.warn('[char3d] ' + label + ': unmapped bones ' + missing.join(', ') + ' (procedural animation will skip them)');
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene), h = Math.max(1e-3, box.max.y - box.min.y);
      resolve({ kind: 'glb', scene, clips: gltf.animations || [], map, height: h, minY: box.min.y, label });
    }, (err) => { console.warn('[char3d] could not parse ' + label, err); resolve(null); });
  });
}
