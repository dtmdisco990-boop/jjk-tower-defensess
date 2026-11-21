/* Screen-space combat effects for the 3D fighters, drawn into the battle's 2D context right after the 3D layer is composited
   (so they inherit screen shake and sit above the figures): impact sparks, divergent (delayed) cursed bursts, Black Flash
   black-red lightning + impact frames, wind-up charge crackle, power-up aura. Fixed pools in typed arrays: no per-frame allocation. */
const TAU = Math.PI * 2;

// small deterministic PRNG for visuals only (never touches the simulation's RNG)
let seed = 0x9e3779b9;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; }

const PART = 512, PS = 9;   // x y vx vy life max size kind drag
const RING = 32, RS = 8;    // x y r0 r1 life max kind squash
const BOLT = 24, BPTS = 14, BS = 6; // x1 y1 x2 y2 life max  (+ jitter points)
export const COLORS = {
  punch: ['#fff4e0', '#ffd27a'],
  divergent: ['#bfe9ff', '#4aa8ff'],
  blackflash: ['#ff1f3d', '#0a0005'],
  aura: ['#ffe9a0', '#ffb84a'],
};
const KIND = { punch: 0, divergent: 1, blackflash: 2, aura: 3, dust: 4 };
const KCOL = ['#ffe9c0', '#7cc8ff', '#ff2448', '#ffd36a', '#c9b8a0'];

