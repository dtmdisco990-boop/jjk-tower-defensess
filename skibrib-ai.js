/* SKIBRIB CHALLENGE mechanics: per-enemy behaviour for the SKIBRIB roster and the four boss AIs.
   Everything here is deterministic and telegraphed: dodges run on a fixed cooldown, channels show a ring before they resolve,
   and every boss ability can be interrupted, clashed or outlasted. Hooks are called from js/sim/battle.js only for enemies
   whose definition has `skib: true`, so the story maps are untouched. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { Util, Balance } = JJK;
  const TILE = Balance.TILE;
  const E = () => JJK.Enemies;

  const say = (b, e, name, color) => b.events.emit('bossCast', { enemy: e, name, color: color || '#ff5a5a' });
  const phase = (b, e, name) => b.events.emit('bossPhase', { enemy: e, name });
  function disableIn(b, h, dur) {
    const c = [];
    b.unitsInHazard(h, c);
    let n = 0;
    for (const u of c) if (b.disableUnit(u, dur)) n++;
    return n;
  }
  /** Spawn minions owned by a boss (they vanish when it dies). off > 0 = ahead of it, off < 0 = behind. */
  function minions(b, e, type, n, off, spacing, hpMult) {
    for (let i = 0; i < n; i++) {
      const d = Util.clamp(e.dist + off + i * spacing, 0, e.pathLen - 8);
      b.spawnEnemy(type, { lane: e.lane, dist: d, wave: b.wave, owner: e.id, hpMult });
    }
  }
  function ring(b, e, r, dur, label, color, disable, extra) {
    return b.hazard(Object.assign({
      shape: 'circle', x: e.x, y: e.y, r: r * TILE, dur, label, color, owner: e.id, skib: true,
      fizzle: (bb) => !e.alive || e.stunT > 0,
      onResolve: (bb, h) => { const n = disableIn(bb, h, disable); bb.fx('impact', { x: h.x, y: h.y, r: h.r, color }); if (n) bb.events.emit('skibDisrupt', { n }); },
    }, extra || {}));
  }
  function topUnit(b) {
    let best = null;
    for (const u of b.units) if (u.disabledT <= 0 && !u.immuneDisable && (!best || u.damageDealt > best.damageDealt)) best = u;
    return best;
  }

  // ------------------------------------------------------------------ per-enemy hooks
  const Skib = {
    init(b, e) {
      e.skibHook = true; e.ccStacks = 0; e.ccDecay = 0; e.dodgeT = 0; e.auraUntil = -1;
      if (e.def.pulseCd) e.pulseT = e.def.pulseCd * 0.6;
      if (e.def.chCd) e.chT = 2.5;
      b.hasSkib = true;
    },

    /** Auras first (like hexer wards): Buff Toilets speed up and protect everything near them. */
    preTick(b) {
      const list = b.enemies, now = b.time;
      let any = false;
      for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].def.aura) { any = true; break; }
      if (!any) return;
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        if (!h.alive || !h.def.aura || h.nullT > 0) continue;
        const r = h.def.aura.r * TILE, r2 = r * r;
        for (let j = 0; j < list.length; j++) {
          const o = list[j];
          if (o !== h && o.alive && !o.boss && Util.dist2(h.x, h.y, o.x, o.y) <= r2) o.auraUntil = now + 0.2;
        }
      }
    },

    tick(b, e, dt) {
      const d = e.def;
      if (e.ccStacks > 0) { e.ccDecay -= dt; if (e.ccDecay <= 0) { e.ccStacks--; e.ccDecay = 4; } }
      if (e.dodgeT > 0) e.dodgeT -= dt;
      e.auraSpd = e.auraUntil > b.time ? 1 + E().buffToilet.aura.spd : 1;
      if (d.pulseCd && e.stunT <= 0) {
        e.pulseT -= dt;
        if (e.pulseT <= 0) {
          e.pulseT = d.pulseCd;
          const amt = Math.round((e.shieldMax || 0) * d.pulseAmt);
          const r2 = (d.pulseR * TILE) ** 2;
          let n = 0;
          for (const o of b.enemies) {
            if (o === e || !o.alive || o.boss || Util.dist2(o.x, o.y, e.x, e.y) > r2) continue;
            // a one-pulse shield (never regrows, never stacks) on trolls that have no shield of their own:
            // Shield Trolls cannot refill each other, so a shield pack is a burst check, not an infinite sponge
            if (o.def.shield) continue;
            o.shield = Math.min(amt, o.shield + amt); o.shieldMax = Math.max(o.shieldMax, amt); o.noShieldRegen = true;
            n++;
          }
          if (n) b.fx('shieldPulse', { x: e.x, y: e.y, r: d.pulseR * TILE });
        }
      }
      if (d.chCd && !e.channeling) {
        e.chT -= dt;
        if (e.chT <= 0 && e.stunT <= 0 && e.nullT <= 0) {
          const r = d.chR * TILE;
          let hit = false;
          for (const u of b.units) if (u.disabledT <= 0 && !b.isDisableImmune(u) && Util.dist2(u.x, u.y, e.x, e.y) <= r * r) { hit = true; break; }
          if (!hit) { e.chT = 0.4; return; }
          e.chT = d.chCd; e.channeling = true; e.rootT = Math.max(e.rootT, d.chTime);
          b.hazard({
            shape: 'circle', x: e.x, y: e.y, r, dur: d.chTime, label: 'DISRUPT', color: '#ff4ad0', owner: e.id, skib: true,
            fizzle: () => !e.alive || e.stunT > 0,
            onFizzle: () => { e.channeling = false; e.rootT = 0; b.fx('fizzle', { x: e.x, y: e.y }); },
            onResolve: (bb, h) => { e.channeling = false; const n = disableIn(bb, h, d.chDisable); bb.fx('impact', { x: h.x, y: h.y, r: h.r, color: '#ff4ad0' }); if (n) bb.events.emit('skibDisrupt', { n }); },
          });
        }
      }
    },

    /** Called at the top of Battle.damage(). Returns the (possibly reduced) damage; 0 = the hit was dodged. */
    dmgMod(b, e, d, o) {
      if (e.def.dodgeCd && e.dodgeT <= 0 && e.stunT <= 0 && e.invulnT <= 0) {
        e.dodgeT = e.def.dodgeCd;
        b.fx('dodge', { x: e.x, y: e.y });
        return 0;
      }
      if (e.auraUntil > b.time) d *= 1 - E().buffToilet.aura.dr;
      return d;
    },

    /** Fake Weakling: the first "death" is a costume change. Returns true when death was prevented. */
    onKill(b, e) {
      if (!e.def.fakeDeath || e.revealed) return false;
      const R = E().trollReveal;
      e.revealed = true;
      const speedMulKept = e.speed / e.def.speed;
      e.type = 'trollReveal'; e.def = R;
      e.maxHp = Math.max(1, Math.round(R.hp * (e.hpScaleUsed || 1)));
      e.hp = e.maxHp; e.shield = 0; e.shieldMax = 0;
      e.speed = R.speed * speedMulKept; e.armor = R.armor; e.size = R.size; e.leak = R.leak;
      e.yen = Math.round(R.yen * (e.yenScaleUsed || 1));
      e.stunT = 0; e.slowT = 0; e.slowAmt = 0; e.markStacks = 0; e.ccStacks = 0;
      b.stats.enemiesSeen.trollReveal = true;
      b.fx('reveal', { x: e.x, y: e.y });
      b.events.emit('skibReveal', { enemy: e });
      return true;
    },

    /** Diminishing crowd control: each stun on a SKIBRIB enemy shortens the next one (decays one stack per 4s). */
    ccMul(e) { return Math.pow(e.boss ? 0.5 : 0.65, e.ccStacks || 0); },
    ccApplied(e) { e.ccStacks = (e.ccStacks || 0) + 1; e.ccDecay = 4; },
  };
  JJK.Skib = Skib;

  // ------------------------------------------------------------------ bosses
  const AI = JJK.BossAI;

  // Boss 1: THE WARNING. Two phases with a burst window between them.
  AI.skibPrime = {
    init(b, e) { const a = e.ai; a.p = 1; a.sumT = 6; a.discT = 6; },
    update(b, e, dt) {
      const a = e.ai, r = e.hp / e.maxHp;
      if (a.p === 1 && r <= 0.5) {
        a.p = 1.5; e.invulnT = 2.5; e.rootT = 2.5;
        phase(b, e, 'THE FLUSH');
        b.schedule(2.5, () => {
          if (!e.alive) return;
          a.p = 2; b.vulnerable(e, 0.4, 4);
          e.armor = 0; e.cursedRes = 0.45; e.speedMul = 1.45; e.regen = 0.015;
          e.shield += Math.round(e.maxHp * 0.18); e.shieldMax = Math.max(e.shieldMax, e.shield); e.noShieldRegen = true;
          phase(b, e, 'EXPOSED! +40% DAMAGE');
          b.schedule(4.2, () => { if (e.alive) phase(b, e, 'PHASE 2: CURSED RESISTANCE'); });
          minions(b, e, 'buffToilet', 1, -40, 0);
        });
      }
      if (a.p === 1.5 || e.stunT > 0) return;
      a.sumT -= dt;
      if (a.sumT <= 0) {
        a.sumT = a.p === 1 ? 8 : 9;
        say(b, e, 'Flush x3', '#9ad8ff');
        b.hazard({ shape: 'circle', x: e.x, y: e.y, r: TILE * 1.1, dur: 1.0, label: 'FLUSH', color: '#9ad8ff', owner: e.id, skib: true, fizzle: () => !e.alive,
          onResolve: (bb) => { if (e.alive) minions(bb, e, 'speedToilet', 3, 50, 26); } });
      }
      if (a.p === 2) {
        a.discT -= dt;
        if (a.discT <= 0) { a.discT = 10; say(b, e, 'Toilet Static', '#ff4ad0'); ring(b, e, 2.6, 1.6, 'TOILET STATIC', '#ff4ad0', 4); }
      }
    },
  };

  // Boss 2: THE RUN KILLER. Adapts to your damage mix, builds CC resistance, enrages, and charges unless clashed.
  AI.skibDemon = {
    init(b, e) {
      const a = e.ai; a.p = 1; a.win = {}; a.res = null; a.evalT = 5; a.escT = 6; a.discT = 7; a.runT = 4; a.splitT = 6; a.chargeT = 0; a.chargeCd = 0;
      a.onHit = (bb, ee, dealt, o) => { const t = (o && o.type) || 'phys'; a.win[t] = (a.win[t] || 0) + dealt; };
      a.mod = (bb, ee, o) => { const t = (o && o.type) || 'phys'; return a.res && t === a.res && ee.nullT <= 0 ? 0.5 : 1; };
      e.ai.onHit = a.onHit; e.ai.mod = a.mod;
    },
    update(b, e, dt) {
      const a = e.ai, r = e.hp / e.maxHp;
      // adaptation window
      a.evalT -= dt;
      if (a.evalT <= 0) {
        a.evalT = 5;
        let tot = 0, best = null, bv = 0;
        for (const k of Object.keys(a.win)) { tot += a.win[k]; if (a.win[k] > bv) { bv = a.win[k]; best = k; } }
        const next = tot > 0 && bv / tot >= 0.6 ? best : null;
        if (next !== a.res) { a.res = next; phase(b, e, next ? 'ADAPTED: ' + next.toUpperCase() + ' -50%' : 'ADAPTATION BROKEN'); }
        a.win = {};
      }
      if (a.p === 1 && r <= 0.66) {
        a.p = 2; e.shield += Math.round(e.maxHp * 0.15); e.shieldMax = Math.max(e.shieldMax, e.shield); e.noShieldRegen = true; e.speedMul = 1.25;
        phase(b, e, 'PHASE 2: THE HUNT');
      }
      if (a.p === 2 && r <= 0.33) {
        a.p = 3; e.speedMul = 1.55; e.regen = 0.02;
        phase(b, e, 'PHASE 3: ENRAGED');
        minions(b, e, 'buffToilet', 1, -30, 0);
        a.chargeCd = 0.01;
      }
      // CC resistance build-up: three stuns in quick succession = immune for 6s
      if (e.ccStacks >= 3 && e.ccImmuneT < 5.9) { e.ccImmuneT = 6; e.ccStacks = 0; phase(b, e, 'CC IMMUNE'); }
      if (a.chargeT > 0) { a.chargeT -= dt; if (a.chargeT <= 0) e.speedMul = 1.55; }
      if (e.stunT > 0) return;
      if (a.p === 1) {
        a.escT -= dt;
        if (a.escT <= 0) { a.escT = 12; say(b, e, 'Shield Escort', '#5a8cff'); minions(b, e, 'shieldTroll', 2, -24, -26); }
      } else {
        a.discT -= dt;
        if (a.discT <= 0) { a.discT = 9; say(b, e, 'Demon Static', '#ff4ad0'); ring(b, e, 2.6, 1.6, 'DEMON STATIC', '#ff4ad0', 4); }
        a.runT -= dt;
        if (a.runT <= 0) { a.runT = a.p === 3 ? 9 : 8; if (a.p === 3) minions(b, e, 'splitter', 1, 40, 0); else minions(b, e, 'speedToilet', 3, -20, -24); }
      }
      if (a.p === 3 && a.chargeCd > 0) {
        a.chargeCd -= dt;
        if (a.chargeCd <= 0) {
          a.chargeCd = 22;
          say(b, e, 'DEMON CHARGE', '#6aff4a');
          b.hazard({ shape: 'circle', x: e.x, y: e.y, r: TILE * 1.4, dur: 4, label: 'DEMON CHARGE', hint: 'Domain clash: have a Domain active when it lands', color: '#6aff4a', owner: e.id, skib: true, fizzle: () => !e.alive,
            onResolve: (bb) => {
              if (!e.alive) return;
              if (bb.domain) { e.stunT = Math.max(e.stunT, 4); bb.fx('clash', { x: e.x, y: e.y }); phase(bb, e, 'DOMAIN CLASH! STUNNED'); }
              else { a.chargeT = 6; e.speedMul = 3.1; phase(bb, e, 'CHARGE!'); }
            } });
        }
      }
    },
  };

  // Wave 70: THE TROLL KING (the fake final boss).
  AI.skibKing = {
    init(b, e) { const a = e.ai; a.escT = 5; a.guard = null; a.guardT = 0; a.ran = false; },
    update(b, e, dt) {
      const a = e.ai, r = e.hp / e.maxHp;
      if (!a.guard && r <= 0.6) {
        a.guard = [];
        const before = new Set(b.enemies.map((x) => x.id));
        minions(b, e, 'shieldTroll', 2, -20, 44, 3.5);
        for (const x of b.enemies) if (!before.has(x.id)) a.guard.push(x);
        e.invulnT = 12; a.guardT = 12;
        phase(b, e, 'CROWN GUARD: KILL THE ROYAL GUARDS');
      }
      if (a.guard && a.guardT > 0) {
        a.guardT -= dt;
        if (a.guard.every((x) => !x.alive) || a.guardT <= 0) { a.guardT = 0; e.invulnT = 0; phase(b, e, 'GUARD DOWN'); }
      }
      if (!a.ran && r <= 0.25) { a.ran = true; e.speedMul = 1.6; phase(b, e, 'THE KING RUNS'); }
      if (e.stunT > 0) return;
      a.escT -= dt;
      if (a.escT <= 0) { a.escT = 12; say(b, e, 'Royal Escort', '#ffd23a'); minions(b, e, 'tankTroll', 2, -30, -40); }
    },
  };

  // Wave 75: THE SKIBRIB ABOMINATION. Four phases.
  AI.skibAbom = {
    init(b, e) {
      const a = e.ai; a.p = 1; a.escT = 6; a.volT = 4; a.disT = 9; a.orbT = 5; a.ringT = 5; a.cycT = 0; a.cyc = 0; a.splitT = 6; a.runT = 2;
      a.mod = (bb, ee) => (a.p === 4 ? 1.2 : 1);
      e.ai.mod = a.mod;
    },
    update(b, e, dt) {
      const a = e.ai, r = e.hp / e.maxHp;
      if (a.p === 1 && r <= 0.7) { a.p = 2; e.speedMul = 1.35; phase(b, e, 'PHASE 2: IT SPEEDS UP'); }
      if (a.p === 2 && r <= 0.4) {
        a.p = 3; e.shield += Math.round(e.maxHp * 0.12); e.shieldMax = Math.max(e.shieldMax, e.shield); e.noShieldRegen = true; a.cycT = 0.01;
        phase(b, e, 'PHASE 3: MAXIMUM PRESSURE');
      }
      if (a.p === 3 && r <= 0.15) {
        a.p = 4; e.speedMul = 1.9; e.armorBonus = 0; e.cursedRes = 0; e.armor = 0.1;
        phase(b, e, 'ENRAGE');
        b.events.emit('skibEnrage', { enemy: e });
      }
      const half = a.p === 4 ? 0.5 : 1;
      // resistance cycle (phase 3 only)
      if (a.p === 3) {
        a.cycT -= dt;
        if (a.cycT <= 0) {
          a.cycT = 7; a.cyc ^= 1;
          if (a.cyc) { e.armorBonus = 0.6; e.cursedRes = 0; say(b, e, 'ARMORED: -60% physical', '#c8d0e0'); }
          else { e.armorBonus = 0; e.cursedRes = 0.6; say(b, e, 'WARDED: -60% cursed', '#c040ff'); }
        }
      }
      if (e.stunT > 0) return;
      if (a.p === 1) {
        a.escT -= dt;
        if (a.escT <= 0) { a.escT = 11; say(b, e, 'Abominable Escort', '#c040ff'); minions(b, e, 'tankTroll', 2, -30, -40); minions(b, e, 'shieldTroll', 1, -110, 0); }
      }
      if (a.p >= 2) {
        a.volT -= dt;
        if (a.volT <= 0) { a.volT = 8 * half; minions(b, e, a.p === 4 ? 'trollRunner' : 'speedToilet', 4, 50, 26); }
        a.orbT -= dt;
        if (a.orbT <= 0) {
          a.orbT = 9 * half;
          const u = topUnit(b);
          if (u) {
            const hp0 = e.hp + e.shield, need = e.maxHp * 0.025;
            say(b, e, 'VOID ORB', '#c040ff');
            b.hazard({ shape: 'circle', x: u.x, y: u.y, r: TILE * 0.6, dur: 1.4, label: 'VOID ORB', color: '#c040ff', owner: e.id, skib: true, target: u.uid,
              fizzle: () => !e.alive || e.stunT > 0 || hp0 - (e.hp + e.shield) >= need,
              onFizzle: (bb) => { if (e.alive) say(bb, e, 'ORB INTERRUPTED', '#4ade80'); },
              onResolve: (bb) => { const t = bb.getUnit(u.uid); if (t) bb.disableUnit(t, 5); bb.fx('impact', { x: u.x, y: u.y, r: TILE * 0.8, color: '#c040ff' }); } });
          }
        }
      }
      if (a.p === 2) {
        a.disT -= dt;
        if (a.disT <= 0) { a.disT = 16; minions(b, e, 'disruptor', 1, 60, 0); }
      }
      if (a.p >= 3) {
        a.ringT -= dt;
        if (a.ringT <= 0) { a.ringT = 8 * half; say(b, e, 'Abominable Static', '#ff4ad0'); ring(b, e, 2.6, 1.6, 'STATIC', '#ff4ad0', 4); }
        a.splitT -= dt;
        if (a.splitT <= 0 && a.p === 3) { a.splitT = 10; minions(b, e, 'splitter', 2, 40, 30); }
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
