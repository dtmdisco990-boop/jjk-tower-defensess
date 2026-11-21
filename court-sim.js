/* RISE OF JAHJUAN: the headless court state machine. One Court instance per Battle on court_of_nine (never shared).
   Everything is driven by an integer court.tick; nothing compares float seconds. Hooks are called from js/sim/battle.js
   only when battle.court exists, so every legacy map runs exactly as before.
   Tick order (spec section 12): calendar(T) runs at the end of update(T-1), so player commands issued before update(T) see
   tick T's law; update(T) then spawns, runs combat (statuses/movement -> gavels -> towers), resolves deaths, credits proofs,
   takes snapshots, judges, and finally advances to T+1 and runs its calendar. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Util, Balance } = JJK;
  const CD = JJK.CourtData, C = CD.C, LG = JJK.CourtLedger;
  const TILE = Balance.TILE;
  const { tx, ty } = CD;
  const FX = C.FX, toFx = LG.toFx;
  const GAL = CD.GALLERIES, DIST = CD.DISTRICTS;
  const MODES = ['first', 'last', 'strongest', 'weakest', 'closest'];
  const MIRROR = { first: 'last', last: 'first', strongest: 'weakest', weakest: 'strongest', closest: 'closest' };
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const SENTINEL = 1e6;
  const MID_Y = ty(4), PX_PER_TICK = C.LOOP_PX / C.LOOP_TICKS;
  const isGallery = (d) => d === 'NW' || d === 'SW' || d === 'NE' || d === 'SE';
  const westOf = (g) => g === 'NW' || g === 'SW';
  const northOf = (g) => g === 'NW' || g === 'NE';
  const pct = (x) => (Math.round(x * 10000) / 100).toFixed(2) + '%';
  const sec = (t) => (t / 60).toFixed(1) + 's';

  // loop geometry (pixels) for the procession rectangle
  const LOOP_PTS = CD.LOOP.map(([c, r]) => ({ x: tx(c), y: ty(r) }));
  const LOOP_CUM = [0];
  for (let i = 1; i < LOOP_PTS.length; i++) LOOP_CUM.push(LOOP_CUM[i - 1] + Math.hypot(LOOP_PTS[i].x - LOOP_PTS[i - 1].x, LOOP_PTS[i].y - LOOP_PTS[i - 1].y));
  function loopXY(sFx, out) {
    const LEN = C.LOOP_TICKS * FX;
    let s = ((sFx % LEN) + LEN) % LEN;
    const px = (s / FX) * PX_PER_TICK;
    let i = 1; while (i < LOOP_CUM.length - 1 && LOOP_CUM[i] < px) i++;
    const a = LOOP_PTS[i - 1], b = LOOP_PTS[i], seg = LOOP_CUM[i] - LOOP_CUM[i - 1], t = seg ? (px - LOOP_CUM[i - 1]) / seg : 0;
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; return out;
  }
  const mirrorY = (y) => 2 * MID_Y - y;

  // corridor membership (enemy position inside a path corridor band)
  function inCorridor(cor, x, y) {
    if (cor.row === 4) return Math.abs(y - ty(4)) <= TILE * 0.5 && x >= tx(cor.c0) - 1 && x <= tx(cor.c1) + 1;
    // gallery corridors include their vertical legs down to the midline approach so the whole gallery floor counts
    const top = Math.min(ty(cor.row), ty(4)), bot = Math.max(ty(cor.row), ty(4));
    if (x < tx(cor.c0) - TILE * 0.5 || x > tx(cor.c1) + TILE * 0.5) return false;
    if (Math.abs(y - ty(cor.row)) <= TILE * 0.5) return true;
    const onLeg = Math.abs(x - tx(cor.c0)) <= TILE * 0.5 || Math.abs(x - tx(cor.c1)) <= TILE * 0.5;
    return onLeg && y >= top - 1 && y <= bot + 1 && Math.abs(y - ty(4)) > TILE * 0.5;
  }
  const keyOf = (c, r) => c + ',' + r;

  class Court {
    constructor(b, opts) {
      this.b = b; opts = opts || {};
      this.tick = 0;
      this.mode = 'idle'; this.lt = 0; this.n = 0; // prep wave number
      this.phase = 0; this.reading = 0; this.measure = -1; this.readingStart = 0;
      this.iu = CD.integrityUnit();
      this.trace = []; this.chain = new LG.Chain();
      this.laws = []; this.lawSeq = 1;
      this.pending = []; // pending letter spawns { at (global tick), type, lane, packet, role, half, air }
      this.packets = new Map();
      this.water = { sources: [], pad: new Map(), cor: {} };
      this.list = { ns: null, we: null }; this.listPending = null; // Scales
      this.lastWeigh = null;
      this.sales = []; this.locks = new Map();
      this.book = new LG.Ring(C.LEDGER); this.doct = new LG.Ring(C.LEDGER); this.chars = new LG.Ring(C.LEDGER); this.forum = new LG.Ring(C.LEDGER);
      this.strips = new LG.Ring(C.NARROW_WIN);
      this.budget = new LG.Budget();
      this.record = new LG.Record();
      this.remedy = null; // Remedy of Record of the previous En Banc (exhausted at the next one)
      this.boss = null; this.body = { x: tx(5), y: ty(3) }; this.sFx = 0; this.dir = 1; this.side = 'body'; this.stagger = 0;
      this.glide = null; this.bookTopLast = null;
      this.ix = null; this.ph = null; this.rd = null;
      this.verdict = null; this.shattered = false; this.cleanupStart = 0;
      this.stats = { mistrials: 0, strikes: 0, articles: 0 };
      this.forecastCache = null; this.lastReject = null;
      this.hitLog = opts.courtOracle ? [] : null;
      this._env = null;
      this.diag = 0;
      this.emit('courtOpen', { iu: this.iu });
      this.log('open', { value: this.iu });
      this.recomputeWater();
    }

    // ------------------------------------------------------------ trace / events
    log(event, f) {
      f = f || {};
      const e = {
        tick: this.tick, phase: this.phase || null, reading: this.reading || null, measure: this.measure >= 0 ? CD.MEASURES[this.measure].id : null,
        localTick: this.lt, event, district: f.district || null, doctrine: f.doctrine || null, charId: f.charId || null, uid: f.uid || null,
        snapshot: f.snapshot === undefined ? null : f.snapshot, value: f.value === undefined ? null : f.value, required: f.required === undefined ? null : f.required,
        reason: f.reason || null,
      };
      this.trace.push(e); this.chain.feed(e);
      return e;
    }
    emit(type, data) { this.b.events.emit(type, Object.assign({ court: this }, data || {})); }
    hash() { return this.chain.value(); }
    checkpoint(label) { this.chain.checkpoint(label, this.tick); }

    // ------------------------------------------------------------ geometry helpers
    benchOf(u) { return CD.benchAt(u.c, u.r); }
    districtOf(u) { const bn = this.benchOf(u); return bn ? bn.district : null; }
    get phaseMax() { return this.boss ? this.boss.maxHp : CD.phaseMax(this.iu, Math.max(1, this.phase)); }
    theta(g) { return this.record.theta(g); }
    globalOf(local) { return this.readingStart + local; }
    inTrial() { return this.mode === 'reading' || this.mode === 'measure'; }

    // ------------------------------------------------------------ water (Black-Water Undertow), Scales, Specular Inversion
    addFlood(id, zone, halfFrom, subFrom, until, label) {
      const pads = new Set(), cors = new Set();
      const addG = (g, withFloor) => { for (const bn of CD.BENCH) if (bn.district === g && bn.type === 'G') pads.add(keyOf(bn.c, bn.r)); if (withFloor) cors.add(g); };
      if (zone === 'C') { for (const bn of CD.BENCH) if (bn.district === 'C') pads.add(keyOf(bn.c, bn.r)); cors.add('C'); }
      else if (zone === 'NPADS') { addG('NW'); addG('NE'); }
      else if (zone === 'SPADS') { addG('SW'); addG('SE'); }
      else if (zone === 'AROW') { const g = this.ix && this.ix.aSigner; const row = g === 'SW' ? 6 : 2; for (const bn of CD.BENCH) if (bn.type === 'G' && bn.r === row && (bn.district === 'NW' || bn.district === 'SW')) pads.add(keyOf(bn.c, bn.r)); }
      else if (isGallery(zone)) addG(zone, true);
      const src = { id, zone, pads, cors, half: halfFrom, sub: subFrom, until, label: label || zone };
      this.water.sources.push(src);
      return src;
    }
    recomputeWater() {
      const t = this.tick, W = this.water;
      W.sources = W.sources.filter((s) => t < s.until);
      W.pad.clear(); W.cor = {};
      const mark = (map, k, st) => { const cur = map instanceof Map ? map.get(k) : map[k]; if (cur === 'sub' || (cur === 'half' && st !== 'sub')) return; if (map instanceof Map) map.set(k, st); else map[k] = st; };
      for (const s of W.sources) {
        const st = t >= s.sub ? 'sub' : t >= s.half ? 'half' : null; if (!st) continue;
        for (const k of s.pads) mark(W.pad, k, st);
        for (const k of s.cors) mark(W.cor, k, st);
      }
      // Scales: Depth 2 (both axes listing toward one gallery) floods that gallery's floor and Ground pads
      for (const g of GAL) {
        const now = LG.Scales.depth(this.list, g) === 2, soon = this.listPending && LG.Scales.depth(this.listPending, g) === 2;
        if (!now && !soon) continue;
        const st = now ? 'sub' : 'half';
        for (const bn of CD.BENCH) if (bn.district === g && bn.type === 'G') mark(W.pad, keyOf(bn.c, bn.r), st);
        mark(W.cor, g, st);
      }
      // Undertow + Specular Inversion on every tower (recomputed, never mutating base stats)
      for (const u of this.b.units) this.applyWater(u);
    }
    padState(c, r) { return this.water.pad.get(keyOf(c, r)) || 'dry'; }
    submerged(u) { const bn = this.benchOf(u); return !!bn && bn.type === 'G' && this.padState(u.c, u.r) === 'sub'; }
    applyWater(u) {
      if (u.courtBaseRangePx == null) u.courtBaseRangePx = u.rangePx;
      const sub = this.submerged(u);
      u.rangePx = sub ? u.courtBaseRangePx * C.SUB_RANGE : u.courtBaseRangePx;
      u.courtSpd = sub ? C.SUB_SPD : 1;
      u.courtSub = sub;
    }
    onRecalc(u) { u.courtBaseRangePx = u.rangePx; this.applyWater(u); }
    effMode(u) { return u.courtSub ? MIRROR[u.targeting] || u.targeting : u.targeting; }
    corridorOf(e) {
      if (e.air) return null;
      for (const k of ['NW', 'SW', 'NE', 'SE', 'C', 'EXIT']) if (inCorridor(CD.CORRIDORS[k], e.x, e.y)) return k;
      return null;
    }
    weigh(label) {
      const w = LG.Scales.weigh(this.b.units, this.sales, this.tick);
      const res = { ns: w.ns, we: w.we };
      this.listPending = res; this.listAt = this.tick + C.LEAD;
      this.lastWeigh = Object.assign({ tick: this.tick, at: this.listAt, label }, w);
      this.log('weigh', { snapshot: { ns: w.ns, we: w.we, N: w.w.N, S: w.w.S, W: w.w.W, E: w.w.E }, value: Math.round(Math.max(w.rhoNS, w.rhoWE) * 1e6) / 1e6, required: C.LIST_RHO });
      this.emit('courtWeigh', { weigh: this.lastWeigh });
      return w;
    }

    // ------------------------------------------------------------ OriginEnvelope (immutable, captured at emission)
    env(u, kind, extra) {
      if (!u) return null;
      const bn = this.benchOf(u), boss = this.boss;
      let inRange = false;
      if (boss && boss.alive) inRange = Util.dist(u.x, u.y, boss.x, boss.y) <= u.rangePx + boss.size * 0.3;
      let remote = kind === 'domain';
      if ((kind === 'zone' || kind === 'summon') && !inRange) remote = true;
      return Object.freeze({
        ownerUid: u.uid, charId: u.id, district: bn ? bn.district : null, c: u.c, r: u.r, onElevated: !!u.onElevated,
        submergedAtEmission: !!u.courtSub, declaredTargeting: u.targeting, effectiveTargeting: this.effMode(u), emittedTick: this.tick,
        bossInNativeRangeAtEmission: inRange, isRemoteGlobal: remote, kind: kind || 'direct', unit: u,
      });
    }

    // ------------------------------------------------------------ player command hooks
    canPlace(id, c, r) {
      const k = keyOf(c, r), lock = this.locks.get(k);
      if (lock != null && this.tick < lock) return { ok: false, reason: 'Pad under 12s Sub Judice lock' };
      const bn = CD.benchAt(c, r);
      if (bn && this.activeLaw('sealedBench', (l) => l.params.gallery === bn.district)) return { ok: false, reason: 'Bench sealed by Court order' };
      return null;
    }
    onPlace(u) { this.applyWater(u); u.courtDistrict = this.districtOf(u); this.log('place', { uid: u.uid, charId: u.id, district: u.courtDistrict }); }
    onUpgrade(u) { this.log('upgrade', { uid: u.uid, charId: u.id, value: u.level }); }
    onSell(u) {
      const bn = this.benchOf(u), inWave = this.b.state === 'wave';
      const s = { tick: this.tick, c: u.c, r: u.r, district: bn ? bn.district : null, investedAtSale: u.invested, uid: u.uid };
      this.sales.push(s);
      if (this.sales.length > 64) this.sales = this.sales.filter((x) => this.tick - x.tick < C.SUBJUDICE);
      if (inWave) this.locks.set(keyOf(u.c, u.r), this.tick + C.SUBJUDICE);
      // Bail Escheat (Wave 13 only): forfeit half of this tower's contribution to any incomplete seal in its gallery
      let escheat = 0;
      if (this.inTrial() && this.ph && bn && isGallery(bn.district)) escheat = this.escheat(u, bn.district);
      this.log('sell', { uid: u.uid, charId: u.id, district: s.district, value: u.invested, snapshot: { subJudice: inWave, escheat } });
    }
    sellPreview(u) {
      const bn = this.benchOf(u); const inWave = this.b.state === 'wave';
      const sales = this.sales.concat([{ tick: this.tick, c: u.c, r: u.r, investedAtSale: u.invested }]);
      const w = LG.Scales.weigh(this.b.units.filter((x) => x !== u), sales, this.tick);
      let esc = 0;
      if (this.inTrial() && this.ph && bn && isGallery(bn.district) && !this.ph.notarizedBy[bn.district]) esc = (this.ph.contrib[u.uid] || 0) * C.ESCHEAT;
      return { lockTicks: inWave ? C.SUBJUDICE : 0, escheat: esc, shareN: w.shareN, shareW: w.shareW, list: { ns: w.ns, we: w.we } };
    }
    canRetarget() { if (this.activeLaw('gag')) { this.lastReject = 'Gag Order'; return false; } return true; }
    onDomain(u) {
      const rd = this.rd;
      this.log('domain', { uid: u.uid, charId: u.id });
      if (!rd || !rd.bell) return;
      const lt = this.lt;
      if (lt >= C.BELL[0] && lt < C.BELL[1] && rd.debt < C.DEBT_CAP) { rd.debt++; this.log('bellDebt', { uid: u.uid, charId: u.id, value: rd.debt }); this.emit('courtLaw', { kind: 'bellDebt', debt: rd.debt }); }
    }

    // ------------------------------------------------------------ waves and intermissions
    canStartWave() {
      const b = this.b;
      if (b.over) return false;
      if (this.mode === 'idle') return b.wave === 0;
      if (this.mode === 'inter') return this.lt >= C.INTERMISSION && b.wave < b.totalWaves;
      return false; // no wave stacking on this map
    }
    onWaveStart(n, spec) {
      this.log('waveStart', { value: n });
      if (n <= 12) {
        this.mode = 'wave'; this.n = n; this.lt = 0; this.readingStart = this.tick; this.laws = [];
        const w = CD.PREP[n - 1];
        const words = w.score.split(' ');
        words.forEach((word, i) => this.queuePacket(i + 1, word, (i % 2 === 0) === (n % 2 === 1) ? 'N' : 'S', C.PREP_PACKETS[i], {
          witness: (w.witness || []).includes(i + 1), perjury: (w.perjury || []).includes(i + 1), route: (w.routes || {})[i + 1], wave: n,
        }));
        if (w.weigh) this.addLaw({ kind: 'weighing', disclose: 0, a: 0 });
        for (const l of w.laws || []) this.addLaw(Object.assign({}, l));
        this.calendar();
      } else {
        this.startTrial();
      }
    }
    onWaveClear(n) {
      if (n >= 13) return;
      this.cancelLaws('wave cleared');
      this.mode = 'inter'; this.lt = -1; this.n = n;
      this.log('waveClear', { value: n });
    }
    docket() {
      const n = this.b.wave + 1;
      if (n > 13) return null;
      if (n === 13) return { n, trial: true, phases: CD.PHASES.slice(1).map((p) => ({ n: p.n, name: p.name, verdict: p.verdict || 'Four Measures: Record, Contradict, Ratify, Recite and Execute.' })) };
      const w = CD.PREP[n - 1];
      return { n, score: w.score, note: w.note, laws: (w.laws || []).map((l) => Object.assign({}, l)), weigh: !!w.weigh };
    }

    // ------------------------------------------------------------ the docket spawner (integer ticks)
    queuePacket(idx, word, half, startLocal, o) {
      const key = (this.mode === 'wave' ? 'w' + this.n : 'p' + this.phase + 'r' + this.reading + 'm' + this.measure) + ':' + idx;
      const pk = { key, idx, word, half, airHalf: o.airHalf || half, members: [], witnessId: 0, perjurerId: 0, priorityId: 0, order: 'straight', second: half, decided: false,
        route: o.route || null, witness: !!o.witness, perjury: !!o.perjury, priority: !!o.priority, wave: o.wave || C.ESCORT_WAVE, escort: !!o.escort,
        witnessTick: -1, startAt: this.readingStart + startLocal };
      this.packets.set(key, pk);
      // witness/perjurer letters (indexes inside the word)
      const letters = word.split('');
      let wIdx = -1, pIdx = -1, kIdx = -1;
      if (pk.witness || pk.perjury) {
        wIdx = letters.indexOf('K');
        if (wIdx < 0) wIdx = letters.findIndex((L) => L !== 'B' && L !== 'A');
      }
      if (pk.perjury) {
        pIdx = letters.findIndex((L, i) => L === 'K' && i !== wIdx);
        if (pIdx < 0) pIdx = letters.findIndex((L, i) => i !== wIdx && L !== 'B' && L !== 'A');
      }
      if (pk.priority) kIdx = letters.indexOf('K');
      letters.forEach((L, i) => {
        let at = pk.startAt + i * C.LETTER_GAP;
        const role = i === wIdx ? 'witness' : i === pIdx ? 'perjurer' : i === kIdx ? 'priority' : null;
        if (role === 'perjurer') at = pk.startAt + wIdx * C.LETTER_GAP + C.PERJURER_DELAY; // 96 ticks behind the True Witness
        this.pending.push({ at, type: CD.LETTER[L], letter: L, packet: key, role, air: L === 'A' });
      });
      this.pending.sort((a, z) => a.at - z.at);
      // a statically ordered bridge is disclosed now (or at its authored tick)
      if (pk.route && pk.route.order !== 'forum') {
        const d = pk.route.disclose != null ? pk.route.disclose : 0;
        this.addLaw({ kind: 'route', disclose: d, a: startLocal, packet: key, order: pk.route.order, startLocal });
      }
      return pk;
    }
    spawning() { return this.pending.length > 0; }
    spawnDue() {
      const b = this.b;
      while (this.pending.length && this.pending[0].at <= this.tick) {
        const p = this.pending.shift();
        const pk = this.packets.get(p.packet);
        if (!pk) continue;
        if (!pk.decided) this.decideRoute(pk);
        const half = p.air ? pk.airHalf : pk.half;
        const lane = p.air ? (half === 'N' ? 0 : 1) : CD.LANES.indexOf(pk.half + pk.second);
        this._spawning = { pk, role: p.role };
        const e = b.spawnEnemy(p.type, { lane, wave: pk.wave, mutator: null });
        this._spawning = null;
        e.court = { packet: pk.key, role: p.role, committed: false, link: 0, relink: 0, frozenUntil: -1, bound: false, gateDone: false, escort: pk.escort, mite: false };
        pk.members.push(e.id);
        if (p.role === 'witness') { pk.witnessId = e.id; pk.witnessTick = this.tick; }
        if (p.role === 'perjurer') pk.perjurerId = e.id;
        if (p.role === 'priority') pk.priorityId = e.id;
        if (p.role === 'witness' || p.role === 'priority') this.linkInitial(e);
        if (pk.escort) { e.yen = 0; e.owner = 0; }
        this.log('spawn', { uid: e.id, snapshot: { type: p.type, packet: pk.key, role: p.role, lane } });
      }
    }
    decideRoute(pk) {
      pk.decided = true;
      let order = pk.route ? pk.route.order : 'straight';
      if (order === 'forum') {
        const ne = this.forum.sum('NE'), se = this.forum.sum('SE');
        const g = ne === se ? null : ne < se ? 'NE' : 'SE';
        pk.second = g ? (g === 'NE' ? 'N' : 'S') : pk.half;
        pk.forum = { NE: ne / FX, SE: se / FX, bound: g };
        order = g ? (pk.second === pk.half ? 'straight' : 'cross') : 'straight';
        this.log('forum', { snapshot: { packet: pk.key, NE: ne, SE: se, bound: g || 'straight' } });
        this.addLaw({ kind: 'route', disclose: this.lt, a: this.lt, packet: pk.key, order, forum: true, params: { bound: g } }, true);
      } else pk.second = order === 'cross' ? (pk.half === 'N' ? 'S' : 'N') : pk.half;
      pk.order = order;
    }
    /** Mites inherit lane/path, commitment, packet membership and Yen suppression (Escort-capable, never Witness/Perjurer). */
    inherit(child, parent) {
      if (!parent.court) return;
      const pc = parent.court;
      child.court = { packet: pc.packet, role: null, committed: pc.committed, link: 0, relink: 0, frozenUntil: -1, bound: false, gateDone: false, escort: pc.escort, mite: true };
      child.path = parent.path; child.lane = parent.lane; child.pathLen = parent.pathLen; child.path.posAt(child.dist, child);
      if (pc.escort) { child.yen = 0; child.owner = 0; child.crowMark = false; }
      const pk = this.packets.get(pc.packet); if (pk) pk.members.push(child.id);
    }
    onSpawn(e) {
      // seed-independent hexers: first hex exactly 324 ticks after spawn, then the native 9.0 s cadence
      if (e.def.hexCd) e.hexT = (324 - 0.5) / 60;
      if (this._spawning && this._spawning.pk.escort) { e.yen = 0; e.owner = 0; }
    }
    /** Iron Switch: pre-fork path follows (current first gallery + own packet order); commit at 1,152 px, never changes again. */
    forkCheck() {
      const list = this.b.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || e.air || !e.court || e === this.boss) continue;
        const cs = e.court;
        if (cs.committed) continue;
        const pk = this.packets.get(cs.packet);
        const first = CD.LANES[e.lane] ? CD.LANES[e.lane][0] : 'N';
        const second = pk ? (pk.order === 'cross' ? (first === 'N' ? 'S' : 'N') : first) : first;
        const lane = CD.LANES.indexOf(first + second);
        if (lane !== e.lane && e.dist < C.FORK_PX) { e.lane = lane; e.path = this.b.geo.ground[lane]; e.pathLen = e.path.length; }
        if (e.dist >= C.FORK_PX) { cs.committed = true; if (lane !== e.lane) { e.lane = lane; e.path = this.b.geo.ground[lane]; e.pathLen = e.path.length; e.path.posAt(e.dist, e); } this.log('commit', { uid: e.id, snapshot: CD.LANES[e.lane] }); }
      }
    }

    // ------------------------------------------------------------ laws: disclosure (snapshot step), activation/expiry (calendar step)
    addLaw(spec, discloseNow) {
      const l = Object.assign({ id: this.lawSeq++, state: 'pending', b: null }, spec);
      l.params = Object.assign({}, spec.params || {});
      this.laws.push(l);
      if (discloseNow) this.disclose(l);
      return l;
    }
    activeLaw(kind, pred) { for (const l of this.laws) if (l.kind === kind && l.state === 'active' && (!pred || pred(l))) return l; return null; }
    cancelLaws(reason) {
      for (const l of this.laws) if (l.state !== 'done') { l.state = 'done'; l.cancelled = reason; }
      this.b.hazards = this.b.hazards.filter((h) => !h.court);
      this.water.sources = this.water.sources.filter((s) => !s.reading);
    }
    disclose(l) {
      const P = l.params, b = this.b;
      switch (l.kind) {
        case 'redPrecedent':
          if (l.fromMeasure) { const tot = this.ix && this.ix.bookB; let best = null, bv = 0; if (tot) for (const d of DIST) if (tot[d] > bv) { bv = tot[d]; best = d; } P.district = best; }
          else P.district = this.book.top(DIST);
          P.ledger = this.book.totals(DIST); break;
        case 'appellate': {
          const c = this.doct.sum('corpus'), a = this.doct.sum('animus'), s = c + a;
          P.corpus = c; P.animus = a;
          P.dominant = s > 0 && c > C.APPELLATE_SHARE * s ? 'corpus' : s > 0 && a > C.APPELLATE_SHARE * s ? 'animus' : null; break;
        }
        case 'sealedBench': P.gallery = l.gallery || P.gallery || this.topCapital(); break;
        case 'attainder': {
          let best = null, bv = 0; for (const id of b.teamOrder) { const v = this.chars.sum(id); if (v > bv) { bv = v; best = id; } }
          P.charId = best; break;
        }
        case 'recusal': P.district = l.onASigner ? (this.ix && this.ix.aSigner) : this.bookTopLast; break;
        case 'blackIndex': {
          const cnt = {}; for (const u of b.units) { const m = this.effMode(u); cnt[m] = (cnt[m] || 0) + 1; }
          let best = null, bv = 0; for (const m of MODES) if ((cnt[m] || 0) > bv) { bv = cnt[m]; best = m; }
          P.mode = best; P.counts = cnt; break;
        }
        case 'flood': {
          const src = this.addFlood('law' + l.id, l.zone, this.globalOf(l.a) - C.LEAD, this.globalOf(l.a), this.globalOf(l.b), l.zone);
          src.reading = true; P.zone = l.zone; P.pads = Array.from(src.pads); break;
        }
        case 'weighing': this.weigh(this.mode === 'wave' ? 'Docket ' + this.n : 'Reading'); break;
        default: break;
      }
      l.state = 'disclosed'; l.disclosedAt = this.tick;
      l.g = { a: this.globalOf(l.a), b: l.b != null ? this.globalOf(l.b) : null };
      this.log('disclose', { snapshot: { kind: l.kind, id: l.id, a: l.g.a, b: l.g.b, params: this.lawParams(l) }, district: P.district || P.gallery || null, charId: P.charId || null });
      this.emit('courtLaw', { law: l, phase: 'disclose' });
      this.forecastCache = null;
    }
    lawParams(l) { const o = {}; for (const k of Object.keys(l.params)) if (k !== 'ledger' && k !== 'counts' && k !== 'pads') o[k] = l.params[k]; if (l.zone) o.zone = l.zone; if (l.order) o.order = l.order; if (l.packet) o.packet = l.packet; return o; }
    activate(l) {
      l.state = 'active';
      this.log('activate', { snapshot: { kind: l.kind, id: l.id } });
      switch (l.kind) {
        case 'remand': this.dir = -this.dir; l.state = 'done'; this.log('remand', { value: this.dir }); break;
        case 'habeas': this.side = 'refl'; break;
        case 'warrant': case 'enBanc': l.state = 'resolve'; break;
        default: break;
      }
      this.emit('courtLaw', { law: l, phase: 'activate' });
    }
    expire(l) {
      l.state = 'done';
      if (l.kind === 'habeas') this.side = 'body';
      this.log('expire', { snapshot: { kind: l.kind, id: l.id } });
      this.emit('courtLaw', { law: l, phase: 'expire' });
    }
    topCapital() {
      const cap = { NW: 0, SW: 0, NE: 0, SE: 0 };
      for (const u of this.b.units) { const d = this.districtOf(u); if (cap[d] != null) cap[d] += u.invested; }
      for (const s of this.sales) if (this.tick - s.tick < C.CONVEYANCE && cap[s.district] != null) cap[s.district] += s.investedAtSale * C.CONVEYANCE_SHARE;
      let best = 'NW', bv = 0; for (const g of GAL) if (cap[g] > bv) { bv = cap[g]; best = g; }
      return best;
    }
    /** Calendar step for the current (new) tick: activations, expirations, the List, telegraph shells, auto-start, water. */
    calendar() {
      const lt = this.lt, b = this.b;
      for (const l of this.laws) {
        const la = l.kind === 'gavel' ? C.VULN[0] + C.DEBT_SHIFT * this.debt() : l.a;
        if (l.state === 'disclosed' && la === lt) this.activate(l);
        else if (l.state === 'active' && l.b != null && l.b === lt) this.expire(l);
        // telegraph shells (render only; resolution is by tick)
        if (l.state === 'disclosed' && l.kind === 'warrant' && l.a - C.WARRANT_SHOW === lt) b.hazards.push({ id: b.uid(), court: true, kind: 'warrant', law: l, shape: 'rect', x: 0, y: 0, w: 0, h: 0, dur: Infinity, t: 0, color: '#e8c25a', label: 'BENCH WARRANT' });
        if (l.state === 'disclosed' && l.kind === 'enBanc' && l.a - C.ENBANC_SHOW === lt) b.hazards.push({ id: b.uid(), court: true, kind: 'enBanc', law: l, shape: 'all', dur: Infinity, t: 0, color: '#e8c25a', label: 'SUPREME EN BANC' });
      }
      if (this.listPending && this.tick >= this.listAt) { this.list = this.listPending; this.listPending = null; this.log('list', { snapshot: { ns: this.list.ns, we: this.list.we } }); this.emit('courtList', { list: this.list }); }
      for (const [k, until] of this.locks) if (this.tick >= until) this.locks.delete(k);
      if (this.mode === 'inter') {
        if (lt === 0) { const dk = this.docket(); this.log('docket', { value: dk ? dk.n : null }); this.emit('courtDocket', { docket: dk, forecast: this.forecast() }); }
        if (lt === C.INTERMISSION && b.wave < b.totalWaves) { this.log('autoStart', { value: b.wave + 1 }); b.startWave(); }
      }
      if (this.mode === 'measure' && this.measure === 3) this.recitationCalendar();
      this.recomputeWater();
    }

    // ------------------------------------------------------------ the boss: procession, control budget, Remand, Habeas Corpus
    spawnBoss() {
      const e = this.b.spawnEnemy('jahjuanBoss', { lane: 0, silent: false });
      return e;
    }
    initBoss(e) {
      this.boss = e;
      e.courtBoss = true; e.frozen = true; e.knockImmune = true; e.dist = SENTINEL; e.pathLen = Infinity; e.yen = 0; e.owner = 0;
      const self = this;
      e.path = { length: Infinity, posAt(d, out) { out.x = self.hit.x; out.y = self.hit.y; return out; } };
      e.size = C.BOSS_SIZE;
      this.hit = { x: tx(5), y: ty(3) };
      e.x = this.hit.x; e.y = this.hit.y;
    }
    setPhaseHp(n) { const e = this.boss; e.maxHp = CD.phaseMax(this.iu, n); e.hp = e.maxHp; e.shield = 0; e.shieldMax = 0; }
    placeAtStart(n) { this.sFx = CD.PHASES[n].start ? 720 * FX : 0; this.dir = 1; this.side = 'body'; this.updateHit(); }
    updateHit() {
      loopXY(this.sFx, this.body);
      const e = this.boss; if (!e) return;
      this.hit.x = this.body.x; this.hit.y = this.side === 'refl' ? mirrorY(this.body.y) : this.body.y;
      e.x = this.hit.x; e.y = this.hit.y;
    }
    bossTick(e) {
      if (e !== this.boss) return;
      if (this.glide) {
        const g = this.glide, k = Math.min(1, (this.tick - g.t0 + 1) / C.TRANSITION);
        this.hit.x = g.x0 + (g.x1 - g.x0) * k; this.hit.y = g.y0 + (g.y1 - g.y0) * k; e.x = this.hit.x; e.y = this.hit.y;
        e.dist = SENTINEL; return;
      }
      if (this.shattered) return;
      // lost movement this tick, measured against what the native movement formula would grant
      let lost = 0;
      if (this.stagger > 0) { lost = FX; this.stagger--; }
      else if (e.stunT > 0 || e.rootT > 0) lost = FX;
      else { const f = e.speedMul * e.auraSpd * (1 - e.slowAmt); if (f < 1) lost = Math.round((1 - Math.max(0, f)) * FX); }
      let push = 0;
      if (e.dist !== SENTINEL) { const px = SENTINEL - e.dist; if (px > 0) push = Math.round((px / PX_PER_TICK) * FX); e.dist = SENTINEL; this.log('push', { value: Math.round(px * 100) / 100 }); }
      const charged = this.budget.charge(lost + push);
      const cc = Math.min(charged, lost), pu = charged - cc;
      this.sFx += this.dir * (FX - cc - pu);
      if (charged) this.lostTotal = (this.lostTotal || 0) + charged;
      e.courtUnstoppable = this.budget.spent();
      this.updateHit();
    }
    /** stun() hook: a spent budget rejects stuns outright (ccImmuneT is not consumed). */
    rejectStun(e) { return e === this.boss && (this.budget.spent() || this.glide || this.mode === 'cleanup'); }
    projectHit(ticksAhead, sFx, dir, out) {
      // pure projection: no further control delay; honours disclosed Remands and Habeas windows of the current reading
      let s = sFx, d = dir; const t0 = this.tick;
      const rem = [], hab = [];
      for (const l of this.laws) {
        if ((l.state === 'disclosed' || l.state === 'active') && l.kind === 'habeas') hab.push([l.g.a, l.g.b]);
        if (l.state === 'disclosed' && l.kind === 'remand') rem.push(l.g.a);
      }
      const T = t0 + ticksAhead;
      let cur = t0;
      for (const r of rem.filter((x) => x > t0 && x <= T).sort((a, z) => a - z)) { s += d * (r - cur) * FX; cur = r; d = -d; }
      s += d * (T - cur) * FX;
      loopXY(s, out);
      const refl = hab.some(([a, b2]) => T >= a && T < b2) || (this.side === 'refl' && !hab.length && ticksAhead === 0);
      if (refl) out.y = mirrorY(out.y);
      return out;
    }

    // ------------------------------------------------------------ witness chain, perjury, hostile witness (post-movement)
    linkInitial(w) {
      const c = this.escortCandidate(w); if (c) { w.court.link = c.id; this.log('link', { uid: w.id, value: c.id }); }
    }
    escortCandidate(w) {
      let best = null, bd = Infinity; const r2 = C.LINK_PX * C.LINK_PX;
      for (const o of this.b.enemies) {
        if (!o.alive || o === w || o.air || !o.court || o.court.packet !== w.court.packet || o.court.role === 'witness' || o.court.role === 'perjurer' || o.court.role === 'priority') continue;
        const d2 = Util.dist2(w.x, w.y, o.x, o.y);
        if (d2 <= r2 && (d2 < bd || (d2 === bd && o.id < best.id))) { best = o; bd = d2; }
      }
      return best;
    }
    byId(id) { if (!id) return null; for (const e of this.b.enemies) if (e.id === id) return e; return null; }
    updateLinks() {
      for (const pk of this.packets.values()) {
        for (const wid of [pk.witnessId, pk.priorityId]) {
          const w = wid && this.byId(wid); if (!w || !w.alive) continue;
          const s = w.court;
          if (s.link) {
            const E = this.byId(s.link);
            if (!E || !E.alive || Util.dist(w.x, w.y, E.x, E.y) > C.LINK_PX) {
              if (wid === pk.priorityId && (!E || !E.alive)) pk.appealForfeit = true;
              s.link = 0; s.relink = 0;
              if (s.bound) { s.frozenUntil = this.tick + C.BINDING; s.bound = false; this.log('bindingCitation', { uid: w.id, value: s.frozenUntil }); }
              this.log('unlink', { uid: w.id });
            } else if (w.stunT > 0 || w.slowT > 0 || w.rootT > 0 || w.frozen) s.bound = true;
          }
          if (!s.link) {
            if (this.tick < s.frozenUntil) continue;
            const c = this.escortCandidate(w);
            if (c) { s.relink++; if (s.relink >= C.RELINK) { s.link = c.id; s.relink = 0; this.log('link', { uid: w.id, value: c.id }); } } else s.relink = 0;
          }
        }
        // Hostile Witness: the True Witness reaches the Exit Gate
        const w = pk.witnessId && this.byId(pk.witnessId);
        if (w && w.alive && !w.court.gateDone && w.dist >= C.GATE_PX) {
          w.court.gateDone = true;
          this.log('hostileWitness', { uid: w.id, reason: 'True Witness reached the Exit Gate' });
          if (this.rd && pk.escort) { this.rd.testimonyVoid = true; this.rd.voidReason = 'Hostile Witness at ' + sec(this.lt); }
          this.emit('courtWitness', { kind: 'hostile', enemy: w });
        }
      }
    }

    // ------------------------------------------------------------ gavels (read the post-movement hitbox)
    mid() {
      if (!this.boss || this.glide) { this.forkCheck(); this.updateLinks(); return; }
      for (const l of this.laws) {
        if (l.state !== 'resolve') continue;
        if (l.kind === 'warrant') this.resolveWarrant(l); else if (l.kind === 'enBanc') this.resolveEnBanc(l);
        l.state = 'done';
        this.b.hazards = this.b.hazards.filter((h) => h.law !== l);
      }
      this.forkCheck();
      this.updateLinks();
      // keep the warrant telegraph over the projected quadrant
      for (const h of this.b.hazards) if (h.court && h.kind === 'warrant') {
        const p = this.projectHit(Math.max(0, h.law.g.a - this.tick), this.sFx, this.dir, { x: 0, y: 0 });
        const q = this.quadrantAt(p.x, p.y); h.quadrant = q; const R = this.quadRect(q); Object.assign(h, R);
      }
    }
    quadrantAt(x, y) { if (y < ty(3.6)) return x < tx(9.5) ? 'NW' : 'NE'; if (y > ty(4.4)) return x < tx(9.5) ? 'SW' : 'SE'; return 'canal'; }
    quadRect(q) {
      if (q === 'canal') return { x: tx(8) - 32, y: ty(3.6), w: TILE * 4, h: ty(4.4) - ty(3.6) };
      const west = westOf(q), north = northOf(q);
      return { x: west ? tx(2) - 32 : tx(11) - 32, y: north ? ty(1) - 32 : ty(5) + 32, w: (west ? 7 : 6) * TILE, h: north ? 3 * TILE : 3 * TILE };
    }
    resolveWarrant(l) {
      const q = this.quadrantAt(this.hit.x, this.hit.y), b = this.b;
      const hitT = [];
      if (q === 'canal') {
        const src = this.addFlood('canal' + l.id, 'C', this.tick, this.tick + C.LEAD, this.tick + 2 * C.LEAD, 'canal'); src.reading = false;
        this.log('warrant', { district: 'canal', snapshot: { x: Math.round(this.hit.x), y: Math.round(this.hit.y) }, reason: 'Midline Canal Parry' });
      } else {
        for (const u of b.units.slice()) if (this.districtOf(u) === q) { if (b.disableUnit(u, (C.WARRANT_DISABLE - 0.5) / 60)) hitT.push(u.uid); }
        this.log('warrant', { district: q, snapshot: { x: Math.round(this.hit.x), y: Math.round(this.hit.y), disabled: hitT } });
      }
      this.lastWarrant = { tick: this.tick, q, disabled: hitT };
      this.emit('courtGavel', { kind: 'warrant', quadrant: q, disabled: hitT });
    }
    resolveEnBanc(l) {
      const b = this.b, ex = this.remedy, thr = (ex === 'quorum' ? C.QUORUM_EXHAUSTED : C.QUORUM) * this.phaseMax;
      let q = 0, w = 0; const disabled = [];
      let remedy;
      if (b.domain && ex !== 'clash') {
        remedy = 'clash'; this.stagger = C.STAGGER;
        this.log('enBanc', { snapshot: { remedy, exhausted: ex }, reason: 'Domain Clash: the subpoena shatters' });
      } else {
        for (const u of b.units.slice()) {
          const g = this.districtOf(u);
          if (isGallery(g) && this.rd && this.rd.qual[g] >= thr) { q++; continue; }
          const warded = ex === 'ward' ? !!u.immuneDisable : b.isDisableImmune(u);
          if (warded) { w++; b.fx('resist', { x: u.x, y: u.y }); continue; }
          if (b.disableUnit(u, (C.ENBANC_DISABLE - 0.5) / 60)) disabled.push(u.uid);
        }
        remedy = q === 0 && w === 0 ? 'none' : q >= w ? 'quorum' : 'ward';
        this.log('enBanc', { snapshot: { remedy, exhausted: ex, quorum: q, ward: w, disabled } });
      }
      this.remedy = remedy === 'none' ? null : remedy;
      this.lastEnBanc = { tick: this.tick, remedy, exhausted: ex, disabled };
      this.emit('courtGavel', { kind: 'enBanc', remedy, exhausted: ex, disabled });
    }

    // ------------------------------------------------------------ forecast: pure, side-effect free
    forecast() {
      const laws = [];
      for (const l of this.laws) if (l.state !== 'pending' && !l.cancelled && l.g) laws.push({ id: l.id, kind: l.kind, a: l.kind === 'gavel' ? this.globalOf(C.VULN[0] + C.DEBT_SHIFT * this.debt()) : l.g.a, b: l.g.b, disclosedAt: l.disclosedAt, state: l.state, params: this.lawParams(l), zone: l.zone || null });
      const path = [];
      if (this.boss && !this.shattered && !this.glide) for (let k = 0; k <= 1440; k += 12) { const p = this.projectHit(k, this.sFx, this.dir, { x: 0, y: 0 }); path.push({ t: this.tick + k, x: p.x, y: p.y }); }
      const water = this.water.sources.map((s) => ({ id: s.id, zone: s.zone, half: s.half, sub: s.sub, until: s.until, pads: Array.from(s.pads) }));
      return {
        tick: this.tick, mode: this.mode, phase: this.phase, reading: this.reading, measure: this.measure, lt: this.lt, laws, path, water,
        list: Object.assign({}, this.list), listPending: this.listPending ? Object.assign({ at: this.listAt }, this.listPending) : null,
        locks: Array.from(this.locks.entries()), budget: { lost: this.budget.lostTicks(), cap: C.BUDGET, spent: this.budget.spent() },
        packets: Array.from(this.packets.values()).filter((p) => p.decided || p.route).map((p) => ({ key: p.key, half: p.half, second: p.decided ? p.second : null, order: p.decided ? p.order : p.route && p.route.order })),
        theta: { NW: this.theta('NW'), SW: this.theta('SW'), NE: this.theta('NE'), SE: this.theta('SE') },
        recitation: this.recitationProjection(),
      };
    }

    // ------------------------------------------------------------ damage hooks (called from Battle.damage)
    lastWordOpen() { return this.mode === 'measure' && this.measure === 3 && this.ix && this.ix.lwStart != null && this.lt >= this.ix.lwStart && !this.shattered; }
    mitigation() {
      if (this.mode === 'measure' && this.measure === 3) return this.lastWordOpen() ? 1 : C.MITIGATION;
      if (!this.inTrial() || !this.rd) return C.MITIGATION;
      const lt = this.lt, a = C.VULN[0] + C.DEBT_SHIFT * this.debt(), b = C.VULN[1];
      if (lt < a || lt >= b) return C.MITIGATION;
      if (this.rd.adjourn && lt >= C.ADJOURN[0] && lt < C.ADJOURN[1]) return C.MITIGATION;
      return 1;
    }
    debt() { const rd = this.rd; return rd ? Math.min(C.DEBT_CAP, rd.debt + (rd.contemptDebt ? 1 : 0)) : 0; }
    monoliths() { if (this.mode === 'reading' || this.mode === 'measure' || this.mode === 'cleanup' || this.mode === 'transition') return CD.MONOLITHS[Math.min(8, Math.max(0, this.phase))] || {}; return {}; }
    glareMul(env, e) {
      if (!env || env.onElevated) return 1;
      if (e.markStacks > 0 || e.vulnT > 0 || e.nullT > 0) return 1;
      const sy = env.r < 4 ? -1 : 1, ty0 = e.y < MID_Y ? -1 : e.y > MID_Y ? 1 : 0;
      if (!ty0 || ty0 === sy) return 1;
      const x0 = tx(env.c), y0 = ty(env.r), k = (MID_Y - y0) / (e.y - y0), x = x0 + (e.x - x0) * k;
      const M = this.monoliths(); let m = 1;
      for (const key of Object.keys(M)) { const sp = CD.SPANS[key]; if (x >= tx(sp[0]) && x <= tx(sp[1])) m = Math.min(m, M[key] === 2 ? C.GLARE_TWIN : C.GLARE); }
      return m;
    }
    hitPre(e, d, o, type) {
      const b = this.b, env = b._env || (o.src ? this.env(o.src) : null);
      const H = { d, armorAdd: 0, env, district: env ? env.district : null, type, doctrine: type === 'phys' ? 'corpus' : type === 'cursed' ? 'animus' : null, boss: e === this.boss, glare: false, eligible: false };
      this._lastType = type;
      if (H.boss) {
        if (type === 'true') d = C.TRUE_NORM * e.maxHp; // Unlicensed Force: normalised before courtroom modifiers
        d *= this.mitigation();
        if (!this.lastWordOpen()) {
          const rp = this.activeLaw('redPrecedent'); if (rp && rp.params.district && H.district === rp.params.district) d *= C.RED_MUL;
          const ap = this.activeLaw('appellate'); if (ap && ap.params.dominant && (type === 'true' || H.doctrine === ap.params.dominant)) d *= C.APPELLATE_MUL;
          const g = this.glareMul(env, e); if (g < 1) { d *= g; H.glare = true; }
        }
        H.d = d; H.eligible = this.eligible(H); return H;
      }
      // ordinary curses and escorts
      if (this.mode === 'wave') {
        const rp = this.activeLaw('redPrecedent'); if (rp && rp.params.district && H.district === rp.params.district) d *= C.RED_MUL;
        const ap = this.activeLaw('appellate'); if (ap && ap.params.dominant && (type === 'true' || H.doctrine === ap.params.dominant)) d *= C.APPELLATE_MUL;
      }
      const g = this.glareMul(env, e); if (g < 1) { d *= g; H.glare = true; }
      if (!e.air && env && !env.onElevated) {
        const cor = this.corridorOf(e);
        if (cor && cor !== 'EXIT' && this.water.cor[cor] === 'sub') {
          if (type === 'phys') H.armorAdd = C.WAKE_ARMOR * (1 - Math.min(1, o.pierce || 0));
          else if (type === 'cursed') d *= C.WAKE_CURSED;
        }
      }
      const cs = e.court;
      if (cs) {
        if (cs.role === 'witness' && cs.link) d *= C.WITNESS_MUL;
        if ((cs.role === 'witness' || cs.role === 'perjurer') && env) {
          const bi = this.activeLaw('blackIndex');
          if (bi && bi.params.mode) { const u = env.unit; const m = u && !u.removed ? this.effMode(u) : env.effectiveTargeting; if (m === bi.params.mode) d *= C.BLACK_INDEX; }
        }
      }
      H.d = d; return H;
    }
    eligible(H) {
      const env = H.env; if (!env) return false;
      const g = env.district; if (!isGallery(g)) return false;
      if (H.glare) return false;
      if (this.lastWordOpen()) return true;
      const rec = this.activeLaw('recusal'); if (rec && rec.params.district === g) return false;
      const writ = this.activeLaw('writ'); if (writ && !(env.bossInNativeRangeAtEmission && !env.isRemoteGlobal)) return false;
      const att = this.activeLaw('attainder'); if (att && att.params.charId && att.params.charId === env.charId) return false;
      return true;
    }
    executor(H) { return H.env && isGallery(H.district) && H.type !== 'true' && H.district !== (this.ix && this.ix.estopped); }
    /** Clamp before HP subtraction: Integrity floors, Verdict Pending, Royal Floor. Returns HP actually removed. */
    clamp(e, d, o, H) {
      if (!H.boss) { this.escortHit(e, d, H); return d; }
      const hp0 = e.hp, max = e.maxHp;
      let floor = 0, pending = false;
      if (this.mode === 'reading') pending = hp0 <= 0;
      else if (this.mode === 'measure') {
        if (this.measure < 3) floor = CD.MEASURES[this.measure].floor * max;
        else if (this.lastWordOpen()) floor = this.executor(H) ? 0 : 1;
        else floor = CD.MEASURES[3].floor * max;
      } else pending = true; // cleanup / transition: nothing lands
      const removed = pending ? 0 : Math.max(0, Math.min(d, hp0 - floor));
      const credit = pending ? (this.mode === 'reading' ? d : 0) : Math.min(d, hp0);
      if (this.lastWordOpen() && this.executor(H) && removed > 0 && hp0 - removed <= 0) { this.shatterOK = true; this.shatterBy = { charId: H.env.charId, district: H.district, uid: H.env.ownerUid }; }
      this.afterBossHit(H, removed, credit);
      return removed;
    }
    escortHit(e, d, H) {
      const rem = Math.max(0, Math.min(d, e.hp)); if (!(rem > 0) || !H.district) return;
      const fx = toFx(rem);
      if (H.district === 'NE' || H.district === 'SE') this.forum.add(H.district, fx);
      if (this.mode === 'wave') { this.book.add(H.district, fx); if (H.doctrine) this.doct.add(H.doctrine, fx); }
      if (this.hitLog) this.hitLog.push({ tick: this.tick, pos: this.book.pos, boss: false, district: H.district, doctrine: H.doctrine, fx, wave: this.mode === 'wave' });
    }
    afterBossHit(H, removed, credit) {
      const rd = this.rd, env = H.env;
      if (removed > 0 && env) {
        const fx = toFx(removed);
        if (H.district) this.book.add(H.district, fx);
        if (H.doctrine) this.doct.add(H.doctrine, fx);
        this.chars.add(env.charId, fx);
        if (rd) rd.removed[H.district] = (rd.removed[H.district] || 0) + removed;
        if (this.ix && this.measure >= 0) { const m = (this.ix.byMeasure[this.measure] = this.ix.byMeasure[this.measure] || {}); m[H.district] = (m[H.district] || 0) + removed; }
        if (this.hitLog) this.hitLog.push({ tick: this.tick, pos: this.book.pos, boss: true, district: H.district, doctrine: H.doctrine, charId: env.charId, fx });
      }
      if (H.eligible && credit > 0 && rd) this.credit(H, credit);
    }
    credit(H, amt) {
      const g = H.district, rd = this.rd, ph = this.ph, max = this.boss.maxHp, lt = this.lt;
      if (H.doctrine) rd.doc[H.doctrine] += amt;
      rd.qual[g] += amt;
      const fx = toFx(amt);
      this.strips.add(g, fx); if (H.doctrine) this.strips.add(g + ':' + H.doctrine, fx);
      if (this.mode === 'reading') {
        if (this.mitigation() === 1) rd.fullHit = true;
        if (this.activeLaw('writ')) rd.writHit = true;
      }
      const ix = this.ix;
      if (ix && this.mode === 'measure') {
        if (this.measure < 3) ix.fourth[g] += amt;
        if (this.measure === 1 && lt >= C.VULN[0] + C.DEBT_SHIFT * this.debt() && lt < C.VULN[1]) {
          rd.win[g] += amt; if (H.doctrine) rd.winDoc[H.doctrine] += amt;
        }
        if (this.measure === 3 && lt < C.RECITATION && H.type !== 'true') {
          const j = Math.floor(lt / C.ARTICLE) + 1, art = ix.articles[j - 1];
          if (art && art.signer === g) { if (!art.affirmed) { art.affirmed = true; art.hitTick = lt; } if (H.doctrine && art.doctrine && H.doctrine !== art.doctrine && !art.dissent) { art.dissent = true; } }
        }
      }
      // seals
      let s = amt;
      if (H.type === 'true') { const room = C.TRUE_CAP * max - (rd.trueUsed[g] || 0); s = Math.max(0, Math.min(s, room)); rd.trueUsed[g] = (rd.trueUsed[g] || 0) + s; }
      if (s > 0) this.sealCredit(g, s, H);
    }

    // ------------------------------------------------------------ the seal engine
    makeReqs(kind) {
      const R = (id, gal, gate) => ({ id, gal, gate: gate || null, done: false, g: null, tick: -1, via: null });
      switch (kind) {
        case 'north': return [R('north', ['NW', 'NE'])];
        case 'south': return [R('south', ['SW', 'SE'])];
        case 'venue': { const w = R('west', ['NW', 'SW']); return [w, R('east', ['NE', 'SE'], () => w.done && this.tick > w.tick)]; }
        case 'double': return [R('north', ['NW', 'NE']), R('south', ['SW', 'SE'])];
        case 'westEast': return [R('west', ['NW', 'SW']), R('east', ['NE', 'SE'])];
        case 'opposite': { const f = R('first', GAL.slice()); return [f, R('second', () => (f.done ? GAL.filter((x) => northOf(x) !== northOf(f.g)) : []), () => f.done)]; }
        case 'sequence': {
          const a = R('first', ['NW', 'SW']), b2 = R('second', ['NE', 'SE'], () => a.done && this.tick > a.tick);
          return [a, b2, R('third', () => (b2.done ? GAL.filter((x) => x !== a.g && x !== b2.g) : []), () => b2.done && this.tick >= b2.tick + C.LEAD)];
        }
        case 'A': return [R('west', ['NW', 'SW'])];
        case 'B': return [R('east', ['NE', 'SE'])];
        default: return [];
      }
    }
    galsOf(q) { return typeof q.gal === 'function' ? q.gal() : q.gal; }
    openFor(g) {
      const ph = this.ph; if (!ph || ph.notarizedBy[g]) return null;
      for (const q of ph.reqs) if (!q.done && this.galsOf(q).includes(g) && (!q.gate || q.gate())) return q;
      return null;
    }
    sealCredit(g, amt, H) {
      const ph = this.ph, rd = this.rd; if (!ph) return;
      if (!this.openFor(g)) return;
      if (rd.holdover === g && this.lt < C.HOLDOVER_TICKS) amt *= C.HOLDOVER;
      const max = this.boss.maxHp, thr = this.theta(g) * max;
      // Injunction Against Monopoly
      if (rd.monopoly && H.doctrine === rd.monopoly && rd.doc[rd.monopoly === 'corpus' ? 'animus' : 'corpus'] < C.MINORITY_LIFT * max) {
        const ceil = C.HALF * thr; amt = Math.max(0, Math.min(amt, ceil - ph.seal[g]));
        if (!(amt > 0)) return;
      }
      ph.seal[g] += amt;
      if (H.doctrine) ph.sealDoc[g][H.doctrine] += amt;
      const uid = H.env && H.env.ownerUid; if (uid) ph.contrib[uid] = (ph.contrib[uid] || 0) + amt;
      if (ph.seal[g] >= thr) this.notarize(g, 'damage');
    }
    notarize(g, via) {
      const ph = this.ph, q = this.openFor(g); if (!q) return false;
      q.done = true; q.g = g; q.tick = this.tick; q.via = via;
      ph.notarizedBy[g] = q;
      ph.order.push({ g, tick: this.tick, req: q.id, via, doc: Object.assign({}, ph.sealDoc[g]) });
      this.log('seal', { district: g, value: Math.round(ph.seal[g] * 1000) / 1000, required: Math.round(this.theta(g) * this.boss.maxHp * 1000) / 1000, snapshot: { req: q.id, via }, doctrine: this.docOf(ph.sealDoc[g]) });
      this.emit('courtSeal', { gallery: g, req: q.id, via });
      // a newly opened request may already be satisfied by banked credit
      for (const x of GAL) if (x !== g && !ph.notarizedBy[x] && ph.seal[x] >= this.theta(x) * this.boss.maxHp && this.openFor(x)) this.notarize(x, 'damage');
      return true;
    }
    docOf(sd) { return sd.animus > sd.corpus ? 'animus' : 'corpus'; }
    escheat(u, g) {
      const ph = this.ph; if (!ph || ph.notarizedBy[g]) return 0;
      const c = ph.contrib[u.uid] || 0; if (!c) return 0;
      const cut = Math.min(ph.seal[g], c * C.ESCHEAT);
      ph.seal[g] -= cut; ph.contrib[u.uid] = c - cut;
      this.log('escheat', { district: g, uid: u.uid, value: cut });
      return cut;
    }
    objection() {
      const rd = this.rd, ph = this.ph;
      if (!rd || !ph || !rd.testimony || rd.testimonySpent) return false;
      const half = rd.tainted ? C.HALF_TAINTED : C.HALF;
      for (const q of ph.reqs) {
        if (q.done || (q.gate && !q.gate())) continue;
        for (const g of GAL) {
          if (!this.galsOf(q).includes(g) || ph.notarizedBy[g]) continue;
          if (ph.seal[g] >= half * this.theta(g) * this.boss.maxHp) {
            rd.testimonySpent = true;
            this.log('objection', { district: g, value: ph.seal[g], required: half * this.theta(g) * this.boss.maxHp });
            this.notarize(g, 'testimony');
            return true;
          }
        }
      }
      return false;
    }

    // ------------------------------------------------------------ kills (Testimony, Perjury, Priority Appeal)
    onKill(e, src) {
      if (e === this.boss) {
        if (!this.shatterOK) { e.hp = Math.max(0, e.hp); return true; } // Integrity broken is not death
        return false;
      }
      const cs = e.court; if (!cs) return false;
      const pk = this.packets.get(cs.packet), rd = this.rd, t = this._lastType;
      if (cs.role === 'witness' && pk) {
        const before = !cs.gateDone && e.dist < C.GATE_PX;
        if (!before) { this.log('witnessLate', { uid: e.id }); }
        else if (t === 'true') {
          this.log('silenced', { uid: e.id, reason: 'silenced, not examined' });
          if (rd && pk.escort) { rd.testimonyVoid = true; rd.voidReason = 'Witness silenced by Unlicensed Force at ' + sec(this.lt); }
        } else {
          this.log('witnessKilled', { uid: e.id, value: Math.round(e.dist) });
          if (rd && pk.escort) {
            rd.witnessKilled = true;
            if (this.ph) this.ph.witness = true;
            if (!rd.testimonyVoid && !rd.testimony) { rd.testimony = 1; rd.testimonyTick = this.lt; if (rd.contemptDebt && this.lt < C.VULN[0]) { rd.contemptDebt = 0; this.log('debtExpunged', {}); } this.log('testimony', { value: 1, snapshot: { tainted: !!rd.tainted } }); this.emit('courtWitness', { kind: 'testimony', tainted: !!rd.tainted }); }
          }
        }
      } else if (cs.role === 'perjurer' && pk) {
        const w = this.byId(pk.witnessId);
        if (w && w.alive && Util.dist(w.x, w.y, e.x, e.y) <= C.PERJURY_PX) {
          w.stunT = 0; w.slowT = 0; w.slowAmt = 0; w.rootT = 0; w.frozen = false;
          const sh = Math.round(w.maxHp * C.CONTEMPT_SHIELD); w.shield += sh; w.shieldMax = Math.max(w.shieldMax, w.shield); w.noShieldRegen = true;
          if (rd && pk.escort) rd.tainted = true;
          this.log('perjury', { uid: e.id, value: Math.round(Util.dist(w.x, w.y, e.x, e.y) * 100) / 100, required: C.PERJURY_PX, reason: 'Contempt by Perjury' });
          this.emit('courtWitness', { kind: 'perjury', enemy: w });
          if (rd) rd.perjuryAt = { lt: this.lt, d: Util.dist(w.x, w.y, e.x, e.y) / TILE };
        }
      } else if (cs.role === 'priority' && pk && rd) {
        const E = this.byId(cs.link);
        if (E && E.alive && !pk.appealForfeit) {
          if (!rd.testimony && !rd.testimonyVoid) { rd.testimony = 1; rd.testimonyTick = this.lt; this.log('testimony', { value: 1, reason: 'Priority Appeal' }); }
          for (const l of this.laws) if (l.kind === 'sealedBench' && l.state !== 'done') { l.state = 'done'; l.cancelled = 'Priority Appeal'; this.log('appealGranted', { reason: 'Sealed Bench cancelled' }); }
          this.emit('courtWitness', { kind: 'appeal' });
        } else this.log('appealDenied', { uid: e.id });
      }
      return false;
    }
    onBossShatter() {
      this.shattered = true;
      this.cancelLaws('Crown shattered');
      this.pending.length = 0;
      this.mode = 'finale';
      this.log('shatter', { district: this.shatterBy && this.shatterBy.district, charId: this.shatterBy && this.shatterBy.charId, value: this.lt });
      this.checkpoint('shatter');
      this.emit('courtShatter', { by: this.shatterBy, survivors: this.b.enemies.filter((x) => x.alive && x !== this.boss).length });
    }

    // ------------------------------------------------------------ the trial: phases, readings, Mistrials
    newReading(o) {
      return Object.assign({ debt: 0, contemptDebt: 0, bell: false, adjourn: false, qual: { NW: 0, SW: 0, NE: 0, SE: 0 }, trueUsed: {}, doc: { corpus: 0, animus: 0 },
        removed: {}, testimony: 0, testimonySpent: false, tainted: false, testimonyVoid: false, witnessKilled: false, holdover: null, monopoly: null,
        fullHit: false, writHit: false, win: { NW: 0, SW: 0, NE: 0, SE: 0 }, winDoc: { corpus: 0, animus: 0 } }, o || {});
    }
    newPhaseState(kind) {
      return { reqs: this.makeReqs(kind), seal: { NW: 0, SW: 0, NE: 0, SE: 0 }, sealDoc: { NW: { corpus: 0, animus: 0 }, SW: { corpus: 0, animus: 0 }, NE: { corpus: 0, animus: 0 }, SE: { corpus: 0, animus: 0 } },
        notarizedBy: {}, order: [], contrib: {}, witness: false, narrow: null, firstReach: {}, kind };
    }
    startTrial() {
      this.book.clear(); this.doct.clear(); this.chars.clear(); this.strips.clear();
      this.mode = 'reading'; this.phase = 1; this.reading = 0;
      this.spawnBoss();
      this.log('trial', { value: this.iu });
      this.checkpoint('trial');
      this.startPhase(1, true);
    }
    startPhase(n, now) {
      this.phase = n; this.strikes = 0;
      this.setPhaseHp(n); this.placeAtStart(n);
      const e = this.boss; e.untargetable = false; e.invulnT = 0;
      this.ph = this.newPhaseState(CD.PHASES[n].seals);
      this.emit('courtPhase', { phase: n, name: CD.PHASES[n].name });
      this.log('phase', { value: n, snapshot: { maxHp: e.maxHp, theta: { NW: this.theta('NW'), SW: this.theta('SW'), NE: this.theta('NE'), SE: this.theta('SE') } } });
      this.startReading(1, now);
    }
    startReading(r, now) {
      const P = CD.PHASES[this.phase], prev = this.rd;
      this.mode = 'reading'; this.reading = r;
      this.readingStart = now ? this.tick : this.tick + 1; this.lt = now ? 0 : -1;
      this.laws = [];
      const strikes = r - 1;
      this.rd = this.newReading({ bell: !!P.bell, adjourn: !!P.adjourn });
      if (P.seals === 'double') this.ph = Object.assign(this.newPhaseState('double'), { witness: this.ph.witness });
      // defaults: Weighing at 0, Gavel Fall, Packet 2's route order
      this.addLaw({ kind: 'weighing', disclose: 0, a: 0 });
      this.addLaw({ kind: 'gavel', disclose: 0, a: C.VULN[0], b: C.VULN[1] });
      if (P.bell) this.addLaw({ kind: 'bell', disclose: 0, a: C.BELL[0], b: C.BELL[1] });
      if (P.adjourn) this.addLaw({ kind: 'adjourn', disclose: 0, a: C.ADJOURN[0], b: C.ADJOURN[1] });
      for (const l of P.laws || []) this.addLaw(Object.assign({}, l));
      if (strikes >= 1 && prev) {
        let top = null, bv = 0; for (const g of GAL) if ((prev.removed[g] || 0) > bv) { bv = prev.removed[g]; top = g; }
        this.rd.holdover = top;
        this.addLaw({ kind: 'holdover', disclose: 0, a: 0, b: C.HOLDOVER_TICKS, params: { district: top }, verdictConsequence: true });
      }
      if (strikes >= 2) { this.addLaw({ kind: 'flood', zone: 'C', disclose: 0, a: 360, b: 1560, mistrial: true }); this.rd.contemptDebt = 1; this.log('contemptDebt', { value: 1 }); }
      if (this.boss.hp <= 0) this.addLaw({ kind: 'writ', disclose: 0, a: 960, b: 1560, stay: true });
      // escorts: odd readings Packet 1 North / Packet 2 South, even readings reverse
      const odd = r % 2 === 1;
      let p1 = P.esc[0]; if (strikes >= 1 && p1.endsWith('W')) p1 = p1.slice(0, -1) + 'G';
      const route = Array.isArray(P.route) ? P.route[r - 1] : P.route;
      const p1Half = odd ? 'N' : 'S', p2Half = odd ? 'S' : 'N';
      this.queuePacket(1, p1, p1Half, 0, { escort: true, priority: !!P.priority });
      this.queuePacket(2, P.esc[1], p2Half, C.PACKET2, { escort: true, witness: true, perjury: !!P.perjury, route: { order: route, disclose: 0 }, airHalf: P.mirrorDocket ? p1Half : p2Half });
      this.checkpoint('P' + this.phase + 'R' + r);
      this.log('reading', { value: r });
      this.emit('courtReading', { phase: this.phase, reading: r });
      if (now) this.calendar();
    }
    /** Judgment at the end of local tick 1919 (Phases I-VIII). */
    judge() {
      this.objection();
      const fail = this.firstUnmet();
      if (!fail) { this.completePhase(); return; }
      this.strikes++; this.stats.mistrials++;
      this.log('hungJury', { reason: fail.text, value: fail.actual, required: fail.required, snapshot: { strike: this.strikes } });
      this.emit('courtHungJury', { strike: this.strikes, fail });
      if (this.strikes >= 3) { this.defeat('Verdict Against the Defense', 'Phase ' + ROMAN[this.phase] + ', Reading 3 failed at Judgment. ' + fail.text); return; }
      this.cancelLaws('mistrial');
      this.bookTopLast = this.book.top(DIST);
      this.startReading(this.reading + 1, false);
    }
    unmetSeal(q, label) {
      const ph = this.ph, max = this.boss.maxHp;
      const gs = this.galsOf(q).length ? this.galsOf(q) : GAL;
      let best = null, bv = -1; for (const g of gs) if (ph.seal[g] / (this.theta(g) * max) > bv) { bv = ph.seal[g] / (this.theta(g) * max); best = g; }
      const th = best ? this.theta(best) : 0;
      return { clause: label, text: label + ' not notarized' + (best ? ': ' + best + ' stood at ' + pct(ph.seal[best] / max) + ' of a required ' + pct(th) + ' (theta = ' + pct(th) + ' after ' + this.record.cit[best] + ' Citation' + (this.record.cit[best] === 1 ? '' : 's') + ').' : '.'), actual: best ? ph.seal[best] : 0, required: best ? th * max : 0, gallery: best };
    }
    firstUnmet() {
      const ph = this.ph, rd = this.rd, e = this.boss, P = CD.PHASES[this.phase];
      if (e.hp > 0) return { clause: 'Integrity', text: 'Integrity not exhausted: ' + Math.ceil(e.hp) + ' / ' + e.maxHp + ' HP remained (' + pct(e.hp / e.maxHp) + ').', actual: e.hp, required: 0 };
      const names = { north: 'Northern seal (NW or NE)', south: 'Southern seal (SW or SE)', west: 'West seal (NW or SW)', east: 'East seal (NE or SE)', first: 'First signature', second: 'Second signature', third: 'Third signature' };
      for (const q of ph.reqs) if (!q.done) return this.unmetSeal(q, names[q.id] || q.id);
      if (P.witnessReq && !ph.witness) return { clause: 'Witness', text: 'No True Witness was killed before the Exit Gate in any reading.', actual: 0, required: 1 };
      if (P.seals === 'double' && !rd.fullHit) return { clause: 'Full-damage hit', text: 'No qualifying gallery hit landed inside the un-adjourned full-damage window.', actual: 0, required: 1 };
      if (P.seals === 'opposite' && !rd.writHit) return { clause: 'Writ of Distance', text: 'No qualifying gallery hit landed locally under Writ of Distance.', actual: 0, required: 1 };
      if (P.seals === 'narrow') {
        if (!ph.narrow) return { clause: 'Narrow Majority', text: 'Narrow Majority not achieved: ' + this.stripText() + '.', actual: 0, required: C.NARROW };
        if (!rd.testimony || rd.tainted) return { clause: 'Clean Testimony', text: rd.tainted ? 'Testimony was Tainted by Contempt by Perjury' + (rd.perjuryAt ? ' (Perjurer killed ' + rd.perjuryAt.d.toFixed(1) + ' tiles from the Witness at ' + sec(rd.perjuryAt.lt) + ')' : '') + '.' : 'No clean Testimony was earned this reading' + (rd.voidReason ? ' (' + rd.voidReason + ')' : '') + '.', actual: 0, required: 1 };
      }
      return null;
    }
    stripText() { const max = this.boss.maxHp; return GAL.map((g) => g + ' ' + pct(this.strips.hp(g) / max)).join(', ') + ' (need two galleries at ' + pct(C.NARROW) + ' in one 6.0s strip)'; }
    completePhase() {
      const ph = this.ph, n = this.phase;
      let signer = null, doctrine = 'corpus';
      if (CD.PHASES[n].seals === 'narrow') { signer = ph.narrow.signer; doctrine = ph.narrow.doctrine; }
      else if (ph.order.length) { const f = ph.order[0]; signer = f.g; doctrine = this.docOf(f.doc); }
      const cos = ph.order.slice(1).map((x) => x.g);
      for (const x of ph.order) this.record.cite(x.g, 1);
      if (CD.PHASES[n].seals === 'narrow' && signer) this.record.cite(signer, 1);
      const row = this.record.write({ phase: n, signer, doctrine, cosigners: cos, readings: this.reading, seals: ph.order.map((x) => x.g) });
      this.log('record', { district: signer, doctrine, snapshot: row, value: this.reading });
      this.emit('courtRecord', { row, citations: Object.assign({}, this.record.cit) });
      this.bookTopLast = this.book.top(DIST);
      this.cancelLaws('phase complete');
      this.mode = 'cleanup'; this.lt = -1; this.cleanupStart = this.tick;
      const e = this.boss; e.untargetable = true; e.invulnT = 1e9;
      this.checkpoint('P' + n + ' complete');
    }
    startTransition() {
      this.mode = 'transition'; this.lt = -1;
      const next = this.phase + 1, s = CD.PHASES[next].start ? 720 * FX : 0, p = loopXY(s, { x: 0, y: 0 });
      this.glide = { t0: this.tick + 1, x0: this.hit.x, y0: this.hit.y, x1: p.x, y1: p.y, end: this.tick + 1 + C.TRANSITION };
      this.boss.untargetable = true; this.boss.invulnT = 1e9;
      this.emit('courtTransition', { from: this.phase, to: next, chair: this.phase });
      this.log('transition', { value: next });
    }
    endTransition() {
      this.glide = null;
      if (this.phase < 8) this.startPhase(this.phase + 1, false);
      else this.startIX();
    }

    // ------------------------------------------------------------ Phase IX: the four Measures
    startIX() {
      this.phase = 9; this.setPhaseHp(9); this.placeAtStart(9);
      const e = this.boss; e.untargetable = false; e.invulnT = 0;
      this.ix = { aSigner: null, aDoctrine: null, bSigner: null, fourth: { NW: 0, SW: 0, NE: 0, SE: 0 }, byMeasure: {}, bookB: null, articles: [], estopped: undefined, lwStart: null, struck: 0, dissents: 0, net: null, startTick: this.tick + 1 };
      this.emit('courtPhase', { phase: 9, name: CD.PHASES[9].name });
      this.log('phase', { value: 9, snapshot: { maxHp: e.maxHp } });
      this.startMeasure(0, false);
    }
    startMeasure(m, now) {
      const M = CD.MEASURES[m];
      this.mode = 'measure'; this.measure = m; this.reading = 0;
      this.readingStart = now ? this.tick : this.tick + 1; this.lt = now ? 0 : -1;
      this.laws = [];
      this.rd = this.newReading({ bell: !!M.bell, adjourn: !!M.adjourn });
      this.ph = this.newPhaseState(m === 0 ? 'A' : m === 1 ? 'B' : 'none');
      this.addLaw({ kind: 'weighing', disclose: 0, a: 0 });
      if (m < 3) this.addLaw({ kind: 'gavel', disclose: 0, a: C.VULN[0], b: C.VULN[1] });
      if (M.bell) this.addLaw({ kind: 'bell', disclose: 0, a: C.BELL[0], b: C.BELL[1] });
      if (M.adjourn) this.addLaw({ kind: 'adjourn', disclose: 0, a: C.ADJOURN[0], b: C.ADJOURN[1] });
      for (const l of M.laws) this.addLaw(Object.assign({}, l));
      M.esc.forEach((p, i) => this.queuePacket(i + 1, p.s, p.half, i ? C.PACKET2 : 0, { escort: true, witness: !!p.witness || !!p.perjury, perjury: !!p.perjury, priority: !!p.priority, airHalf: p.airHalf || p.half,
        route: p.order ? { order: p.order, disclose: 0 } : null }));
      if (m === 3) this.setupRecitation();
      this.checkpoint('IX-' + M.id);
      this.log('measure', { value: M.id });
      this.emit('courtMeasure', { measure: m, id: M.id, name: M.name });
      if (now) this.calendar();
    }
    measureVerdict() {
      const m = this.measure, M = CD.MEASURES[m], e = this.boss, ix = this.ix, rd = this.rd, ph = this.ph, max = e.maxHp;
      const at = sec(this.tick + 1 - ix.startTick);
      const fail = (clause, text) => this.defeat('Measure ' + M.id + ' failed', 'Measure ' + M.id + ' failed at ' + at + '. ' + text, clause);
      if (m === 0) {
        if (!ph.reqs[0].done && rd.witnessKilled) this.objection();
        if (!ph.reqs[0].done) return fail('West seal', this.unmetSeal(ph.reqs[0], 'West seal (NW or SW)').text);
        if (!rd.witnessKilled) return fail('Witness', 'Packet 2\'s True Witness was not killed before the Exit Gate' + (rd.voidReason ? ' (' + rd.voidReason + ')' : '') + '.');
        if (e.hp > M.check * max) return fail('Integrity', 'Integrity stood at ' + pct(e.hp / max) + '; the Measure required <= ' + pct(M.check) + '.');
        ix.aSigner = ph.reqs[0].g; ix.aDoctrine = this.docOf(ph.order[0].doc);
        this.record.cite(ix.aSigner, 1);
        const row = this.record.write({ phase: 'A', signer: ix.aSigner, doctrine: ix.aDoctrine, cosigners: [], readings: 1, seals: [ix.aSigner] });
        this.log('record', { district: ix.aSigner, doctrine: ix.aDoctrine, snapshot: row }); this.emit('courtRecord', { row, citations: Object.assign({}, this.record.cit) });
      } else if (m === 1) {
        this.objection();
        if (!ph.reqs[0].done) return fail('East seal', this.unmetSeal(ph.reqs[0], 'East seal (NE or SE)').text);
        const opp = GAL.filter((g) => northOf(g) !== northOf(ix.aSigner));
        const a0 = C.VULN[0] + C.DEBT_SHIFT * this.debt(), wtxt = '[' + sec(a0 + 1920) + ', ' + sec(C.VULN[1] + 1920) + ')';
        const best = Math.max(...opp.map((g) => rd.win[g]));
        const minor = ix.aDoctrine === 'corpus' ? 'animus' : 'corpus';
        const head = ix.aSigner + ' signed Measure A using ' + (ix.aDoctrine === 'corpus' ? 'Corpus' : 'Animus') + ', so ' + (northOf(ix.aSigner) ? 'South' : 'North') + ' owed 2.0% and ' + (minor === 'corpus' ? 'Corpus' : 'Animus') + ' owed 1.0% during ' + wtxt + (this.debt() ? ' (' + this.debt() + ' Bell Debt delayed opening by ' + sec(this.debt() * C.DEBT_SHIFT) + ')' : '') + '. ';
        if (best < C.SPATIAL * max) return fail('Spatial Contradiction', head + opp.join(' + ') + ' delivered ' + pct(best / max) + ' / 2.00% ✗.');
        if (rd.winDoc[minor] < C.CONTRA * max) return fail('Contra Proferentem', head + opp.join(' + ') + ' delivered ' + pct(best / max) + ' ✓, but ' + (minor === 'corpus' ? 'Corpus' : 'Animus') + ' delivered ' + pct(rd.winDoc[minor] / max) + ' / 1.00% ✗.');
        if (e.hp > M.check * max) return fail('Integrity', 'Integrity stood at ' + pct(e.hp / max) + '; the Measure required <= ' + pct(M.check) + '.');
        ix.bSigner = ph.reqs[0].g; ix.bookB = Object.assign({}, ix.byMeasure[1] || {});
        this.record.cite(ix.bSigner, 1);
        const row = this.record.write({ phase: 'B', signer: ix.bSigner, doctrine: this.docOf(ph.order[0].doc), cosigners: [], readings: 1, seals: [ix.bSigner] });
        this.log('record', { district: ix.bSigner, snapshot: row }); this.emit('courtRecord', { row, citations: Object.assign({}, this.record.cit) });
      } else if (m === 2) {
        if (!ph.narrow) return fail('Narrow Majority', 'Narrow Majority (with a gallery other than ' + ix.aSigner + '/' + ix.bSigner + ') was not achieved in [' + sec(5760 - 1920 + 960) + ', ' + sec(5760 - 1920 + 1560) + '): ' + this.stripText() + '.');
        for (const g of GAL) if (ix.fourth[g] < C.FOURTH_CHAIR * max) return fail('Fourth-Chair Quorum', 'Fourth-Chair Quorum: ' + g + ' contributed ' + pct(ix.fourth[g] / max) + ' of the required 1.00% across Measures A-C.');
        if (e.hp > M.check * max) return fail('Integrity', 'Integrity stood at ' + pct(e.hp / max) + '; the Measure required <= ' + pct(M.check) + '.');
        ix.cPassed = true; // Equipoise is judged by the Weighing sampled at this verdict tick (Measure D, local 0)
      }
      if (this.b.over) return;
      this.startMeasure(m + 1, false);
    }
    // Measure D: the Recitation reads the Record backwards; Struck Articles eat the Last Word
    setupRecitation() {
      const ix = this.ix;
      ix.articles = [];
      for (let j = 1; j <= 8; j++) { const row = this.record.row(9 - j); ix.articles.push({ j, phase: 9 - j, signer: row ? row.signer : null, doctrine: row ? row.doctrine : null, affirmed: false, dissent: false, hitTick: -1, closed: false, reason: null }); }
    }
    recitationProjection() {
      if (!this.boss || this.phase !== 9 || !this.ix || !this.ix.articles.length && this.measure !== 3 && this.record.rows.length < 8) return null;
      const out = []; const ix = this.ix;
      const dStart = ix.startTick + 3 * C.READING;
      for (let j = 1; j <= 8; j++) {
        const row = this.record.row(9 - j); if (!row) continue;
        const t0 = dStart + (j - 1) * C.ARTICLE, t1 = t0 + C.ARTICLE - 1;
        const s0 = this.sFx + this.dir * Math.max(0, t0 - this.tick) * FX, s1 = this.sFx + this.dir * Math.max(0, t1 - this.tick) * FX;
        const a = loopXY(s0, { x: 0, y: 0 }), b2 = loopXY(s1, { x: 0, y: 0 });
        const reach = row.signer ? this.b.units.some((u) => this.districtOf(u) === row.signer && (Util.dist(u.x, u.y, a.x, a.y) <= u.rangePx + C.BOSS_SIZE * 0.3 || Util.dist(u.x, u.y, b2.x, b2.y) <= u.rangePx + C.BOSS_SIZE * 0.3)) : false;
        out.push({ j, phase: 9 - j, signer: row.signer, from: a, to: b2, t0, reachable: reach });
      }
      return out;
    }
    /** Measure C's Equipoise clause is read off the Weighing sampled at the verdict tick (Measure D, local 0, after commands). */
    equipoise() {
      const ix = this.ix, w = this.lastWeigh;
      if (ix.cPassed && w && (w.ns || w.we)) {
        this.defeat('Measure C failed', 'Measure C failed at ' + sec(this.tick - ix.startTick) + ': Equipoise. The floor was listing ' + [w.ns, w.we].filter(Boolean).join(' and ') + ' at the verdict (N ' + pct(w.shareN) + ' / W ' + pct(w.shareW) + '; each axis must stay within 65/35).', 'Equipoise');
        return;
      }
      ix.estopped = this.record.estopped();
      this.log('estoppel', { district: ix.estopped || 'Unanimous Bench', snapshot: Object.assign({}, this.record.cit) });
      this.emit('courtEstoppel', { gallery: ix.estopped, citations: Object.assign({}, this.record.cit) });
    }
    recitationCalendar() {
      const lt = this.lt, ix = this.ix;
      if (lt === C.RECITATION) {
        const testimony = this.rd.testimony && !this.rd.testimonyVoid ? 1 : 0;
        ix.net = Math.max(0, ix.struck - ix.dissents - testimony);
        ix.lwStart = C.LAST_WORD[0] + C.STRIKE * ix.net;
        this.log('courtRises', { value: ix.net, snapshot: { struck: ix.struck, dissents: ix.dissents, testimony, opening: ix.lwStart } });
        this.emit('courtRises', { net: ix.net, opening: ix.lwStart });
      }
      if (lt === C.LAST_WORD[0] && ix.net >= 4) { this.defeat('The Ninth Chair stayed sealed', 'The Ninth Chair stayed sealed at ' + sec(this.tick - ix.startTick) + ': ' + ix.struck + ' Articles struck. ' + this.articleText(), 'Recitation'); return; }
      if (ix.lwStart != null && lt === ix.lwStart) { this.log('lastWord', { value: lt }); this.emit('courtLastWord', { opening: lt }); }
    }
    closeArticle(j) {
      const ix = this.ix, a = ix.articles[j - 1]; if (!a || a.closed) return;
      a.closed = true;
      if (!a.affirmed) { ix.struck++; a.reason = this.articleReason(a); }
      else if (a.dissent) ix.dissents++;
      if (a.affirmed) this.stats.articles++;
      this.log('article', { district: a.signer, value: j, snapshot: { phase: a.phase, affirmed: a.affirmed, dissent: a.dissent }, reason: a.reason });
      this.emit('courtArticle', { article: a });
    }
    articleReason(a) {
      const units = this.b.units.filter((u) => this.districtOf(u) === a.signer);
      const where = '(' + ((this.hit.x / TILE) - 0.5).toFixed(1) + ',' + ((this.hit.y - Balance.FIELD_Y) / TILE - 0.5).toFixed(1) + ')';
      if (!units.length) return 'Article ' + a.j + ' (Phase ' + ROMAN[a.phase] + ', signer ' + a.signer + '): ' + a.signer + ' had no tower.';
      if (this.lastWarrant && this.lastWarrant.q === a.signer && this.tick - this.lastWarrant.tick < C.WARRANT_DISABLE) return 'Article ' + a.j + ' (Phase ' + ROMAN[a.phase] + ', ' + a.signer + '): ' + a.signer + ' disabled by the Bench Warrant at ' + sec(this.lastWarrant.tick - this.ix.startTick) + '.';
      return 'Article ' + a.j + ' (Phase ' + ROMAN[a.phase] + ', signer ' + a.signer + '): hitbox at ' + where + ', ' + a.signer + ' landed no qualifying hit.';
    }
    articleText() { return this.ix.articles.filter((a) => a.closed && !a.affirmed).map((a) => a.reason).join(' '); }

    // ------------------------------------------------------------ Narrow Majority (rolling 6-second strips)
    narrowCheck() {
      const ph = this.ph; if (!ph || ph.narrow) return;
      const isVI = this.mode === 'reading' && this.phase === 6, isC = this.mode === 'measure' && this.measure === 2;
      if (!isVI && !isC) return;
      const lt = this.lt; if (lt < C.VULN[0] || lt >= C.VULN[1]) return;
      const max = this.boss.maxHp, thr = C.NARROW * max * FX;
      const up = GAL.filter((g) => this.strips.sum(g) >= thr);
      for (const g of up) if (ph.firstReach[g] == null) ph.firstReach[g] = this.tick;
      if (up.length < 2) return;
      if (isC) { const ix = this.ix; if (!up.some((g) => g !== ix.aSigner && g !== ix.bSigner)) return; }
      let signer = null; for (const g of up) if (signer === null || ph.firstReach[g] < ph.firstReach[signer]) signer = g;
      const doctrine = this.strips.sum(signer + ':animus') > this.strips.sum(signer + ':corpus') ? 'animus' : 'corpus';
      ph.narrow = { pair: up.slice(), signer, doctrine, tick: this.tick };
      this.log('narrowMajority', { district: signer, doctrine, snapshot: up });
      this.emit('courtSeal', { gallery: signer, req: 'narrow', via: 'strip' });
    }

    // ------------------------------------------------------------ per-tick steps
    pre() {
      this.spawnDue();
      this.forkCheck();
      const L = this.list;
      for (const e of this.b.enemies) {
        if (!e.court || e.air) continue;
        const cor = this.corridorOf(e);
        let down = false;
        if (cor && cor !== 'C' && cor !== 'EXIT') down = LG.Scales.depth(L, cor) >= 1;
        else if (cor === 'EXIT') down = L.we === 'E';
        e.courtSpd = down ? 1 + C.DOWNHILL : 1;
      }
    }
    post() {
      const b = this.b;
      if (this.mode === 'wave' || this.inTrial()) for (const l of this.laws) if (l.state === 'pending' && l.disclose === this.lt) this.disclose(l);
      this.narrowCheck();
      if (this.mode === 'reading' && this.lt === C.READING - 1) this.judge();
      else if (this.mode === 'measure') {
        if (this.measure === 3) {
          if (this.lt < C.RECITATION && (this.lt + 1) % C.ARTICLE === 0) this.closeArticle((this.lt + 1) / C.ARTICLE);
          if (this.lt === C.READING - 1 && !this.shattered) this.defeat('The Ninth Chair Closed', 'The Last Word closed unexecuted at ' + sec(this.tick + 1 - this.ix.startTick) + ' with ' + Math.ceil(this.boss.hp) + ' HP (' + pct(this.boss.hp / this.boss.maxHp) + ') remaining.', 'Last Word');
        } else if (this.lt === C.READING - 1) this.measureVerdict();
      }
      if (this.mode === 'measure' && this.measure === 3 && this.lt === 0) this.equipoise();
      if (b.over) return;
      if (this.mode === 'cleanup') {
        const left = b.enemies.some((x) => x.alive && x !== this.boss) || this.pending.length;
        if (!left) this.startTransition();
      } else if (this.mode === 'transition' && this.glide && this.tick + 1 >= this.glide.end) this.endTransition();
      // advance to the next tick
      this.tick++;
      this.budget.advance();
      if (this.mode === 'wave' || this.inTrial()) { this.book.advance(); this.doct.advance(); this.chars.advance(); this.strips.advance(); }
      this.forum.advance();
      this.lt++;
      this.calendar();
    }
    defeat(title, text, clause) {
      if (this.b.over) return;
      this.verdict = { victory: false, title, text, clause: clause || null, tick: this.tick, phase: this.phase, reading: this.reading, measure: this.measure >= 0 ? CD.MEASURES[this.measure].id : null };
      this.log('defeat', { reason: text, snapshot: { title, clause: clause || null } });
      this.checkpoint('defeat');
      this.mode = 'over';
      this.b.finish(false);
    }
    onFinish(victory) {
      if (this.verdict && !victory) return;
      if (victory) { this.verdict = { victory: true, title: 'The Crown is shattered', text: 'The Court of Nine Reflections finds for the defense.', tick: this.tick }; this.log('victory', { value: this.b.baseHp }); }
      else if (!this.verdict) {
        const t = this.shattered ? 'Verdict Spoiled by Escort Leak' : 'The defense ran out of lives';
        const where = this.phase ? 'Phase ' + ROMAN[this.phase] + (this.mode === 'measure' || this.phase === 9 ? '' : ', Reading ' + this.reading) : 'Docket ' + (this.b.wave || 1);
        this.verdict = { victory: false, title: t, text: t + ' (' + where + ', ' + sec(this.tick) + '): the last life leaked' + (this.shattered ? ' after the Crown was shattered.' : '.'), clause: 'Lives', tick: this.tick };
        this.log('defeat', { reason: this.verdict.text });
      }
      this.checkpoint('final');
    }
    summary() {
      const ix = this.ix;
      return {
        verdict: this.verdict, phase: this.phase, reading: this.reading, measure: this.measure >= 0 ? CD.MEASURES[this.measure].id : null, tick: this.tick, hash: this.hash(),
        record: this.record.rows.map((r) => Object.assign({}, r)), citations: Object.assign({}, this.record.cit), mistrials: this.stats.mistrials,
        articles: ix ? ix.articles.filter((a) => a.affirmed).length : 0, strikes: ix && ix.net != null ? ix.net : null, struck: ix ? ix.struck : null,
        unanimous: !!(ix && ix.estopped === null), estopped: ix ? ix.estopped : undefined, aSigner: ix ? ix.aSigner : null, bSigner: ix ? ix.bSigner : null,
        lost: this.lostTotal ? this.lostTotal / FX : 0,
      };
    }
  }

  // ------------------------------------------------------------ the boss AI and the public hook table
  JJK.BossAI = JJK.BossAI || {};
  JJK.BossAI.jahjuanBoss = {
    init(b, e) {
      if (b.court) { b.court.initBoss(e); return; }
      // outside the Court (Owner Lab sandbox) he is an ordinary walking boss with Phase I Integrity
      const iu = CD.integrityUnit(); e.maxHp = e.hp = CD.phaseMax(iu, 1); e.speed = 40; e.yen = 0;
    },
    update(b, e) { if (b.court) b.court.bossTick(e); },
  };
  JJK.CourtSim = { Court, MIRROR, loopXY, SENTINEL, PX_PER_TICK, ROMAN, inCorridor };
})(typeof window !== 'undefined' ? window : globalThis);
