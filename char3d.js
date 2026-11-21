/* 3D character layer in a real browser (headless Chrome, WebGL 2). Uses only the original stand-in rig and a fixture GLB
   generated from it (tests/browser/char3d-fixture.js) — no third-party model is needed or bundled.
   needs: python3 -m http.server 8123 (from the game folder); run: node tests/browser/char3d.js */
const { launch } = require('./_pw');
const BASE = 'http://localhost:8123/index.html';
const res = []; const ok = (n, c, extra) => { res.push({ n, c: !!c, extra }); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || !extra ? '' : '  ' + extra)); };

(async () => {
  const br = await launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  pg.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  const E = (fn, a) => pg.evaluate(fn, a), wait = (ms) => pg.waitForTimeout(ms);
  await pg.goto(BASE + '?debug=1');
  await pg.waitForFunction(() => window.JJK && JJK.Char3D && JJK.Char3D.ready, null, { timeout: 30000 });
  // the stand-in preview and model loading are developer tools: switch them on for this test session only
  await E(() => { JJK.Config.CHAR3D_DEV_TOOLS = true; JJK.Char3D.setMode('preview'); });
  ok('boot: 3D layer ready, preview mode, no supplied model bundled', await E(() => JJK.Char3D.mode === 'preview' && !JJK.Char3D.registry.yuji.supplied && /stand-in/.test(JJK.Char3D.status())));

  // ---------------------------------------------------------------- battle with real input
  await pg.locator('.menu-wrap button', { hasText: /^\s*PLAY/ }).first().click(); await wait(300);
  await pg.locator('button:has-text("START BATTLE")').click(); await wait(700);
  const slots = await E(() => { const b = __battle.battle; b.addYen(20000); return [...b.geo.slots.values()].filter((s) => s.type === 'G').map((s) => ({ c: s.c, r: s.r })); });
  const at = (s) => [(s.c + 0.5) * 64, 48 + (s.r + 0.5) * 64];
  await pg.keyboard.press('1'); let [x, y] = at(slots[0]); await pg.mouse.move(x, y); await wait(120);
  ok('8. placement preview unaffected (valid ghost while placing Yuji)', await E(() => __battle.st.placing && __battle.st.placing.valid === true && __battle.st.placingId === 'yuji'));
  await pg.mouse.click(x, y); await wait(500);
  const s1 = await E(() => ({ units: __battle.battle.units.length, st: JJK.Char3D.stats()[0], snap: JJK.Char3D.snapshot() }));
  ok('1. a placed Yuji gets a 3D fighter that renders', s1.units === 1 && s1.st && s1.st.fighters === 1 && s1.st.frames > 5, JSON.stringify(s1.st));
  // the figure really is on the battle canvas: compare the tower area with the 3D layer switched off (paused: identical frame time)
  await E(() => __battle.setPaused(true)); await wait(150);
  const grab = () => E(() => { const u = __battle.battle.units[0], c = document.getElementById('battle-canvas').getContext('2d'); return Array.from(c.getImageData(u.x - 30, u.y - 70, 60, 70).data); });
  const on = await grab(); await E(() => JJK.Char3D.setMode('off')); await wait(150); const off = await grab(); await E(() => JJK.Char3D.setMode('preview')); await wait(150);
  let diff = 0; for (let i = 0; i < on.length; i += 4) if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 60) diff++;
  ok('1. 3D figure replaces the flat sprite on the canvas (' + diff + ' px differ)', diff > 400);
  await E(() => __battle.setPaused(false));
  // idle: breathing/bounce/weight shift move the fists with no enemies around
  const fists = []; for (let i = 0; i < 6; i++) { fists.push(await E(() => JJK.Char3D.snapshot()[0])); await wait(150); }
  const mv = Math.max(...fists.map((f) => Math.hypot(f.fist.L.x - fists[0].fist.L.x, f.fist.L.y - fists[0].fist.L.y)));
  ok('2. idle fighting stance is alive (state idle, fists drift ' + mv.toFixed(2) + ' px)', fists.every((f) => f.state === 'idle' || f.state === 'land') && mv > 0.4);
  ok('placement plays the landing (land clip counted)', fists[0].counts.land === 1);
  // selection still works on a 3D tower
  await pg.mouse.click(x, y); await wait(150);
  ok('8. clicking the 3D Yuji selects it and opens the unit panel', await E(() => __battle.st.selected === __battle.battle.units[0].uid && !!document.querySelector('.upanel')));
  await pg.keyboard.press('u'); await wait(700);
  const up = await E(() => ({ lvl: __battle.battle.units[0].level, snap: JJK.Char3D.snapshot()[0], st: JJK.Char3D.stats()[0] }));
  ok('7. upgrade works and plays the power-up reaction', up.lvl === 2 && up.snap.counts.upgrade === 1 && up.st.fx.rings > 0);
  await pg.locator('.upanel button:has-text("SELL")').click(); await wait(150);
  if (await E(() => !!document.querySelector('.modal'))) { await pg.locator('.modal button:has-text("Sell")').first().click().catch(() => {}); await wait(250); }
  const sold = await E(() => ({ units: __battle.battle.units.length, st: JJK.Char3D.stats()[0] }));
  ok('7. sell removes the unit and releases its 3D fighter to the pool', sold.units === 0 && sold.st.fighters === 0 && sold.st.released >= 1);

  // ---------------------------------------------------------------- combat: several Yujis, upgrades, a real wave
  const placed = await E((ss) => {
    const b = __battle.battle, out = [];
    // slots nearest to the enemy path so every Yuji gets to fight
    const path = b.geo.ground[0], pts = [];
    for (let d = 0; d < path.length; d += 16) { const p = {}; path.posAt(d, p); pts.push(p); }
    const near = ss.map((s) => { const cx = (s.c + 0.5) * 64, cy = 48 + (s.r + 0.5) * 64; return { s, d: Math.min(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) }; }).sort((a, c) => a.d - c.d);
    for (const n of near.slice(0, 4)) { const r = b.place('yuji', n.s.c, n.s.r); out.push(!!(r && r.ok !== false)); }
    const us = b.units.filter((u) => u.id === 'yuji');
    for (let i = 0; i < 3; i++) b.upgrade(us[0].uid);     // level 4: Black Flash every 5th hit (+ Divergent)
    for (let i = 0; i < 2; i++) b.upgrade(us[1].uid);     // level 3: Divergent Fist
    const pl = b.geo.slots.values(); let pandaSlot = null;
    for (const s of pl) { if (s.type === 'G' && !b.grid.has(s.c + ',' + s.r) && near.slice(-1)[0].s.c === s.c && near.slice(-1)[0].s.r === s.r) pandaSlot = s; }
    const far = near.slice(-1)[0].s; b.place('panda', far.c, far.r);
    return { out, yuji: us.length, panda: b.units.some((u) => u.id === 'panda') };
  }, slots);
  ok('6. four Yujis + a Panda placed', placed.yuji === 4 && placed.panda, JSON.stringify(placed));
  await wait(600);
  // other characters: Panda is drawn with its normal sprite while the 3D layer runs
  ok('9. other towers keep their 2D sprites (Panda not handled by the 3D layer)', await E(() => { const v = [...JJK.Char3D.views][0]; return !v.handled.has('panda') && v.handled.has('yuji') && JJK.Art.unitSprite('panda', 54) === JJK.Art._cache['us:panda:54']; }));
  await E(() => __battle.setPaused(true)); await wait(150);
  const grabP = () => E(() => { const u = __battle.battle.units.find((x) => x.id === 'panda'), c = document.getElementById('battle-canvas').getContext('2d'); return Array.from(c.getImageData(u.x - 30, u.y - 50, 60, 80).data); });
  const pOn = await grabP(); await E(() => JJK.Char3D.setMode('off')); await wait(150); const pOff = await grabP(); await E(() => JJK.Char3D.setMode('preview')); await wait(150);
  let pd = 0; for (let i = 0; i < pOn.length; i++) if (pOn[i] !== pOff[i]) pd++;
  ok('9. Panda pixels identical with the 3D layer on and off (' + pd + ' channel diffs)', pd === 0);
  await E(() => __battle.setPaused(false));
  await E(() => __battle.setSpeed(2));
  // keep waves coming (and the first enemies tough enough to reach several towers)
  const fight = async (secs, until) => {
    for (let i = 0; i < secs * 4; i++) {
      await E(() => { const b = __battle.battle; if (b.state !== 'wave' && b.canStartWave()) __battle.startWave(); });
      await wait(250);
      if (until && i > 12 && (await E(until))) break;
    }
  };
  await fight(40, () => { const s = JJK.Char3D.snapshot(); return s.some((f) => f.counts.blackflash > 0) && s.filter((f) => f.counts.jab + f.counts.cross > 0).length >= 2 && s.some((f) => f.counts.divL + f.counts.divR > 0); });
  const C = await E(() => ({ snap: JJK.Char3D.snapshot(), st: JJK.Char3D.stats()[0] }));
  const tot = (k) => C.snap.reduce((a, f) => a + (f.counts[k] || 0), 0);
  ok('3. punches animate on real hits: jabs ' + tot('jab') + ', crosses ' + tot('cross') + ', primed wind-ups ' + tot('primed'), tot('jab') > 3 && tot('cross') > 3 && tot('primed') > 3);
  ok('3. punches alternate hands (|jab-cross| <= fighters)', Math.abs(tot('jab') - tot('cross')) <= C.snap.length + 1);
  ok('4. Black Flash plays its own clip (' + tot('blackflash') + ') with impact frames/lightning (' + C.st.fx.frames + ' frames, ' + C.st.fx.bolts + ' bolts)', tot('blackflash') > 0 && C.st.fx.bolts > 0);
  ok('4. Divergent echo plays a distinct follow-up (' + (tot('divL') + tot('divR')) + ') on the sim\'s delayed hit (' + C.st.sync.follow + ')', tot('divL') + tot('divR') > 0 && C.st.sync.follow > 0);
  ok('5. Yuji faces his target at every impact (' + C.st.aimOk + '/' + C.st.aimN + ' impacts aimed within 20°)', C.st.aimN > 5 && C.st.aimOk / C.st.aimN > 0.85);
  ok('5. footwork: planted feet step when he turns (' + C.snap.reduce((a, f) => a + f.steps, 0) + ' steps)', C.snap.some((f) => f.steps > 2));
  ok('6. several Yujis attacked independently', C.snap.filter((f) => f.counts.jab + f.counts.cross + f.counts.blackflash > 0).length >= 2);

  // ---------------------------------------------------------------- performance + resize
  const perf = await E(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const meas = async (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) await frame(); return (performance.now() - t0) / n; };
    const on = await meas(90); JJK.Char3D.setMode('off'); const off = await meas(90); JJK.Char3D.setMode('preview'); await meas(10);
    const s = JJK.Char3D.stats()[0];
    return { on: +on.toFixed(2), off: +off.toFixed(2), gl: +s.avgMs.toFixed(2), fighters: s.fighters, created: s.created, reused: s.reused };
  });
  console.log('   frame ms with 3D:', perf.on, ' without:', perf.off, ' 3D render cost:', perf.gl, 'ms for', perf.fighters, 'fighters (software GL)');
  ok('13. 3D layer cost per frame is bounded (' + perf.gl + ' ms for ' + perf.fighters + ' fighters, software WebGL)', perf.gl < 25);
  await pg.setViewportSize({ width: 900, height: 520 }); await wait(400);
  const rs = await E(() => JJK.Char3D.stats()[0].frames); await wait(300);
  ok('resize: battle keeps rendering 3D after the window shrinks', (await E(() => JJK.Char3D.stats()[0].frames)) > rs);
  await pg.setViewportSize({ width: 1280, height: 720 }); await wait(200);

  // ---------------------------------------------------------------- render isolation (determinism)
  const det = await E(async () => {
    const run = (withView) => {
      const b = new JJK.Battle({ mapId: 'tokyo', diff: 'normal', team: [{ id: 'yuji', level: 1, stars: 0 }, { id: 'panda', level: 1, stars: 0 }], seed: 4242, startYen: 1e6 });
      const ss = [...b.geo.slots.values()].filter((s) => s.type === 'G').slice(0, 4);
      ss.forEach((s, i) => b.place(i === 3 ? 'panda' : 'yuji', s.c, s.r));
      for (let i = 0; i < 3; i++) b.upgrade(b.units[0].uid);
      let R = null;
      if (withView) { const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; R = new JJK.BattleRenderer(cv); R.setBattle(b, { showRanges: true, dmgNumbers: true, shake: true }); }
      b.startWave && b.startWave();
      for (let i = 0; i < 60 * 40; i++) { b.update(JJK.Balance.STEP); if (R) R.frame(JJK.Balance.STEP); }
      const h = JSON.stringify([b.time.toFixed(6), b.yen, b.baseHp, b.wave, b.units.map((u) => [u.hits, Math.round(u.damageDealt * 1000), u.cdT.toFixed(6)]), b.enemies.filter((e) => e.alive).map((e) => [e.id, e.hp.toFixed(4), e.x.toFixed(4), e.y.toFixed(4)])]);
      const views = R && R.__char3d ? R.__char3d.stats.fighters : 0;
      if (R) R.dispose();
      return { h, views };
    };
    const a = run(false), b2 = run(true);
    return { same: a.h === b2.h, views: b2.views, len: a.h.length };
  });
  ok('10. simulation is bit-identical with the 3D layer rendering every step (' + det.views + ' fighters drawn)', det.same && det.views === 3, JSON.stringify(det));

  // ---------------------------------------------------------------- supplied-model path: a GLB with its own clips
  const sup = await E(async () => {
    const fx = await import('/tests/browser/char3d-fixture.js');
    const buf = await fx.buildClipGLB();
    const t = await JJK.Char3D.loadModel('yuji', buf, 'fixture.glb', { animation: 'clips', clips: fx.FIXTURE_CLIPS });
    const I = t.clipInfo;
    return { status: JJK.Char3D.status(), roles: t.rig.roles.length, spine: t.rig.info.spine.name, chest: t.rig.info.chest.name, useClips: t.useClips, turnL: Math.round(I.turnL.total * 57.2958), turnR: Math.round(I.turnR.total * 57.2958), C: +I.idle.C.x.toFixed(2), hand: [I.punchL.hand, I.punchR.hand, I.blackflash.hand].join(''), ti: +I.punchL.ti.toFixed(2) };
  });
  ok('GLB import: bones mapped (Mixamo names, spine order from hierarchy), clips recognised', sup.roles === 21 && sup.spine === 'mixamorigSpine2' && sup.chest === 'mixamorigSpine' && sup.useClips && /7 animation clips found/.test(sup.status), JSON.stringify(sup));
  ok('GLB import: animated root baked in (turn clips ' + sup.turnL + '° / ' + sup.turnR + '°), stances re-centred (offset ' + sup.C + ' m), impact frames found', Math.abs(sup.turnL - 90) <= 2 && Math.abs(sup.turnR + 90) <= 2 && Math.abs(sup.C - 0.28) < 0.04 && sup.hand === 'LRR' && sup.ti > 0.3);
  await wait(800);
  const g1 = await E(() => JJK.Char3D.snapshot());
  ok('GLB import: every Yuji switched to the supplied model driven by its clips', g1.length === 4 && g1.every((f) => f.kind === 'glb' && f.clips));
  // force a big re-target on an idle fighter: it should play a turn clip
  await E(() => { const v = [...JJK.Char3D.views][0]; for (const f of v.fighters.values()) if (f.driver && !f.driver.active()) { f.driver.facing.yaw = AN_wrap(f.driver.facing.target + 2.0); f.driver.facing.vel = 0; } function AN_wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); } });
  await fight(40, () => { const s = JJK.Char3D.snapshot(), t = (k) => s.reduce((a, f) => a + f.counts[k], 0); return t('blackflash') > 0 && t('turnL') + t('turnR') > 0 && t('punchL') > 2 && t('punchR') + t('divergent') > 2; });
  const g2 = await E(() => ({ snap: JJK.Char3D.snapshot(), st: JJK.Char3D.stats()[0] }));
  const gt = (k) => g2.snap.reduce((a, f) => a + (f.counts[k] || 0), 0);
  ok('GLB clips: stance + alternating punches on real hits (L ' + gt('punchL') + ' / R ' + gt('punchR') + ' / div ' + gt('divergent') + ', primed ' + gt('primed') + ')', gt('punchL') > 2 && gt('punchR') + gt('divergent') > 2 && gt('primed') > 2);
  ok('GLB clips: Black Flash clip on Black Flash hits (' + gt('blackflash') + ')', gt('blackflash') > 0);
  ok('GLB clips: big re-targets play turn clips (' + (gt('turnL') + gt('turnR')) + ') and feet step instead of sliding (' + g2.snap.reduce((a, f) => a + f.steps, 0) + ' steps)', gt('turnL') + gt('turnR') > 0 && g2.snap.some((f) => f.steps > 0));
  ok('GLB clips: wind-ups never get stuck (hold timeouts ' + gt('holdTimeouts') + ')', gt('holdTimeouts') <= 2);

  // ---------------------------------------------------------------- leaving the battle releases everything
  const mem0 = await E(() => { const r = [...JJK.Char3D.views][0]; return { views: JJK.Char3D.views.size }; });
  await pg.keyboard.press('p'); await wait(250);
  await pg.locator('.modal button:has-text("Forfeit")').first().click(); await wait(250);
  await pg.locator('.modal button:has-text("Forfeit")').last().click(); await wait(3500);
  const left = await E(() => ({ screen: __jjk.UI.current && __jjk.UI.current.name, views: JJK.Char3D.views.size }));
  ok('cleanup: leaving the battle disposes the 3D view (' + mem0.views + ' -> ' + left.views + ')', left.screen !== 'battle' && left.views === 0, JSON.stringify(left));

  ok('13. no JavaScript errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await br.close();
  const failed = res.filter((r) => !r.c);
  console.log('\n' + (res.length - failed.length) + '/' + res.length + ' 3D checks passed');
  if (failed.length) { console.log('FAILED:\n' + failed.map((f) => ' - ' + f.n + ' ' + (f.extra || '')).join('\n')); process.exit(1); }
})().catch((e) => { console.error('CHAR3D CRASH', e); process.exit(2); });
