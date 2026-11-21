// SKIBRIB CHALLENGE in a real browser: unlocked on a fresh save, the SUFFER double-confirm (both ways out), a real battle on the
// map, scripted overlays, death recording + results, a heavy late wave for frame time, and no console errors anywhere.
const { launch } = require('./_pw');
(async () => {
  const br = await launch(); const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errs.push(m.text()); }); // an absent optional assets/models/yuji.glb is a 404 by design
  const res = []; const ok = (n, c) => res.push((c ? 'PASS ' : 'FAIL ') + n);
  await pg.goto('http://localhost:8123/index.html'); await pg.waitForTimeout(1800);
  const click = (sel, re) => pg.evaluate(([s, r]) => { const b = [...document.querySelectorAll(s)].find((x) => new RegExp(r).test(x.textContent)); if (b) b.click(); return !!b; }, [sel, re]);
  // fresh save: player level 1, nothing cleared
  ok('fresh save is level 1', await pg.evaluate(() => __jjk.profile.d.player.level === 1 && !__jjk.profile.mapCleared('tokyo')));
  await pg.evaluate(() => __jjk.UI.show('play', {})); await pg.waitForTimeout(400);
  ok('SKIBRIB card visible and not locked', await pg.evaluate(() => { const c = document.querySelector('.mapcard.skibcard'); return !!c && !c.classList.contains('locked') && /SKIBRIB CHALLENGE/.test(c.textContent); }));
  await pg.evaluate(() => document.querySelector('.mapcard.skibcard').click()); await pg.waitForTimeout(300);
  const panel = await pg.evaluate(() => document.querySelector('.skibpanel') && document.querySelector('.skibpanel').textContent);
  ok('panel: 10 skulls, tagline, SUFFER', !!panel && (panel.match(/💀/g) || []).length >= 10 && /This is technically beatable\./.test(panel) && /SUFFER/.test(panel));
  // NO
  await click('button', '^S\\s*U\\s*F\\s*F\\s*E\\s*R$'); await pg.waitForTimeout(200);
  ok('"Are you sure?" with YES / NO', await pg.evaluate(() => /Are you sure\?/.test(document.querySelector('.modal').textContent) && [...document.querySelectorAll('.modal button')].map((b) => b.textContent).join('|') === 'NO|YES'));
  await click('.modal button', '^NO$'); await pg.waitForTimeout(200);
  ok('NO backs out', await pg.evaluate(() => !document.querySelector('.modal') && !window.__battle));
  // YES -> I HAVE CHANGED MY MIND
  await click('button', 'SUFFER'); await pg.waitForTimeout(150); await click('.modal button', '^YES$'); await pg.waitForTimeout(250);
  ok('"Are you REALLY sure?" with YES / I HAVE CHANGED MY MIND', await pg.evaluate(() => /Are you REALLY sure\?/.test(document.querySelector('.modal').textContent) && /I HAVE CHANGED MY MIND/.test(document.querySelector('.modal').textContent)));
  await click('.modal button', 'CHANGED MY MIND'); await pg.waitForTimeout(200);
  ok('changing your mind backs out', await pg.evaluate(() => !document.querySelector('.modal') && !window.__battle && __jjk.profile.d.skibrib.attempts === 0));
  // YES -> YES
  await click('button', 'SUFFER'); await pg.waitForTimeout(150); await click('.modal button', '^YES$'); await pg.waitForTimeout(250); await click('.modal button', '^YES$'); await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => ({ map: __battle.battle.mapId, diff: __battle.battle.diffId, waves: __battle.battle.totalWaves, lives: __battle.battle.baseHp, yen: __battle.battle.yen, attempts: __jjk.profile.d.skibrib.attempts, debug: !!__battle.battle.debugUsed }));
  ok('battle starts: SKIBRIB, 75 waves, 15 lives, normal Yen, attempt counted', st.map === 'skibrib' && st.diff === 'skibrib' && st.waves === 75 && st.lives === 15 && st.yen === 700 && st.attempts === 1 && !st.debug);
  // play wave 1 for real with the starter team
  await pg.evaluate(() => { const b = __battle.battle; b.place('yuji', 9, 5); b.place('yuji', 13, 3); b.place('yuji', 11, 5); __battle.startWave(); __battle.setSpeed(2); });
  await pg.waitForFunction(() => __battle.battle.clearedWaves >= 1 || __battle.battle.over, null, { timeout: 60000 });
  ok('wave 1 played and cleared in the browser', await pg.evaluate(() => __battle.battle.clearedWaves === 1));
  await pg.screenshot({ path: '/tmp/skib_b1.png' });
  // scripted overlays (presentation only)
  await pg.evaluate(() => { const b = __battle.battle; b.events.emit('waveClear', { n: 70, bonus: 0 }); });
  await pg.waitForTimeout(600); ok('wave 70: SKIBRIB CHALLENGE COMPLETE!', await pg.evaluate(() => /SKIBRIB CHALLENGE COMPLETE!/.test(document.body.innerText)));
  await pg.waitForTimeout(2600); ok('...LOL NO. 5 WAVES REMAIN.', await pg.evaluate(() => /LOL NO\./.test(document.body.innerText) && /5 WAVES REMAIN\./.test(document.body.innerText)));
  await pg.waitForTimeout(3200);
  // heavy late-game load: wave 74's whole column at once, measure frame time
  const perf = await pg.evaluate(async () => {
    const b = __battle.battle;
    for (const en of b.waves[73].entries) { const e = b.spawnEnemy(en.type, { wave: 74, hpMult: en.hpMult }); e.dist = Math.random() * e.pathLen * 0.9; e.path.posAt(e.dist, e); }
    const t = []; let last = performance.now();
    await new Promise((r) => { let n = 0; const f = (now) => { t.push(now - last); last = now; if (++n < 90) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    t.sort((x, y) => x - y);
    return { alive: b.enemies.filter((e) => e.alive).length, median: t[45], p95: t[85] };
  });
  ok('frame time with ' + perf.alive + ' enemies: median ' + perf.median.toFixed(1) + 'ms, p95 ' + perf.p95.toFixed(1) + 'ms', perf.alive >= 80 && perf.median < 60);
  await pg.screenshot({ path: '/tmp/skib_b74.png' });
  // die for real: let the column through
  await pg.evaluate(() => { const b = __battle.battle; for (const u of b.units.slice()) b.removeUnit(u); for (const e of b.enemies) { e.speedMul = 30; } });
  await pg.waitForFunction(() => document.querySelector('.skibres'), null, { timeout: 30000 });
  await pg.waitForTimeout(500);
  const deathText = await pg.evaluate(() => document.querySelector('.skibdeath').textContent);
  ok('results: a death message from the list', await pg.evaluate((t) => JJK.Skibrib.DEATH_MESSAGES.includes(t), deathText));
  ok('results: BACK TO WAVE 1 + SUFFER AGAIN', await pg.evaluate(() => /BACK TO WAVE 1\./.test(document.body.innerText) && /SUFFER AGAIN/.test(document.body.innerText)));
  ok('death recorded (deaths 1, attempts 1, highest wave 1)', await pg.evaluate(() => { const K = __jjk.profile.d.skibrib; return K.deaths === 1 && K.attempts === 1 && K.highestWave === 1; }));
  ok('records persisted to the save', await pg.evaluate(() => JSON.parse(localStorage.getItem(JJK.Config.SAVE_KEY)).skibrib.deaths === 1));
  await pg.screenshot({ path: '/tmp/skib_dead.png' });
  // the rest of the game is untouched: Tokyo High still starts normally
  await pg.evaluate(() => __jjk.UI.show('battle', { mapId: 'tokyo', diff: 'normal', mode: 'story', from: 'play' })); await pg.waitForTimeout(800);
  ok('story map still starts normally', await pg.evaluate(() => __battle.battle.mapId === 'tokyo' && __battle.battle.waves.length === 15 && __battle.battle.baseHp === 20));
  ok('no page / console errors', !errs.length);
  console.log(res.join('\n'), errs.join(' ; '));
  await br.close(); process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
