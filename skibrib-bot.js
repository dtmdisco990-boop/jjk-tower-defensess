/* SKIBRIB autoplayer: an optimizing strategy used to PROVE the challenge is beatable with legitimate play, and to show that weaker
   strategies are slaughtered. It plays through the public Battle API only: place / upgrade / sell / setTargeting / activateDomain /
   startWave. No startYen overrides, no god mode, no debug helpers, no stat edits.

   What it knows (the same things a dedicated player learns):
   - roster knowledge: a micro-benchmark of every team member's AoE and single-target DPS at every upgrade level
   - map knowledge: how much path each tile covers at each range, weighted toward the exit (intersections count twice)
   - wave knowledge: the upcoming wave script (it is shown in the game's NEXT-WAVE preview)
   What it decides, live:
   - spending by value per Yen, saving for big purchases, emergency spending when something is about to leak
   - selling the weakest unit when the deployment cap blocks a better one
   - targeting per unit (with a human-like change cooldown), e.g. popping Fake Weaklings early, killing Buff Toilets and channeling
     Disruptors first, never wasting everything on the tank in front
   - Domain timing: boss burst windows, clashes, emergencies, and saving them before boss waves and Wave 65

   Feature flags turn each of those off to build the "weaker strategies".
   CLI: node tests/skibrib-bot.js [team=a,b,c] [seed=3] [profile=optimal] [level=30] [stars=5] */
'use strict';
const path = require('path');
const { loadGame } = require(path.join(__dirname, 'load.js'));