export class Fx2D {
  constructor() {
    this.p = new Float32Array(PART * PS); this.np = 0;
    this.r = new Float32Array(RING * RS); this.nr = 0;
    this.b = new Float32Array(BOLT * BS); this.bp = new Float32Array(BOLT * BPTS * 2); this.nb = 0; this.bAge = new Float32Array(BOLT);
    this.frame = { t: 0, x: 0, y: 0, max: 0 }; // Black Flash impact frame
    this.squash = 0.82; this.reduced = false;
    this.counts = { sparks: 0, rings: 0, bolts: 0, frames: 0 };
  }
  clear() { this.np = this.nr = this.nb = 0; this.frame.t = 0; }
  spark(x, y, vx, vy, life, size, kind, drag) {
    if (this.np >= PART) return;
    const o = this.np++ * PS, p = this.p;
    p[o] = x; p[o + 1] = y; p[o + 2] = vx; p[o + 3] = vy; p[o + 4] = life; p[o + 5] = life; p[o + 6] = size; p[o + 7] = kind; p[o + 8] = drag || 4;
    this.counts.sparks++;
  }
  ring(x, y, r0, r1, life, kind) {
    if (this.nr >= RING) return;
    const o = this.nr++ * RS, r = this.r;
    r[o] = x; r[o + 1] = y; r[o + 2] = r0; r[o + 3] = r1; r[o + 4] = life; r[o + 5] = life; r[o + 6] = kind; r[o + 7] = this.squash;
    this.counts.rings++;
  }
  bolt(x1, y1, x2, y2, life) {
    if (this.nb >= BOLT) return;
    const i = this.nb++, o = i * BS, b = this.b;
    b[o] = x1; b[o + 1] = y1; b[o + 2] = x2; b[o + 3] = y2; b[o + 4] = life; b[o + 5] = life; this.bAge[i] = 1;
    this.jitter(i); this.counts.bolts++;
  }
  jitter(i) {
    const o = i * BS, b = this.b, q = i * BPTS * 2, pts = this.bp;
    const x1 = b[o], y1 = b[o + 1], x2 = b[o + 2], y2 = b[o + 3], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let k = 0; k < BPTS; k++) {
      const t = k / (BPTS - 1), amp = (k === 0 || k === BPTS - 1) ? 0 : (rnd() - 0.5) * Math.min(26, len * 0.32) * Math.sin(t * Math.PI);
      pts[q + k * 2] = x1 + dx * t + nx * amp; pts[q + k * 2 + 1] = y1 + dy * t + ny * amp;
    }
  }

  // ------------------------------------------------------------ composite effects
  impact(x, y, kind, dirX, dirY) {
    const k = KIND[kind] !== undefined ? KIND[kind] : 0;
    const n = kind === 'blackflash' ? 26 : kind === 'divergent' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirY, dirX) + (rnd() - 0.5) * (kind === 'punch' ? 1.8 : TAU), sp = (kind === 'blackflash' ? 260 : 170) * (0.35 + rnd());
      this.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp * this.squash, 0.18 + rnd() * (kind === 'blackflash' ? 0.35 : 0.2), kind === 'blackflash' ? 3.2 : 2.4, k, 5);
    }
    if (kind === 'punch') this.ring(x, y, 4, 22, 0.16, k);
    if (kind === 'divergent') { this.ring(x, y, 6, 40, 0.3, k); this.ring(x, y, 2, 26, 0.22, k); }
    if (kind === 'blackflash') {
      this.ring(x, y, 8, 74, 0.42, k); this.ring(x, y, 4, 46, 0.3, KIND.punch);
      for (let i = 0; i < 7; i++) { const a = rnd() * TAU, l = 40 + rnd() * 70; this.bolt(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l * this.squash, 0.22 + rnd() * 0.18); }
      const f = this.frame; f.t = f.max = this.reduced ? 0 : 0.11; f.x = x; f.y = y; if (!this.reduced) this.counts.frames++;
    }
  }
  /** Divergent Fist: the cursed energy lands a beat after the fist. */
  divergent(x, y) { this.impact(x, y, 'divergent', 0, 0); }
  dust(x, y) { for (let i = 0; i < 6; i++) { const a = Math.PI + (rnd() - 0.5) * 2.2; this.spark(x + (rnd() - 0.5) * 10, y, Math.cos(a) * 40 * (rnd() + 0.3) * (rnd() < 0.5 ? -1 : 1), -10 - rnd() * 18, 0.3 + rnd() * 0.2, 3, KIND.dust, 3); } }
  aura(x, y) {
    this.ring(x, y, 10, 52, 0.55, KIND.aura); this.ring(x, y, 4, 34, 0.4, KIND.aura);
    for (let i = 0; i < 18; i++) this.spark(x + (rnd() - 0.5) * 46, y - rnd() * 10, (rnd() - 0.5) * 20, -60 - rnd() * 90, 0.5 + rnd() * 0.4, 2.6, KIND.aura, 1.2);
  }
  /** Per-frame wind-up glow on a fist (charge 0..1). Black Flash charge crackles black and red. */
  charge(ctx, x, y, c, bf, t) {
    if (c <= 0.02) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 10 + 16 * c, g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, bf ? 'rgba(255,60,80,' + (0.8 * c) + ')' : 'rgba(150,210,255,' + (0.6 * c) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
    if (bf && !this.reduced && c > 0.4) {
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        let px = x, py = y; const a0 = (t * 9 + i * 2.1) % TAU;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let k = 1; k <= 4; k++) { px = x + Math.cos(a0 + (rnd() - 0.5) * 1.2) * k * 6 * c; py = y + Math.sin(a0 + (rnd() - 0.5) * 1.2) * k * 6 * c; ctx.lineTo(px, py); }
        ctx.strokeStyle = '#0a0005'; ctx.lineWidth = 3.2; ctx.stroke(); ctx.strokeStyle = '#ff2448'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.restore();
    }
  }

  update(dt) {
    if (dt <= 0) return;
    const p = this.p;
    for (let i = 0; i < this.np;) {
      const o = i * PS; p[o + 4] -= dt;
      if (p[o + 4] <= 0) { const last = --this.np * PS; if (last !== o) p.copyWithin(o, last, last + PS); continue; }
      const dr = Math.exp(-p[o + 8] * dt); p[o + 2] *= dr; p[o + 3] = p[o + 3] * dr + (p[o + 7] === KIND.aura ? 0 : 140 * dt);
      p[o] += p[o + 2] * dt; p[o + 1] += p[o + 3] * dt; i++;
    }
    const r = this.r;
    for (let i = 0; i < this.nr;) { const o = i * RS; r[o + 4] -= dt; if (r[o + 4] <= 0) { const last = --this.nr * RS; if (last !== o) r.copyWithin(o, last, last + RS); continue; } i++; }
    const b = this.b;
    for (let i = 0; i < this.nb;) {
      const o = i * BS; b[o + 4] -= dt;
      if (b[o + 4] <= 0) { const last = --this.nb; if (last !== i) { b.copyWithin(o, last * BS, last * BS + BS); this.bp.copyWithin(i * BPTS * 2, last * BPTS * 2, (last + 1) * BPTS * 2); this.bAge[i] = this.bAge[last]; } continue; }
      this.bAge[i] -= dt; if (this.bAge[i] <= 0) { this.bAge[i] = 1 / 30; this.jitter(i); } // flicker
      i++;
    }
    if (this.frame.t > 0) this.frame.t -= dt;
  }

  /** Impact frame: a manga-style inverted burst behind everything else in this layer. */
  drawFrame(ctx) {
    const f = this.frame; if (f.t <= 0 || f.max <= 0) return;
    const k = f.t / f.max;
    ctx.save();
    ctx.globalAlpha = 0.75 * k; ctx.fillStyle = '#050003';
    ctx.beginPath(); ctx.arc(f.x, f.y, 150, 0, TAU); ctx.fill();
    ctx.globalAlpha = k; ctx.fillStyle = '#ff1f3d';
    ctx.beginPath();
    for (let i = 0; i < 18; i++) { const a = i * TAU / 18 + 0.3, a2 = a + 0.08, l = 150 - (i % 3) * 30; ctx.moveTo(f.x + Math.cos(a) * 16, f.y + Math.sin(a) * 16 * this.squash); ctx.lineTo(f.x + Math.cos(a) * l, f.y + Math.sin(a) * l * this.squash); ctx.lineTo(f.x + Math.cos(a2) * 16, f.y + Math.sin(a2) * 16 * this.squash); }
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + 8 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  draw(ctx) {
    this.drawFrame(ctx);
    const r = this.r;
    ctx.save();
    for (let i = 0; i < this.nr; i++) {
      const o = i * RS, life = r[o + 4] / r[o + 5], u = 1 - life, rad = r[o + 2] + (r[o + 3] - r[o + 2]) * (1 - (1 - u) * (1 - u)), kd = r[o + 6] | 0;
      ctx.globalAlpha = life * 0.9; ctx.strokeStyle = KCOL[kd]; ctx.lineWidth = kd === KIND.blackflash ? 4 : 2.5;
      ctx.beginPath(); ctx.ellipse(r[o], r[o + 1], rad, rad * r[o + 7], 0, 0, TAU); ctx.stroke();
      if (kd === KIND.blackflash) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r[o], r[o + 1], rad * 0.8, rad * 0.8 * r[o + 7], 0, 0, TAU); ctx.stroke(); }
    }
    // lightning: wide black core under a hot red line
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 0; i < this.nb; i++) {
      const o = i * BS, q = i * BPTS * 2, life = this.b[o + 4] / this.b[o + 5], pts = this.bp;
      ctx.globalAlpha = Math.min(1, life * 1.6);
      ctx.beginPath(); ctx.moveTo(pts[q], pts[q + 1]); for (let k = 1; k < BPTS; k++) ctx.lineTo(pts[q + k * 2], pts[q + k * 2 + 1]);
      ctx.strokeStyle = '#0a0005'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#ff2448'; ctx.lineWidth = 2; ctx.stroke();
    }
    const p = this.p;
    for (let i = 0; i < this.np; i++) {
      const o = i * PS, life = p[o + 4] / p[o + 5], kd = p[o + 7] | 0, s = p[o + 6] * (0.5 + life * 0.7);
      ctx.globalAlpha = Math.min(1, life * 1.4); ctx.fillStyle = KCOL[kd];
      if (kd === KIND.blackflash && (i & 1)) ctx.fillStyle = '#0a0005';
      ctx.fillRect(p[o] - s / 2, p[o + 1] - s / 2, s, s);
    }
    ctx.restore();
  }
}
