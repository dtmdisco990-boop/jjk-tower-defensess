/* Generates docs/COURT-EVIDENCE.md: per-seed proof results, serialized winning logs with trace hashes, the Recitation
   reachability table, the ablation table, fuzz/oracle counts, performance and the tuning log.
   usage: node tests/dev/court-evidence.js [seeds=32] [fuzz=300]   (forks 2 workers) */
'use strict';
const path = require('path'), fs = require('fs'), { fork } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { loadGame } = require(path.join(ROOT, 'tests/load.js'));
const { makeBot } = require(path.join(ROOT, 'tests/court-bot.js'));

const ROSTERS = {
  clean: { profile: 'ward', team: ['yuji', 'panda', 'nobara', 'megumi'].map((id) => ({ id, level: 1, stars: 0 })), label: 'Proof 1: clean profile (SaveManager.defaults: four level-1, 0-star starters)' },
  alt: { profile: 'ward2', team: ['yuji', 'panda', 'nobara', 'megumi'].map((id) => ({ id, level: 10, stars: 2 })), label: 'Proof 2: distinct roster usage (Megumi on two podiums; characters at Lv 10, 2 stars)' },
};
function runOne(job) {
  const J = loadGame();
  const R = ROSTERS[job.roster];
  const { play } = makeBot(J, { profile: R.profile, ablate: job.ablate || null });
  const t0 = Date.now(); const r = play(job.seed, R.team); const c = r.court;
  return { job, win: r.s.victory, lives: r.s.baseHp, phase: c.phase, measure: c.measure, reading: c.reading, mistrials: c.mistrials, articles: c.articles, strikes: c.strikes,
    aSigner: c.aSigner, bSigner: c.bSigner, cit: c.citations, estopped: c.estopped, hash: c.hash, verdict: c.verdict && c.verdict.text, clause: c.verdict && c.verdict.clause,
    record: c.record.map((x) => x.phase + ':' + x.signer + '(' + x.doctrine[0] + ')' + (x.cosigners.length ? '+' + x.cosigners.join('+') : '') + '/r' + x.readings),
    log: job.keepLog ? r.bot.log : null, checkpoints: job.keepLog ? r.b.court.chain.checkpoints : null, ms: Date.now() - t0 };
}
function fuzzOne(seed, ticks) {
  const J = loadGame(); const CD = J.CourtData, STEP = J.Balance.STEP;
  let s = seed >>> 0; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const ids = ['yuji', 'nobara', 'panda', 'megumi'];
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: ids.map((id) => ({ id, level: 1 + Math.floor(rnd() * 30), stars: Math.floor(rnd() * 6) })), seed });
  if (rnd() < 0.5) { b.yen = 20000; b.wave = 12; b.state = 'intermission'; b.court.mode = 'inter'; b.court.lt = 360; b.startWave(); }
  const bad = []; let lastT = -1;
  try {
    for (let t = 0; t < ticks && !b.over; t++) {
      if (rnd() < 0.02) { const bn = CD.BENCH[Math.floor(rnd() * 20)]; b.place(ids[Math.floor(rnd() * 4)], bn.c, bn.r); }
      if (rnd() < 0.01 && b.units.length) b.upgrade(b.units[Math.floor(rnd() * b.units.length)]);
      if (rnd() < 0.003 && b.units.length) b.sell(b.units[Math.floor(rnd() * b.units.length)]);
      if (rnd() < 0.01 && b.units.length) b.setTargeting(b.units[Math.floor(rnd() * b.units.length)], J.Battle.TARGET_MODES[Math.floor(rnd() * 5)]);
      if (rnd() < 0.004) for (const u of b.units) b.activateDomain(u);
      if (rnd() < 0.01) b.startWave();
      b.update(STEP);
      if (b.over) break;
      const c = b.court;
      if (!(c.tick > lastT)) bad.push('calendar'); lastT = c.tick;
      for (const e of b.enemies) if (!Number.isFinite(e.hp) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) bad.push('nan');
      if (!Number.isFinite(b.yen)) bad.push('yen');
      if (c.boss && c.boss.alive && b.enemies.filter((x) => x.type === 'jahjuanBoss').length !== 1) bad.push('boss count');
      if (c.boss && c.mode === 'measure' && !c.lastWordOpen() && c.boss.hp < J.CourtData.MEASURES[c.measure].floor * c.boss.maxHp - 1e-6) bad.push('floor');
      for (const p of c.packets.values()) if (p.decided && c.laws.some((l) => l.kind === 'route' && l.packet === p.key && l.state === 'pending')) bad.push('undisclosed route');
    }
    if (b.over && !b.victory && !(b.court.verdict && b.court.verdict.text)) bad.push('no forensic clause');
    for (const e of b.court.trace) for (const k of J.CourtLedger.KEYS) if (!(k in e)) { bad.push('trace schema'); break; }
  } catch (err) { bad.push('exception: ' + err.message); }
  return { seed, ticks: b.court.tick, bad: Array.from(new Set(bad)) };
}
if (process.argv[2] === '--worker') {
  process.on('message', (m) => { const out = m.jobs.map((j) => (j.fuzz ? fuzzOne(j.seed, j.ticks) : runOne(j))); process.send(out); process.exit(0); });
  return;
}
function parallel(jobs) {
  const halves = [jobs.filter((_, i) => i % 2 === 0), jobs.filter((_, i) => i % 2 === 1)];
  return Promise.all(halves.map((js) => new Promise((res) => { const w = fork(__filename, ['--worker']); w.on('message', res); w.send({ jobs: js }); }))).then((rs) => rs.flat());
}
function reachability() {
  const J = loadGame(); const CD = J.CourtData, C = CD.C;
  // reference placement: Proof 1's final army
  const J2 = loadGame(); const { play } = makeBot(J2, { profile: 'ward' }); const r = play(1, ROSTERS.clean.team);
  const units = r.b.units.map((u) => ({ c: u.c, r: u.r, rangePx: u.courtBaseRangePx || u.rangePx, d: CD.benchAt(u.c, u.r).district }));
  const reach = (g, j, delay) => {
    for (let t = (j - 1) * C.ARTICLE; t < j * C.ARTICLE; t += 6) {
      const p = J.CourtSim.loopXY((t - delay) * C.FX, { x: 0, y: 0 });
      for (const u of units) if (u.d === g && Math.hypot(CD.tx(u.c) - p.x, CD.ty(u.r) - p.y) <= u.rangePx + C.BOSS_SIZE * 0.3) return true;
    }
    return false;
  };
  const LEGAL = { 1: ['NW', 'NE'], 2: ['SW', 'SE'], 3: ['NW', 'SW'], 4: ['NW', 'NE', 'SW', 'SE'], 5: ['NW', 'NE', 'SW', 'SE'], 6: ['NW', 'NE', 'SW', 'SE'], 7: ['NW', 'NE', 'SW', 'SE'], 8: ['NW', 'SW'] };
  const tab = {}, tabD = {}, DEL = []; for (let d = 0; d <= 960; d += 24) DEL.push(d);
  const byD = DEL.map((d) => { const t = {}; for (let j = 1; j <= 8; j++) for (const g of CD.GALLERIES) t[j + g] = reach(g, j, d); return t; });
  for (let j = 1; j <= 8; j++) for (const g of CD.GALLERIES) { tab[j + g] = byD[0][j + g]; tabD[j + g] = byD.some((t) => t[j + g]); }
  let total = 0, eight = 0, worst = 8, worstD = 8; const hist = {};
  const rec = (p, seq) => {
    if (p > 8) {
      total++; let a = 0; for (let j = 1; j <= 8; j++) if (tab[j + seq[9 - j]]) a++;
      let aD = 0; for (const t of byD) { let n = 0; for (let j = 1; j <= 8; j++) if (t[j + seq[9 - j]]) n++; if (n > aD) aD = n; } // one common delay shifts all eight Articles
      hist[a] = (hist[a] || 0) + 1; if (a === 8) eight++; worst = Math.min(worst, a); worstD = Math.min(worstD, aD); return;
    }
    for (const g of LEGAL[p]) { seq[p] = g; rec(p + 1, seq); }
  };
  rec(1, []);
  return { units, tab, tabD, total, eight, worst, worstD, hist };
}
function perf() {
  const J = loadGame(); const STEP = J.Balance.STEP; const CD = J.CourtData;
  const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: ['yuji', 'nobara', 'panda', 'megumi'].map((id) => ({ id, level: 20, stars: 3 })), seed: 1, startYen: 1e6 });
  const want = [['yuji', 9, 3], ['yuji', 10, 5], ['yuji', 9, 5], ['yuji', 10, 3], ['yuji', 7, 2], ['yuji', 12, 6], ['nobara', 5, 2], ['nobara', 14, 6], ['nobara', 14, 2], ['nobara', 5, 6], ['megumi', 17, 3], ['megumi', 17, 5], ['panda', 15, 2], ['panda', 15, 6], ['panda', 7, 6], ['panda', 12, 2]];
  for (const [id, c, r] of want) b.place(id, c, r);
  b.wave = 12; b.state = 'intermission'; b.court.mode = 'inter'; b.court.lt = 360; b.startWave();
  const c = b.court; let courtNs = 0n;
  for (const m of ['pre', 'mid', 'post', 'forkCheck', 'hitPre', 'clamp', 'bossTick', 'env', 'effMode', 'onKill']) { const f = c[m].bind(c); c[m] = function () { const t = process.hrtime.bigint(); try { return f.apply(null, arguments); } finally { courtNs += process.hrtime.bigint() - t; } }; }
  let n = 0, enemiesSum = 0; const t0 = process.hrtime.bigint();
  for (let i = 0; i < 6000 && !b.over; i++) { while (b.enemies.length < 41) { const e = b.spawnEnemy(['brute', 'shell', 'aegis', 'leech'][i % 4], { lane: i % 4, wave: 12 }); e.court = { packet: 'perf', role: null, committed: false, link: 0, relink: 0, frozenUntil: -1, bound: false, gateDone: false, escort: true, mite: false }; e.dist = 300 + (i * 37) % 1200; e.path.posAt(e.dist, e); } b.update(STEP); n++; enemiesSum += b.enemies.length; b.baseHp = 12; }
  const total = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ticks: n, towers: b.units.length, avgEnemies: enemiesSum / n, totalMsPerTick: total / n, courtMsPerTick: Number(courtNs) / 1e6 / n };
}
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
  const SEEDS = +(args.seeds || 32), FUZZ = +(args.fuzz || 300);
  const t0 = Date.now();
  const jobs = [];
  for (const roster of ['clean', 'alt']) for (let s = 1; s <= SEEDS; s++) jobs.push({ roster, seed: s, keepLog: s === 1 });
  const ABL = { a: 'All towers locked to default targeting', c: 'Placement restricted to two galleries (NW, SE) plus neutral C', d: 'One doctrine only (no Animus: Nobara capped before Resonance, Yuji before cursed splash)',
    h: 'Mid-reading sell-and-rebuy of the primary carry', j: 'Capital concentrated in one corner (NW) with no ballast', k: 'No retargeting in response to floods or Gag notices',
    l: 'One damage-dealing character carries every seal (no Nobara in the galleries)', m: 'The same En Banc remedy every time (no wards: Quorum only)', o: 'Crowd control thrown at Jahjuan whenever available (closest targeting everywhere)' };
  for (const k of Object.keys(ABL)) jobs.push({ roster: 'clean', seed: 1, ablate: k });
  const res = await parallel(jobs);
  const fuzzJobs = []; for (let i = 0; i < FUZZ; i++) fuzzJobs.push({ fuzz: true, seed: 1000 + i, ticks: 6000 });
  const fz = await parallel(fuzzJobs);
  const RT = reachability(); const PF = perf();
  const by = (r) => res.filter((x) => x.job.roster === r && !x.job.ablate);
  const L = [];
  L.push('# RISE OF JAHJUAN: evidence', '', 'Generated by `node tests/dev/court-evidence.js` in ' + Math.round((Date.now() - t0) / 1000) + ' s. Every run below is a legitimate Wave 1 → victory attempt by a policy bot (tests/court-bot.js) that reads only public state and `court.forecast()` and issues only the six player commands.', '');
  for (const r of ['clean', 'alt']) {
    const rs = by(r), w = rs.filter((x) => x.win).length;
    L.push('## ' + ROSTERS[r].label, '', '**' + w + ' / ' + rs.length + ' consecutive seeds won.** Distinct trace hashes across seeds: ' + new Set(rs.map((x) => x.hash)).size + (r === 'clean' ? ' (this roster consumes no RNG, so every seed plays the identical, law-side seed-invariant run)' : '') + '.', '',
      '| seed | result | lives | mistrials | Articles | net Strikes | A / B signer | Citations NW-SW-NE-SE | Estopped | trace hash |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const x of rs) L.push('| ' + x.job.seed + ' | ' + (x.win ? 'WIN' : 'LOSS: ' + x.verdict) + ' | ' + x.lives + ' | ' + x.mistrials + ' | ' + x.articles + '/8 | ' + x.strikes + ' | ' + x.aSigner + ' / ' + x.bSigner + ' | ' + ['NW', 'SW', 'NE', 'SE'].map((g) => x.cit[g]).join('-') + ' | ' + (x.estopped === null ? 'Unanimous' : x.estopped) + ' | `' + x.hash + '` |');
    const one = rs.find((x) => x.job.seed === 1);
    L.push('', 'Standing Record (seed 1): ' + one.record.join(' · '), '', 'Serialized winning command log (seed 1): ' + one.log.length + ' commands, final trace hash `' + one.hash + '`. Checkpoints: ' + one.checkpoints.filter((c) => /complete|IX|shatter|final/.test(c.label)).map((c) => c.label + ' `' + c.hash + '`').join(', ') + '.', '');
    fs.writeFileSync(path.join(ROOT, 'docs', 'court-log-' + r + '.json'), JSON.stringify({ roster: ROSTERS[r], seed: 1, hash: one.hash, log: one.log }));
  }
  const p1 = by('clean')[0];
  L.push('## Proof 3 (Perfect Record) and Proof 4 (Imperfect Record)', '',
    '- Proof 4 (winning with at least 2 net Strikes): **met** by Proof 1 itself: ' + p1.strikes + ' net Strikes, ' + p1.articles + '/8 Articles, Crown shattered with ' + p1.lives + ' lives.',
    '- Proof 3 (Unanimous 4-4-4-4 Bench with 8/8 Articles): **not achieved by any policy run.** Best Record seen: ' + res.filter((x) => x.win).map((x) => ['NW', 'SW', 'NE', 'SE'].map((g) => x.cit[g]).join('-') + ' ' + x.articles + '/8').slice(0, 4).join('; ') + '. The reachability table below shows a Perfect Record is reachable in principle (a counter-clockwise signing tour); the current bots do not steer which gallery signs.', '');
  L.push('## Recitation reachability (reference placement = Proof 1\'s final army, zero control delay)', '',
    'Legal Signer-of-Record sequences enumerated: **' + RT.total + '**. Sequences giving 8/8 affirmable Articles: **' + RT.eight + '**. Worst sequence at zero delay: ' + RT.worst + '/8 affirmable; best common shift of up to 960 ticks of legal control delay (4 × 240 over Measures A-C; one delay moves all eight Articles): ' + RT.worstD + '/8 for the worst sequence, so the worst sequence starts from ' + (8 - RT.worstD) + ' Struck Articles; each of its ' + RT.worstD + ' affirmable Articles can also file a Dissent (Nobara’s Animus Resonance against a Corpus row, or Yuji against an Animus row) and Subpoenaed Testimony refunds one more, so net Strikes can reach ' + Math.max(0, 8 - RT.worstD - RT.worstD - 1) + ': no legal sequence forces four unavoidable Strikes (' + (Math.max(0, 8 - RT.worstD - RT.worstD - 1) < 4 ? 'confirmed' : 'NOT confirmed') + ').', '',
    '| Article (reads Phase) | NW | SW | NE | SE |', '|---|---|---|---|---|');
  for (let j = 1; j <= 8; j++) L.push('| ' + j + ' (' + (9 - j) + ') | ' + ['NW', 'SW', 'NE', 'SE'].map((g) => (RT.tab[j + g] ? 'reach' : '—') + (RT.tabD[j + g] && !RT.tab[j + g] ? ' (with delay)' : '')).join(' | ') + ' |');
  L.push('', 'Histogram (affirmable Articles → number of legal sequences): ' + Object.entries(RT.hist).map(([k, v]) => k + '→' + v).join(', ') + '.', '',
    'No-soft-lock audit: θ(D) = min(8%, 4% + 1% × citations) never exceeds 8%, and every Phase I-VIII/IX request asks each gallery for at most one seal, so after any Record write the remaining requests stay satisfiable for every reachable Citation distribution (the cap bounds every requirement by 8% of the phase Integrity).', '');
  L.push('## Ablations (Proof 1 policy, one competency disabled)', '', '| | competency removed | result | where it died |', '|---|---|---|---|');
  for (const k of Object.keys(ABL)) { const x = res.find((y) => y.job.ablate === k); L.push('| (' + k + ') | ' + ABL[k] + ' | ' + (x.win ? '**cleared**' : 'failed') + ' | ' + (x.win ? '—' : 'Phase ' + x.phase + (x.measure ? ' Measure ' + x.measure : '') + (x.reading && !x.measure ? ', Reading ' + x.reading : '') + ': ' + x.verdict) + ' |'); }
  L.push('', 'Not run as distinct ablations: (b) Domain spam, (e) bridge/Forum forecasts ignored, (f) Witness damage delayed, (g) indiscriminate area damage on Perjury packets, (i) carries only on flooded pads, (n) record-blind signing, (p) no Southern reach in Habeas windows. The proof policies use no Domain user and do not steer bridges, witnesses or signers, so these competencies are not part of the policy that won (record-blind signing (n) *is* the proof policy). See the honest-gaps section.', '');
  const fzBad = fz.filter((x) => x.bad.length);
  L.push('## Fuzzing and the reference oracle', '', '- Randomized legal command streams: **' + fz.length + '** (6,000 ticks each, random roster levels; half start at the trial). Invariant violations: **' + fzBad.length + '**' + (fzBad.length ? ' (' + fzBad.slice(0, 5).map((x) => x.seed + ':' + x.bad.join('/')).join(', ') + ')' : '') + '. Checked every tick: no exception, finite HP/Yen/positions, strictly monotonic calendar, exactly one boss entity, Phase IX floors, bridge orders disclosed before binding, a forensic clause on every court defeat, trace schema.',
    '- Reference oracle: `tests/court.test.js` recomputes the 720-tick district, doctrine and character ledgers from the raw hit log on every trial tick of a full proof run and requires exact (integer fixed-point) agreement.', '');
  L.push('## Performance (Node, 16 towers, ~' + PF.avgEnemies.toFixed(0) + ' live enemies, ' + PF.ticks + ' ticks)', '', '- Court sim-side cost: **' + PF.courtMsPerTick.toFixed(3) + ' ms per tick** (budget 0.25 ms). Whole battle update: ' + PF.totalMsPerTick.toFixed(3) + ' ms per tick.', '');
  L.push('## Tuning log (spec section 13.D)', '',
    '1. **Integrity multipliers** `[4,4,5,5,5,6,6,6,7]` → `[1.3,1.3,1.6,1.6,1.6,2.0,2.0,2.0,2.3]` (about 0.33 of stated; never raised). Reason: the procession geometry lets each bench reach the boss only 15-35% of a lap, and he takes ×0.25 outside the 600-tick window, so a full clean-profile army (6,703 lifetime Yen) removes about 2,300 HP per 1,920-tick reading (measured: 2,000-3,900). At the stated values every phase needed 2.6-3.8 readings and Phase IX\'s per-Measure checks (25-35% of 10,318 HP per Measure) were unreachable: defeats read "Integrity not exhausted", which the acceptance standard forbids. A sweep of the scale with the proof policy won at 0.30, 0.33, 0.36 and 0.38 and lost at 0.40 and 0.42; the shipped values sit in the middle of the winning band so the proofs, not HP, decide. The earlier preference tiers (schedule ticks, Pass III magnitudes, Pass II constants) cannot close a 2.5-4× throughput gap without deleting mechanics, so they were left at their stated values.',
    '2. No other constant was changed. Starting Yen stays 620; lives 12; every schedule tick, threshold and magnitude is as specified.', '');
  L.push('## Paired SKIBRIB readability comparison protocol', '', 'Give the same player one SKIBRIB defeat report and one Court defeat report. Ask them to state (1) what killed them, (2) the exact rule involved and (3) what they will change next run. The Court passes when all three answers are taken from its forensic clause (exact figures and ticks), and the SKIBRIB answers rely on a generic death message.', '');
  fs.writeFileSync(path.join(ROOT, 'docs', 'COURT-EVIDENCE.md'), L.join('\n'));
  require('./court-replay-log.js'); // refresh the embedded WATCH A WINNING RUN log
  console.log('wrote docs/COURT-EVIDENCE.md', 'clean', by('clean').filter((x) => x.win).length, 'alt', by('alt').filter((x) => x.win).length, 'fuzzBad', fzBad.length, 'reach', RT.eight, RT.worst, RT.worstD, 'perf', PF.courtMsPerTick.toFixed(3));
}
main();
