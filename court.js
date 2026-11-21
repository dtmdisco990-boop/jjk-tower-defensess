/* RISE OF JAHJUAN: The Court of Nine Reflections. Pure data: the map, the 20 authored benches, routes, docket tables,
   the nine phases, the four Measures and every court constant as named data. Logic lives in sim/court-ledger.js and sim/court-sim.js.
   Nothing here touches JJK.MapOrder, JJK.BossOrder, JJK.CharacterOrder or Missions. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Balance } = JJK;

  // ------------------------------------------------------------------ constants (every number in the spec, by name)
  const C = {
    LEAD: 360,                 // every law is disclosed at least this many ticks before it acts
    READING: 1920,             // ticks per reading / Measure
    TRANSITION: 240,           // untargetable glide between phases
    PACKET2: 600,              // second packet of a reading
    LETTER_GAP: 48,            // ticks between letters of a packet
    PREP_PACKETS: [0, 480, 960, 1440, 1920],
    INTERMISSION: 360,         // startWave rejected before, auto-start exactly at
    VULN: [960, 1560], BELL: [480, 720], DEBT_SHIFT: 120, DEBT_CAP: 2, ADJOURN: [1200, 1440],
    MITIGATION: 0.25,
    FORK_PX: 1152, GATE_PX: 1856, ROUTE_PX: 2112,
    LOOP_TICKS: 1440, LOOP_PX: 1408,
    BUDGET: 240, BUDGET_WINDOW: 1440, FX: 1024,
    LINK_PX: 128, WITNESS_MUL: 0.70, RELINK: 120, BINDING: 180, PERJURY_PX: 160, PERJURER_DELAY: 96, CONTEMPT_SHIELD: 0.25,
    LEDGER: 720, RED_MUL: 0.65, APPELLATE_SHARE: 0.68, APPELLATE_MUL: 0.55, MINORITY_LIFT: 0.0075,
    TRUE_NORM: 0.035, TRUE_CAP: 0.01,
    SUBJUDICE: 720, ESCHEAT: 0.5, CONVEYANCE: 360, CONVEYANCE_SHARE: 0.5,
    WARRANT_DISABLE: 210, WARRANT_SHOW: 180, ENBANC_SHOW: 240, ENBANC_DISABLE: 270, STAGGER: 90,
    QUORUM: 0.015, QUORUM_EXHAUSTED: 0.03,
    THETA_BASE: 0.04, THETA_STEP: 0.01, THETA_CAP: 0.08, HALF: 0.5, HALF_TAINTED: 0.625,
    NARROW: 0.02, NARROW_WIN: 360, CONTRA: 0.01, SPATIAL: 0.02, FOURTH_CHAIR: 0.01,
    HOLDOVER: 0.75, HOLDOVER_TICKS: 720,
    LIST_RHO: 0.30, DOWNHILL: 0.12,
    SUB_RANGE: 0.75, SUB_SPD: 0.80, WAKE_ARMOR: 0.15, WAKE_CURSED: 1.15,
    GLARE: 0.50, GLARE_TWIN: 0.35, BLACK_INDEX: 0.80,
    ARTICLE: 180, STRIKE: 90, RECITATION: 1440, COURT_RISES: [1440, 1560], LAST_WORD: [1560, 1920], HABEAS_D: [1740, 1920],
    // Tuned per spec 13.D (see docs/COURT-EVIDENCE.md, tuning log): stated [4,4,5,5,5,6,6,6,7] left every phase HP-bound for the
    // clean profile (~2,300 HP removed per reading); this band (0.30-0.38 of stated all clear) lets the proofs, not HP, decide.
    INTEGRITY: [1.3, 1.3, 1.6, 1.6, 1.6, 2.0, 2.0, 2.0, 2.3],
    INTEGRITY_STATED: [4, 4, 5, 5, 5, 6, 6, 6, 7],
    MEASURE_FLOOR: [0.65, 0.30, 0.10, 0.03], MEASURE_CHECK: [0.75, 0.40, 0.15],
    ESCORT_WAVE: 12, BOSS_SIZE: 46, CC_RESIST: 0.65,
    START_YEN: 620, LIVES: 12,
  };

  // ------------------------------------------------------------------ geometry
  const T = Balance.TILE, FY = Balance.FIELD_Y;
  const tx = (c) => (c + 0.5) * T, ty = (r) => FY + (r + 0.5) * T;
  const W_IN = [[-1, 4], [2, 4]];
  const N1 = [[2, 1], [8, 1], [8, 4]], S1 = [[2, 7], [8, 7], [8, 4]];
  const N2 = [[11, 4], [11, 1], [16, 1], [16, 4]], S2 = [[11, 4], [11, 7], [16, 7], [16, 4]];
  const OUT = [[20, 4]];
  const route = (a, b) => W_IN.concat(a, b, OUT);
  const ROUTES = { NN: route(N1, N2), NS: route(N1, S2), SN: route(S1, N2), SS: route(S1, S2) };
  const LANES = ['NN', 'NS', 'SN', 'SS'];
  const AIR = [[[-1, 0], [7, 3], [13, 3], [20, 4]], [[-1, 8], [7, 5], [13, 5], [20, 4]]]; // 0 Upper (North), 1 Lower (South)

  // the 20 authored benches; district, type, North/South and West/East weight sides
  const BENCH = [
    [3, 2, 'G', 'NW'], [5, 2, 'E', 'NW'], [7, 2, 'G', 'NW'],
    [3, 6, 'G', 'SW'], [5, 6, 'E', 'SW'], [7, 6, 'G', 'SW'],
    [12, 2, 'G', 'NE'], [14, 2, 'E', 'NE'], [15, 2, 'G', 'NE'],
    [12, 6, 'G', 'SE'], [14, 6, 'E', 'SE'], [15, 6, 'G', 'SE'],
    [9, 3, 'G', 'C'], [9, 5, 'G', 'C'], [10, 3, 'G', 'C'], [10, 5, 'G', 'C'],
    [17, 3, 'G', 'E'], [17, 5, 'G', 'E'], [18, 3, 'G', 'E'], [18, 5, 'G', 'E'],
  ].map(([c, r, type, district]) => ({ c, r, type, district, ns: r < 4 ? 'N' : 'S', we: c <= 9 ? 'W' : 'E' }));

  const GALLERIES = ['NW', 'SW', 'NE', 'SE'];
  const DISTRICTS = ['NW', 'SW', 'NE', 'SE', 'C', 'E'];
  const GALLERY = {
    NW: { ns: 'N', we: 'W', corridor: { row: 1, c0: 2, c1: 8 }, row: 2 }, SW: { ns: 'S', we: 'W', corridor: { row: 7, c0: 2, c1: 8 }, row: 6 },
    NE: { ns: 'N', we: 'E', corridor: { row: 1, c0: 11, c1: 16 }, row: 2 }, SE: { ns: 'S', we: 'E', corridor: { row: 7, c0: 11, c1: 16 }, row: 6 },
  };
  const CORRIDORS = {
    NW: GALLERY.NW.corridor, SW: GALLERY.SW.corridor, NE: GALLERY.NE.corridor, SE: GALLERY.SE.corridor,
    C: { row: 4, c0: 8, c1: 11 }, EXIT: { row: 4, c0: 16, c1: 20 },
  };
  // Mirror Monolith spans along y = ty(4) (tile-centre coordinates)
  const SPANS = { WO: [3.5, 5.5], EO: [13.5, 15.5], WI: [5.5, 7.5], EI: [11.5, 13.5] };
  // monolith state when each phase BEGINS: 1 = single, 2 = twin-layer
  const MONOLITHS = [
    {}, { WO: 1 }, { WO: 1, EO: 1 }, { WO: 1, EO: 1, WI: 1 }, { WO: 1, EO: 1, WI: 1, EI: 1 },
    { WO: 2, EO: 1, WI: 1, EI: 1 }, { WO: 2, EO: 2, WI: 1, EI: 1 }, { WO: 2, EO: 2, WI: 2, EI: 2 }, { WO: 2, EO: 2, WI: 2, EI: 2 },
  ];
  // procession rectangle (5,3) -> (14,3) -> (14,5) -> (5,5) -> (5,3), clockwise on screen
  const LOOP = [[5, 3], [14, 3], [14, 5], [5, 5], [5, 3]];

  // ------------------------------------------------------------------ the docket
  const LETTER = { W: 'wisp', K: 'skitter', B: 'brute', A: 'wraith', S: 'shell', L: 'leech', G: 'aegis', T: 'twin', H: 'hexer' };
  // Preparation Waves: score + the laws each one rehearses (wave-local ticks)
  const PREP = [
    { n: 1, score: 'WWK WWK', note: 'Observe both first galleries. No law.' },
    { n: 2, score: 'BWW KKW BWW', note: 'A lead brute pulls first while runners trail.' },
    { n: 3, score: 'WAW KAK WWA', note: 'First Air Dockets; trajectories are previewed before the wave.' },
    { n: 4, score: 'SWW BKK SWW', note: 'Armor versus runners: physical versus cursed coverage.' },
    { n: 5, score: 'BWWK KAA BWWK', note: 'First Iron Switch: Packet 2 Countermarch, announced at tick 120.', routes: { 2: { order: 'cross', disclose: 120 } } },
    { n: 6, score: 'SKKW BKKA SKKW', note: 'Packet 2 carries the first Witness Chain.', witness: [2] },
    { n: 7, score: 'BWKW SAKA LKKW SAKA', note: 'Leech. Sealed Bench on NW and Flood the Well on C for [720, 1200). First Specular Inversion on the Crossing pads.',
      laws: [{ kind: 'sealedBench', gallery: 'NW', disclose: 360, a: 720, b: 1200 }, { kind: 'flood', zone: 'C', disclose: 360, a: 720, b: 1200, tutorial: 'specular' }] },
    { n: 8, score: 'BKKW GKKA TKKW SKKA', note: 'Aegis and twin. Witnesses in Packets 1 and 3. Packet 3 Countermarch (announced 600).', witness: [1, 3], routes: { 3: { order: 'cross', disclose: 600 } } },
    { n: 9, score: 'SBAK HAAK SBAK GAAK', note: 'Hexer. At 720 the Court samples [0, 720) and announces Red Precedent plus Appellate Parity for [1080, 1440). First Weighing.',
      weigh: true, laws: [{ kind: 'redPrecedent', disclose: 720, a: 1080, b: 1440, escorts: true }, { kind: 'appellate', disclose: 720, a: 1080, b: 1440, escorts: true }] },
    { n: 10, score: 'BKWK SAKA TKKL HAKA', note: 'Packets 2 and 4 cross. Packet 2 has a Witness. Packet 3 is the first Perjury Trap.', weigh: true,
      witness: [2], perjury: [3], routes: { 2: { order: 'cross', disclose: 0 }, 4: { order: 'cross', disclose: 0 } } },
    { n: 11, score: 'SBGK HKAK SBLK TGAH', note: 'At 600: Sealed Bench on the highest-capital gallery and Undertow on the North Ground pads for [960, 1440); Gag Order [960, 1320). Packet 3 is routed by Forum.',
      weigh: true, routes: { 3: { order: 'forum' } },
      laws: [{ kind: 'sealedBench', disclose: 600, a: 960, b: 1440 }, { kind: 'flood', zone: 'NPADS', disclose: 600, a: 960, b: 1440 }, { kind: 'gag', disclose: 600, a: 960, b: 1320 }] },
    { n: 12, score: 'BSHK AKGA TLKK AHKA SWGH', note: 'Dress rehearsal. Witnesses in Packets 1 and 5, Perjury Trap on 3, Packet 2 crosses, Packet 4 by Forum. At 1080: Red Precedent + Appellate Parity for [1440, 1800).',
      weigh: true, witness: [1, 5], perjury: [3], routes: { 2: { order: 'cross', disclose: 0 }, 4: { order: 'forum' } },
      laws: [{ kind: 'redPrecedent', disclose: 1080, a: 1440, b: 1800, escorts: true }, { kind: 'appellate', disclose: 1080, a: 1440, b: 1800, escorts: true }] },
  ];

  // The nine phases. Laws use reading-local ticks. route: packet 2's bridge order (per reading for Phase VIII).
  const PHASES = [
    null,
    { n: 1, name: 'The Clerk With No Face', start: 0, esc: ['BKW', 'SKA'], route: 'straight',
      verdict: 'Exhaust Integrity and notarize 1 Northern seal (NW or NE).', seals: 'north',
      laws: [{ kind: 'flood', zone: 'C', disclose: 600, a: 960, b: 1440 }] },
    { n: 2, name: 'The Bailiff Beneath the Water', start: 1, esc: ['BKW', 'SKA'], route: 'cross', witnessReq: true,
      verdict: 'Exhaust Integrity, notarize 1 Southern seal (SW or SE), and kill a True Witness before the Exit Gate.', seals: 'south',
      laws: [{ kind: 'warrant', disclose: 360, a: 720 }, { kind: 'habeas', disclose: 600, a: 960, b: 1320 }] },
    { n: 3, name: 'The Walking Archive', start: 0, esc: ['BGK', 'SKLA'], route: 'straight',
      verdict: 'Exhaust Integrity and notarize a West seal, then on a strictly later tick an East seal.', seals: 'venue',
      laws: [{ kind: 'redPrecedent', disclose: 600, a: 960, b: 1320 }, { kind: 'appellate', disclose: 600, a: 960, b: 1320 }, { kind: 'attainder', disclose: 960, a: 1320, b: 1560 }] },
    { n: 4, name: 'The Bell That Borrows Tomorrow', start: 1, esc: ['BGK', 'SKLA'], route: 'cross', bell: true, adjourn: true,
      verdict: 'Exhaust Integrity and complete Double Entry (a North and a South seal) in one reading, with a gallery hit in the un-adjourned full-damage window.', seals: 'double',
      laws: [{ kind: 'flood', zone: 'SPADS', disclose: 0, a: 360, b: 840 }, { kind: 'warrant', disclose: 720, a: 1080 }, { kind: 'remand', disclose: 480, a: 840 }] },
    { n: 5, name: 'The Minister of Empty Seats', start: 0, esc: ['BHKW', 'STKKA'], route: 'cross', perjury: true, priority: true,
      verdict: 'Exhaust Integrity and notarize 1 West and 1 East seal in either order.', seals: 'westEast',
      laws: [{ kind: 'sealedBench', disclose: 600, a: 960, b: 1440 }, { kind: 'blackIndex', disclose: 0, a: 360, b: 720 }, { kind: 'gag', disclose: 0, a: 360, b: 720 }] },
    { n: 6, name: 'The Judge With Two Shadows', start: 1, esc: ['BHKW', 'STKA'], route: 'forum', mirrorDocket: true, cleanTestimony: true,
      verdict: 'Exhaust Integrity, achieve Narrow Majority in [960, 1560), and earn clean Testimony in the same reading.', seals: 'narrow',
      laws: [{ kind: 'redPrecedent', disclose: 600, a: 960, b: 1320 }, { kind: 'appellate', disclose: 600, a: 960, b: 1320 }, { kind: 'enBanc', disclose: 480, a: 840 },
        { kind: 'habeas', disclose: 240, a: 600, b: 960 }, { kind: 'habeas', disclose: 240, a: 1320, b: 1560 }, { kind: 'attainder', disclose: 600, a: 960, b: 1320 }] },
    { n: 7, name: 'The Court Walks', start: 0, esc: ['BGHK', 'SLKKA'], route: 'forum', perjury: true, inheritance: true,
      verdict: 'Exhaust Integrity and notarize 2 galleries on opposite sides of the midline, with a gallery hit landed locally under Writ of Distance.', seals: 'opposite',
      laws: [{ kind: 'recusal', disclose: 600, a: 960, b: 1320 }, { kind: 'writ', disclose: 600, a: 960, b: 1320 }, { kind: 'warrant', disclose: 960, a: 1320 },
        { kind: 'flood', zone: 'C', disclose: 0, a: 360, b: 1320 }, { kind: 'remand', disclose: 960, a: 1320 }] },
    { n: 8, name: 'The Unanimous King', start: 1, esc: ['BGHK', 'SLKKA'], route: ['straight', 'cross', 'forum'], perjury: true, bell: true, counterseal: true,
      verdict: 'Exhaust Integrity and notarize three sequential signatures: West, then East, then a third gallery distinct from both.', seals: 'sequence',
      laws: [{ kind: 'blackIndex', disclose: 0, a: 360, b: 720 }, { kind: 'appellate', disclose: 600, a: 960, b: 1320 }, { kind: 'enBanc', disclose: 600, a: 960 },
        { kind: 'gag', disclose: 0, a: 360, b: 720 }, { kind: 'attainder', disclose: 600, a: 960, b: 1320 }] },
    { n: 9, name: 'The Empty Ninth Chair', start: 0 },
  ];

  // Phase IX: the four Measures (Measure-local ticks)
  const MEASURES = [
    { id: 'A', name: 'Record', check: 0.75, floor: 0.65,
      esc: [{ s: 'BGK', half: 'N' }, { s: 'SKAH', half: 'S', order: 'cross', witness: true }],
      laws: [{ kind: 'flood', zone: 'C', disclose: 0, a: 360, b: 1320 }, { kind: 'appellate', disclose: 600, a: 960, b: 1320 }] },
    { id: 'B', name: 'Contradict', check: 0.40, floor: 0.30, bell: true,
      esc: [{ s: 'TKL', half: 'S' }, { s: 'SKKA', half: 'N', airHalf: 'S', perjury: true }],
      laws: [{ kind: 'sealedBench', disclose: 0, a: 360, b: 840 }, { kind: 'recusal', disclose: 600, a: 960, b: 1320, onASigner: true },
        { kind: 'flood', zone: 'AROW', disclose: 600, a: 960, b: 1560 }, { kind: 'warrant', disclose: 720, a: 1080 }] },
    { id: 'C', name: 'Ratify', check: 0.15, floor: 0.10, adjourn: true,
      esc: [{ s: 'BHK', half: 'N', priority: true }, { s: 'GSKA', half: 'S', order: 'forum', witness: true }],
      laws: [{ kind: 'redPrecedent', disclose: 0, a: 360, b: 720, fromMeasure: 'B' }, { kind: 'blackIndex', disclose: 0, a: 360, b: 720 }, { kind: 'gag', disclose: 0, a: 360, b: 720 },
        { kind: 'enBanc', disclose: 600, a: 960 }, { kind: 'writ', disclose: 600, a: 1200, b: 1560 }, { kind: 'attainder', disclose: 600, a: 960, b: 1320 }] },
    { id: 'D', name: 'Recite and Execute', check: null, floor: 0.03,
      esc: [{ s: 'TKH', half: 'S' }, { s: 'SKA', half: 'N', order: 'forum', witness: true }],
      laws: [{ kind: 'warrant', disclose: 180, a: 540 }, { kind: 'warrant', disclose: 1140, a: 1500 }, { kind: 'habeas', disclose: 1380, a: 1740, b: 1920 }] },
  ];

  const CD = (JJK.CourtData = {
    C, ROUTES, LANES, AIR, BENCH, GALLERIES, DISTRICTS, GALLERY, CORRIDORS, SPANS, MONOLITHS, LOOP, LETTER, PREP, PHASES, MEASURES,
    tx, ty,
    benchAt(c, r) { for (const b of BENCH) if (b.c === c && b.r === r) return b; return null; },
    integrityUnit() { return Math.round(JJK.Enemies.brute.hp * Balance.hpScale(13)); },
    phaseMax(iu, n) { return Math.ceil(iu * C.INTEGRITY[n - 1]); },
    theta(cit) { return Math.min(C.THETA_CAP, C.THETA_BASE + C.THETA_STEP * cit); },
    DEATH: 'The Court has ruled against the defense.',
  });

  // ------------------------------------------------------------------ registrations (no order arrays are touched)
  const waves = () => {
    const out = [];
    for (const w of PREP) out.push({ n: w.n, label: 'Docket ' + w.n, theme: 'court', entries: [], bonus: 55 + 16 * w.n, mutator: null, boss: null, elite: 0, court: w });
    out.push({ n: 13, label: 'THE TRIAL OF JAHJUAN', theme: 'court', entries: [], bonus: 0, mutator: null, boss: 'jahjuanBoss', elite: 0, court: { n: 13, trial: true } });
    return out;
  };
  JJK.Maps.court_of_nine = {
    id: 'court_of_nine', order: 95, challenge: true, courtChallenge: true, name: 'The Court of Nine Reflections', short: 'COURT', waves: 13,
    recommendedLevel: 1, desc: 'Every verdict is entered into the Standing Record and read back to you.',
    twist: 'Four equal routes, twenty authored benches, a sovereign who audits yesterday\'s winning answer and announces every law six seconds ahead.',
    startYen: C.START_YEN, rewardScale: 1, bg: 'court_of_nine', diffLock: 'court',
    paths: LANES.map((k) => ROUTES[k]), air: AIR, elevated: [], blocked: [],
    slots: BENCH.map((b) => ({ c: b.c, r: b.r, type: b.type, district: b.district })),
    waveCfg: { hpMult: 1 }, unlock: { level: 1, map: null }, enemies: JJK.EnemyOrder.slice(), boss: 'jahjuanBoss',
    special: { id: 'court', label: 'COURT', desc: 'One law, one court.', rules: {} },
    script: waves,
  };
  Balance.difficulty.court = {
    id: 'court', label: 'COURT', hpMult: 1, countMult: 1, startYenMult: 1, baseHp: C.LIVES, yenMult: 1, sellRefund: 0.7, speedMult: 1,
    rewardMult: 2.0, eliteFrom: 1, eliteBoost: 1, gemsRepeat: 0, gemsFirst: 0, hidden: true,
    desc: 'The only difficulty: 12 lives, 620 Yen, native prices and refunds.',
  };
  JJK.Bosses.jahjuanBoss = {
    id: 'jahjuanBoss', name: 'JAHJUAN', title: 'Chief Justice of the Nine Reflections', hp: 1, speed: 0, armor: 0, leak: 999,
    size: C.BOSS_SIZE, color: '#e8c25a', ai: 'jahjuanBoss', knockImmune: true, ccResist: C.CC_RESIST, drops: [], rewardCoins: 0, yen: 0,
    desc: 'He audits what your defense has already done, codifies a statute against it, and announces the exact tick six seconds ahead. Then he remembers.',
    court: true,
  };
})(typeof window !== 'undefined' ? window : globalThis);
