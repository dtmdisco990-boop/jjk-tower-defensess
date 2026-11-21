/* RISE OF JAHJUAN: zero-regression gates, geometry, tick boundaries, every court system, invalid-win rejections, and the
   legitimate clean-profile proof (policy bot, command-log replay, seed / frame-rate / pause invariance, disclosure soundness,
   naive-oracle agreement). Heavier evidence (32-seed proofs, ablations, fuzzing) lives in tests/dev/court-evidence.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGame } = require('./load.js');
const { makeBot } = require('./court-bot.js');

const J = loadGame();
const { Balance } = J;
const CD = J.CourtData, C = CD.C, STEP = Balance.STEP;
const TEAM4 = ['yuji', 'panda', 'nobara', 'megumi'];
const mk = (team, o) => new J.Battle(Object.assign({ mapId: 'court_of_nine', diff: 'court', team: (team || TEAM4).map((id) => ({ id, level: 30, stars: 5 })), seed: 1 }, o || {}));
const step = (b, n) => { for (let i = 0; i < n && !b.over; i++) b.update(STEP); };
function toTrial(b) { b.wave = 12; b.state = 'intermission'; b.court.mode = 'inter'; b.court.lt = 360; assert.ok(b.startWave()); return b.court; }
function toPhase(b, n) { const c = toTrial(b); if (n > 1) { c.cancelLaws('test'); c.pending.length = 0; c.startPhase(n, true); } return c; }
function toMeasure(b, m, rows) {
  const c = toTrial(b); c.cancelLaws('test'); c.pending.length = 0;
  for (let p = 1; p <= 8; p++) c.record.write(Object.assign({ phase: p, signer: ['NW', 'SW', 'SW', 'SE', 'NE', 'NE', 'NE', 'NW'][p - 1], doctrine: 'corpus', cosigners: [], readings: 1 }, (rows || {})[p] || {}));
  c.phase = 8; c.startIX(); step(b, 1);
  if (m > 0) { c.ix.aSigner = 'NW'; c.ix.aDoctrine = 'corpus'; c.ix.bSigner = 'NE'; c.cancelLaws('test'); c.startMeasure(m, false); step(b, 1); }
  return c;
}
const { play } = makeBot(J, { profile: 'ward' });
let PROOF = null;
const proof = () => PROOF || (PROOF = play(1));

// ------------------------------------------------------------------ A. zero-regression gates
test('registry deltas: +1 map, +1 boss, +1 hidden difficulty; orders, missions, JOAN and the playable Jahjuan untouched', () => {
  const F = require('./fixtures/preservation.json');
  const now = require('./dev/preservation-probe.js').main(path.join(__dirname, '..'));
  for (const k of Object.keys(F)) assert.deepEqual(now[k], F[k], k + ' changed');
  assert.ok(J.Maps.court_of_nine && J.Maps.court_of_nine.challenge && J.Maps.court_of_nine.courtChallenge);
  assert.ok(J.Bosses.jahjuanBoss && !J.BossOrder.includes('jahjuanBoss') && !J.MapOrder.includes('court_of_nine'));
  assert.ok(Balance.difficulty.court.hidden);
  assert.ok(!J.Characters.jahjuanBoss && J.CharacterOrder.indexOf('jahjuanBoss') < 0);
});
test('legacy replay: fixed-seed tokyo, shibuya, shinjuku and skibrib battles are bit-identical to the pre-integration build', () => {
  const F = require('./fixtures/legacy-replay.json');
  const now = require('./dev/legacy-replay.js').main(path.join(__dirname, '..'));
  for (let i = 0; i < F.runs.length; i++) { assert.equal(now.runs[i].final, F.runs[i].final, F.runs[i].mapId); assert.deepEqual(now.runs[i].summary, F.runs[i].summary, F.runs[i].mapId); }
});
test('SKIBRIB isolation: a SKIBRIB loss and win write exactly what they wrote before (incl. d.endless.byMap.skibrib)', () => {
  const F = require('./fixtures/skib-save.json');
  assert.deepEqual(JSON.parse(JSON.stringify(require('./dev/skib-save-probe.js').main(path.join(__dirname, '..')))), F);
});
test('save isolation: v1/v2 saves migrate to v3 adding only d.court; court loss/retry/win touch nothing else', () => {
  for (const v of [1, 2]) {
    const st = new J.Util.MemoryStorage(), sm0 = new J.SaveManager(st); sm0.load();
    const raw = JSON.parse(JSON.stringify(sm0.data)); raw.saveVersion = v; if (v === 1) delete raw.skibrib; delete raw.court; raw.progress.maps.tokyo = { normal: { cleared: true, clears: 1, bestWave: 20, bestTime: 1, flawless: false } };
    raw.skibrib = raw.skibrib || {}; raw.skibrib.attempts = 7; raw.endless.byMap.tokyo = { bestWave: 4, bestScore: 9 };
    st.setItem(J.SaveManager.KEY || Object.keys(st.data || {})[0] || 'jjk-td-save', JSON.stringify(raw));
  }
  const sm = new J.SaveManager(new J.Util.MemoryStorage()); sm.load();
  const p = new J.Profile(sm, { now: () => 1e12 });
  assert.equal(sm.data.saveVersion, J.SaveManager.CURRENT_VERSION);
  assert.equal(J.SaveManager.CURRENT_VERSION, 3);
  assert.deepEqual(Object.keys(p.d.court).sort(), ['aSignersCleared', 'attempts', 'bestArticles', 'bestLives', 'bestTime', 'fewestMistrials', 'fewestStrikes', 'unanimousBench', 'wins']);
  const before = JSON.stringify({ m: p.d.progress.maps, s: p.d.skibrib, e: p.d.endless, su: p.d.summon, ch: p.d.challenges, c: Object.keys(p.d.characters).sort() });
  const sum = (victory, extra) => Object.assign({ mapId: 'court_of_nine', diff: 'court', mode: 'story', victory, wave: 13, wavesCleared: victory ? 13 : 12, totalWaves: 13, kills: 200, yenEarned: 6000, baseLost: 4, sold: 0, disabled: 3, upgrades: 30, deploys: 12, domains: 0, bossKills: victory ? { jahjuanBoss: 1 } : {}, bossTimes: victory ? { jahjuanBoss: 600 } : {}, duration: 1300, score: 0, deployedIds: ['yuji'], loadout: TEAM4, enemiesSeen: ['wisp'], bossesSeen: ['jahjuanBoss'], baseHp: victory ? 5 : 0, baseMax: 12, damage: 1, debug: false, unitStats: [], court: { mistrials: 6, articles: 3, strikes: 2, unanimous: false, aSigner: 'SW' } }, extra || {});
  p.courtStart(); p.applyMatchResult(sum(false), 'c1', 1); p.courtStart(); const r = p.applyMatchResult(sum(true), 'c2', 2); p.applyMatchResult(sum(true), 'c2', 2);
  assert.equal(JSON.stringify({ m: p.d.progress.maps, s: p.d.skibrib, e: p.d.endless, su: p.d.summon, ch: p.d.challenges, c: Object.keys(p.d.characters).sort() }), before);
  assert.equal(p.d.court.attempts, 2); assert.equal(p.d.court.wins, 1); assert.equal(p.d.court.aSignersCleared.SW, true); assert.equal(p.d.court.bestArticles, 3);
  assert.equal(r.rewards.gems || 0, 0); assert.ok(r.rewards.coins > 0);
  const sm2 = new J.SaveManager(sm.storage); sm2.load(); assert.deepEqual(sm2.data.court, p.d.court, 'd.court persists idempotently');
});
test('concurrency: two interleaved court battles and a tokyo battle share no mutable state', () => {
  const solo = (seed) => { const b = mk(['yuji', 'nobara'], { seed }); b.place('yuji', 9, 3); b.startWave(); step(b, 6000); return b.court.hash(); };
  const h1 = solo(1), h2 = solo(2);
  const a = mk(['yuji', 'nobara'], { seed: 1 }), b2 = mk(['yuji', 'nobara'], { seed: 2 }), t = new J.Battle({ mapId: 'tokyo', team: [{ id: 'yuji', level: 5, stars: 0 }], seed: 3 });
  a.place('yuji', 9, 3); b2.place('yuji', 9, 3); a.startWave(); b2.startWave(); t.startWave();
  b2.place('nobara', 5, 6);
  for (let i = 0; i < 6000; i++) { a.update(STEP); if (i < 3000) b2.update(STEP); t.update(STEP); }
  assert.equal(a.court.hash(), h1);
  assert.notEqual(a.court, b2.court); assert.notEqual(a.court.water, b2.court.water); assert.ok(!t.court);
  assert.notEqual(h1, h2 === h1 ? 'x' : h2);
});

// ------------------------------------------------------------------ B. geometry and the Iron Switch
test('geometry: four 2,112 px routes sharing coordinates to the 1,152 px fork, 20 authored benches (4 E, 16 G), none on a centerline', () => {
  const b = mk(); const g = b.geo;
  assert.deepEqual(g.ground.map((p) => p.length), [2112, 2112, 2112, 2112]);
  const o1 = { x: 0, y: 0 }, o2 = { x: 0, y: 0 };
  for (let d = 0; d <= 1152; d += 16) { g.ground[0].posAt(d, o1); g.ground[1].posAt(d, o2); assert.deepEqual(o1, o2); g.ground[2].posAt(d, o1); g.ground[3].posAt(d, o2); assert.deepEqual(o1, o2); }
  assert.equal(g.slots.size, 20); assert.equal([...g.slots.values()].filter((s) => s.type === 'E').length, 4);
  for (const s of g.slots.values()) { assert.ok(!g.pathTiles.has(s.c + ',' + s.r), 'bench on a path tile'); }
  assert.ok(Math.abs(g.air[0].length - 1383.36) < 0.01 && Math.abs(g.air[1].length - g.air[0].length) < 1e-9);
});
test('fork commitment: a knockback across the fork never teleports, and the route binds by first gallery + own packet order', () => {
  const b = mk(); const c = b.court; b.startWave(); step(b, 5);
  const e = b.enemies[0]; const pk = c.packets.get(e.court.packet); pk.order = 'cross';
  e.dist = 1150; e.path.posAt(e.dist, e); step(b, 1);
  e.dist = 1160; c.forkCheck(); assert.ok(e.court.committed); assert.equal(J.CourtData.LANES[e.lane], 'NS');
  const x0 = e.x, y0 = e.y; b.knockback(e, 0.5); c.forkCheck(); assert.equal(J.CourtData.LANES[e.lane], 'NS', 'path never changes after commit'); assert.ok(Math.hypot(e.x - x0, e.y - y0) <= 0.5 * 64 + 1e-6);
});
test('Forum of Least Resistance: ties bind Straight; the fastest legal runner needs >= 551 ticks to reach the fork', () => {
  const b = mk(); const c = b.court;
  const pk = c.queuePacket(9, 'K', 'N', 0, { route: { order: 'forum' } }); c.decideRoute(pk); assert.equal(pk.order, 'straight');
  const fast = (C.FORK_PX) / (J.Enemies.skitter.speed * (1 + C.DOWNHILL) / 60);
  assert.ok(fast >= 551 - 1e-9 && fast > C.LEAD);
});

// ------------------------------------------------------------------ C. calendar, waves, budget
test('Integrity: 1 IU = 1,474 HP from the unmodified brute; phase maxima ceil once', () => {
  assert.equal(CD.integrityUnit(), 1474);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => CD.phaseMax(1474, n)), C.INTEGRITY.map((m) => Math.ceil(1474 * m)));
});
test('intermissions: startWave rejected until tick 360, auto-start exactly at 360, no wave stacking; dt != STEP never advances', () => {
  const b = mk(['yuji']); b.place('yuji', 9, 3); b.place('yuji', 10, 5); assert.ok(b.startWave()); assert.equal(b.startWave(), false, 'no stacking');
  while (b.state === 'wave') { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  const c = b.court;
  for (let i = 0; i < 359; i++) { assert.equal(b.startWave(), false); step(b, 1); }
  assert.equal(c.lt, 359); assert.equal(b.wave, 1); step(b, 1); assert.equal(b.wave, 2, 'auto-start exactly at intermission tick 360');
  const t0 = c.tick; let diag = 0; b.events.on('courtDiagnostic', () => diag++); b.update(0.02); b.update(STEP * 2); assert.equal(c.tick, t0); assert.equal(diag, 2);
});
test('Gag Order: setTargeting accepted at a-1, rejected at a, accepted at b', () => {
  const b = mk(); const c = toPhase(b, 5); const u = b.place('yuji', 9, 3).unit;
  while (c.lt < 359) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  assert.ok(b.setTargeting(u, 'last')); step(b, 1); assert.equal(c.lt, 360);
  assert.equal(b.setTargeting(u, 'first'), false); assert.equal(c.lastReject, 'Gag Order');
  while (c.lt < 720) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); } assert.ok(b.setTargeting(u, 'first'));
});
test('Bell Debt: 0, 1 and 2 debts open the window at 960, 1080 and 1200 (rejected clicks and passives add none)', () => {
  for (const n of [0, 1, 2]) {
    const b = mk(['megumi', 'gojo', 'yuji']); b.godMode = true; const c = toPhase(b, 8); b.yen = 1e6; // VIII: Bell without Adjournment
    const us = [b.place('megumi', 5, 2).unit, b.place('gojo', 14, 2).unit]; for (const u of us) { while (b.upgrade(u).ok); u.domainCd = 0; }
    while (c.lt < 500) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
    for (let i = 0; i < n; i++) { b.endDomain(true); us[i].domainCd = 0; assert.ok(b.activateDomain(us[i])); }
    if (n === 1) assert.equal(b.activateDomain(us[1]), false, 'rejected click (a Domain is open)');
    if (n === 2) assert.equal(b.activateDomain(us[0]), false, 'rejected click (on cooldown)');
    assert.equal(c.rd.debt, n);
    while (c.lt < 959 + 120 * n) { step(b, 1); assert.equal(c.mitigation(), C.MITIGATION); }
    step(b, 1); assert.equal(c.mitigation(), 1);
  }
});
test('control budget: 239 / 240 / 241 lost ticks, roll-out after 1,440 ticks, rejected stuns leave ccImmuneT untouched', () => {
  const b = mk(); const c = toPhase(b, 1); const e = c.boss;
  for (let i = 0; i < 239; i++) { e.stunT = 1; step(b, 1); }
  assert.equal(c.budget.lostTicks(), 239); assert.ok(!c.budget.spent());
  e.stunT = 1; step(b, 1); assert.equal(c.budget.lostTicks(), 240); assert.ok(c.budget.spent());
  const s0 = c.sFx; e.stunT = 1; step(b, 1); assert.equal(c.budget.lostTicks(), 240); assert.equal(Math.abs(c.sFx - s0), C.FX, 'Unstoppable: full step');
  e.stunT = 0; e.ccImmuneT = 0; assert.equal(b.stun(e, 2), false); assert.equal(e.ccImmuneT, 0);
  step(b, 1440 - 241); assert.ok(c.budget.lostTicks() < 240, 'old loss rolls out');
});
test('Remand reverses the procession at the disclosed tick; Habeas Corpus moves the single hitbox <= 128 px vertically, 0 px horizontally', () => {
  const b = mk(); const c = toPhase(b, 4);
  while (c.lt < 839) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); } const d0 = c.dir; step(b, 1); assert.equal(c.dir, -d0);
  const b2 = mk(); const c2 = toPhase(b2, 2);
  while (c2.lt < 959) { if (b2.over) throw new Error('battle ended early: ' + (b2.court.verdict && b2.court.verdict.text)); step(b2, 1); } const h0 = { x: c2.hit.x, y: c2.hit.y }, body0 = { x: c2.body.x, y: c2.body.y }; step(b2, 1);
  assert.equal(c2.side, 'refl'); const bodyMoved = c2.body.x - body0.x;
  assert.ok(Math.abs(c2.hit.x - h0.x - bodyMoved) < 1e-9 && Math.abs(c2.hit.y - h0.y) <= 128 + 1e-9);
  assert.equal(b2.enemies.filter((x) => x.type === 'jahjuanBoss').length, 1);
  while (c2.lt < 1320) { if (b2.over) throw new Error('battle ended early: ' + (b2.court.verdict && b2.court.verdict.text)); step(b2, 1); } assert.equal(c2.side, 'body');
});

// ------------------------------------------------------------------ D. the court systems
test('Hanging Scales: exactly 65.0% is Level, just above lists; neutral ballast restores Level; Depth 2 floods the low corner but never a podium', () => {
  const W = (units) => J.CourtLedger.Scales.weigh(units, [], 0);
  assert.equal(W([{ c: 7, r: 2, invested: 650 }, { c: 7, r: 6, invested: 350 }]).ns, null);
  assert.equal(W([{ c: 7, r: 2, invested: 651 }, { c: 7, r: 6, invested: 349 }]).ns, 'N');
  assert.equal(W([{ c: 7, r: 2, invested: 700 }, { c: 7, r: 6, invested: 300 }, { c: 9, r: 5, invested: 200 }]).ns, null);
  const b = mk(); const c = b.court; c.list = { ns: 'N', we: 'W' }; c.recomputeWater();
  assert.equal(c.padState(7, 2), 'sub'); assert.equal(c.padState(5, 2), 'dry'); assert.equal(c.padState(7, 6), 'dry');
});
test('Specular Inversion: all five modes mirror on a submerged Ground pad (even modes the unit lacks); podiums never invert', () => {
  const b = mk(); const c = b.court; b.yen = 1e6;
  const y = b.place('yuji', 7, 2).unit, p = b.place('panda', 3, 2).unit, n = b.place('nobara', 5, 2).unit;
  c.list = { ns: 'N', we: 'W' }; c.recomputeWater();
  for (const m of ['first', 'last', 'strongest', 'weakest', 'closest']) { y.targeting = m; assert.equal(c.effMode(y), J.CourtSim.MIRROR[m]); }
  assert.equal(c.effMode(p), 'last'); assert.ok(!p.def.targeting.includes('last'));
  n.targeting = 'strongest'; assert.equal(c.effMode(n), 'strongest');
  assert.ok(y.rangePx < y.courtBaseRangePx && y.courtSpd === C.SUB_SPD);
});
test('Docket Order: under first/last he sorts after every curse in range; strongest picks him at full Integrity, weakest at 0', () => {
  const b = mk(); const c = toPhase(b, 1); const u = b.place('yuji', 9, 3).unit; const e = c.boss;
  c.sFx = Math.round(((9 - 5) * 64 / J.CourtSim.PX_PER_TICK)) * C.FX; c.updateHit();
  const esc = b.spawnEnemy('wisp', { lane: 0, wave: 12 }); esc.dist = 1152 - 64; esc.path.posAt(esc.dist, esc);
  for (const m of ['first', 'last']) { u.targeting = m; assert.equal(b.pickTarget(u), esc); }
  u.targeting = 'strongest'; assert.equal(b.pickTarget(u), e);
  esc.alive = false; u.targeting = 'first'; assert.equal(b.pickTarget(u), e, 'taken when no curse is in range');
  esc.alive = true; e.hp = 0; u.targeting = 'weakest'; assert.equal(b.pickTarget(u), e);
});
test('Witness Chain + Perjury: link x0.70, Testimony before the Exit Gate, true-damage silences, perjury only within 160 px of a living Witness', () => {
  const b = mk(); b.godMode = true; const c = toPhase(b, 5); b.yen = 1e6;
  while (!([...c.packets.values()].find((p) => p.perjury) || {}).perjurerId) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  const pk = [...c.packets.values()].find((p) => p.perjury), w = c.byId(pk.witnessId), pj = c.byId(pk.perjurerId);
  assert.ok(w && pj, 'True Witness and Perjurer marked');
  c.linkInitial(w); const lk = w.court.link;
  if (lk) { const hp = w.hp; b.damage(w, 10, { type: 'cursed' }); assert.ok(Math.abs(hp - w.hp - 10 * C.WITNESS_MUL) < 1e-9); }
  pj.x = w.x + 200; pj.y = w.y; b.damage(pj, 1e9, { type: 'phys' }); assert.ok(!c.rd.tainted, 'outside 160 px costs nothing');
  b.damage(w, 1e9, { type: 'true', pierceShield: true }); assert.ok(!c.rd.testimony && c.rd.testimonyVoid, 'silenced, not examined');
});
test('Appellate Parity at exactly 68.0% is not a monopoly; just above is; Unlicensed Force is normalised to 3.5% and caps seals at 1.0%', () => {
  const b = mk(); const c = toPhase(b, 3);
  c.doct.add('corpus', 68); c.doct.add('animus', 32);
  const l = c.addLaw({ kind: 'appellate', disclose: c.lt, a: c.lt + 360, b: c.lt + 720 }, true); assert.equal(l.params.dominant, null);
  c.doct.add('corpus', 1); const l2 = c.addLaw({ kind: 'appellate', disclose: c.lt, a: c.lt + 360, b: c.lt + 720 }, true); assert.equal(l2.params.dominant, 'corpus');
  const b2 = mk(['jahjuan', 'yuji']); const c2 = toPhase(b2, 1); b2.yen = 1e6; const jj = b2.place('jahjuan', 7, 2); assert.ok(jj.ok, jj.reason);
  const e = c2.boss; const hp = e.hp; b2.damage(e, 1e12, { type: 'true', pierceShield: true, ignoreWard: true, src: jj.unit });
  assert.ok(Math.abs(hp - e.hp - C.TRUE_NORM * e.maxHp * c2.mitigation()) < 1e-6);
  for (let i = 0; i < 40; i++) b2.damage(e, 1e12, { type: 'true', pierceShield: true, ignoreWard: true, src: jj.unit });
  assert.ok(c2.ph.seal.NW <= C.TRUE_CAP * e.maxHp + 1e-9, 'true seal contribution capped at 1%');
});
test('Sub Judice locks a tile for 720 ticks only when sold in combat; Bail Escheat forfeits half the contribution to an incomplete seal', () => {
  const b = mk(); b.yen = 1e6; const u = b.place('yuji', 7, 2).unit; b.sell(u); assert.ok(b.place('yuji', 7, 2).ok, 'intermission/prep sale locks nothing');
  const c = toPhase(b, 1); const u2 = b.unitAt(7, 2); c.ph.contrib[u2.uid] = 100; c.ph.seal.NW = 100; b.sell(u2);
  assert.equal(c.ph.seal.NW, 50); assert.equal(b.place('yuji', 7, 2).reason, 'Pad under 12s Sub Judice lock');
  step(b, 719); assert.ok(!b.place('yuji', 7, 2).ok); step(b, 1); assert.ok(b.place('yuji', 7, 2).ok);
});
test('Citation Wear: theta = 4% + 1% per Citation, capped at 8%; Estoppel tie-break NW, SW, NE, SE; 4-4-4-4 is a Unanimous Bench', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => +CD.theta(n).toFixed(4)), [0.04, 0.05, 0.06, 0.07, 0.08, 0.08]);
  const R = new J.CourtLedger.Record(); R.cit = { NW: 4, SW: 4, NE: 4, SE: 4 }; assert.equal(R.estopped(), null);
  R.cit = { NW: 3, SW: 5, NE: 5, SE: 3 }; assert.equal(R.estopped(), 'SW'); R.cit = { NW: 5, SW: 5, NE: 3, SE: 3 }; assert.equal(R.estopped(), 'NW');
});
test('Bench Warrant reads the post-movement hitbox: quadrant cleave, or the canal band parries it into the water', () => {
  const b = mk(); b.godMode = true; const c = toPhase(b, 2);
  assert.equal(c.quadrantAt(CD.tx(7), CD.ty(3)), 'NW'); assert.equal(c.quadrantAt(CD.tx(12), CD.ty(5)), 'SE'); assert.equal(c.quadrantAt(CD.tx(5), CD.ty(4)), 'canal');
  while (c.lt < 720) { if (b.over) throw new Error('battle ended early'); step(b, 1); }
  assert.ok(!c.lastWarrant, 'not before its tick'); step(b, 1);
  assert.ok(c.lastWarrant && c.lastWarrant.q === c.quadrantAt(c.hit.x, c.hit.y) || (c.lastWarrant && c.lastWarrant.q === 'canal'));
});
test('Supreme En Banc: Domain Clash, Quorum and Ward each answer it, and the previous Remedy of Record is Exhausted at the next', () => {
  const b = mk(['megumi', 'panda', 'yuji']); b.godMode = true; const c = toPhase(b, 6); b.yen = 1e6;
  const m = b.place('megumi', 14, 2).unit; while (b.upgrade(m).ok); m.domainCd = 0;
  const p = b.place('panda', 15, 2).unit; while (b.upgrade(p).ok);
  while (c.lt < 839) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); } assert.ok(b.activateDomain(m)); step(b, 2);
  assert.equal(c.lastEnBanc.remedy, 'clash'); assert.ok(c.stagger > 0 || c.budget.lostTicks() > 0);
  c.cancelLaws('t'); c.startPhase(8, true); b.endDomain(true); m.domainCd = 0;
  while (c.lt < 959) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); } assert.ok(b.activateDomain(m)); step(b, 2);
  assert.notEqual(c.lastEnBanc.remedy, 'clash', 'Exhausted Clash: an active Domain no longer shatters it'); assert.equal(c.lastEnBanc.exhausted, 'clash');
});
test('Mistrial: a Hung Jury keeps HP loss and Notarized seals, consumes a reading, and the third failure is a forensic defeat', () => {
  const b = mk(); b.godMode = true; const c = toPhase(b, 1); const e = c.boss;
  e.hp = Math.round(e.maxHp / 2); c.ph.seal.NW = c.theta('NW') * e.maxHp; c.notarize('NW', 'damage');
  while (c.reading === 1) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  assert.equal(c.reading, 2); assert.equal(e.hp, Math.round(e.maxHp / 2)); assert.ok(c.ph.notarizedBy.NW);
  while (!b.over) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  assert.ok(/Reading 3 failed at Judgment\. Integrity not exhausted/.test(c.verdict.text), c.verdict.text);
});

// ------------------------------------------------------------------ E. Phase IX and invalid-win rejections
test('Phase IX floors hold (65/30/10/3%) and floor hits still credit the Measure', () => {
  const b = mk(); const c = toMeasure(b, 0); const e = c.boss; b.yen = 1e6; const u = b.place('yuji', 7, 2).unit;
  b._env = c.env(u); b.damage(e, 1e9, { type: 'phys', src: u }); b._env = null;
  assert.equal(e.hp, 0.65 * e.maxHp); assert.ok(c.ph.seal.NW > 0);
  for (const [m, f] of [[1, 0.30], [2, 0.10], [3, 0.03]]) { const b2 = mk(); const c2 = toMeasure(b2, m); b2.damage(c2.boss, 1e9, { type: 'phys' }); assert.ok(c2.boss.hp >= f * c2.boss.maxHp - 1e-6); }
});
test('invalid wins: raw HP burst ignoring seals is a Hung Jury (a); neutral-only, Estopped-only and true-damage Last Words cannot shatter (c, d, e)', () => {
  const b = mk(); const c = toPhase(b, 1); c.boss.hp = 0; while (c.reading === 1) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  assert.ok(c.trace.some((t) => t.event === 'hungJury' && /Northern seal/.test(t.reason)));
  for (const kind of ['neutral', 'estopped', 'true']) {
    const b2 = mk(['yuji', 'jahjuan']); const c2 = toMeasure(b2, 3); b2.yen = 1e6;
    c2.ix.estopped = 'NW'; c2.ix.lwStart = 1560; while (c2.lt < 1560) { if (b2.over) throw new Error('ended: ' + b2.court.verdict.text); c2.boss.hp = c2.boss.maxHp * 0.05; b2.baseHp = 12; step(b2, 1); }
    const u = kind === 'neutral' ? b2.place('yuji', 9, 3).unit : kind === 'estopped' ? b2.place('yuji', 7, 2).unit : b2.place('jahjuan', 12, 2).unit;
    b2._env = c2.env(u); b2.damage(c2.boss, 1e12, { type: kind === 'true' ? 'true' : 'phys', src: u, pierceShield: true }); b2._env = null;
    assert.ok(c2.boss.alive && c2.boss.hp >= 1, kind + ' must not shatter the Crown');
  }
});
test('invalid wins: a missed Measure A witness (f), B signed from A\'s half (g), four net Strikes (i), one tick late (j), and a leak after the shatter (k)', () => {
  const b = mk(); const c = toMeasure(b, 0); c.ph.seal.SW = 1e9; c.ph.reqs[0].done = true; c.ph.reqs[0].g = 'SW'; c.ph.order.push({ g: 'SW', doc: { corpus: 1, animus: 0 } }); c.boss.hp = 0.7 * c.boss.maxHp;
  while (!b.over) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); } assert.equal(c.verdict.clause, 'Witness');
  const b2 = mk(); const c2 = toMeasure(b2, 1); c2.ph.reqs[0].done = true; c2.ph.reqs[0].g = 'NE'; c2.ph.order.push({ g: 'NE', doc: { corpus: 1, animus: 0 } }); c2.boss.hp = 0.35 * c2.boss.maxHp; c2.rd.win.NE = 1e9; c2.rd.win.NW = 1e9;
  while (!b2.over) { if (b2.over) throw new Error('battle ended early: ' + (b2.court.verdict && b2.court.verdict.text)); step(b2, 1); } assert.equal(c2.verdict.clause, 'Spatial Contradiction', 'A=NW, so only SW/SE count');
  const b3 = mk(); const c3 = toMeasure(b3, 3); while (!b3.over) { if (b3.over) throw new Error('battle ended early: ' + (b3.court.verdict && b3.court.verdict.text)); step(b3, 1); }
  assert.equal(c3.verdict.clause, 'Recitation'); assert.ok(/stayed sealed/.test(c3.verdict.text)); assert.equal(c3.lt, 1560);
  const b4 = mk(); const c4 = toMeasure(b4, 3); for (const a of c4.ix.articles) a.affirmed = true; b4.yen = 1e6; const u = b4.place('yuji', 12, 2).unit;
  while (c4.lt < 1919) { if (b4.over) throw new Error('ended: ' + b4.court.verdict.text); c4.boss.hp = c4.boss.maxHp * 0.05; b4.baseHp = 12; step(b4, 1); }
  step(b4, 1); assert.ok(b4.over && /closed unexecuted/.test(c4.verdict.text), 'the window closes at 1920');
  const b5 = mk(['yuji']); const c5 = toMeasure(b5, 3); b5.baseHp = 1; c5.shatterOK = true; b5.kill(c5.boss); assert.ok(c5.shattered);
  const esc = b5.spawnEnemy('brute', { lane: 0, wave: 12 }); esc.dist = 2111; step(b5, 2);
  assert.ok(b5.over && !b5.victory && /Spoiled by Escort Leak/.test(c5.verdict.title));
});
test('Recitation: an Article is affirmed by a hit on its first or last tick, a tick outside does not count, and Dissent refunds a Strike', () => {
  const b = mk(); const c = toMeasure(b, 3); b.yen = 1e6;
  const sw = b.place('nobara', 5, 6).unit;
  const art = c.ix.articles[6]; assert.equal(art.signer, 'SW');
  while (c.lt < 6 * 180) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  c.credit({ district: 'SW', type: 'cursed', doctrine: 'animus', env: c.env(sw), eligible: true }, 1);
  assert.ok(art.affirmed && art.dissent, 'first tick of Article 7, opposite doctrine to its corpus row');
  const a8 = c.ix.articles[7]; while (c.lt < 7 * 180 - 1) { if (b.over) throw new Error('battle ended early: ' + (b.court.verdict && b.court.verdict.text)); step(b, 1); }
  c.credit({ district: 'NW', type: 'phys', doctrine: 'corpus', env: c.env(sw), eligible: true }, 1); assert.ok(!a8.affirmed, 'one tick early');
});

// ------------------------------------------------------------------ F. legitimate proof + invariances
test('PROOF 1 (clean profile, four level-1 starters, policy bot): wins legitimately from Docket 1 to the shattered Crown', () => {
  const r = proof();
  assert.ok(r.s.victory, r.court.verdict && r.court.verdict.text);
  assert.equal(r.s.debug, false); assert.ok(r.s.baseHp >= 1); assert.ok(r.court.strikes >= 0 && r.court.strikes <= 3);
  for (const cmd of r.bot.log) assert.ok(['place', 'upgrade', 'sell', 'setTargeting', 'activateDomain', 'startWave'].includes(cmd.cmd));
  assert.equal(r.b.teamOrder.join(), TEAM4.join()); for (const id of TEAM4) assert.equal(r.b.roster[id].level, 1);
});
function replay(log, seed, frameMs, pauseAt) {
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: TEAM4.map((id) => ({ id, level: 1, stars: 0 })), seed });
  let i = 0, acc = 0, paused = false; const speed = frameMs ? 2 : 1;
  const apply = () => { while (i < log.length && log[i].t === b.court.tick) { const L = log[i++]; const u = L.c != null && L.cmd !== 'place' ? b.unitAt(L.c, L.r) : null;
    if (L.cmd === 'place') b.place(L.id, L.c, L.r); else if (L.cmd === 'upgrade') b.upgrade(u); else if (L.cmd === 'sell') b.sell(u); else if (L.cmd === 'setTargeting') b.setTargeting(u, L.mode); else if (L.cmd === 'activateDomain') b.activateDomain(u); else if (L.cmd === 'startWave') b.startWave(); } };
  let frames = 0;
  while (!b.over && frames < 5e6) {
    frames++;
    if (pauseAt && frames % pauseAt === 0) { paused = !paused; if (paused) continue; }
    if (!frameMs) { apply(); b.update(STEP); continue; }
    acc += (frameMs / 1000) * speed; let n = 0;
    while (acc >= STEP && n < 8 && !b.over) { apply(); b.update(STEP); acc -= STEP; n++; }
    if (n >= 8) acc = 0;
  }
  return b;
}
test('replay + invariances: the winning command log replays to the identical trace hash at any seed, frame interval, speed and pause pattern', () => {
  const r = proof(), H = r.b.court.hash();
  assert.equal(replay(r.bot.log, 1).court.hash(), H);
  assert.equal(replay(r.bot.log, 987654).court.hash(), H, 'law-side seed invariance (this roster consumes no RNG)');
  for (const [ms, pz] of [[7, 0], [16.67, 37], [50, 11]]) assert.equal(replay(r.bot.log, 5, ms, pz).court.hash(), H, 'frame ' + ms + 'ms');
});
test('disclosure soundness: every law that activates at T appeared in forecast() by T - 360 with identical parameters (whole proof run)', () => {
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: TEAM4.map((id) => ({ id, level: 1, stars: 0 })), seed: 1 });
  const bot = new (makeBot(J, { profile: 'ward' }).CourtBot)(b); const seen = new Map(); let bad = 0, checked = 0;
  b.events.on('courtLaw', (x) => {
    if (x.phase !== 'activate' || x.law.verdictConsequence || x.law.kind === 'route' || x.law.kind === 'weighing') return;
    const s = seen.get(x.law.id); checked++;
    const a = x.law.kind === 'gavel' ? b.court.tick : x.law.g.a;
    if (!s || s.tick > a - C.LEAD || JSON.stringify(s.params) !== JSON.stringify(b.court.lawParams(x.law))) { if (!(x.law.kind === 'gavel' && s && s.tick <= a - C.LEAD)) bad++; }
  });
  while (!b.over) { bot.tick(); b.update(STEP); for (const l of b.court.laws) if (l.state !== 'pending' && !seen.has(l.id)) seen.set(l.id, { tick: b.court.tick - 1, params: b.court.lawParams(l) }); }
  assert.ok(b.victory); assert.ok(checked > 100); assert.equal(bad, 0);
});
test('reference oracle: incremental 720-tick ledgers equal a naive recomputation from the raw hit log on every tick of a proof run', () => {
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: TEAM4.map((id) => ({ id, level: 1, stars: 0 })), seed: 1, courtOracle: true });
  const bot = new (makeBot(J, { profile: 'ward' }).CourtBot)(b); const c = b.court; let checked = 0, mism = 0;
  const keys = [['book', 'district', ['NW', 'SW', 'NE', 'SE', 'C', 'E']], ['doct', 'doctrine', ['corpus', 'animus']], ['chars', 'charId', ['yuji', 'nobara', 'panda']]];
  while (!b.over) {
    bot.tick(); b.update(STEP);
    if (!c.inTrial()) continue;
    const pos = c.book.pos, lo = pos - C.LEDGER; const naive = {};
    for (let i = c.hitLog.length - 1; i >= 0; i--) { const h = c.hitLog[i]; if (h.pos <= lo) break; if (!h.boss) continue; for (const [, f] of keys) naive[f + ':' + h[f]] = (naive[f + ':' + h[f]] || 0) + h.fx; }
    for (const [ring, f, ks] of keys) for (const k of ks) { checked++; if ((naive[f + ':' + k] || 0) !== c[ring].sum(k)) mism++; }
  }
  assert.ok(b.victory); assert.ok(checked > 100000, 'every trial tick'); assert.equal(mism, 0);
});
test('fuzzing (unit-scale): random legal command streams never throw, never produce NaN, keep exactly one boss and a monotonic calendar', () => {
  let s = 12345; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let run = 0; run < 12; run++) {
    const b = mk(['yuji', 'nobara', 'panda', 'megumi'], { seed: run }); b.yen = 4000 + Math.floor(rnd() * 4000); let lastT = -1;
    if (run % 2) toTrial(b);
    for (let t = 0; t < 9000 && !b.over; t++) {
      if (rnd() < 0.02) { const bn = CD.BENCH[Math.floor(rnd() * 20)]; b.place(['yuji', 'nobara', 'panda', 'megumi'][Math.floor(rnd() * 4)], bn.c, bn.r); }
      if (rnd() < 0.01 && b.units.length) b.upgrade(b.units[Math.floor(rnd() * b.units.length)]);
      if (rnd() < 0.004 && b.units.length) b.sell(b.units[Math.floor(rnd() * b.units.length)]);
      if (rnd() < 0.01 && b.units.length) b.setTargeting(b.units[Math.floor(rnd() * b.units.length)], J.Battle.TARGET_MODES[Math.floor(rnd() * 5)]);
      if (rnd() < 0.005) for (const u of b.units) b.activateDomain(u);
      if (rnd() < 0.01) b.startWave();
      b.update(STEP);
      if (b.over) break;
      assert.ok(b.court.tick > lastT); lastT = b.court.tick;
      for (const e of b.enemies) assert.ok(Number.isFinite(e.hp) && Number.isFinite(e.x) && Number.isFinite(e.y));
      assert.ok(Number.isFinite(b.yen));
      if (b.court.boss && b.court.boss.alive) assert.equal(b.enemies.filter((x) => x.type === 'jahjuanBoss').length, 1);
      if (b.court.boss && b.court.mode === 'measure') assert.ok(b.court.boss.hp >= (b.court.lastWordOpen() ? 0 : CD.MEASURES[b.court.measure].floor * b.court.boss.maxHp) - 1e-6);
    }
    if (b.over && !b.victory && b.court.verdict) assert.ok(b.court.verdict.text && b.court.verdict.text.length > 10);
  }
});
test('playable INVINCIBLE JAHJUAN alone cannot clear: sworn proofs need teammates (his hits are capped, silence Witnesses and never shatter)', () => {
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: [{ id: 'jahjuan', level: 1, stars: 0 }], seed: 1, startYen: 50000 });
  b.place('jahjuan', 9, 3); b.startWave();
  for (let i = 0; i < 2e6 && !b.over; i++) b.update(STEP);
  assert.ok(b.over && !b.victory, 'Jahjuan alone is not a win');
  assert.ok(b.court.verdict && b.court.verdict.text.length > 10);
});
test('WATCH A WINNING RUN: the embedded log (js/ui/court-replay-log.js) is the proof run and replays headless to the same win and hash', () => {
  const fs = require('fs'), vm = require('vm');
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'court-replay-log.js'), 'utf8'));
  const L = globalThis.JJK.CourtReplayLog;
  assert.ok(L && L.log.length > 100);
  assert.deepEqual(L.team, TEAM4.map((id) => ({ id, level: 1, stars: 0 })), 'the four level-1, 0-star starters');
  const b = replay(L.log, 424242);
  assert.ok(b.victory); assert.equal(b.court.hash(), L.hash);
  assert.equal(proof().b.court.hash(), L.hash, 'embedded log matches the current proof run');
});
