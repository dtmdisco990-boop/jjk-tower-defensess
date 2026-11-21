/* SKIBRIB CHALLENGE tests: the script, every enemy mechanic, all four bosses and their phases, records/saves/rewards,
   "no checkpoints", and the beatability proof (a legitimate Wave 1 -> 75 clear by the optimizing bot) plus weaker strategies failing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load.js');
const { makeBot } = require('./skibrib-bot.js');

const J = loadGame();
const { Battle, Balance, Util } = J;
const STEP = Balance.STEP;
const step = (b, sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n && !b.over; i++) b.update(STEP); };
const slots = (b, type) => [...b.geo.slots.values()].filter((s) => !type || s.type === type);
const mk = (team, o) => new Battle(Object.assign({ mapId: 'skibrib', diff: 'skibrib', team: (team || ['yuji']).map((id) => ({ id, level: 30, stars: 5 })), seed: 3 }, o || {}));
function near(b, u, type, o) {
  const e = b.spawnEnemy(type, o || {});
  let best = 0, bd = Infinity; const tmp = { x: 0, y: 0 };
  for (let d = 0; d < e.path.length; d += 4) { e.path.posAt(d, tmp); const q = (tmp.x - u.x) ** 2 + (tmp.y - u.y) ** 2; if (q < bd) { bd = q; best = d; } }
  e.dist = best; e.path.posAt(best, e); return e;
}
const PROOF = ['yuji', 'megumi', 'choso', 'mahitoC', 'gojo', 'jogoC'];

// ------------------------------------------------------------------ script & map
test('the map: 75 scripted waves, unlocked for everyone, fixed difficulty, no endless, single path with four crossings', () => {
  const M = J.Maps.skibrib;
  assert.equal(M.waves, 75); assert.equal(M.challenge, true); assert.deepEqual(M.unlock, { level: 1, map: null });
  const sm = new J.SaveManager(new Util.MemoryStorage()); sm.load();
  const p = new J.Profile(sm, { now: () => 0 });
  assert.equal(p.d.player.level, 1); assert.equal(p.isMapUnlocked('skibrib'), true, 'unlocked on a brand-new save');
  const b = mk(['yuji'], { diff: 'normal', mode: 'endless' });
  assert.equal(b.diffId, 'skibrib', 'difficulty is locked'); assert.equal(b.mode, 'story', 'no endless SKIBRIB');
  assert.equal(b.waves.length, 75); assert.equal(b.baseMax, 15); assert.equal(b.sellRefund, 0.5);
  const names = new Set(b.waves.map((w) => w.label));
  assert.equal(names.size, 75, 'every wave is named and unique');
  for (const w of b.waves) { assert.ok(w.entries.length > 0 && w.entries.every((e) => J.Enemies[e.type] || J.Bosses[e.type])); for (let i = 1; i < w.entries.length; i++) assert.ok(w.entries[i].t >= w.entries[i - 1].t); }
  assert.deepEqual([30, 50, 70, 75].map((n) => b.waves[n - 1].boss), ['skibPrime', 'skibDemon', 'skibKing', 'skibAbom']);
  assert.equal(b.waves[64].intro, true); assert.equal(b.waves[69].fakeEnd, true); assert.equal(b.waves[25].clearMsg, 'okay that was probably the hardest wave');
  assert.equal(b.waves[73].clearMsg, 'You should have stopped.'); assert.equal(b.waves[60].msg, 'THE OWNER SENDS HIS REGARDS.');
  for (const [n, nm] of [[51, 'THE STAMPEDE'], [52, 'THE WALL'], [53, 'THE WRONG TARGET'], [54, 'REGEN HELL'], [55, 'THE PARADE'], [56, 'THE BAIT'], [71, 'SPEED NIGHTMARE'], [72, 'DPS NIGHTMARE'], [73, 'SYNERGY NIGHTMARE']]) assert.equal(b.waves[n - 1].label, nm);
  // deterministic: same script every time, no RNG in the enemies
  assert.deepEqual(JSON.stringify(mk().waves), JSON.stringify(mk(['yuji'], { seed: 99 }).waves));
  // the path crosses itself
  const cnt = {}; for (const wp of M.paths) for (let i = 1; i < wp.length; i++) { const [a, c] = [wp[i - 1], wp[i]]; for (let x = Math.min(a[0], c[0]); x <= Math.max(a[0], c[0]); x++) for (let y = Math.min(a[1], c[1]); y <= Math.max(a[1], c[1]); y++) { if (i > 1 && x === a[0] && y === a[1]) continue; cnt[x + ',' + y] = (cnt[x + ',' + y] || 0) + 1; } }
  assert.ok(Object.values(cnt).filter((n) => n > 1).length >= 4, 'at least four crossings');
  // wave 65 is the biggest normal wave of the first 70
  const hp = (w) => w.entries.reduce((s, e) => s + (e.boss ? 0 : J.Enemies[e.type].hp * M.hpScale(w.n) * (e.hpMult || 1)), 0);
  for (let n = 1; n <= 69; n++) if (n !== 65) assert.ok(hp(b.waves[64]) > hp(b.waves[n - 1]), 'wave 65 out-weighs wave ' + n);
  // performance: no wave spawns an absurd number of enemies
  assert.ok(Math.max(...b.waves.map((w) => w.entries.length)) <= 130);
});

test('all eleven SKIBRIB enemies exist with art, and the story maps are untouched by the SKIBRIB hooks', () => {
  const ids = J.Skibrib.ENEMIES;
  assert.equal(ids.length, 11);
  for (const id of ids.concat(['trollShard', 'trollReveal'])) { const d = J.Enemies[id]; assert.ok(d && d.skib && d.img && d.desc && d.tip, id); }
  for (const id of J.Skibrib.BOSSES) { const d = J.Bosses[id]; assert.ok(d && d.skib && d.img && J.BossAI[d.ai] && d.mechanics.length >= 3, id); }
  // a story map battle never touches the SKIBRIB code paths
  const b = new Battle({ mapId: 'tokyo', diff: 'normal', team: [{ id: 'yuji', level: 1, stars: 0 }], seed: 1 });
  b.startWave(); step(b, 20);
  assert.ok(!b.hasSkib && b.enemies.every((e) => !e.skibHook));
});

// ------------------------------------------------------------------ enemy mechanics
test('Dodge Troll: dodges exactly one hit per 0.8s (deterministic, never random), and cannot dodge while stunned', () => {
  const b = mk(); const e = b.spawnEnemy('dodgeTroll', { wave: 1 }); e.speedMul = 0;
  assert.equal(b.damage(e, 10), 0, 'first hit dodged');
  assert.ok(b.damage(e, 10) > 0, 'second hit lands');
  step(b, 0.5); assert.ok(b.damage(e, 10) > 0, 'still recharging');
  step(b, 0.4); assert.equal(b.damage(e, 10), 0, 'recharged after 0.8s');
  step(b, 1); e.stunT = 1; assert.ok(b.damage(e, 10) > 0, 'stunned trolls cannot dodge');
});

test('Regeneration Troll heals only after 0.8s without damage; Shield Troll pulses one-time shields that never stack on Shield Trolls', () => {
  const b = mk();
  const r = b.spawnEnemy('regenTroll', { wave: 1 }); r.speedMul = 0; b.damage(r, r.maxHp * 0.5, { type: 'true' });
  const h0 = r.hp; step(b, 0.5); assert.equal(Math.round(r.hp), Math.round(h0), 'no regen yet');
  step(b, 1); assert.ok(r.hp > h0, 'regenerating');
  const b2 = mk();
  const s1 = b2.spawnEnemy('shieldTroll', { wave: 1, dist: 300 }); const s2 = b2.spawnEnemy('shieldTroll', { wave: 1, dist: 310 }); const w = b2.spawnEnemy('trollRunner', { wave: 1, dist: 305 });
  for (const e of [s1, s2, w]) e.speedMul = 0;
  const max2 = s2.shieldMax;
  step(b2, 8);
  assert.ok(w.shield > 0 && w.noShieldRegen, 'runner got a pulse shield');
  assert.ok(w.shield <= Math.round(s1.shieldMax * 0.45) + 1, 'pulses never stack above one pulse');
  assert.equal(s2.shieldMax, max2, 'shield trolls never grow each other');
});

test('Armored Troll: 70% physical reduction, cursed goes straight through; Buff Toilet aura: +30% speed and -40% damage taken', () => {
  const b = mk();
  const a = b.spawnEnemy('armoredTroll', { wave: 1 }); a.speedMul = 0;
  const p = b.damage(a, 100, { type: 'phys' }), c = b.damage(a, 100, { type: 'cursed' });
  assert.ok(Math.abs(p - 30) < 0.01 && c === 100, 'phys ' + p + ' cursed ' + c);
  const t = b.spawnEnemy('buffToilet', { wave: 1, dist: 500 }); const r = b.spawnEnemy('trollRunner', { wave: 1, dist: 520 });
  t.speedMul = 0; r.speedMul = 0; step(b, 0.1);
  assert.ok(r.auraUntil > b.time && r.auraSpd > 1.29);
  assert.ok(Math.abs(b.damage(r, 10, { type: 'true' }) - 6) < 0.01, 'buffed runner takes 40% less');
  b.damage(t, 1e9, { type: 'true', pierceShield: true }); step(b, 0.3);
  assert.equal(r.auraSpd, 1, 'aura gone the moment the toilet dies');
});

test('Disruptor: telegraphed channel disables units in a 1.6-tile ring; killing or stunning it during the channel fizzles it; wards ignore it', () => {
  for (const mode of ['resolve', 'kill', 'stun', 'ward']) {
    const id = mode === 'ward' ? 'panda' : 'yuji';
    const b = mk([id]); b.yen = 1e6;
    const u = b.place(id, 9, 5).unit;
    u.kit = Object.assign({}, u.kit, { attack: () => true, tick: null }); // a pacifist unit: we only test the channel
    const e = near(b, u, 'disruptor', { wave: 1 }); e.speedMul = 0; e.chT = 0;
    step(b, 0.1);
    if (mode === 'ward') { assert.ok(!e.channeling && !b.hazards.length, 'ward/immune units are ignored'); step(b, 3); assert.equal(u.disabledT, 0); continue; }
    assert.equal(e.channeling, true, mode + ': channel started');
    assert.ok(b.hazards.some((h) => h.label === 'DISRUPT'), 'telegraphed');
    if (mode === 'kill') { e.dodgeT = 0; b.damage(e, 1e9, { type: 'true' }); }
    if (mode === 'stun') b.stun(e, 1);
    step(b, 2);
    if (mode === 'resolve') assert.ok(u.disabledT > 0, 'unit disabled');
    else assert.equal(u.disabledT, 0, mode + ': it fizzled, nothing disabled');
  }
});

test('Splitter bursts into 3 shards; Fake Weakling "dies" into a 10x tougher armored form right where it fell', () => {
  const b = mk();
  const s = b.spawnEnemy('splitter', { wave: 10, dist: 800 }); b.damage(s, 1e9, { type: 'true' });
  assert.equal(b.enemies.filter((e) => e.alive && e.type === 'trollShard').length, 3);
  const f = b.spawnEnemy('fakeWeakling', { wave: 10, dist: 1500 }); const hp0 = f.maxHp, d0 = f.dist;
  b.damage(f, 1e9, { type: 'true' });
  assert.ok(f.alive && f.type === 'trollReveal' && f.revealed, 'revealed instead of dying');
  assert.equal(f.dist, d0, 'right where it fell');
  assert.ok(Math.abs(f.maxHp / hp0 - J.Enemies.trollReveal.hp / J.Enemies.fakeWeakling.hp) < 0.01, 'scaled the same way as the weakling');
  assert.equal(f.leak, 4); assert.ok(f.armor >= 0.3);
  b.damage(f, 1e9, { type: 'true' }); assert.equal(f.alive, false, 'the real form dies for real');
});

test('crowd control has diminishing returns on SKIBRIB enemies (not immunity), and the stacks decay', () => {
  const b = mk();
  const e = b.spawnEnemy('trollRunner', { wave: 1 }); e.speedMul = 0;
  const durs = [];
  for (let i = 0; i < 4; i++) { e.stunT = 0; e.ccImmuneT = 0; b.stun(e, 2); durs.push(+e.stunT.toFixed(3)); }
  assert.deepEqual(durs, [2, 1.3, 0.845, 0.549]);
  e.stunT = 0; e.ccImmuneT = 0; step(b, 17); e.stunT = 0; e.ccImmuneT = 0;
  b.stun(e, 2); assert.equal(+e.stunT.toFixed(3), 2, 'stacks decayed');
});

// ------------------------------------------------------------------ bosses
test('Boss 1 SKIBRIB PRIME: phase 1 armor + flushes, THE FLUSH at 50% (invulnerable dive, then EXPOSED), phase 2 swaps to cursed resistance', () => {
  const b = mk(); b.state = 'wave'; b.canStartWave = () => false;
  const phases = []; b.events.on('bossPhase', (x) => phases.push(x.name));
  const e = b.spawnEnemy('skibPrime', { wave: 30 }); e.dist = 300; e.speedMul = 0;
  assert.equal(e.armor, 0.45);
  step(b, 10); assert.ok(b.enemies.some((x) => x.type === 'speedToilet' && x.owner === e.id), 'flushed speed toilets');
  b.damage(e, e.maxHp * 0.51, { type: 'true' }); step(b, 0.1);
  assert.ok(phases.includes('THE FLUSH') && e.invulnT > 0);
  assert.equal(b.damage(e, 1000, { type: 'true' }), 0, 'invulnerable while flushing');
  step(b, 2.6);
  assert.ok(phases.some((p) => /EXPOSED/.test(p)) && e.vulnAmt >= 0.4, 'exposed burst window');
  assert.equal(e.cursedRes, 0.45); assert.equal(e.armor, 0); assert.ok(e.shield > 0 && e.speedMul > 1.4 && e.regen > 0);
  b.damage(e, 1e9, { type: 'true', pierceShield: true }); step(b, 0.1);
  assert.ok(!b.enemies.some((x) => x.alive && x.owner === e.id), 'its toilets vanish with it');
});

test('Boss 2 THE GREEN MENACE: adapts to your damage mix, 3 phases, CC immunity build-up, and Demon Charge must be clashed with a Domain', () => {
  const b = mk(); b.state = 'wave'; b.canStartWave = () => false;
  const phases = []; b.events.on('bossPhase', (x) => phases.push(x.name));
  const e = b.spawnEnemy('skibDemon', { wave: 50 }); e.dist = 200; e.speedMul = 0;
  for (let i = 0; i < 20; i++) { b.damage(e, 50, { type: 'cursed' }); step(b, 0.25); }
  step(b, 0.1); // the 5 s adaptation window closes (float accumulation can land one frame late)
  assert.ok(phases.includes('ADAPTED: CURSED -50%'));
  assert.ok(Math.abs(b.damage(e, 100, { type: 'cursed' }) - 50) < 1, 'cursed halved');
  for (let i = 0; i < 24; i++) { b.damage(e, 80, { type: 'cursed' }); b.damage(e, 50, { type: 'phys' }); step(b, 0.25); }
  assert.ok(phases.includes('ADAPTATION BROKEN'), 'mixing damage types breaks it');
  b.damage(e, e.maxHp * 0.36, { type: 'true', pierceShield: true }); step(b, 0.1);
  assert.equal(e.ai.p, 2); assert.ok(e.shield > 0);
  for (let i = 0; i < 3; i++) { e.stunT = 0; e.ccImmuneT = 0; b.stun(e, 1); step(b, 0.05); }
  assert.ok(phases.includes('CC IMMUNE') && e.ccImmuneT > 5);
  e.shield = 0; b.damage(e, e.hp - e.maxHp * 0.3, { type: 'true', pierceShield: true }); step(b, 0.1);
  assert.equal(e.ai.p, 3);
  // charge, no domain: it charges
  step(b, 0.2); assert.ok(b.hazards.some((h) => h.label === 'DEMON CHARGE'));
  step(b, 4.1); assert.ok(phases.includes('CHARGE!') && e.speedMul > 3);
  // next charge, with a domain active: clash + stun
  const b2 = mk(['megumi']); b2.yen = 1e6; b2.state = 'wave'; b2.canStartWave = () => false;
  const u = b2.place('megumi', 9, 5).unit; while (b2.upgrade(u).ok); u.domainCd = 0;
  const e2 = b2.spawnEnemy('skibDemon', { wave: 50 }); e2.dist = 200; e2.speedMul = 0; e2.hp = e2.maxHp * 0.3; step(b2, 0.3);
  assert.ok(b2.hazards.some((h) => h.label === 'DEMON CHARGE'));
  step(b2, 3); assert.ok(b2.activateDomain(u)); step(b2, 1.2);
  assert.ok(e2.stunT > 2, 'clashed: stunned');
});

test('Wave 70 THE TROLL KING: invulnerable behind two Royal Guards until both fall, then runs at 25%', () => {
  const b = mk(); b.state = 'wave'; b.canStartWave = () => false;
  const e = b.spawnEnemy('skibKing', { wave: 70 }); e.dist = 300; e.speedMul = 0;
  b.damage(e, e.maxHp * 0.45, { type: 'true' }); step(b, 0.1);
  assert.ok(e.invulnT > 0 && e.ai.guard.length === 2);
  assert.equal(b.damage(e, 1000, { type: 'true' }), 0);
  for (const g of e.ai.guard) b.damage(g, 1e12, { type: 'true', pierceShield: true });
  step(b, 0.1); assert.equal(e.invulnT, 0, 'guard down');
  b.damage(e, e.hp - e.maxHp * 0.2, { type: 'true' }); step(b, 0.1); assert.ok(e.speedMul >= 1.6);
});

test('Wave 75 THE SKIBRIB ABOMINATION: all four phases (escorts, speed + interruptible Void Orb, shield + resistance cycle, ENRAGE)', () => {
  const b = mk(['yuji']); b.yen = 1e6; b.state = 'wave'; b.canStartWave = () => false;
  const u = b.place('yuji', 9, 5).unit;
  const phases = [], casts = []; b.events.on('bossPhase', (x) => phases.push(x.name)); b.events.on('bossCast', (x) => casts.push(x.name));
  let enr = 0; b.events.on('skibEnrage', () => enr++);
  const e = b.spawnEnemy('skibAbom', { wave: 75 }); e.dist = 300; e.speedMul = 0; u.kit = Object.assign({}, u.kit, { attack: () => true });
  step(b, 7); assert.ok(b.enemies.some((x) => x.alive && x.type === 'tankTroll' && x.owner === e.id), 'P1 escorts');
  b.damage(e, e.maxHp * 0.31, { type: 'true' }); step(b, 0.1); assert.equal(e.ai.p, 2); assert.ok(e.speedMul >= 1.35);
  // Void Orb lands if ignored...
  e.ai.orbT = 0; e.speedMul = 0; step(b, 0.1); assert.ok(b.hazards.some((h) => h.label === 'VOID ORB'));
  step(b, 1.5); assert.ok(u.disabledT > 0, 'orb disabled the top unit');
  // ...and fizzles if you hit the boss hard during the mark
  u.disabledT = 0; e.ai.orbT = 0; step(b, 0.1); b.damage(e, e.maxHp * 0.03, { type: 'true' }); step(b, 1.5);
  assert.ok(casts.includes('ORB INTERRUPTED') && u.disabledT <= 0);
  e.shield = 0; b.damage(e, e.hp - e.maxHp * 0.39, { type: 'true', pierceShield: true }); step(b, 0.2);
  assert.equal(e.ai.p, 3); assert.ok(e.shield > 0);
  const modes = new Set(); for (let i = 0; i < 16; i++) { step(b, 1); modes.add(e.armorBonus > 0 ? 'armored' : e.cursedRes > 0 ? 'warded' : 'none'); }
  assert.ok(modes.has('armored') && modes.has('warded'), 'resistance cycle');
  e.shield = 0; b.damage(e, e.hp - e.maxHp * 0.14, { type: 'true', pierceShield: true }); step(b, 0.1);
  assert.equal(e.ai.p, 4); assert.equal(enr, 1); assert.ok(phases.includes('ENRAGE') && e.speedMul >= 1.9);
  assert.ok(Math.abs(b.damage(e, 100, { type: 'true' }) - 120) < 0.5, 'falls apart: +20% damage taken');
  // reaching the exit ends the run, whatever your lives
  e.speedMul = 50; step(b, 10);
  assert.ok(b.over && !b.victory && b.baseHp === 0, 'boss escape = instant defeat');
});

// ------------------------------------------------------------------ run rules, records, rewards, saves
test('no checkpoints: a defeat on any wave ends the run, and the only restart is a fresh Wave 1', () => {
  const b = mk(['yuji']);
  b.wave = 73; b.state = 'wave';
  const e = b.spawnEnemy('tankTroll', { wave: 73 }); e.dist = e.pathLen - 1; e.leak = 99; step(b, 0.2);
  assert.ok(b.over && !b.victory);
  assert.equal(mk(['yuji']).wave, 0, 'a new attempt starts before Wave 1');
  assert.equal(typeof b.checkpoint, 'undefined');
});

test('records + rewards: attempts, deaths, highest wave, best time/lives, fewest units; SKIBRIB SURVIVOR; wave 70 grants nothing by itself; saves migrate', () => {
  const store = new Util.MemoryStorage();
  const sm = new J.SaveManager(store); sm.load();
  const p = new J.Profile(sm, { now: () => 1 });
  p.skibStart(); p.skibStart();
  const base = { mapId: 'skibrib', diff: 'skibrib', mode: 'story', totalWaves: 75, kills: 10, yenEarned: 0, baseLost: 0, sold: 2, disabled: 0, upgrades: 0, deploys: 30, domains: 0, bossKills: {}, bossTimes: {}, score: 0, deployedIds: [], loadout: [], enemiesSeen: [], bossesSeen: [], damage: 1e6 };
  const lose = p.applyMatchResult(Object.assign({}, base, { victory: false, wave: 70, wavesCleared: 69, duration: 4000, baseHp: 0 }), 'a');
  assert.equal(p.d.skibrib.deaths, 1); assert.equal(p.d.skibrib.highestWave, 69); assert.ok(lose.skibrib.newHighest);
  assert.ok(lose.challenges.some((c) => c.id === 'skib_65') && !lose.challenges.some((c) => c.id === 'skib_win'), 'milestones but no SURVIVOR for a wave-70 death');
  const win = p.applyMatchResult(Object.assign({}, base, { victory: true, wave: 75, wavesCleared: 75, duration: 6300, baseHp: 3 }), 'b');
  const K = p.d.skibrib;
  assert.deepEqual([K.attempts, K.wins, K.deaths, K.highestWave, K.bestTime, K.bestLives, K.fewestUnits, K.completed], [2, 1, 1, 75, 6300, 3, 30, true]);
  assert.ok(win.challenges.some((c) => c.id === 'skib_win'));
  assert.ok(!p.d.progress.maps.skibrib, 'not mixed into story progress');
  // debug / sandbox runs record nothing
  const before = JSON.stringify(p.d.skibrib);
  p.applyMatchResult(Object.assign({}, base, { victory: true, wave: 75, wavesCleared: 75, duration: 10, baseHp: 15, debug: true }), 'c');
  assert.equal(JSON.stringify(p.d.skibrib), before);
  // round-trip + v1 migration
  p.commit(); const sm2 = new J.SaveManager(store); sm2.load();
  assert.deepEqual(sm2.data.skibrib, p.d.skibrib);
  // an existing v1 save (before SKIBRIB existed) migrates without losing anything
  const st2 = new Util.MemoryStorage();
  st2.setItem(J.Config.SAVE_KEY, JSON.stringify({ saveVersion: 1, currencies: { coins: 1234, gems: 56 }, characters: { yuji: { level: 7, xp: 3, stars: 2 } }, loadout: ['yuji'] }));
  const sm3 = new J.SaveManager(st2); sm3.load();
  assert.equal(sm3.data.saveVersion, J.SaveManager.CURRENT_VERSION);
  assert.deepEqual([sm3.data.currencies.coins, sm3.data.currencies.gems, sm3.data.characters.yuji.level, sm3.data.characters.yuji.stars], [1234, 56, 7, 2]);
  assert.equal(sm3.data.skibrib.attempts, 0); assert.equal(sm3.data.skibrib.completed, false);
  assert.ok(!/owner/i.test(JSON.stringify(sm2.data)));
});

// ------------------------------------------------------------------ beatability proof
test('PROOF: the optimizing bot clears Wave 1 -> 75 legitimately (real Yen, no god mode, no debug), deterministic replay', () => {
  const SB = makeBot(J);
  const b = new Battle({ mapId: 'skibrib', diff: 'skibrib', team: PROOF.map((id) => ({ id, level: 30, stars: 5 })), seed: 4 });
  const startYen = b.yen;
  const bot = new SB(b, { profile: 'optimal' });
  let peak = 0;
  while (!b.over && b.time < 14000) { bot.step(); if (b.enemies.length > peak) peak = b.enemies.length; }
  const s = b.getSummary();
  assert.equal(startYen, J.Maps.skibrib.startYen, 'normal starting Yen');
  assert.equal(s.debug, false); assert.ok(!b.godMode);
  assert.equal(s.victory, true, 'cleared: died on wave ' + s.wave);
  assert.equal(s.wavesCleared, 75);
  assert.ok(s.baseHp >= 1 && s.baseHp <= 10, 'a knife edge, not a stroll: ' + s.baseHp + ' lives left');
  assert.ok(peak <= 150, 'peak enemies alive ' + peak);
});

test('weaker strategies get slaughtered: casual play, greedy spending and sloppy placement all die long before the end', () => {
  const SB = makeBot(J);
  for (const [profile, limit] of [['casual', 20], ['greedy', 20], ['sloppyPlacement', 40]]) {
    const b = new Battle({ mapId: 'skibrib', diff: 'skibrib', team: PROOF.map((id) => ({ id, level: 30, stars: 5 })), seed: 1 });
    const s = new SB(b, { profile }).run(14000);
    assert.equal(s.victory, false, profile);
    assert.ok(s.wave <= limit, profile + ' died on wave ' + s.wave);
  }
});
