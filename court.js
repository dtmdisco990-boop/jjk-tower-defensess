// RISE OF JAHJUAN in a real browser: clean-storage direct entry (Menu -> RISE OF JAHJUAN -> Briefing -> Enter the Court ->
// Battle), every Briefing tab, then a complete winning run through index.html (the Proof 1 command log replayed tick for tick
// while the renderer and HUD run), the Court Verdict screen, render isolation (same trace hash as headless) and no errors.
// needs: python3 -m http.server 8123 (from the game folder); run: node tests/browser/court.js
const { launch } = require('./_pw');
const LOG = require('../../docs/court-log-clean.json');
(async () => {
  const br = await launch(); const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errs.push(m.text()); }); // an absent optional assets/models/yuji.glb is a 404 by design
  const res = []; const ok = (n, c) => res.push((c ? 'PASS ' : 'FAIL ') + n);
  await pg.goto('http://localhost:8123/index.html'); await pg.waitForTimeout(1600);
  const screens = []; await pg.evaluate(() => { const show = __jjk.UI.show.bind(__jjk.UI); __jjk.UI.show = (n, p) => { (window.__screens = window.__screens || []).push(n); return show(n, p); }; });
  ok('clean profile: level 1, four starters, nothing cleared', await pg.evaluate(() => __jjk.profile.d.player.level === 1 && Object.keys(__jjk.profile.d.characters).sort().join() === 'megumi,nobara,panda,yuji' && __jjk.profile.d.court.attempts === 0));
  ok('RISE OF JAHJUAN button visible on the main menu', await pg.isVisible('[data-court=menu]'));
  await pg.click('[data-court=menu]'); await pg.waitForTimeout(400);
  for (const t of ['MAP', 'DOCKET', 'SYSTEMS', 'RECORD', 'SCALES', 'CHECKLIST']) { await pg.click('[data-tab=' + t + ']'); await pg.waitForTimeout(120); }
  ok('Briefing: Docket lists 12 waves and 9 phases', await pg.evaluate(() => { document.querySelector('[data-tab=DOCKET]').click(); return document.querySelectorAll('.ctable')[0].querySelectorAll('tr').length === 13 && /The Empty Ninth Chair|Four Measures|Recite and Execute/.test(document.body.textContent); }));
  ok('Briefing: interactive Recitation diagram and draggable Scales', await pg.evaluate(() => { document.querySelector('[data-tab=RECORD]').click(); document.querySelector('[data-article="5"]').click(); const a = /Article 5 reads Phase IV/.test(document.body.textContent); document.querySelector('[data-tab=SCALES]').click(); const r = document.querySelector('[data-scale=NW]'); r.value = 4000; r.dispatchEvent(new Event('input')); return a && /lists/.test(document.body.textContent); }));
  await pg.click('[data-court=enter]'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { [...document.querySelectorAll('.modal button')].find((x) => /ENTER THE COURT/.test(x.textContent)).click(); __battle.setPaused(true); }); // paused before the first frame: court tick 0
  await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => ({ tick: __battle.battle.court.tick, map: __battle.battle.mapId, yen: __battle.battle.yen, lives: __battle.battle.baseHp, att: __jjk.profile.d.court.attempts, skib: __jjk.profile.d.skibrib.attempts, screens: window.__screens }));
  ok('direct entry: menu -> briefing -> battle without touching any other screen', JSON.stringify(st.screens) === JSON.stringify(['courtBriefing', 'battle']));
  ok('battle: court_of_nine, 620 Yen, 12 lives, attempt counted in d.court only (court tick ' + st.tick + ')', st.tick === 0 && st.map === 'court_of_nine' && st.yen === 620 && st.lives === 12 && st.att === 1 && st.skib === 0);
  // a full winning run through the live page: commands at their exact ticks, rendering in between
  await pg.evaluate((log) => { window.__log = log; window.__li = 0; __battle.setPaused(true); }, LOG.log);
  let shots = 0, done = false, guard = 0;
  while (!done && guard++ < 400) {
    const s = await pg.evaluate(() => {
      const b = __battle.battle, L = window.__log, STEP = window.JJK.Balance.STEP;
      for (let k = 0; k < 400 && !b.over; k++) {
        while (window.__li < L.length && L[window.__li].t === b.court.tick) {
          const c = L[window.__li++], u = c.c != null && c.cmd !== 'place' ? b.unitAt(c.c, c.r) : null;
          if (c.cmd === 'place') b.place(c.id, c.c, c.r); else if (c.cmd === 'upgrade') b.upgrade(u); else if (c.cmd === 'sell') b.sell(u); else if (c.cmd === 'setTargeting') b.setTargeting(u, c.mode); else if (c.cmd === 'activateDomain') b.activateDomain(u); else if (c.cmd === 'startWave') b.startWave();
        }
        b.update(STEP);
      }
      return { over: b.over, phase: b.court.phase, mode: b.court.mode, measure: b.court.measure, lt: b.court.lt };
    });
    if ((s.phase === 1 && s.mode === 'reading' && s.lt > 1100 && shots === 0) || (s.phase === 6 && shots === 1) || (s.phase === 9 && s.measure === 3 && s.lt > 300 && shots === 2)) { await pg.waitForTimeout(80); await pg.screenshot({ path: '/tmp/court_' + shots + '.png' }); shots++; }
    await pg.waitForTimeout(4);
    done = s.over;
  }
  const end = await pg.evaluate(() => ({ victory: __battle.battle.victory, hash: __battle.battle.court.hash(), lives: __battle.battle.baseHp }));
  ok('winning run completed in the browser (Crown shattered, ' + end.lives + ' lives)', end.victory === true);
  ok('render isolation: the live run has the headless trace hash ' + LOG.hash, end.hash === LOG.hash);
  // the test drove the sim while the UI was paused; release the UI's pause flag (UI state only) so it can open the verdict
  await pg.evaluate(() => { __battle.st.paused = false; document.querySelectorAll('.modal-back,.modal-wrap,.modal').forEach((m) => (m.closest('.modal-back') || m).remove()); }); await pg.waitForTimeout(4000);
  const vtxt = await pg.evaluate(() => (document.querySelector('.courtres') || {}).textContent || '');
  ok('Court Verdict screen renders the victory and the Standing Record', /THE CROWN IS SHATTERED/.test(vtxt) && /Standing Record/i.test(vtxt) && /finds for the defense/.test(vtxt));
  await pg.screenshot({ path: '/tmp/court_verdict.png' });
  const rec = await pg.evaluate(() => ({ c: __jjk.profile.d.court, s: __jjk.profile.d.skibrib, maps: __jjk.profile.d.progress.maps }));
  ok('d.court records the win; d.skibrib and story progress untouched', rec.c.wins === 1 && rec.c.attempts === 1 && rec.s.attempts === 0 && Object.keys(rec.maps).length === 0);
  // WATCH A WINNING RUN: the bot's run on screen, verified, nothing recorded
  await pg.evaluate(() => __jjk.UI.show('courtBriefing', {})); await pg.waitForTimeout(300);
  ok('Briefing has WATCH A WINNING RUN', await pg.isVisible('[data-court=watch]'));
  await pg.click('[data-court=watch]'); await pg.waitForTimeout(800);
  const rs = await pg.evaluate(() => ({ team: __battle.battle.teamOrder.map((id) => id + ':' + __battle.battle.roster[id].level).join(), att: __jjk.profile.d.court.attempts, head: !!document.querySelector('.creplayhead') }));
  ok('replay starts with the four level-1 starters and counts no attempt', rs.head && rs.team === 'yuji:1,panda:1,nobara:1,megumi:1' && rs.att === 1);
  ok('your input is locked during the replay', await pg.evaluate(() => __battle.battle.place('yuji', 3, 2).ok === false));
  await pg.click('[data-replay=ff]'); await pg.click('[data-replay=ff]'); await pg.evaluate(() => __battle.setSpeed(2));
  await pg.waitForTimeout(8000);
  ok('the bot feed narrates its moves', await pg.evaluate(() => /BOT: (Place|Upgrade|Set)/.test(document.querySelector('.creplayfeed').textContent)));
  for (let k = 0; k < 120 && !(await pg.evaluate(() => !!document.querySelector('.courtres'))); k++) await pg.waitForTimeout(2000);
  const rv = await pg.evaluate(() => ({ txt: (document.querySelector('.courtres') || {}).textContent || '', c: __jjk.profile.d.court }));
  ok('replay ends on the verdict screen, verified identical to the proof run', /THE CROWN IS SHATTERED/.test(rv.txt) && /verified identical/.test(rv.txt) && /nothing was recorded/.test(rv.txt));
  ok('the replay recorded nothing (still 1 attempt, 1 win)', rv.c.attempts === 1 && rv.c.wins === 1);
  await pg.screenshot({ path: '/tmp/court_replay_verdict.png' });
  ok('no page / console errors', errs.length === 0);
  console.log(res.join('\n')); if (errs.length) console.log('errors:', errs.slice(0, 5));
  await br.close();
  process.exit(res.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