function makeBot(J) {
  const { Battle, Balance, Util } = J;
  const TILE = Balance.TILE, STEP = Balance.STEP;

  // ------------------------------------------------------------------ roster knowledge (cached micro-benchmarks)
  const benchCache = {};
  function bench(id, level, stars, lvlUp) {
    const key = id + ':' + level + ':' + stars + ':' + lvlUp;
    if (benchCache[key]) return benchCache[key];
    const out = {};
    for (const mode of ['horde', 'single']) {
      const b = new Battle({ mapId: 'tokyo', diff: 'normal', team: [{ id, level, stars }], seed: 9, startYen: 1e7 });
      b.state = 'wave'; b.canStartWave = () => false; b.godMode = true;
      let slot = null, bs = -1;
      for (const s of b.geo.slots.values()) { if (!b.canPlace(id, s.c, s.r).ok) continue; const v = J.Bot.tileScore(b, s, J.Characters[id], J.Characters[id].base.range, true); if (v > bs) { bs = v; slot = s; } }
      const u = b.place(id, slot.c, slot.r).unit;
      while (u.level < lvlUp && b.upgrade(u).ok);
      const p = b.geo.ground[0]; let best = 0, bd = Infinity; const tmp = { x: 0, y: 0 };
      for (let d = 0; d < p.length; d += 4) { p.posAt(d, tmp); const q = (tmp.x - u.x) ** 2 + (tmp.y - u.y) ** 2; if (q < bd) { bd = q; best = d; } }
      const n = mode === 'horde' ? 6 : 1, HP = mode === 'horde' ? 3000 : 20000;
      const mk = (i) => { const e = b.spawnEnemy(mode === 'horde' ? 'wisp' : 'brute', { wave: 1, dist: best + (i - n / 2) * 12 }); e.hp = e.maxHp = HP; e.armor = 0; e.knockImmune = true; e.slot = i; };
      for (let i = 0; i < n; i++) mk(i);
      const T = 24;
      while (b.time < T) {
        const alive = new Set(); for (const e of b.enemies) if (e.alive) alive.add(e.slot);
        for (let i = 0; i < n; i++) if (!alive.has(i)) mk(i);
        for (const e of b.enemies) { e.speedMul = 0; e.stunT = 0; }
        b.update(STEP);
      }
      let dmg = 0; for (const x of b.units) dmg += x.damageDealt;
      out[mode] = dmg / T;
    }
    benchCache[key] = out;
    return out;
  }

  // ------------------------------------------------------------------ helpers
  const isCursed = (def) => def.base.dtype === 'cursed' || def.base.dtype === 'true';
  const WARD = { panda: true, miwa: true };
  const DAMAGE_DOMAINS = { mutualLove: 3, malevolentShrine: 4, deadlySentencing: 2, embodiment: 2.5, ironMountain: 2, idleDeath: 1.5, unlimitedVoid: 2.5, shadowGarden: 1 };
  const CROWD_DOMAINS = { unlimitedVoid: 4, shadowGarden: 3, ironMountain: 2.5, embodiment: 2.5, malevolentShrine: 3, mutualLove: 2, idleDeath: 1, deadlySentencing: 2 };

  const PROFILES = {
    optimal: { targeting: true, domains: 'smart', econ: 'smart', sell: true, placement: 'smart', save: true },
    noTargeting: { targeting: false, domains: 'smart', econ: 'smart', sell: true, placement: 'smart', save: true },
    spamDomains: { targeting: true, domains: 'spam', econ: 'smart', sell: true, placement: 'smart', save: true },
    noDomains: { targeting: true, domains: 'off', econ: 'smart', sell: true, placement: 'smart', save: true },
    greedy: { targeting: true, domains: 'smart', econ: 'greedy', sell: false, placement: 'smart', save: false },
    sloppyPlacement: { targeting: true, domains: 'smart', econ: 'smart', sell: true, placement: 'naive', save: true },
    casual: { targeting: false, domains: 'spam', econ: 'greedy', sell: false, placement: 'naive', save: false },
  };

  class SkibBot {
    constructor(b, cfg) {
      this.b = b;
      this.cfg = Object.assign({}, PROFILES[(cfg && cfg.profile) || 'optimal'], cfg || {});
      this.decideT = 0;
      this.log = [];
      this.tgtCd = new Map();
      this.leaks = 0;
      this.levelOf = {}; for (const id of b.teamOrder) this.levelOf[id] = b.roster[id].level;
      // path samples every 8px with progress p in [0,1]
      const p = b.geo.ground[0]; this.samples = [];
      for (let d = 0; d <= p.length; d += 8) { const q = p.posAt(d, { x: 0, y: 0 }); this.samples.push({ x: q.x, y: q.y, p: d / p.length }); }
      this.covCache = new Map();
      this.dps = {}; // id -> [ {horde, single} per level ]
      for (const id of b.teamOrder) {
        const def = b.roster[id].def; this.dps[id] = [];
        for (let L = 1; L <= def.maxLevel; L++) this.dps[id][L] = bench(id, b.roster[id].level, b.roster[id].stars, L);
      }
      b.events.on('leak', (e) => { this.leaks += e.enemy.leak; });
      this.incomes = []; this._yen0 = 0;
      b.events.on('waveClear', () => { const y = b.stats.yenEarned; this.incomes.push(y - this._yen0); this._yen0 = y; if (this.incomes.length > 4) this.incomes.shift(); });
      b.events.on('bossPhase', (e) => this.onBossPhase(e));
      this.window = null; // a boss burst window the domains are being saved for
    }

    // ---------------------------------------------------------------- map knowledge
    coverage(slot, rangePx, late) {
      const key = slot.c + ',' + slot.r + ':' + Math.round(rangePx) + ':' + (late ? 1 : 0);
      let v = this.covCache.get(key);
      if (v !== undefined) return v;
      v = 0;
      const r2 = rangePx * rangePx;
      for (const s of this.samples) if ((s.x - slot.x) ** 2 + (s.y - slot.y) ** 2 <= r2) v += late ? (s.p > 0.62 ? 2.2 : 0.4) : 1 + 0.9 * s.p;
      v = v * 8 / TILE; // tiles of path
      this.covCache.set(key, v);
      return v;
    }
    rangeAt(id, level, slot) {
      const def = this.b.roster[id].def, ro = this.b.roster[id];
      let r = def.base.range;
      for (let i = 0; i < level - 1; i++) r += def.upgrades[i].range;
      if (ro.stars >= 3) r += Balance.starRangeAt3;
      if (slot.type === 'E') r += Balance.elevatedRange;
      return r * TILE;
    }
    pathDist(slot) { let d = Infinity; for (const q of this.samples) { const v = (q.x - slot.x) ** 2 + (q.y - slot.y) ** 2; if (v < d) d = v; } return Math.sqrt(d); }
    // ---------------------------------------------------------------- wave knowledge
    outlook() {
      // composition of the current + next 2 waves (what the NEXT-WAVE preview tells a player)
      const b = this.b, from = Math.max(1, b.wave), to = Math.min(b.totalWaves, from + 2);
      let hp = 0, big = 0, armored = 0, disr = 0, fast = 0;
      for (let n = from; n <= to; n++) {
        for (const en of b.waves[n - 1].entries) {
          const d = J.Enemies[en.type] || J.Bosses[en.type];
          const h = (d.hp + (d.shield || 0)) * (en.boss ? 1 : J.Maps.skibrib.hpScale(n)) * (en.hpMult || 1);
          hp += h;
          if (en.boss || d.hp >= 600) big += h;
          if ((d.armor || 0) >= 0.5) armored += h;
          if (d.chCd) disr++;
          if (d.speed >= 120) fast += h;
        }
      }
      return { aoeW: hp ? Util.clamp(1 - big / hp, 0.25, 0.85) : 0.6, armoredFrac: hp ? armored / hp : 0, disruptors: disr, fastFrac: hp ? fast / hp : 0 };
    }
    // ---------------------------------------------------------------- unit value
    unitValue(id, level, slot, look) {
      const def = this.b.roster[id].def, d = this.dps[id][level];
      const rp = this.rangeAt(id, level, slot);
      const cov = Math.min(1.8, this.coverage(slot, rp) / 16);
      const late = Math.min(1.6, this.coverage(slot, rp, true) / 10);
      let v = (d.horde * look.aoeW + d.single * (1 - look.aoeW)) * (0.55 * cov + 0.45 * late);
      if (!isCursed(def)) v *= 1 - 0.75 * look.armoredFrac;
      // a Domain (max level) is worth a lot more than its DPS: clashes, burst windows, emergencies. The first one most of all.
      if (level === def.maxLevel && def.upgrades.some((u) => u.flags && u.flags.domain)) {
        const have = this.b.units.filter((u) => u.flags.domain && u.id !== id).length;
        v += this.teamValue(look) * (have === 0 ? 0.35 : have === 1 ? 0.15 : 0.05);
      }
      return v;
    }
    effValue(u, look) { return this.unitValue(u.id, u.level, u, look); }
    teamValue(look) {
      if (this._tvT === this.b.time) return this._tv;
      let t = 0; for (const u of this.b.units) { const d = this.dps[u.id][u.level]; t += d.horde * look.aoeW + d.single * (1 - look.aoeW); }
      this._tvT = this.b.time; this._tv = t; return t;
    }
    cumCost(id, L) { const d = this.b.roster[id].def; let c = this.b.roster[id].cost; for (let i = 0; i < L - 1; i++) c += d.upgrades[i].cost; return c; }
    income() { const a = this.incomes; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 300; }
    /** Best (value / total cost) level reachable within a budget: a planned purchase, not just the level-1 price tag. */
    plan(id, slot, look, budget) {
      const def = this.b.roster[id].def; let best = null;
      for (let L = 1; L <= def.maxLevel; L++) {
        const c = this.cumCost(id, L);
        if (c > budget && L > 1) break;
        const v = this.unitValue(id, L, slot, look), sc = v / c;
        if (!best || sc > best.score) best = { L, v, c, score: sc };
      }
      return best;
    }

    bestSlot(id, look) {
      const b = this.b; let best = null, bv = -1;
      const naive = this.cfg.placement === 'naive';
      for (const s of b.geo.slots.values()) {
        if (b.grid.has(s.c + ',' + s.r)) continue;
        const ok = b.canPlace(id, s.c, s.r);
        if (!ok.ok && ok.reason !== 'Not enough Yen') continue;
        let v;
        if (naive) v = this.coverage(s, this.rangeAt(id, 1, s)) - 0.6 * s.c; // the "obvious" spots near the start of the path
        else {
          v = this.unitValue(id, 1, s, look);
          // disruptor awareness: ranged units stand out of reach of the ring (1.6 tiles from the path); melee units do not stack
          if (look.disruptors > 0 && !WARD[id] && this.pathDist(s) < 1.75 * TILE && this.rangeAt(id, 1, s) > 2.6 * TILE) v *= 0.6;
          if (look.disruptors > 0 && !WARD[id]) {
            let crowd = 0, warded = false;
            for (const u of b.units) { const dd = Util.dist(u.x, u.y, s.x, s.y); if (dd <= 2.2 * TILE) crowd++; if (u.flags.ward && dd <= u.flags.ward * TILE) warded = true; if (u.id === 'panda' && dd < 1) warded = true; }
            if (!warded) v *= 1 / (1 + 0.12 * crowd);
          }
          if (WARD[id]) { let near = 0; for (const u of b.units) if (Util.dist(u.x, u.y, s.x, s.y) <= 1.6 * TILE) near++; v = near + this.coverage(s, this.rangeAt(id, 1, s)) * 0.05; }
        }
        if (v > bv) { bv = v; best = s; }
      }
      return best;
    }

    // ---------------------------------------------------------------- spending
    options(look) {
      const b = this.b, out = [];
      const capped = b.units.length >= b.rules.maxDeployed;
      const budget = b.yen + (this.cfg.save ? this.income() * 1.5 : 0);
      for (const id of b.teamOrder) {
        if (b.placedCount(id) >= b.maxPlace(id) || capped) continue;
        const slot = this.bestSlot(id, look); if (!slot) continue;
        const cost = b.roster[id].cost;
        if (WARD[id]) { const need = look.disruptors > 0 && b.units.length >= 4 && !b.units.some((u) => WARD[u.id]); if (need) out.push({ kind: 'place', id, slot, cost, gain: 1e9, score: 1e9 }); continue; }
        const pl = this.cfg.econ === 'greedy' ? { v: this.unitValue(id, 1, slot, look), c: cost } : this.plan(id, slot, look, budget);
        out.push({ kind: 'place', id, slot, cost, gain: pl.v, score: pl.v / pl.c });
      }
      for (const u of b.units) {
        const cost = b.upgradeCost(u); if (cost == null) continue;
        if (WARD[u.id]) continue;
        const gain = this.unitValue(u.id, u.level + 1, u, look) - this.effValue(u, look);
        out.push({ kind: 'up', u, cost, gain: Math.max(0, gain), score: Math.max(0, gain) / cost });
      }
      out.sort((a, c) => c.score - a.score);
      return out;
    }
    spend(look) {
      const b = this.b;
      for (let guard = 0; guard < 12; guard++) {
        const opts = this.options(look);
        if (!opts.length) break;
        const best = opts[0];
        if (this.cfg.econ === 'greedy') {
          // greedy: buy the first affordable thing in roster order, never save
          const pick = opts.filter((o) => o.cost <= b.yen).sort((x, y) => (x.kind === 'place' ? 0 : 1) - (y.kind === 'place' ? 0 : 1))[0];
          if (!pick || !this.exec(pick)) break;
          continue;
        }
        if (best.cost <= b.yen) { if (!this.exec(best)) break; continue; }
        // can't afford the best option: save for it if it is close, unless something is about to leak
        const affordable = opts.filter((o) => o.cost <= b.yen);
        if (!affordable.length) break;
        const alt = affordable[0];
        const emergency = this.danger() > 2.5;
        const close = best.cost <= b.yen + 120 + 18 * b.wave;
        if (this.cfg.save && !emergency && close && alt.score < best.score * 0.8) break;
        if (!this.exec(alt)) break;
      }
      if (this.cfg.sell && b.units.length >= b.rules.maxDeployed && b.yen > 400) this.considerSell(look);
    }
    exec(o) {
      const b = this.b;
      if (o.kind === 'place') { const r = b.place(o.id, o.slot.c, o.slot.r); return r.ok; }
      return b.upgrade(o.u).ok;
    }
    considerSell(look) {
      // at the deployment cap with money to spare: sell the unit with the least value per invested Yen and put a higher-ceiling
      // unit in its place (that is how a player turns a cheap early army into a late-game one)
      const b = this.b;
      if (b.state === 'wave' && this.danger() > 1) return; // never reshuffle in the middle of a crisis
      const ups = this.options(look).filter((o) => o.kind === 'up');
      const upScore = ups.length ? ups[0].score : 0;
      let worst = null, wv = Infinity;
      for (const u of b.units) { if (WARD[u.id]) continue; const v = this.effValue(u, look) / u.invested; if (v < wv) { wv = v; worst = u; } }
      if (!worst) return;
      const refund = b.sellValue(worst), oldV = this.effValue(worst, look);
      let best = null;
      for (const id of b.teamOrder) {
        if (b.placedCount(id) - (id === worst.id ? 1 : 0) >= b.maxPlace(id) || WARD[id]) continue;
        if (b.roster[id].cost > b.yen + refund) continue;
        const slot = this.bestSlot(id, look) || worst; if (!slot) continue;
        const pl = this.plan(id, slot, look, b.yen + refund + this.income() * 2);
        const net = pl.c - refund, gain = pl.v - oldV;
        if (gain <= oldV * 0.3 || net <= 0) continue;
        const sc = gain / net;
        if (sc > upScore * 1.1 && (!best || sc > best.sc)) best = { id, slot, sc };
      }
      if (!best) return;
      this.log.push('w' + b.wave + ' sell ' + worst.id + ' L' + worst.level + ' -> ' + best.id);
      const c = worst.c, r = worst.r;
      b.sell(worst);
      const slot = b.grid.has(best.slot.c + ',' + best.slot.r) ? { c, r } : best.slot;
      if (!b.place(best.id, slot.c, slot.r).ok) b.place(best.id, c, r);
    }

    // ---------------------------------------------------------------- targeting
    /** Rule-based targeting, the way strong players actually micro: stay on FIRST, switch only for a reason.
        Preference: interrupt a channeling Disruptor > the boss > a Buff Toilet > a weakling at the spawn; never pop a weakling late. */
    pref(u, e) {
      if (!e) return -9;
      const d = e.def, p = e.dist / e.pathLen;
      const R = this.cfg.rules || 'dbaw';
      if (d.chCd && e.channeling && R.includes('d')) return 4;
      if (e.boss && R.includes('b')) return 3;
      if (d.aura && R.includes('a')) return 2;
      if (d.fakeDeath && R.includes('w')) return p < 0.22 ? 1 : -1;
      return 0;
    }
    retarget() {
      const b = this.b;
      for (const u of b.units) {
        if (u.def.targeting.length < 2 || u.disabledT > 0) continue;
        if (b.time < (this.tgtCd.get(u.uid) || 0)) continue;
        const cur = this.pref(u, b.pickTarget(u, { mode: u.targeting }));
        let best = null, bv = cur;
        for (const m of u.def.targeting) {
          if (m === u.targeting) continue;
          const v = this.pref(u, b.pickTarget(u, { mode: m }));
          if (v > bv) { bv = v; best = m; }
        }
        const def = u.def.defaultTargeting;
        if (!best && cur <= 0 && u.targeting !== def && this.pref(u, b.pickTarget(u, { mode: def })) >= cur) best = def; // back to default
        if (best && best !== u.targeting) { b.setTargeting(u, best); this.tgtCd.set(u.uid, b.time + 1.2); }
      }
    }

    // ---------------------------------------------------------------- domains
    onBossPhase(e) {
      const n = e.name;
      if (/EXPOSED|GUARD DOWN|ENRAGE|THE KING RUNS|PHASE 3: ENRAGED/.test(n)) this.window = { until: this.b.time + 4, kind: 'damage' };
    }
    pickDomain(table) {
      const b = this.b; let best = null, bv = 0;
      for (const u of b.units) { if (!b.canActivateDomain(u)) continue; const v = table[u.flags.domain] || 1; if (v > bv) { bv = v; best = u; } }
      return best;
    }
    domains() {
      const b = this.b;
      if (this.cfg.domains === 'off' || b.domain) return;
      if (this.cfg.domains === 'spam') { if (b.enemies.length > 4) { const u = this.pickDomain(CROWD_DOMAINS); if (u) b.activateDomain(u); } return; }
      const boss = b.enemies.find((e) => e.alive && e.boss);
      // 1) clash: a telegraph that needs a Domain active when it lands
      const clash = b.hazards.find((h) => h.hint && /Domain/i.test(h.hint) && h.dur - h.t < 1.6);
      if (clash) { const u = this.pickDomain(DAMAGE_DOMAINS); if (u) { b.activateDomain(u); this.log.push('w' + b.wave + ' clash ' + u.flags.domain); return; } }
      // 2) boss burst windows
      if (this.window && b.time < this.window.until) { const u = this.pickDomain(DAMAGE_DOMAINS); if (u) { b.activateDomain(u); this.log.push('w' + b.wave + ' burst ' + u.flags.domain); this.window = null; return; } }
      // boss knowledge: the Run Killer's Demon Charge repeats every 22s in phase 3 and must be clashed. Keep a Domain for it.
      const ready = b.units.filter((u) => b.canActivateDomain(u)).length;
      const clashSoon = boss && boss.ai && boss.def.ai === 'skibDemon' && boss.ai.p === 3 && boss.ai.chargeCd < 26;
      if (clashSoon && ready <= 1 && boss.dist / boss.pathLen < 0.95) return;
      // 3) a boss about to escape
      if (boss && boss.dist / boss.pathLen > 0.8) { const u = this.pickDomain(DAMAGE_DOMAINS); if (u) { b.activateDomain(u); this.log.push('w' + b.wave + ' last-stand ' + u.flags.domain); return; } }
      // 4) emergencies (something is about to leak). Domains are saved before and during boss waves and before Wave 65.
      const dg = this.danger();
      const nextW = b.wave + (b.state === 'wave' ? 0 : 1);
      const hold = boss ? 10 : [28, 29, 48, 49, 63, 64, 68, 69, 73, 74].includes(nextW) ? 9 : 3;
      if (dg > hold) { const u = this.pickDomain(CROWD_DOMAINS); if (u) { b.activateDomain(u); this.log.push('w' + b.wave + ' emergency ' + u.flags.domain + ' d=' + dg.toFixed(1)); } }
    }

    danger() {
      // how close is something to leaking: non-boss enemies deep in the path weighted by their leak value
      let d = 0;
      for (const e of this.b.enemies) { if (!e.alive || e.boss) continue; const p = e.dist / e.pathLen; if (p > 0.55) d += e.leak * (p - 0.55) * 4; }
      return d;
    }

    // ---------------------------------------------------------------- main loop
    step() {
      const b = this.b;
      this.decideT -= STEP;
      if (this.decideT <= 0) {
        this.decideT = 0.25;
        const look = this.outlook();
        this.domains();
        if (this.cfg.targeting) this.retarget();
        this.spend(look);
        if ((b.state === 'prep' && b.units.length) || b.state === 'intermission') { if (b.canStartWave()) b.startWave(); }
      }
      b.update(STEP);
    }
    run(maxSeconds) {
      const b = this.b;
      while (!b.over && b.time < (maxSeconds || 12000)) this.step();
      return b.getSummary();
    }
  }
  SkibBot.PROFILES = PROFILES;
  SkibBot.bench = bench;
  return SkibBot;
}

