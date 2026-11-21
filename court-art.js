/* RISE OF JAHJUAN presentation: the inverted courthouse background, the procedural Chief Justice (drawn twice: the Body and
   its true mirrored Reflection, from the same model), and court overlays (water, Monoliths, procession, gavel projections,
   Recitation ribbon, witness rings). Reads only battle events/state, court.forecast() and the trace; never mutates the sim.
   Never touches assets/characters/jahjuan.png (the playable unit). */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Balance, Util } = JJK;
  const CD = JJK.CourtData;
  if (!CD || typeof document === 'undefined') return;
  const TILE = Balance.TILE, W = 1280, H = 720, TAU = Math.PI * 2;
  const { tx, ty } = CD;
  const MID = ty(4);
  const DCOL = { NW: '#7fb7ff', SW: '#7fffd0', NE: '#ffb27f', SE: '#ff86c8', C: '#e8c25a', E: '#c0c0d8' };
  const face = new Image(); face.src = 'assets/court/jahjuan-face.png';

  // ------------------------------------------------------------ background (static, cached)
  function renderBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // basalt above, mirror-black water below the procession
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#15131c'); gr.addColorStop(0.45, '#0d0c14'); gr.addColorStop(1, '#050509');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // the inverted courthouse: iron beams and four chains
    g.strokeStyle = '#2b2838'; g.lineWidth = 6;
    for (const x of [96, 448, 832, 1184]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (x < 640 ? 40 : -40), FYpx()); g.stroke(); for (let y = 6; y < 44; y += 10) { g.strokeStyle = '#3b3650'; g.strokeRect(x - 4 + (x < 640 ? (y / 44) * 40 : -(y / 44) * 40), y, 8, 7); g.strokeStyle = '#2b2838'; } }
    // basin of mirror water under the central well
    gr = g.createRadialGradient(tx(9.5), MID, 30, tx(9.5), MID, 420); gr.addColorStop(0, '#1b2a3acc'); gr.addColorStop(1, '#0000');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // floor tiles
    g.strokeStyle = '#ffffff08'; g.lineWidth = 1;
    for (let cc = 0; cc <= 20; cc++) { g.beginPath(); g.moveTo(cc * TILE, 48); g.lineTo(cc * TILE, H); g.stroke(); }
    for (let r = 0; r <= 9; r++) { g.beginPath(); g.moveTo(0, 48 + r * TILE); g.lineTo(W, 48 + r * TILE); g.stroke(); }
    // ground routes (stone causeways)
    const lane = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach(([cc, r], i) => (i ? g.lineTo(tx(cc), ty(r)) : g.moveTo(tx(cc), ty(r)))); g.stroke(); };
    for (const k of CD.LANES) lane(CD.ROUTES[k], '#3a3446', 46);
    for (const k of CD.LANES) lane(CD.ROUTES[k], '#4a435a', 38);
    for (const k of CD.LANES) lane(CD.ROUTES[k], '#ffffff10', 2);
    // the fork and the exit gate
    ring(g, tx(11), ty(4), 22, '#e8c25a', 2); ring(g, tx(16), ty(4), 22, '#ff5a5a', 2);
    label(g, 'FORK', tx(11), ty(4) + 34, '#e8c25a'); label(g, 'EXIT GATE', tx(16), ty(4) + 34, '#ff8a8a');
    // procession causeway (raised; non-colliding)
    g.setLineDash([10, 8]); g.strokeStyle = '#e8c25a55'; g.lineWidth = 3;
    g.beginPath(); CD.LOOP.forEach(([cc, r], i) => (i ? g.lineTo(tx(cc), ty(r)) : g.moveTo(tx(cc), ty(r)))); g.stroke(); g.setLineDash([]);
    // Clerk's Well and the nine obsidian chairs
    ring(g, tx(9.5), MID, 54, '#e8c25a66', 3);
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i * TAU) / 9, x = tx(9.5) + Math.cos(a) * 78, y = MID + Math.sin(a) * 30; g.fillStyle = '#0a0a10'; g.strokeStyle = '#6a6080'; g.lineWidth = 1.5; g.beginPath(); g.rect(x - 6, y - 8, 12, 14); g.fill(); g.stroke(); }
    // benches with district badges
    for (const bn of CD.BENCH) {
      const x = tx(bn.c), y = ty(bn.r), col = DCOL[bn.district];
      g.fillStyle = bn.type === 'E' ? '#2c2738' : '#1e1b28'; g.strokeStyle = col + '88'; g.lineWidth = 2;
      g.beginPath(); g.roundRect ? g.roundRect(x - 26, y - 26, 52, 52, 8) : g.rect(x - 26, y - 26, 52, 52); g.fill(); g.stroke();
      if (bn.type === 'E') { g.strokeStyle = '#e8c25a'; g.lineWidth = 2; g.strokeRect(x - 20, y - 20, 40, 40); }
      g.fillStyle = col; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.fillText(bn.district + (bn.type === 'E' ? ' ▲' : ''), x, y + 22);
    }
    label(g, 'THE COURT OF NINE REFLECTIONS', W / 2, 66, '#e8c25a99', 13);
    return c;
  }
  function FYpx() { return 48; }
  function ring(g, x, y, r, col, w) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  function label(g, s, x, y, col, size) { g.fillStyle = col; g.font = '700 ' + (size || 10) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(s, x, y); }

  const Bg = JJK.Backgrounds;
  if (Bg) {
    const get = Bg.get.bind(Bg);
    Bg.get = function (mapId) {
      if (mapId !== 'court_of_nine') return get(mapId);
      if (!this._cache) this._cache = {};
      return this._cache.court_of_nine || (this._cache.court_of_nine = renderBg());
    };
  }
  // the Chief Justice is procedural: frames for galleries / the Owner Lab come from the same model; the battlefield draws him live
  const Art = JJK.Art; let judgeFrames = null;
  function frames() {
    if (judgeFrames) return judgeFrames;
    judgeFrames = [];
    for (let i = 0; i < 8; i++) { const c = document.createElement('canvas'); c.width = 160; c.height = 160; drawJudge(c.getContext('2d'), 80, 96, 54, 1, i * 0.4, { target: true }); judgeFrames.push(c); }
    return judgeFrames;
  }
  if (Art && Art.enemyFrames) { const ef = Art.enemyFrames.bind(Art); Art.enemyFrames = function (type) { return type === 'jahjuanBoss' ? frames() : ef(type); }; }

  // ------------------------------------------------------------ the procedural Chief Justice
  function drawJudge(g, x, y, s, phase, t, o) {
    o = o || {};
    g.save(); g.translate(x, y); if (o.mirror) g.scale(1, -1);
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const sway = o.reduced ? 0 : Math.sin(t * 2) * 2;
    // two interlocking shadows (VI)
    if (phase === 6) { g.save(); g.globalAlpha *= 0.4; g.translate(-10, 2); robe(g, s, '#20202c', phase); g.restore(); }
    // walking pillars (VII)
    if (phase >= 7) { g.strokeStyle = '#6a6080'; g.lineWidth = 3; for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * s * 0.7, s * 0.3); g.lineTo(k * s * (0.95 + (o.reduced ? 0 : 0.05 * Math.sin(t * 3 + k))), s * 0.95); g.stroke(); } }
    robe(g, s, phase === 5 ? '#3a2d18' : '#141420', phase);
    // cadastral tax map (V)
    if (phase === 5) { g.strokeStyle = '#e8c25a55'; g.lineWidth = 1; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * s * 0.18, -s * 0.1); g.lineTo(i * s * 0.25, s * 0.9); g.stroke(); } }
    // law shelves along the spine (III)
    if (phase === 3) { g.fillStyle = '#5a4a2a'; for (let i = 0; i < 4; i++) g.fillRect(-s * 0.32, -s * 0.05 + i * s * 0.2, s * 0.64, s * 0.05); }
    // bell in the ribcage (IV)
    if (phase === 4) { g.fillStyle = '#b08a3a'; g.beginPath(); g.moveTo(-s * 0.2, s * 0.35 + sway); g.quadraticCurveTo(0, -s * 0.05, s * 0.2, s * 0.35 + sway); g.closePath(); g.fill(); }
    // gold collar
    g.strokeStyle = '#e8c25a'; g.lineWidth = 3; g.beginPath(); g.arc(0, -s * 0.18, s * 0.34, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // face (clipped oval), the same model in both passes
    g.save(); g.beginPath(); g.ellipse(0, -s * 0.48, s * 0.27, s * 0.34, 0, 0, TAU); g.clip();
    if (face.complete && face.naturalWidth) { g.save(); if (o.mirror) { g.scale(1, -1); g.drawImage(face, -s * 0.27, s * 0.48 - s * 0.34, s * 0.54, s * 0.68); } else g.drawImage(face, -s * 0.27, -s * 0.48 - s * 0.34, s * 0.54, s * 0.68); g.restore(); }
    else { g.fillStyle = '#6a4a35'; g.fillRect(-s, -s, 2 * s, 2 * s); }
    g.restore();
    // crown: eight chairs fold into it from VIII; the lowered arena crown in IX
    const pts = phase >= 8 ? 8 : 5, cy = -s * 0.86, cr = s * (phase >= 9 ? 0.42 : 0.3);
    g.fillStyle = '#e8c25a'; g.beginPath();
    for (let i = 0; i <= pts * 2; i++) { const a = Math.PI + (i * Math.PI) / (pts * 2), rr = i % 2 ? cr * 0.62 : cr; g.lineTo(Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr * 0.9); }
    g.closePath(); g.fill();
    if (o.lit) { for (let i = 0; i < 8; i++) { const a = Math.PI + ((i + 0.5) * Math.PI) / 8; g.fillStyle = i < o.lit ? '#fff6c0' : '#6a5a2a'; g.beginPath(); g.arc(Math.cos(a) * cr * 1.15, cy + Math.sin(a) * cr * 0.85, 2.6, 0, TAU); g.fill(); } }
    // double-handed gavel (I)
    if (phase === 1) { g.save(); g.rotate(-0.6 + sway * 0.05); g.fillStyle = '#8a6a3a'; g.fillRect(s * 0.25, -s * 0.2, s * 0.08, s * 0.7); g.fillStyle = '#3a2a1a'; g.fillRect(s * 0.12, -s * 0.32, s * 0.34, s * 0.16); g.restore(); }
    // outline: solid for the targetable silhouette, dashed for the other
    g.globalAlpha = 1; g.strokeStyle = o.target ? '#fff6c0' : '#fff6c066'; g.lineWidth = o.target ? 2.5 : 1.5; if (!o.target) g.setLineDash([5, 5]);
    g.beginPath(); g.ellipse(0, -s * 0.15, s * 0.62, s * 1.0, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
  }
  function robe(g, s, col, phase) {
    g.fillStyle = col; g.strokeStyle = '#4a4060'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-s * 0.36, -s * 0.2); g.lineTo(s * 0.36, -s * 0.2); g.lineTo(s * 0.62, s * 0.9); g.lineTo(-s * 0.62, s * 0.9); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = phase >= 8 ? '#e8c25a' : '#c8c8d8'; g.fillRect(-s * 0.05, -s * 0.18, s * 0.1, s * 1.05);
  }

  // ------------------------------------------------------------ overlays
  const R = JJK.BattleRenderer && JJK.BattleRenderer.prototype;
  if (!R) return;
  const fcCache = { tick: -1, fc: null, b: null };
  function forecastOf(b) { const c = b.court; if (fcCache.b !== b || fcCache.tick !== c.tick) { fcCache.b = b; fcCache.tick = c.tick; fcCache.fc = c.forecast(); } return fcCache.fc; }
  const drawHazards = R.drawHazards;
  R.drawHazards = function (ctx, b) {
    if (b.court) underlay.call(this, ctx, b);
    if (b.court) { const keep = b.hazards; b.hazards = keep.filter((h) => !h.court); drawHazards.call(this, ctx, b); b.hazards = keep; courtHazards.call(this, ctx, b); }
    else drawHazards.call(this, ctx, b);
  };
  function underlay(ctx, b) {
    const c = b.court, t = this.t || 0, fc = forecastOf(b);
    // water on benches and corridors
    for (const bn of CD.BENCH) {
      const st = c.padState(bn.c, bn.r); if (st === 'dry') continue;
      const x = tx(bn.c), y = ty(bn.r);
      ctx.fillStyle = st === 'sub' ? '#4a8ac0aa' : '#9ac8ff33'; ctx.fillRect(x - 28, y - 28, 56, 56);
      ctx.strokeStyle = '#d8ecff'; ctx.lineWidth = 1; for (let k = 0; k < (st === 'sub' ? 3 : 1); k++) { ctx.beginPath(); ctx.moveTo(x - 24, y + 12 - k * 8); ctx.quadraticCurveTo(x, y + 6 - k * 8, x + 24, y + 12 - k * 8); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⇅', x + 17, y - 14); // Specular Inversion glyph
    }
    for (const k of Object.keys(c.water.cor)) {
      const cor = CD.CORRIDORS[k]; if (!cor) continue; const st = c.water.cor[k];
      ctx.fillStyle = st === 'sub' ? '#4a8ac055' : '#9ac8ff22'; ctx.fillRect(tx(cor.c0) - 32, ty(cor.row) - 22, (cor.c1 - cor.c0 + 1) * TILE, 44);
    }
    // Mirror Monoliths on y = ty(4)
    const M = c.monoliths();
    for (const key of Object.keys(M)) { const sp = CD.SPANS[key]; ctx.strokeStyle = M[key] === 2 ? '#d8d0ff' : '#9a90c0'; ctx.lineWidth = M[key] === 2 ? 7 : 4; ctx.beginPath(); ctx.moveTo(tx(sp[0]), MID); ctx.lineTo(tx(sp[1]), MID); ctx.stroke(); }
    // Sub Judice locks and Sealed Bench padlocks
    for (const [k, until] of fc.locks) { const [cc, r] = k.split(',').map(Number); const x = tx(cc), y = ty(r); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 20, y - 20); ctx.lineTo(x + 20, y + 20); ctx.moveTo(x + 20, y - 20); ctx.lineTo(x - 20, y + 20); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, (until - c.tick) / 720)); ctx.stroke(); }
    const sb = fc.laws.find((l) => l.kind === 'sealedBench' && (l.state === 'active' || l.state === 'disclosed'));
    if (sb && sb.params.gallery) for (const bn of CD.BENCH) if (bn.district === sb.params.gallery) { const x = tx(bn.c), y = ty(bn.r); ctx.fillStyle = sb.state === 'active' ? '#000a' : '#0005'; ctx.fillRect(x - 26, y - 4, 52, 8); ctx.fillStyle = '#e8c25a'; ctx.fillText('🔒', x, y + 4); }
    // projected procession (next 24 s) and Remand arrows
    if (fc.path.length) { ctx.strokeStyle = '#fff6c044'; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); ctx.beginPath(); fc.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]); }
    const rem = fc.laws.find((l) => l.kind === 'remand' && l.state === 'disclosed');
    if (rem) { ctx.fillStyle = '#ff9a5a'; ctx.font = '700 13px sans-serif'; ctx.fillText('↺ REMAND in ' + ((rem.a - c.tick) / 60).toFixed(1) + 's', tx(9.5), ty(2.2)); }
    // Recitation ribbon (Phase IX)
    if (fc.recitation) for (const a of fc.recitation) { ctx.strokeStyle = (DCOL[a.signer] || '#fff') + (a.reachable ? 'cc' : '44'); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a.from.x, a.from.y + 30); ctx.lineTo(a.to.x, a.to.y + 30); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.fillText(String(a.j), (a.from.x + a.to.x) / 2, (a.from.y + a.to.y) / 2 + 26); }
  }
  function courtHazards(ctx, b) {
    const c = b.court;
    for (const h of b.hazards) {
      if (!h.court) continue;
      const left = Math.max(0, h.law.g.a - c.tick) / 60;
      ctx.save();
      if (h.kind === 'warrant') { ctx.fillStyle = '#e8c25a22'; ctx.strokeStyle = '#e8c25a'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.fillRect(h.x, h.y, h.w, h.h); ctx.strokeRect(h.x, h.y, h.w, h.h); ctx.setLineDash([]); ctx.fillStyle = '#ffe9a0'; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BENCH WARRANT ' + (h.quadrant || '') + ' · ' + left.toFixed(1) + 's', h.x + h.w / 2, h.y + 18); }
      else if (h.kind === 'enBanc') { ctx.strokeStyle = '#e8c25a'; ctx.lineWidth = 6; ctx.globalAlpha = 0.35 + 0.25 * Math.sin((this.t || 0) * 8); ctx.strokeRect(6, 54, W - 12, H - 60); ctx.globalAlpha = 1; ctx.fillStyle = '#ffe9a0'; ctx.font = '800 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SUPREME EN BANC · ' + left.toFixed(1) + 's' + (c.remedy ? ' · EXHAUSTED: ' + c.remedy.toUpperCase() : ''), W / 2, 92); }
      ctx.restore();
    }
  }
  const drawEnemies = R.drawEnemies;
  R.drawEnemies = function (ctx, b) {
    if (!b.court) { drawEnemies.call(this, ctx, b); return; }
    const all = b.enemies; b.enemies = all.filter((x) => !x.courtBoss); // the judge is drawn below as Body + Reflection
    try { drawEnemies.call(this, ctx, b); } finally { b.enemies = all; }
    const c = b.court, e = c.boss, t = this.t || 0, reduced = !!(this.settings && this.settings.reduced);
    // witness rings and links
    for (const pk of c.packets.values()) {
      for (const [id, tag, col] of [[pk.witnessId, 'I', '#e8c25a'], [pk.perjurerId, 'X', '#ff6a6a'], [pk.priorityId, 'K', '#9ad8ff']]) {
        const w = id && c.byId(id); if (!w || !w.alive) continue;
        ctx.strokeStyle = col; ctx.lineWidth = 2; if (tag === 'X') ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(w.x, w.y, w.size * 0.8, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('[' + tag + ']', w.x, w.y - w.size * 0.85);
        const E = w.court.link && c.byId(w.court.link); if (E && E.alive) { ctx.strokeStyle = '#e8c25aaa'; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(E.x, E.y); ctx.stroke(); }
      }
    }
    if (!e || !e.alive) return;
    // mirrored second pass of the same model: the inactive silhouette dashed, the hitbox holder solid
    const body = c.body, refl = { x: body.x, y: 2 * MID - body.y }, hitRefl = c.side === 'refl';
    const s = e.size * 1.7, ph = c.phase, lit = ph === 9 && c.ix && c.ix.articles ? c.ix.articles.filter((a) => a.closed && a.affirmed).length : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(0, MID - 0.5, W, H); ctx.clip();
    ctx.fillStyle = '#0d1824aa'; ctx.fillRect(0, MID - 0.5, W, TILE * 0.55);
    for (const en of b.enemies) if (en.alive && en !== e && Math.abs(en.y - MID) < TILE * 0.6) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#9ac8ff'; ctx.beginPath(); ctx.ellipse(en.x, 2 * MID - en.y, en.size * 0.4, en.size * 0.25, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    drawJudge(ctx, refl.x, refl.y, s, ph, t, { mirror: true, alpha: hitRefl ? 0.95 : 0.4, target: hitRefl, reduced, lit });
    drawJudge(ctx, body.x, body.y, s, ph, t, { alpha: hitRefl ? 0.45 : (e.untargetable ? 0.5 : 1), target: !hitRefl, reduced, lit });
    if (e.courtUnstoppable) { ctx.fillStyle = '#fff'; ctx.font = '800 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛓ UNSTOPPABLE BY PRECEDENT', e.x, e.y - s * 1.35); }
    if (c.mode === 'reading' && e.hp <= 0) { ctx.fillStyle = '#ffe9a0'; ctx.font = '800 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('INTEGRITY BROKEN — VERDICT PENDING', e.x, e.y + s * 1.2); }
  };
  JJK.CourtArt = { renderBg, drawJudge };
})(typeof window !== 'undefined' ? window : globalThis);
