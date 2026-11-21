/* SKIBRIB CHALLENGE art: enemy and boss sprites built from the supplied pictures (assets/skibrib/*.png, loaded through the asset
   manifest), the brainrot map background, and the extra battle effects (dodges, shield pulses, auras, reveals).
   The map is meant to look like it was designed at 3 AM by someone with severe internet poisoning, but the path, the tiles and the
   enemies stay readable: decorations live only on blocked or unused tiles and everything is drawn under the path. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Util, Balance } = JJK;
  const Art = JJK.Art;
  const TAU = Math.PI * 2;
  const TILE = Balance.TILE, FY = Balance.FIELD_Y, W = Balance.W, H = Balance.H, COLS = Balance.COLS, ROWS = Balance.ROWS;
  const mk = (w, h) => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const img = (k) => Art.overrides.skibrib && Art.overrides.skibrib[k];

  // ------------------------------------------------------------------ sprites
  function tinted(src, tint, w, h) {
    const c = mk(w, h); if (!c) return null;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, w, h);
    if (tint) {
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.42; g.fillStyle = tint; g.fillRect(0, 0, w, h);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    return c;
  }
  function overlay(g, fx, S, ph, def) {
    const s = S / 100;
    g.save(); g.scale(s, s);
    switch (fx) {
      case 'speed': g.strokeStyle = '#fff'; g.globalAlpha = 0.7; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const y = -20 + i * 13, o = (ph * 6 + i) % 3; g.beginPath(); g.moveTo(-48 - o * 4, y); g.lineTo(-30 - o * 2, y); g.stroke(); } break;
      case 'helmet': g.fillStyle = '#6a6e7a'; g.beginPath(); g.ellipse(0, -30, 40, 18, 0, Math.PI, TAU); g.fill(); g.fillStyle = '#9aa0b0'; g.fillRect(-42, -32, 84, 6); g.fillStyle = '#c0523a'; g.fillRect(-6, -48, 12, 10); break;
      case 'plates': g.fillStyle = '#b8c0d0cc'; g.fillRect(-40, -38, 80, 10); g.fillRect(-44, 18, 88, 10); g.strokeStyle = '#444a'; g.lineWidth = 2; for (let x = -36; x <= 36; x += 12) { g.beginPath(); g.arc(x, -33, 2, 0, TAU); g.stroke(); } break;
      case 'plus': g.fillStyle = '#4ade80'; for (let i = 0; i < 3; i++) { const a = ph + i * 2.1, x = Math.cos(a) * 38, y = -30 + Math.sin(a * 1.3) * 10 - i * 6; g.fillRect(x - 6, y - 2, 12, 4); g.fillRect(x - 2, y - 6, 4, 12); } break;
      case 'bubble': g.strokeStyle = '#8ad8ff'; g.globalAlpha = 0.55 + 0.2 * Math.sin(ph); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 47, 0, TAU); g.stroke(); break;
      case 'ghost': break;
      case 'glitch': g.fillStyle = '#ff4ad0'; g.fillRect(-6, -54, 4, 16); g.beginPath(); g.arc(-4, -56, 5, 0, TAU); g.fill(); g.globalAlpha = 0.5; g.fillStyle = '#4af0ff'; g.fillRect(-44, -8 + Math.sin(ph * 3) * 10, 88, 5); g.fillStyle = '#ff4ad0'; g.fillRect(-44, 14 + Math.cos(ph * 2) * 8, 88, 4); break;
      case 'crack': g.strokeStyle = '#ffb070'; g.lineWidth = 3; g.beginPath(); g.moveTo(-10, -40); g.lineTo(2, -14); g.lineTo(-8, 4); g.lineTo(6, 30); g.stroke(); g.beginPath(); g.moveTo(2, -14); g.lineTo(20, -6); g.stroke(); break;
      case 'bandaid': g.fillStyle = '#f0c8a0'; g.save(); g.rotate(-0.5); g.fillRect(-20, -30, 40, 12); g.fillStyle = '#d8a880'; g.fillRect(-5, -30, 10, 12); g.restore(); g.fillStyle = '#7ac8ff'; g.beginPath(); g.ellipse(30, -12, 5, 8, 0, 0, TAU); g.fill(); break;
      case 'rage': g.strokeStyle = '#ff2a4a'; g.globalAlpha = 0.6; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 46 + Math.sin(ph * 2) * 3, 0, TAU); g.stroke(); g.fillStyle = '#fff8'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-24 + i * 24, -50 - ((ph * 8 + i * 5) % 12), 5, 0, TAU); g.fill(); } break;
      default: break;
    }
    g.restore();
  }
  function skibFrames(type, def) {
    const key = 'en:' + type;
    if (Art._cache[key]) return Art._cache[key];
    const boss = !!def.boss, S = boss ? 320 : 192, N = 8, frames = [];
    const src = img(def.img);
    for (let f = 0; f < N; f++) {
      const c = mk(S, S); if (!c) return [];
      const g = c.getContext('2d'), ph = (f / N) * TAU;
      g.translate(S / 2, S / 2);
      if (boss) { const gr = g.createRadialGradient(0, 0, S * 0.1, 0, 0, S * 0.5); gr.addColorStop(0, def.color + 'aa'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.globalAlpha = 0.5 + 0.25 * Math.sin(ph); g.fillRect(-S / 2, -S / 2, S, S); g.globalAlpha = 1; }
      if (src) {
        const k = (boss ? 0.9 : 0.86) * S / Math.max(src.width, src.height);
        const w = src.width * k, h = src.height * k;
        // dumb dramatic wobble: squash, stretch and a tiny tilt (they are trolls, they cannot walk normally)
        const sq = 1 + Math.sin(ph) * (boss ? 0.03 : 0.07), tilt = Math.sin(ph + 1) * (boss ? 0.03 : 0.09);
        g.rotate(tilt); g.scale(1 / sq, sq);
        const t = tinted(src, def.tint, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
        if (def.fx === 'ghost') { g.globalAlpha = 0.25; g.drawImage(t, -w / 2 - 14, -h / 2, w, h); g.globalAlpha = 0.45; g.drawImage(t, -w / 2 - 7, -h / 2, w, h); g.globalAlpha = 1; }
        g.drawImage(t, -w / 2, -h / 2, w, h);
        g.setTransform(1, 0, 0, 1, S / 2, S / 2);
      } else {
        // the picture has not loaded (or is missing): a plain placeholder blob, never a drawn copy of the meme
        g.fillStyle = def.color || '#888'; g.beginPath(); g.arc(0, 0, S * 0.32, 0, TAU); g.fill();
        g.fillStyle = '#000'; g.font = 'bold ' + Math.round(S * 0.3) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 4);
      }
      overlay(g, def.fx, S * (boss ? 0.6 : 1), ph, def);
      frames.push(c);
    }
    if (src) Art._cache[key] = frames;
    return frames;
  }
  const baseFrames = Art.enemyFrames;
  Art.enemyFrames = function (type) {
    const def = (JJK.Enemies && JJK.Enemies[type]) || (JJK.Bosses && JJK.Bosses[type]);
    if (def && def.skib) return skibFrames(type, def);
    return baseFrames(type);
  };

  // ------------------------------------------------------------------ battle effects
  if (JJK.VFX) {
    const onFx = JJK.VFX.prototype.onFx;
    JJK.VFX.prototype.onFx = function (e) {
      switch (e.type) {
        case 'dodge': this.text(e.x, e.y - 30, 'DODGE!', '#4ad0ff', 14, { bold: true }); return;
        case 'shieldPulse': this.ring(e.x, e.y, e.r || 100, '#5a8cff', 0.5, 4, { from: 0.2 }); return;
        case 'reveal': this.ring(e.x, e.y, 70, '#ff2a4a', 0.6, 6); this.burst(e.x, e.y, 26, '#ff2a4a', 220, 0.6, 4); this.text(e.x, e.y - 44, 'lol. not weak.', '#ff5a7a', 16, { bold: true }); this.shake(3, 0.15); return;
        case 'fizzle': this.text(e.x, e.y - 34, 'INTERRUPTED', '#4ade80', 14, { bold: true }); this.ring(e.x, e.y, 40, '#4ade80', 0.4, 3); return;
        default: return onFx.call(this, e);
      }
    };
  }
  if (JJK.BattleRenderer) {
    const drawEnemies = JJK.BattleRenderer.prototype.drawEnemies;
    JJK.BattleRenderer.prototype.drawEnemies = function (ctx, b) {
      if (b.hasSkib) {
        // auras and channels under the sprites
        for (const e of b.enemies) {
          if (!e.alive) continue;
          if (e.def.aura) { ctx.save(); ctx.strokeStyle = '#ffd23a'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 5 + e.id); ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(e.x, e.y, e.def.aura.r * TILE, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffd23a'; ctx.fill(); ctx.restore(); }
          else if (e.auraUntil > b.time) { ctx.save(); ctx.strokeStyle = '#ffd23a'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y + e.size * 0.45, e.size * 0.5, 0, TAU); ctx.stroke(); ctx.restore(); }
          if (e.channeling) { ctx.save(); ctx.fillStyle = '#ff4ad0'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 20); ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, TAU); ctx.fill(); ctx.restore(); }
        }
      }
      drawEnemies.call(this, ctx, b);
    };
  }

  // ------------------------------------------------------------------ the background
  function strokePath(g, pts, w, color, dash) {
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = color; if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.restore();
  }
  function toilet(g, x, y, w, h, hue) {
    // a giant toilet used as a building
    g.save(); g.translate(x, y);
    g.fillStyle = '#0006'; g.beginPath(); g.ellipse(w * 0.5, h * 0.95, w * 0.48, h * 0.1, 0, 0, TAU); g.fill();
    const body = g.createLinearGradient(0, 0, w, 0); body.addColorStop(0, '#e8e8f4'); body.addColorStop(1, '#a8a8c0');
    g.fillStyle = body; g.strokeStyle = '#222'; g.lineWidth = 3;
    g.beginPath(); g.roundRect ? g.roundRect(w * 0.55, h * 0.04, w * 0.4, h * 0.42, 8) : g.rect(w * 0.55, h * 0.04, w * 0.4, h * 0.42); g.fill(); g.stroke(); // tank
    g.beginPath(); g.ellipse(w * 0.42, h * 0.52, w * 0.4, h * 0.2, 0, 0, TAU); g.fill(); g.stroke(); // bowl rim
    g.fillStyle = hue || '#24203a'; g.beginPath(); g.ellipse(w * 0.42, h * 0.52, w * 0.28, h * 0.12, 0, 0, TAU); g.fill();
    g.fillStyle = body; g.beginPath(); g.moveTo(w * 0.14, h * 0.58); g.lineTo(w * 0.24, h * 0.92); g.lineTo(w * 0.6, h * 0.92); g.lineTo(w * 0.7, h * 0.58); g.closePath(); g.fill(); g.stroke();
    // windows in the tank, because people live in there apparently
    g.fillStyle = '#ffd23a'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.globalAlpha = (i + j) % 2 ? 0.9 : 0.35; g.fillRect(w * 0.6 + i * w * 0.11, h * 0.1 + j * h * 0.14, w * 0.07, h * 0.08); }
    g.restore();
  }
  function cone(g, x, y, s) { g.save(); g.translate(x, y); g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.45, s * 0.5); g.lineTo(-s * 0.45, s * 0.5); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-s * 0.25, -s * 0.2, s * 0.5, s * 0.16); g.fillStyle = '#222'; g.fillRect(-s * 0.55, s * 0.45, s * 1.1, s * 0.15); g.restore(); }
  function sign(g, x, y, text, bg, fg, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.font = 'bold 11px sans-serif'; const w = g.measureText(text).width + 12;
    g.fillStyle = '#5a4a3a'; g.fillRect(-2, 6, 4, 20);
    g.fillStyle = bg; g.strokeStyle = '#000'; g.lineWidth = 2; g.fillRect(-w / 2, -10, w, 18); g.strokeRect(-w / 2, -10, w, 18);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, -1);
    g.restore();
  }
  function button(g, x, y, r) { g.save(); g.fillStyle = '#333'; g.beginPath(); g.ellipse(x, y + 4, r * 1.2, r * 0.6, 0, 0, TAU); g.fill(); g.fillStyle = '#e01a2a'; g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, 0, TAU); g.fill(); g.fillStyle = '#ff6a7a'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.15, r * 0.3, r * 0.15, 0, 0, TAU); g.fill(); g.restore(); }
  function pipe(g, x, y, len, vert) { g.save(); g.fillStyle = '#4a8a4a'; g.strokeStyle = '#1a3a1a'; g.lineWidth = 2; if (vert) { g.fillRect(x - 7, y, 14, len); g.strokeRect(x - 7, y, 14, len); g.fillRect(x - 10, y + len - 6, 20, 8); } else { g.fillRect(x, y - 7, len, 14); g.strokeRect(x, y - 7, len, 14); g.fillRect(x + len - 6, y - 10, 8, 20); } g.restore(); }
  function portal(g, x, y, r, c1, c2) { g.save(); const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, c1); gr.addColorStop(1, c2 + '00'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 0.7, r, 0, 0, TAU); g.fill(); g.strokeStyle = c1; g.lineWidth = 3; g.stroke(); g.restore(); }
  function arrow(g, x, y, a, s, color) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color; g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.6, -s * 0.7); g.lineTo(-s * 0.2, 0); g.lineTo(-s * 0.6, s * 0.7); g.closePath(); g.fill(); g.restore(); }
  function billboard(g, x, y, w, h, pic, caption) {
    g.save();
    g.fillStyle = '#3a3a48'; g.fillRect(x + w * 0.2, y + h, 5, 18); g.fillRect(x + w * 0.75, y + h, 5, 18);
    g.fillStyle = '#111'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
    const p = img(pic);
    if (p) g.drawImage(p, x + 2, y + 2, w - 4, h - (caption ? 16 : 4)); // badly stretched on purpose
    if (caption) { g.fillStyle = '#e01a2a'; g.fillRect(x, y + h - 14, w, 14); g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(caption, x + w / 2, y + h - 7); }
    g.restore();
  }
  function floatingHead(g, x, y, s, pic, alpha) { const p = img(pic); if (!p) return; g.save(); g.globalAlpha = alpha; const k = s / Math.max(p.width, p.height); g.drawImage(p, x - p.width * k / 2, y - p.height * k / 2, p.width * k, p.height * k * 1.35); g.restore(); }

  function renderBg(mapId) {
    const map = JJK.Maps[mapId];
    const c = mk(W, H); if (!c) return null;
    const g = c.getContext('2d');
    const rng = Util.makeRng(Util.hashString('bg:skibrib'));
    // sky: a cursed sunset gradient
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2a0a3a'); sky.addColorStop(1, '#0a1a2a'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // the floor: tiles that do not match, on purpose
    for (let col = 0; col < COLS; col++) for (let r = 0; r < ROWS; r++) {
      const k = (col * 7 + r * 13) % 5;
      g.fillStyle = ['#23402a', '#284a2e', '#2a3a48', '#3a2a48', '#244a3a'][k];
      g.fillRect(col * TILE, FY + r * TILE, TILE, TILE);
    }
    // random grass tufts
    g.strokeStyle = '#5ad06a88'; g.lineWidth = 2;
    for (let i = 0; i < 260; i++) { const x = rng.range(0, W), y = rng.range(FY + 4, FY + ROWS * TILE - 4); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-3, 3), y - rng.range(4, 9)); g.stroke(); }
    // fake shortcut: a painted path-coloured strip that goes nowhere (signposted as a shortcut)
    g.fillStyle = '#c8a87a33'; g.fillRect(15 * TILE + 8, FY + 5.25 * TILE, 4.5 * TILE, TILE * 0.5);
    // elevated pads: big red "DO NOT PRESS" button platforms
    for (const e of map.elevated) {
      const x = e.c * TILE, y = FY + e.r * TILE, w = e.w * TILE, h = e.h * TILE;
      g.fillStyle = '#00000066'; g.fillRect(x + 6, y + 10, w, h);
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#5a4a7a'); gr.addColorStop(1, '#3a2a5a'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.strokeStyle = '#ffd23a'; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.setLineDash([]);
    }
    // blocked tiles: toilets as buildings, plus the big toilet HQ
    for (const bl of map.blocked) {
      const x = bl.c * TILE, y = FY + bl.r * TILE, w = bl.w * TILE, h = bl.h * TILE;
      g.fillStyle = '#0d0a18'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
      if (bl.w * bl.h >= 2) toilet(g, x + 4, y + 2, Math.min(w - 8, h * 1.4), h - 4, ['#2a1a4a', '#4a1a2a', '#1a3a4a'][(bl.c + bl.r) % 3]);
      else { cone(g, x + w / 2, y + h / 2 + 6, 16); }
    }
    // billboards and floating heads (the supplied pictures, stretched badly)
    billboard(g, 0.4 * TILE, FY + 0.12 * TILE, 3.2 * TILE, 0.78 * TILE, 'king', 'SKIBRIB CHALLENGE');
    billboard(g, 15.3 * TILE, FY + 0.1 * TILE, 4.4 * TILE, 0.8 * TILE, 'toilet', 'FREE WIN →');
    billboard(g, 16.35 * TILE, FY + 6.3 * TILE, 3.3 * TILE, 2.4 * TILE, 'troll', 'YOU WILL NOT SURVIVE 65');
    floatingHead(g, 18.2 * TILE, FY + 4.4 * TILE, 54, 'demon', 0.35);
    floatingHead(g, 7 * TILE, FY + 8.4 * TILE, 50, 'abom', 0.3);
    // props on free tiles that are not deployment slots
    const geo = JJK.Geometry.get(mapId);
    for (let col = 0; col < COLS; col++) for (let r = 0; r < ROWS; r++) {
      const k = col + ',' + r;
      if (geo.pathTiles.has(k) || geo.slots.has(k)) continue;
      if (map.blocked.some((b) => col >= b.c && col < b.c + b.w && r >= b.r && r < b.r + b.h)) continue;
      const x = (col + 0.5) * TILE, y = FY + (r + 0.5) * TILE;
      if (rng.chance(0.5)) cone(g, x + rng.range(-14, 14), y + rng.range(-8, 12), 12);
      else if (rng.chance(0.5)) button(g, x, y, 14);
      else pipe(g, x - 20, y, 40, false);
    }
    // portals at the spawn and the base, a pipe to nowhere, warning signs and pointless arrows
    portal(g, 0.25 * TILE, FY + 7.5 * TILE, 30, '#4af0ff', '#2a40ff');
    portal(g, 19.55 * TILE, FY + 2.5 * TILE, 34, '#ff4ad0', '#ff2a4a');
    pipe(g, 6.15 * TILE, FY + 4.55 * TILE, 30, true);
    sign(g, 2.3 * TILE, FY + 5.7 * TILE, 'NOT A SHORTCUT', '#ffd23a', '#000', -0.08);
    sign(g, 13.6 * TILE, FY + 8.2 * TILE, 'TOILET PARKING', '#2a6aff', '#fff', 0.05);
    sign(g, 8.7 * TILE, FY + 0.15 * TILE, '⚠ WAVE 65 ⚠', '#e01a2a', '#fff', 0);
    sign(g, 17.6 * TILE, FY + 1.35 * TILE, 'EXIT (pls no)', '#fff', '#e01a2a', 0.06);
    arrow(g, 3.4 * TILE, FY + 8.45 * TILE, Math.PI, 12, '#ffd23a99');
    arrow(g, 12.6 * TILE, FY + 8.45 * TILE, -Math.PI / 2, 12, '#ff4ad099');
    arrow(g, 19.3 * TILE, FY + 5.5 * TILE, 2.4, 12, '#4af0ff99');
    // the path: loud, clear, with direction chevrons so the four crossings stay readable
    const pts = map.paths[0].map((p) => ({ x: (p[0] + 0.5) * TILE, y: FY + (p[1] + 0.5) * TILE }));
    strokePath(g, pts, TILE * 0.98, '#000000aa');
    strokePath(g, pts, TILE * 0.9, '#ffd23a');
    strokePath(g, pts, TILE * 0.76, '#7a5a3a');
    strokePath(g, pts, TILE * 0.66, '#a8845a');
    const P = new JJK.PathData(map.paths[0]); const q = { x: 0, y: 0 }, q2 = { x: 0, y: 0 };
    for (let d = 40; d < P.length - 20; d += 52) { P.posAt(d, q); P.posAt(d + 4, q2); arrow(g, q.x, q.y, Math.atan2(q2.y - q.y, q2.x - q.x), 8, '#ffffff66'); }
    // crossings get a little "!!" so nobody thinks the troll will turn there
    const seen = {};
    for (const wp of map.paths) for (let i = 1; i < wp.length; i++) { const a = wp[i - 1], b = wp[i]; for (let cc = Math.min(a[0], b[0]); cc <= Math.max(a[0], b[0]); cc++) for (let rr = Math.min(a[1], b[1]); rr <= Math.max(a[1], b[1]); rr++) { const kk = cc + ',' + rr; seen[kk] = (seen[kk] || 0) + 1; } }
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ff4ad0';
    for (const [cc, rr] of [[5, 4], [8, 4], [10, 6], [14, 2]]) g.fillText('✕', (cc + 0.5) * TILE + 22, FY + (rr + 0.5) * TILE - 20);
    // base marker
    const l = pts[pts.length - 1]; g.fillStyle = '#ff2a4a'; g.beginPath(); g.arc(Math.min(l.x, W - 30), l.y, 20, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textBaseline = 'middle'; g.fillText('🚽', Math.min(l.x, W - 30), l.y + 1);
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 820); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,0,30,.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  }

  const Bg = JJK.Backgrounds;
  if (Bg) {
    const get = Bg.get.bind(Bg);
    Bg.get = function (mapId) {
      if (mapId !== 'skibrib') return get(mapId);
      if (Art.overrides.backgrounds.skibrib) return Art.overrides.backgrounds.skibrib;
      if (this._cache.skibrib) return this._cache.skibrib;
      const c = renderBg(mapId);
      // only cache once the supplied pictures are in (otherwise the billboards would stay blank)
      if (c && img('troll') && img('king')) this._cache.skibrib = c;
      return c;
    };
  }
  JJK.SkibArt = { renderBg, skibFrames };
})(typeof window !== 'undefined' ? window : globalThis);
