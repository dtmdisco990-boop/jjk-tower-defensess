/* SKIBRIB CHALLENGE: an optional 75-wave endurance map. Data only: enemies, bosses, the map, the hand-authored wave script and its
   messages. Mechanics live in js/sim/skibrib-ai.js, art in js/render/skibrib-art.js, presentation in js/ui/skibrib-ui.js.
   Design rules: no RNG-decided outcomes (every dodge, channel and phase is deterministic and telegraphed), no unavoidable damage,
   every threat has more than one answer. It is hard through systems (speed, armor, shields, regen, auras, disruption, splits,
   targeting traps, economy), not through one giant HP number. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Balance } = JJK;
  const E = JJK.Enemies, B = JJK.Bosses;

  // ------------------------------------------------------------------ enemies
  // img = base picture (assets/skibrib/*.png), tint = recolour, fx = procedural overlay drawn on top.
  const SK = { skib: true, ccDim: true };
  const add = (id, o) => { E[id] = Object.assign({ id }, SK, o); };

  add('trollRunner', {
    name: 'Troll Runner', hp: 46, speed: 150, armor: 0, yen: 3, leak: 1, threat: 8, size: 24, color: '#ffd23a', img: 'troll', tint: '#ffd23a', fx: 'speed',
    desc: 'Horrifyingly fast, horrifyingly fragile.', tip: 'Anything kills it, if it is still in range. Cover the exit stretch, or hit them early with LAST/WEAKEST.',
  });
  add('tankTroll', {
    name: 'Tank Troll', hp: 900, speed: 30, armor: 0.25, yen: 18, leak: 4, threat: 60, size: 50, color: '#c0523a', img: 'troll', tint: '#c0523a', fx: 'helmet', ccResist: 0.5,
    desc: 'Slow, enormous, 25% armor. Leaks for 4 lives. Usually walks in FRONT so FIRST-targeting units waste their time on it.', tip: 'Sustained damage or mahito-style missing-HP damage. Do not let every unit stare at it while runners pass.',
  });
  add('dodgeTroll', {
    name: 'Dodge Troll', hp: 120, speed: 72, armor: 0, yen: 5, leak: 2, threat: 16, size: 30, color: '#4ad0ff', img: 'troll', tint: '#4ad0ff', fx: 'ghost', dodgeCd: 0.8,
    desc: 'Dodges the first hit it takes every 0.8 seconds ("DODGE!"). Never random.', tip: 'Fast-attacking units and AoE overwhelm the dodge. Slow heavy hitters waste shots. Stunned trolls cannot dodge.',
  });
  add('regenTroll', {
    name: 'Regeneration Troll', hp: 300, speed: 46, armor: 0, yen: 7, leak: 2, threat: 24, size: 34, color: '#4ade80', img: 'troll', tint: '#36d06a', fx: 'plus', regen: 0.12, regenDelay: 0.8,
    desc: 'Heals 12% max HP per second once it goes 0.8s without taking damage.', tip: 'Keep sustained damage on it. Burns and damage-over-time stop the healing.',
  });
  add('shieldTroll', {
    name: 'Shield Troll', hp: 170, shield: 340, speed: 50, armor: 0, yen: 8, leak: 2, threat: 30, size: 34, color: '#5a8cff', img: 'troll', tint: '#5a8cff', fx: 'bubble',
    shieldRegenDelay: 3, shieldRegen: 60, pulseCd: 7, pulseR: 1.7, pulseAmt: 0.45,
    desc: 'A separate, visible shield that regrows after 3s. Every 7s it pulses a smaller one-time shield onto nearby trolls (but never onto other Shield Trolls).', tip: 'Shield-piercing hits and burst. Kill it before the pulse or the whole pack gets shielded.',
  });
  add('armoredTroll', {
    name: 'Armored Troll', hp: 240, speed: 48, armor: 0.7, yen: 7, leak: 2, threat: 26, size: 36, color: '#a8b0c0', img: 'troll', tint: '#9aa4b8', fx: 'plates',
    desc: 'Steel plating: 70% physical damage reduction. Cursed energy goes straight through.', tip: 'Cursed damage, armor break or armor pierce. Yuji spam bounces off this.',
  });
  add('speedToilet', {
    name: 'Speed Toilet', hp: 120, speed: 190, armor: 0, yen: 3, leak: 2, threat: 14, size: 30, color: '#ffffff', img: 'toilet', fx: 'speed',
    desc: 'A porcelain missile. Exists to make you panic.', tip: 'Covers 3 tiles a second. Units near the exit, slows and stuns.',
  });
  add('buffToilet', {
    name: 'Buff Toilet', hp: 420, speed: 46, armor: 0.1, yen: 14, leak: 3, threat: 40, size: 40, color: '#ffd23a', img: 'shades', fx: 'aura',
    aura: { r: 2.0, spd: 0.3, dr: 0.4 },
    desc: 'Everything within 2 tiles moves 30% faster and takes 40% less damage. Priority target.', tip: 'Usually walks at the BACK of its pack: LAST targeting reaches it. Killing it removes the aura instantly.',
  });
  add('disruptor', {
    name: 'Disruptor', hp: 170, speed: 44, armor: 0, yen: 10, leak: 2, threat: 34, size: 34, color: '#ff4ad0', img: 'troll', tint: '#d040ff', fx: 'glitch',
    chCd: 9, chTime: 1.6, chR: 1.6, chDisable: 4,
    desc: 'When your units are near, it stops and channels for 1.6s (big pink warning ring), then disables every unit in the ring for 4s.', tip: 'Kill or stun it during the channel and it fizzles. Panda and Miwa\'s ward ignore it. Its ring reaches 1.6 tiles: units two tiles back from the path are safe. Do not crowd melee units on one corner.',
  });
  add('splitter', {
    name: 'Splitter', hp: 330, speed: 50, armor: 0, yen: 6, leak: 2, threat: 30, size: 38, color: '#ff8a3a', img: 'troll', tint: '#ff8a3a', fx: 'crack', split: { type: 'trollShard', n: 3 },
    desc: 'Bursts into 3 fast Troll Shards when killed.', tip: 'Kill it early in the path, where the shards still have a long way to run.',
  });
  add('trollShard', {
    name: 'Troll Shard', hp: 52, speed: 130, armor: 0, yen: 1, leak: 1, threat: 0, size: 20, color: '#ffb070', img: 'troll', tint: '#ffb070', fx: 'speed',
    desc: 'A fragment of a Splitter.', tip: 'Fast and fragile.',
  });
  add('fakeWeakling', {
    name: 'Fake Weakling', hp: 30, speed: 34, armor: 0, yen: 0, leak: 1, threat: 12, size: 18, color: '#e8e0e8', img: 'troll', tint: '#f0e8f0', fx: 'bandaid', fakeDeath: true,
    desc: 'Looks pathetic. Is not pathetic. When "killed" it stops pretending and becomes a 10x tougher, armored sprinter right where it died.', tip: 'Pop it EARLY (WEAKEST targeting) so the real form appears far from your base.',
  });
  add('trollReveal', {
    name: 'Fake Weakling (revealed)', hp: 380, speed: 100, armor: 0.3, yen: 8, leak: 4, threat: 0, size: 42, color: '#ff3a5a', img: 'troll', tint: '#ff2a4a', fx: 'rage',
    desc: 'The Fake Weakling\'s real form.', tip: 'Fast, armored, leaks for 4 lives.',
  });

  // ------------------------------------------------------------------ bosses
  const SB = (id, o) => { B[id] = Object.assign({ id, boss: true, skib: true, ccDim: true, knockImmune: true, air: false, drops: [] }, o); };
  SB('skibPrime', {
    name: 'SKIBRIB PRIME', title: 'Boss 1: The Warning', hp: 38000, speed: 26, armor: 0.45, yen: 600, leak: 999, size: 78, color: '#e8e8f0', img: 'prime',
    ccResist: 0.6, ai: 'skibPrime', rewardCoins: 600,
    desc: 'A toilet that has seen things. Two phases. Harder than most final bosses, and it is only the first one.',
    mechanics: ['Phase 1: 45% physical armor. Flushes 3 Speed Toilets ahead of itself every 8s (telegraphed).', 'THE FLUSH (50%): dives for 2.5s (invulnerable), then surfaces EXPOSED for 4s (+40% damage taken): save your Domain and burst for this.', 'Phase 2: armor swaps to 45% CURSED resistance, +45% speed, an 18% shield, regenerates when you stop hitting it, and pulses a disruption ring every 10s.', 'If it reaches the exit the run is over.'],
  });
  SB('skibDemon', {
    name: 'THE GREEN MENACE', title: 'Boss 2: The Run Killer', hp: 58000, speed: 22, armor: 0.2, yen: 1400, leak: 999, size: 84, color: '#6aff4a', img: 'demon',
    ccResist: 0.6, ai: 'skibDemon', rewardCoins: 1400,
    desc: 'It exists to destroy runs. Three phases, and it learns.',
    mechanics: ['Adaptation: every 5s it checks which damage type hurt it most. Above 60% share, that type is resisted by 50%. Mix physical and cursed damage.', 'Phase 2 (66%): 15% shield, +25% speed, Speed Toilets pouring out behind it, a disruption ring every 9s, and crowd-control resistance that builds with every stun (3 stuns = immune for 6s).', 'Phase 3 (33%) ENRAGED: +55% speed, heals 2%/s when you stop hitting it, summons a Buff Toilet and Splitters.', 'DEMON CHARGE (33%): a 4s warning. A Domain active when it lands stuns it for 4s; otherwise it charges at double speed for 6s.'],
  });
  SB('skibKing', {
    name: 'THE TROLL KING', title: 'Wave 70: The Final Boss (probably)', hp: 110000, speed: 22, armor: 0.2, yen: 2000, leak: 999, size: 86, color: '#ffd23a', img: 'king',
    ccResist: 0.7, ai: 'skibKing', rewardCoins: 0,
    desc: 'The king of all trolls. Surely this is the end.',
    mechanics: ['Royal Escort: Tank Trolls join him every 12s.', 'CROWN GUARD (60%): two Royal Guards appear and the King is invulnerable until both die (12s max).', 'Below 25%: he runs. +60% speed.'],
  });
  SB('skibAbom', {
    name: 'THE SKIBRIB ABOMINATION', title: 'Wave 75: The Real Final Boss', hp: 160000, speed: 20, armor: 0.3, yen: 5000, leak: 999, size: 92, color: '#c040ff', img: 'abom',
    ccResist: 0.75, ai: 'skibAbom', rewardCoins: 3000,
    desc: 'Four phases. It wants you gone.',
    mechanics: ['100-70%: 30% armor, escorted by Tank and Shield Trolls every 11s.', '70-40%: +35% speed, Speed Toilet volleys, a Disruptor every 16s, and VOID ORB: it marks one unit for 1.4s then disables it for 5s. Hit it hard (2.5% of its HP) or stun it during the mark and the orb fizzles.', '40-15%: 12% shield, disruption rings, and a resistance cycle every 7s (ARMORED: -60% physical / WARDED: -60% cursed). Splitters.', '15-0% ENRAGE: +90% speed, takes +20% damage, every ability at half cooldown. It is heading for the exit. Finish it.'],
  });

  // ------------------------------------------------------------------ the map
  const MAP = {
    id: 'skibrib', order: 90, challenge: true, name: 'SKIBRIB CHALLENGE', short: 'SKIBRIB', waves: 75, recommendedLevel: 30,
    desc: 'This is technically beatable.',
    twist: 'One path that crosses itself four times. A few tiles are golden. Most are not. No checkpoints: lose anywhere and it is Wave 1.',
    startYen: 700, rewardScale: 1.6, bg: 'skibrib', diffLock: 'skibrib', skulls: 10,
    paths: [[[-1, 7], [5, 7], [5, 1], [1, 1], [1, 4], [10, 4], [10, 7], [14, 7], [14, 1], [8, 1], [8, 6], [12, 6], [12, 2], [19, 2]]],
    air: [[[-1, 7], [9, 4], [19, 2]]],
    elevated: [{ c: 2, r: 3, w: 3, h: 1 }, { c: 16, r: 3, w: 2, h: 2 }],
    blocked: [
      { c: 6, r: 2, w: 2, h: 2 }, { c: 2, r: 2, w: 3, h: 1 }, { c: 11, r: 3, w: 1, h: 2 }, { c: 9, r: 2, w: 2, h: 2 }, { c: 13, r: 5, w: 1, h: 1 },
      { c: 0, r: 0, w: 4, h: 1 }, { c: 16, r: 6, w: 4, h: 3 }, { c: 6, r: 8, w: 3, h: 1 }, { c: 15, r: 0, w: 5, h: 1 },
    ],
    waveCfg: { hpMult: 1, bosses: { 30: { id: 'skibPrime', hp: 1 }, 50: { id: 'skibDemon', hp: 1 }, 70: { id: 'skibKing', hp: 1 }, 75: { id: 'skibAbom', hp: 1 } } },
    special: { id: 'skibrib', label: 'SKIBRIB', desc: 'Everything.', rules: {} },
    unlock: { level: 1, map: null },
    enemies: ['trollRunner', 'tankTroll', 'dodgeTroll', 'regenTroll', 'shieldTroll', 'armoredTroll', 'speedToilet', 'buffToilet', 'disruptor', 'splitter', 'fakeWeakling'],
    boss: 'skibAbom',
    /** HP growth per wave: a smooth base curve times a per-act factor (tuned with the simulation bot, see tests/skibrib-bot.js).
        The waves get harder mostly by composition; these numbers keep every act at the edge of what optimal play survives. */
    hpScale: (n) => (1 + 0.085 * (n - 1) + 0.0042 * (n - 1) * (n - 1)) * actHp(n),
  };
  // per-act HP factors: [first wave of the act, factor]
  const ACT_HP = [[1, 1.6], [11, 1.8], [21, 1.9], [31, 1.4], [41, 1.25], [51, 1.15], [61, 1.05], [65, 1.46], [66, 0.9], [71, 1.28]];
  function actHp(n) { let f = 1; for (const [w0, k] of ACT_HP) if (n >= w0) f = k; return f; }
  MAP.ACT_HP = ACT_HP;
  JJK.Maps.skibrib = MAP;

  // SKIBRIB is played on its own fixed difficulty: there is no "easy SKIBRIB".
  Balance.difficulty.skibrib = {
    id: 'skibrib', label: 'SKIBRIB', hpMult: 1, countMult: 1, startYenMult: 1, baseHp: 15, yenMult: 1.1, rewardMult: 1.5,
    gemsRepeat: 60, gemsFirst: 500, eliteFrom: 1, eliteBoost: 1, speedMult: 1, sellRefund: 0.5, hidden: true,
    desc: 'The only difficulty. 15 lives, 50% sell refund, starving economy.',
  };

  // ------------------------------------------------------------------ the 75 waves
  // g(type, count, start, gap, hp) = a group. Names show in the wave banner. msg = shown before the wave; clear = shown after it.
  const g = (type, n, t, gap, hp) => ({ type, n, t, gap: gap == null ? 1 : gap, hp: hp || 1 });
  const R = 'trollRunner', T = 'tankTroll', D = 'dodgeTroll', H = 'regenTroll', S = 'shieldTroll', A = 'armoredTroll',
    ST = 'speedToilet', BF = 'buffToilet', X = 'disruptor', P = 'splitter', F = 'fakeWeakling';
  const W = {};
  const w = (n, name, groups, o) => { W[n] = Object.assign({ name, groups }, o || {}); };

  // ---- 1-10: THIS IS ALREADY BAD
  w(1, 'Hello :)', [g(R, 10, 3, 0.9), g(ST, 2, 14, 1.4)], { msg: 'lol stupid toilet map' });
  w(2, 'Rush Hour', [g(R, 14, 2, 0.7), g(T, 1, 6)]);
  w(3, 'Shields (Early)', [g(S, 3, 2, 3), g(R, 10, 9, 0.6)]);
  w(4, 'Fake News', [g(F, 6, 2, 2.2), g(R, 8, 10, 0.6)]);
  w(5, 'Careless Player Detector', [g(T, 2, 1, 1.4), g(R, 16, 4, 0.45), g(ST, 4, 13, 0.8)], { msg: 'Wave 5 kills careless players.' });
  w(6, 'Dodge This', [g(D, 10, 2, 1.0), g(R, 8, 12, 0.5)]);
  w(7, 'Regen Moment', [g(H, 6, 2, 2), g(A, 2, 8, 2), g(R, 8, 14, 0.5)]);
  w(8, 'Armor Check', [g(A, 6, 2, 1.6), g(R, 12, 6, 0.5), g(ST, 3, 15, 0.7)]);
  w(9, 'The Toilet Arrives', [g(T, 1, 2), g(R, 12, 3, 0.4), g(BF, 1, 6.5), g(ST, 4, 12, 0.6)]);
  w(10, 'SKILL CHECK', [g(T, 2, 1, 2), g(S, 3, 4, 1.5), g(X, 1, 7), g(R, 14, 9, 0.35), g(F, 4, 11, 1.2), g(ST, 6, 16, 0.5), g(BF, 1, 18), g(H, 2, 19, 1)], { msg: 'Wave 10. Major skill check.' });
  // ---- 11-20: WHY DID I CLICK THIS?
  w(11, 'Splitter Introduction', [g(P, 5, 2, 2.2), g(R, 10, 6, 0.5)], { msg: 'WHY DID I CLICK THIS?' });
  w(12, 'Shield + Regen', [g(S, 4, 2, 1.8), g(H, 5, 3, 1.8), g(R, 8, 12, 0.5)]);
  w(13, 'Disruption', [g(X, 2, 2, 5), g(R, 18, 4, 0.4), g(D, 6, 10, 0.8)]);
  w(14, 'The Wrong Target (Lite)', [g(T, 3, 1, 1.6), g(ST, 8, 5, 0.5), g(R, 10, 8, 0.4)]);
  w(15, 'Steel Parade', [g(BF, 2, 2, 6), g(A, 7, 3, 1.2), g(D, 6, 8, 0.9)]);
  w(16, 'Nothing Is What It Seems', [g(F, 8, 2, 1.4), g(P, 4, 6, 2), g(R, 8, 12, 0.4)]);
  w(17, 'Mending Wall', [g(H, 8, 2, 1.2), g(S, 4, 4, 2), g(BF, 1, 10), g(R, 10, 12, 0.4)]);
  w(18, 'Mixed Speeds', [g(T, 2, 1, 4), g(A, 3, 2, 3), g(R, 12, 3, 0.7), g(ST, 6, 6, 1.4), g(D, 4, 9, 1)]);
  w(19, 'Static', [g(X, 3, 2, 4), g(T, 2, 3, 5), g(R, 14, 5, 0.5), g(H, 4, 10, 1)]);
  w(20, 'Already Ridiculous', [g(BF, 2, 2, 8), g(S, 4, 3, 1.5), g(H, 4, 5, 1.2), g(P, 4, 8, 1.5), g(ST, 10, 12, 0.4), g(T, 2, 14, 2), g(X, 2, 16, 3)], { msg: 'Compare this to a normal map. Go on.' });
  // ---- 21-29: THIS ISN'T FUNNY ANYMORE
  w(21, 'Tanks Covering Runners', [g(T, 4, 1, 1.2), g(R, 24, 3, 0.25)], { msg: 'THIS ISN\'T FUNNY ANYMORE.' });
  w(22, 'Buffed Steel', [g(A, 10, 2, 0.9), g(BF, 3, 4, 3.2), g(D, 6, 10, 0.7)]);
  w(23, 'Regen + Static', [g(H, 10, 2, 1), g(X, 3, 3, 4), g(R, 12, 9, 0.4)]);
  w(24, 'Shrapnel Express', [g(P, 8, 2, 1.2), g(ST, 10, 5, 0.6), g(F, 4, 9, 1)]);
  w(25, 'lol easy wave', [g(R, 8, 2, 1.0)], { msg: 'Free wave. You earned it.', bonusMul: 0.3 });
  w(26, 'Never Mind', [g(T, 4, 1, 1.5), g(BF, 2, 3, 6), g(S, 6, 4, 1), g(P, 6, 8, 1), g(X, 3, 9, 3), g(ST, 12, 14, 0.4)], { clear: 'okay that was probably the hardest wave' });
  w(27, 'It Was Not', [g(T, 5, 1, 1.2), g(BF, 3, 2, 4), g(H, 6, 3, 1), g(A, 6, 5, 1), g(X, 4, 8, 2.5), g(F, 6, 10, 0.8), g(ST, 14, 16, 0.35)]);
  w(28, 'Ghost Shields', [g(D, 12, 2, 0.6), g(S, 6, 4, 1.2), g(BF, 2, 6, 4)]);
  w(29, 'The Calm Before', [g(R, 30, 2, 0.22), g(ST, 12, 6, 0.4), g(BF, 2, 8, 3), g(F, 6, 10, 0.7)], { msg: 'Something big is coming.' });
  // ---- 30: BOSS 1
  w(30, 'BOSS: SKIBRIB PRIME', [g('skibPrime', 1, 3), g(S, 2, 1, 2), g(T, 2, 6, 3), g(ST, 8, 12, 0.6)], { boss: 'skibPrime' });
  // ---- 31-40: WAIT THERE'S MORE?
  w(31, 'Wait There\'s More', [g(BF, 2, 2, 3), g(R, 30, 3, 0.2), g(ST, 8, 10, 0.4)], { msg: 'WAIT THERE\'S MORE?' });
  w(32, 'Tank Spa', [g(T, 4, 1, 2), g(H, 8, 2, 1), g(S, 3, 6, 2)]);
  w(33, 'Support Group', [g(S, 8, 2, 0.9), g(BF, 2, 4, 4), g(A, 6, 6, 0.8)]);
  w(34, 'Splinter Cell', [g(P, 10, 2, 0.9), g(ST, 14, 6, 0.35), g(D, 6, 8, 0.6)]);
  w(35, 'Static Swarm', [g(X, 5, 2, 2.4), g(R, 30, 3, 0.25), g(H, 4, 8, 1)]);
  w(36, 'Bait And Switch', [g(F, 10, 2, 0.8), g(T, 3, 4, 2), g(ST, 10, 12, 0.4)]);
  w(37, 'Heavy Metal', [g(A, 12, 2, 0.6), g(BF, 3, 3, 3), g(T, 3, 8, 2), g(X, 2, 10, 4)]);
  w(38, 'Regen Choir', [g(H, 14, 2, 0.6), g(S, 6, 4, 1), g(BF, 2, 6, 4), g(R, 12, 12, 0.3)]);
  w(39, 'Fast And Fractured', [g(P, 8, 2, 0.8), g(D, 10, 3, 0.6), g(ST, 16, 8, 0.3)]);
  w(40, 'Disgusting', [g(T, 5, 1, 1.4), g(BF, 3, 2, 3), g(S, 6, 4, 0.8), g(H, 6, 6, 0.8), g(A, 6, 8, 0.8), g(X, 4, 9, 2.5), g(P, 6, 12, 0.8), g(ST, 14, 18, 0.3)], { msg: 'Wave 40 is disgusting. That is the design.' });
  // ---- 41-49: THE SUFFERING ARC (wave bonuses are halved: plan ahead)
  const lean = { bonusMul: 0.5 };
  w(41, 'The Suffering Arc', [g(T, 4, 1, 1.5), g(R, 30, 2, 0.2), g(F, 8, 8, 0.8)], Object.assign({ msg: 'THE SUFFERING ARC. Wave bonuses are halved from here to 49.' }, lean));
  w(42, 'Armor Tax', [g(A, 14, 2, 0.6), g(S, 6, 4, 1), g(D, 8, 8, 0.6)], lean);
  w(43, 'Expensive Mistakes', [g(BF, 4, 2, 2.5), g(H, 10, 3, 0.8), g(ST, 16, 10, 0.3)], lean);
  w(44, 'Fault Lines', [g(P, 12, 2, 0.7), g(X, 4, 4, 3), g(T, 3, 6, 2)], lean);
  w(45, 'Paper Wall', [g(F, 14, 2, 0.6), g(A, 8, 4, 0.8), g(BF, 2, 6, 4)], lean);
  w(46, 'Everybody Gets A Shield', [g(S, 12, 2, 0.6), g(H, 8, 4, 0.8), g(R, 24, 10, 0.2)], lean);
  w(47, 'Rolling Static', [g(X, 6, 2, 2), g(D, 12, 3, 0.5), g(ST, 12, 10, 0.3), g(T, 3, 12, 2)], lean);
  w(48, 'The Squeeze', [g(T, 6, 1, 1.2), g(BF, 3, 2, 3), g(A, 10, 4, 0.6), g(P, 8, 9, 0.7)], lean);
  w(49, 'Run Killer Approaching', [g(H, 10, 2, 0.6), g(S, 8, 3, 0.8), g(X, 4, 6, 2.5), g(ST, 18, 12, 0.25), g(F, 8, 14, 0.5)], Object.assign({ msg: 'Next: the run killer.' }, lean));
  // ---- 50: BOSS 2
  w(50, 'BOSS: THE GREEN MENACE', [g('skibDemon', 1, 3), g(S, 3, 1, 2), g(T, 1, 7), g(X, 2, 12, 6)], { boss: 'skibDemon' });
  // ---- 51-60: ABSOLUTE NONSENSE (named waves, each attacks a different weakness)
  w(51, 'THE STAMPEDE', [g(ST, 30, 2, 0.28), g(R, 30, 3, 0.25), g(BF, 2, 6, 5)], { msg: 'ABSOLUTE NONSENSE. Wave 51: THE STAMPEDE.' });
  w(52, 'THE WALL', [g(T, 8, 1, 1.2), g(A, 10, 3, 0.8), g(BF, 3, 4, 3), g(S, 4, 8, 1)]);
  w(53, 'THE WRONG TARGET', [g(T, 4, 1, 0.8), g(F, 10, 3, 0.4), g(P, 8, 5, 0.6), g(ST, 12, 7, 0.3)]);
  w(54, 'REGEN HELL', [g(H, 20, 2, 0.45), g(S, 6, 3, 1.2), g(BF, 2, 5, 5), g(X, 2, 9, 5)]);
  w(55, 'THE PARADE', [g(BF, 5, 1, 1.4), g(D, 12, 2, 0.5), g(A, 8, 3, 0.7), g(R, 20, 6, 0.25)]);
  w(56, 'THE BAIT', [g(F, 16, 2, 0.4), g(P, 8, 4, 0.8), g(X, 3, 8, 3)]);
  w(57, 'THE BLACKOUT', [g(X, 8, 2, 1.6), g(R, 30, 3, 0.2), g(T, 3, 6, 3)]);
  w(58, 'THE GAUNTLET', [g(S, 10, 2, 0.6), g(A, 10, 3, 0.6), g(H, 10, 4, 0.6), g(BF, 3, 6, 3)]);
  w(59, 'THE SHATTER', [g(P, 16, 2, 0.5), g(D, 12, 4, 0.5), g(ST, 16, 10, 0.25)]);
  w(60, 'INSANE', [g(T, 6, 1, 1), g(BF, 2, 2, 4), g(S, 8, 3, 0.7), g(H, 8, 5, 0.6), g(X, 5, 7, 2), g(P, 8, 10, 0.6), g(F, 8, 12, 0.5), g(ST, 10, 16, 0.35)], { msg: 'Wave 60 feels insane. Because it is.' });
  // ---- 61-69: THE OWNER HATES YOU
  w(61, 'The Owner Hates You', [g(T, 6, 1, 1), g(R, 40, 2, 0.15), g(BF, 3, 4, 3), g(ST, 16, 10, 0.25)], { msg: 'THE OWNER SENDS HIS REGARDS.' });
  w(62, 'Precision Required', [g(A, 16, 2, 0.5), g(S, 10, 3, 0.6), g(D, 12, 6, 0.5)]);
  w(63, 'Economy Of Pain', [g(H, 16, 2, 0.5), g(F, 12, 4, 0.5), g(X, 5, 6, 2)], { bonusMul: 0.6 });
  w(64, 'The Warm-Up', [g(P, 14, 2, 0.6), g(BF, 4, 3, 2.5), g(T, 5, 6, 1.4), g(ST, 18, 12, 0.25)], { clear: 'Next wave: 65.' });
  // ---- 65: THE WAVE PEOPLE HATE. Three acts on a fixed clock: act 2 does not wait for act 1 to die.
  w(65, 'THE TOLL', [
    // act 1 (0s): the Wall. Tanks in front, Buff Toilets at the BACK of the column. FIRST targeting melts the wrong thing.
    g(T, 6, 1, 1.0, 1.15), g(A, 8, 3, 0.6), g(BF, 4, 7, 1.2),
    // act 2 (24s): the Blackout + Stampede. Disruptors arrive on the clock so they channel exactly when act 1 reaches your best corner.
    g(X, 6, 24, 1.1), g(ST, 24, 26, 0.22), g(S, 8, 27, 0.5),
    // act 3 (44s): the Bait. Fake Weaklings and Splitters: kill them late and the threats spawn at your exit.
    g(F, 12, 44, 0.45), g(P, 10, 46, 0.6), g(H, 8, 48, 0.6), g(R, 30, 52, 0.18),
  ], { msg: 'WAVE 65', intro: true, bonusMul: 1.5 });
  w(66, 'You Beat 65?', [g(T, 6, 1, 1), g(S, 10, 2, 0.6), g(X, 4, 5, 2.5), g(ST, 20, 10, 0.25)]);
  w(67, 'Synergy Check', [g(BF, 5, 1, 2), g(H, 12, 2, 0.5), g(A, 12, 3, 0.5), g(D, 10, 8, 0.4)]);
  w(68, 'Splinters Everywhere', [g(P, 18, 2, 0.45), g(F, 12, 4, 0.5), g(X, 4, 8, 3)]);
  w(69, 'Final Approach', [g(T, 6, 1, 1.0), g(BF, 2, 2, 3), g(S, 10, 4, 0.5), g(ST, 12, 12, 0.3), g(R, 12, 15, 0.25)], { msg: 'Almost there. Right?' });
  // ---- 70: FAKE FINAL BOSS
  w(70, 'BOSS: THE TROLL KING', [g('skibKing', 1, 3), g(S, 4, 1, 1.5), g(BF, 2, 8, 6), g(ST, 12, 14, 0.4)], { boss: 'skibKing', fakeEnd: true });
  // ---- 71-74: THE FINAL GAUNTLET
  w(71, 'SPEED NIGHTMARE', [g(ST, 36, 2, 0.2), g(R, 50, 3, 0.12), g(D, 14, 6, 0.4), g(BF, 3, 4, 4)], { msg: 'THE FINAL GAUNTLET. Wave 71: SPEED NIGHTMARE.' });
  w(72, 'DPS NIGHTMARE', [g(T, 10, 1, 0.9), g(A, 14, 2, 0.5), g(H, 14, 3, 0.5), g(S, 10, 5, 0.6)], { msg: 'Wave 72: DPS NIGHTMARE.' });
  w(73, 'SYNERGY NIGHTMARE', [g(BF, 6, 1, 1.2), g(S, 12, 2, 0.5), g(X, 6, 4, 1.6), g(H, 12, 6, 0.5), g(D, 12, 8, 0.4)], { msg: 'Wave 73: SYNERGY NIGHTMARE.' });
  w(74, 'EVERYTHING', [g(T, 8, 1, 0.9), g(BF, 5, 2, 1.6), g(S, 10, 3, 0.5), g(A, 10, 4, 0.5), g(X, 6, 6, 1.5), g(H, 10, 8, 0.5), g(P, 10, 12, 0.5), g(F, 10, 14, 0.4), g(ST, 24, 18, 0.2)], { msg: 'Wave 74: EVERYTHING COMBINED.', clear: 'You should have stopped.' });
  // ---- 75: THE REAL FINAL BOSS
  w(75, 'BOSS: THE SKIBRIB ABOMINATION', [g('skibAbom', 1, 3), g(T, 3, 1, 2), g(S, 4, 5, 1.5), g(ST, 10, 16, 0.5)], { boss: 'skibAbom' });

  /** Expand the script into the battle's wave format (deterministic; no RNG). */
  function build() {
    const out = [];
    for (let n = 1; n <= 75; n++) {
      const sw = W[n];
      if (!sw) throw new Error('SKIBRIB wave ' + n + ' missing');
      const entries = [];
      for (const gr of sw.groups) {
        const isBoss = !!B[gr.type];
        for (let i = 0; i < gr.n; i++) entries.push({ type: gr.type, t: +(gr.t + i * gr.gap).toFixed(2), lane: 0, hpMult: gr.hp, boss: isBoss || undefined });
      }
      entries.sort((a, b) => a.t - b.t);
      const last = entries.length ? entries[entries.length - 1].t : 0;
      const bonus = Math.round((60 + 12 * n) * (sw.bonusMul == null ? 1 : sw.bonusMul));
      out.push({
        n, theme: 'skibrib', label: sw.name, mutator: null, boss: sw.boss || null, entries, duration: last, bonus, elite: 0,
        threat: entries.reduce((s, e) => s + (e.boss ? 0 : (E[e.type].threat || 0)), 0),
        msg: sw.msg || null, clearMsg: sw.clear || null, intro: !!sw.intro, fakeEnd: !!sw.fakeEnd,
      });
    }
    return out;
  }
  MAP.script = build;

  JJK.Skibrib = {
    SCRIPT: W,
    ENEMIES: MAP.enemies,
    BOSSES: ['skibPrime', 'skibDemon', 'skibKing', 'skibAbom'],
    DEATH_MESSAGES: [
      'SKILL ISSUE', 'NICE TRY 💀', 'THE TROLLS HAVE WON.', 'WAVE 1 MISSED YOU.', 'THE OWNER EXPECTED THIS.',
      'SO CLOSE. ANYWAY, BACK TO WAVE 1.', '99% OF SKIBRIB PLAYERS QUIT BEFORE THE WINNING RUN.',
    ],
    /** Story text keyed by wave for the UI. */
    ACTS: [[1, 'THIS IS ALREADY BAD'], [11, 'WHY DID I CLICK THIS?'], [21, 'THIS ISN\'T FUNNY ANYMORE'], [30, 'BOSS 1: THE WARNING'], [31, 'WAIT THERE\'S MORE?'], [41, 'THE SUFFERING ARC'], [50, 'BOSS 2: THE RUN KILLER'], [51, 'ABSOLUTE NONSENSE'], [61, 'THE OWNER HATES YOU'], [65, 'THE WAVE PEOPLE HATE'], [70, 'THE END?'], [71, 'THE FINAL GAUNTLET'], [75, 'THE FINAL SKIBRIB ABOMINATION']],
    act(n) { let a = ''; for (const [w0, name] of this.ACTS) if (n >= w0) a = name; return a; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
