/* RISE OF JAHJUAN policy bots (test-side only). A bot reads only public battle state and court.forecast(), and issues only
   the six legal commands: place, upgrade, sell, setTargeting, activateDomain, startWave. No stat edits, no Yen, no state writes.
   Profiles (cfg.profile) and ablation switches (cfg.ablate) let the evidence script prove that each competency matters.
   usage: node tests/court-bot.js [seed=1] [profile=clean] [ablate=a]  */
'use strict';
const path = require('path');

const MIRROR = { first: 'last', last: 'first', strongest: 'weakest', weakest: 'strongest', closest: 'closest' };

// Build plans: [label, action]. place: [id, c, r]; up: [c, r] (upgrade the tower on that bench). Executed in order as Yen allows.
const PLANS = {
  clean: [
    ['C yuji N', { place: ['yuji', 9, 3] }], ['C yuji S', { place: ['yuji', 10, 5] }], ['NW nobara (upper air)', { place: ['nobara', 5, 2] }],
    ['SE nobara (lower air)', { place: ['nobara', 14, 6] }], ['NW yuji', { place: ['yuji', 7, 2] }], ['SE yuji', { place: ['yuji', 12, 6] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [9, 3] }],
    ['NE yuji', { place: ['yuji', 12, 2] }], ['SW yuji', { place: ['yuji', 7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['SW megumi', { place: ['megumi', 5, 6] }], ['NE megumi', { place: ['megumi', 14, 2] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up meg', { up: [5, 6] }], ['up meg', { up: [14, 2] }],
    ['up meg', { up: [5, 6] }], ['up meg', { up: [14, 2] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }],
    ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
  ],
  ward: [
    ['C yuji N', { place: ['yuji', 9, 3] }], ['C yuji S', { place: ['yuji', 10, 5] }], ['NW nobara (upper air)', { place: ['nobara', 5, 2] }],
    ['SE nobara (lower air)', { place: ['nobara', 14, 6] }], ['NW yuji', { place: ['yuji', 7, 2] }], ['SE yuji', { place: ['yuji', 12, 6] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [9, 3] }],
    ['NE yuji', { place: ['yuji', 12, 2] }], ['SW yuji', { place: ['yuji', 7, 6] }],
    ['NE nobara', { place: ['nobara', 14, 2] }], ['SW nobara', { place: ['nobara', 5, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up nob', { up: [14, 2] }], ['up nob', { up: [5, 6] }],
    ['NE panda', { place: ['panda', 15, 2] }], ['SE panda', { place: ['panda', 15, 6] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up nob', { up: [14, 2] }], ['up nob', { up: [5, 6] }],
    ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }], ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }],
    ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up nob', { up: [14, 2] }], ['up nob', { up: [5, 6] }],
    ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }],
  ],
  // Proof 2: a distinct roster (Megumi carries the SW and NE podiums; levelled characters)
  ward2: [
    ['C yuji N', { place: ['yuji', 9, 3] }], ['C yuji S', { place: ['yuji', 10, 5] }], ['NW nobara (upper air)', { place: ['nobara', 5, 2] }],
    ['SE nobara (lower air)', { place: ['nobara', 14, 6] }], ['NW yuji', { place: ['yuji', 7, 2] }], ['SE yuji', { place: ['yuji', 12, 6] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }],
    ['up C', { up: [10, 5] }], ['up C', { up: [10, 5] }], ['up C', { up: [9, 3] }], ['up C', { up: [9, 3] }],
    ['NE yuji', { place: ['yuji', 12, 2] }], ['SW yuji', { place: ['yuji', 7, 6] }],
    ['NE megumi', { place: ['megumi', 14, 2] }], ['SW megumi', { place: ['megumi', 5, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up meg', { up: [14, 2] }], ['up meg', { up: [5, 6] }],
    ['NE panda', { place: ['panda', 15, 2] }], ['SE panda', { place: ['panda', 15, 6] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up meg', { up: [14, 2] }], ['up meg', { up: [5, 6] }],
    ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }], ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }],
    ['up panda', { up: [15, 2] }], ['up panda', { up: [15, 6] }],
    ['up NW', { up: [7, 2] }], ['up SE', { up: [12, 6] }], ['up NE', { up: [12, 2] }], ['up SW', { up: [7, 6] }],
    ['up nob', { up: [5, 2] }], ['up nob', { up: [14, 6] }], ['up meg', { up: [14, 2] }], ['up meg', { up: [5, 6] }],
    ['up C', { up: [9, 3] }], ['up C', { up: [10, 5] }],
  ],
};

function makeBot(J, cfg) {
  cfg = Object.assign({ profile: 'clean', ablate: null, plan: null, every: 6 }, cfg || {});
  const { Balance } = J;
  const CD = J.CourtData;
  class CourtBot {
    constructor(b) {
      this.b = b; this.c = b.court; this.plan = (cfg.plan || PLANS[cfg.profile] || PLANS.clean).slice(); this.step = 0;
      this.desired = new Map(); this.log = [];
    }
    unitAt(c, r) { return this.b.unitAt(c, r); }
    cmd(name, ...a) {
      const b = this.b; let r;
      if (name === 'place') r = b.place(...a); else if (name === 'upgrade') r = b.upgrade(...a); else if (name === 'sell') r = b.sell(...a);
      else if (name === 'setTargeting') r = b.setTargeting(...a); else if (name === 'activateDomain') r = b.activateDomain(...a); else if (name === 'startWave') r = b.startWave();
      const ok = r === true || (r && r.ok);
      if (ok) { const u = a[0] && a[0].uid ? a[0] : null; this.log.push(u ? { t: this.c.tick, cmd: name, c: u.c, r: u.r, mode: a[1] } : name === 'place' ? { t: this.c.tick, cmd: name, id: a[0], c: a[1], r: a[2] } : { t: this.c.tick, cmd: name }); }
      return ok;
    }
    build() {
      const b = this.b;
      const A = cfg.ablate;
      if (A === 'h' && this.c.inTrial() && this.c.lt >= 960 && this.c.lt < 1200 && this.soldKey !== this.c.phase + ':' + this.c.reading + ':' + this.c.measure) { this.soldKey = this.c.phase + ':' + this.c.reading + ':' + this.c.measure; const u = this.unitAt(10, 5); if (u) { this.cmd('sell', u); this.plan.splice(this.step, 0, ['rebuy', { place: ['yuji', 10, 5] }], ['rebuy up', { up: [10, 5] }], ['rebuy up', { up: [10, 5] }]); } }
      while (this.step < this.plan.length) {
        const [, act] = this.plan[this.step];
        if (act.place) {
          let [id, c, r] = act.place;
          const bn = CD.benchAt(c, r);
          if (A === 'c' && !['NW', 'SE', 'C'].includes(bn.district)) { const alt = CD.BENCH.find((x) => ['NW', 'SE', 'C'].includes(x.district) && !this.unitAt(x.c, x.r) && (x.type === 'G' || J.Characters[id].place !== 'ground')); if (!alt) { this.step++; continue; } c = alt.c; r = alt.r; act.place = [id, c, r]; }
          if (A === 'j' && bn.district !== 'NW' && bn.district !== 'C') { const alt = CD.BENCH.find((x) => (x.district === 'NW' || (x.c === 9 && x.r === 3) || (x.c === 10 && x.r === 3)) && !this.unitAt(x.c, x.r) && (x.type === 'G' || J.Characters[id].place !== 'ground')); if (!alt) { this.step++; continue; } c = alt.c; r = alt.r; act.place = [id, c, r]; }
          if (A === 'l' && id === 'nobara' && ['NW', 'SW', 'NE', 'SE'].includes(bn.district)) { this.step++; continue; }
          if (A === 'm' && id === 'panda') { this.step++; continue; }
          if (this.unitAt(c, r)) { this.step++; continue; }
          const chk = b.canPlace(id, c, r);
          if (!chk.ok) { if (chk.reason === 'Not enough Yen' || /sealed|Sub Judice/.test(chk.reason)) return; this.step++; continue; }
          if (!this.cmd('place', id, c, r)) return;
          this.step++;
        } else if (act.up) {
          const u = this.unitAt(act.up[0], act.up[1]);
          if (!u) { this.step++; continue; }
          if (A === 'd' && ((u.id === 'nobara' && u.level >= 2) || (u.id === 'yuji' && u.level >= 4))) { this.step++; continue; }
          const cost = b.upgradeCost(u);
          if (cost == null) { this.step++; continue; }
          if (b.yen < cost) return;
          if (!this.cmd('upgrade', u)) return;
          this.step++;
        } else this.step++;
      }
    }
    /** desired effective targeting per tower */
    roleMode(u) {
      const c = this.c, f = this.forecast;
      if (cfg.ablate === 'a') return u.def.defaultTargeting;
      const bn = CD.benchAt(u.c, u.r);
      // Witness work: Panda and the exit bailiff keep 'first'
      if (u.id === 'panda') return 'first';
      if (cfg.ablate === 'o') return 'closest';
      if (bn && bn.district === 'E') return 'first';
      if (!c.inTrial()) return u.id === 'yuji' ? 'first' : 'first';
      return 'strongest';
    }
    manageTargeting() {
      const b = this.b, c = this.c, f = this.forecast;
      if (c.activeLaw('gag')) return;
      for (const u of b.units) {
        const want = this.roleMode(u);
        // Specular Inversion: if this pad is (or will be within the lead) submerged, declare the mirror so the effective mode is right
        let sub = u.courtSub;
        if (cfg.ablate !== 'k') {
          const k = u.c + ',' + u.r, soon = f.water.some((w) => w.pads.includes(k) && w.sub <= c.tick + cfg.every + 1 && w.until > c.tick);
          const gagSoon = f.laws.some((l) => l.kind === 'gag' && l.a > c.tick && l.a <= c.tick + 30);
          sub = soon && !(u.def.place === 'ground' && CD.benchAt(u.c, u.r).type === 'E');
          if (gagSoon) { const w2 = f.water.some((w) => w.pads.includes(k) && w.sub <= c.tick + 720 && w.until > c.tick + 360); if (w2) sub = true; }
        }
        let decl = sub ? MIRROR[want] : want;
        if (!u.def.targeting.includes(decl)) decl = u.def.targeting.includes(want) ? want : u.targeting;
        if (u.targeting !== decl) this.cmd('setTargeting', u, decl);
      }
    }
    domains() {
      const b = this.b, c = this.c, f = this.forecast;
      if (cfg.ablate === 'b') { for (const u of b.units) if (b.canActivateDomain(u)) this.cmd('activateDomain', u); return; }
      for (const u of b.units) {
        if (!b.canActivateDomain(u)) continue;
        if (!c.inTrial()) continue;
        const inBell = c.rd && c.rd.bell && c.lt >= 480 && c.lt < 720;
        const enBanc = f.laws.find((l) => l.kind === 'enBanc' && l.state === 'disclosed' && l.a - c.tick <= 40 && l.a - c.tick > 0);
        if (enBanc && c.remedy !== 'clash' && !inBell) { this.cmd('activateDomain', u); return; }
      }
    }
    tick() {
      const c = this.c, b = this.b;
      if (b.over) return;
      if (c.tick % cfg.every !== 0) return;
      this.forecast = c.forecast();
      this.build();
      this.manageTargeting();
      this.domains();
      if (b.wave === 0) this.cmd('startWave');
    }
  }
  function play(seed, team, o) {
    o = o || {};
    const T = team || ['yuji', 'panda', 'nobara', 'megumi'].map((id) => ({ id, level: 1, stars: 0 }));
    const b = new J.Battle({ mapId: 'court_of_nine', diff: 'court', team: T, seed, courtOracle: !!o.oracle });
    const bot = new CourtBot(b);
    const STEP = Balance.STEP; let n = 0; const max = o.maxTicks || 400000;
    while (!b.over && n < max) { bot.tick(); b.update(STEP); n++; if (o.onTick) o.onTick(b, bot); }
    return { b, bot, s: b.getSummary(), court: b.court.summary() };
  }
  return { CourtBot, play, PLANS };
}
module.exports = { makeBot, PLANS, MIRROR };

if (require.main === module) {
  const { loadGame } = require(path.join(__dirname, 'load.js'));
  const J = loadGame();
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
  const { play } = makeBot(J, { profile: args.profile || 'clean', ablate: args.ablate || null });
  const t0 = Date.now();
  const r = play(+(args.seed || 1));
  const cs = r.court;
  console.log(JSON.stringify({ win: r.s.victory, lives: r.s.baseHp, wave: r.s.wave, phase: cs.phase, measure: cs.measure, reading: cs.reading, mistrials: cs.mistrials, verdict: cs.verdict && cs.verdict.text, record: cs.record.map((x) => x.phase + ':' + x.signer + '/' + (x.cosigners || []).join('+') + ' r' + x.readings), cit: cs.citations, articles: cs.articles, ms: Date.now() - t0 }));
}