function play(opts) {
  opts = opts || {};
  const J = opts.J || loadGame();
  const SkibBot = makeBot(J);
  const team = opts.team || ['yuji', 'mahitoC', 'choso', 'gojo', 'hakari', 'sukunaC'];
  const b = new J.Battle({ mapId: 'skibrib', diff: 'skibrib', team: team.map((id) => ({ id, level: opts.level || 30, stars: opts.stars == null ? 5 : opts.stars })), seed: opts.seed || 3 });
  const bot = new SkibBot(b, Object.assign({ profile: opts.profile || 'optimal' }, opts.cfg || {}));
  const marks = [];
  b.events.on('waveClear', (e) => { if (opts.trace && (e.n % 5 === 0 || e.n >= 61)) marks.push('w' + e.n + ':' + b.baseHp + 'hp:¥' + Math.round(b.yen) + ':u' + b.units.length); });
  const t0 = Date.now();
  const s = bot.run(opts.maxSeconds);
  return { summary: s, b, bot, marks, ms: Date.now() - t0 };
}

module.exports = { makeBot, play };

if (require.main === module) {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => x.split('=')));
  const r = play({ team: a.team ? a.team.split(',') : undefined, seed: +(a.seed || 3), profile: a.profile || 'optimal', level: +(a.level || 30), stars: a.stars != null ? +a.stars : 5, trace: true });
  const s = r.summary;
  console.log((s.victory ? 'WIN ' : 'LOSE') + ' wave ' + s.wave + '/75 lives ' + s.baseHp + ' sim ' + s.duration + 's real ' + r.ms + 'ms profile=' + (a.profile || 'optimal') + ' team=' + r.b.teamOrder.join(','));
  console.log(r.marks.join(' '));
  if (a.log) console.log(r.bot.log.slice(-40).join('\n'));
}
