/* Combat synchronisation: turns the simulation's own events into animation triggers, and predicts wind-ups from the unit's
   attack cooldown so the anticipation plays *before* the hit lands. Strictly read-only: it subscribes to battle.events,
   reads unit/enemy fields and calls the pure query methods pickTarget/spdMul; it never writes to the battle. */

const EV = 64; // fixed event ring (events are rare; no per-frame allocation)

export class CombatSync {
  constructor(battle, handles) {
    this.b = battle; this.handles = handles;
    this.ring = Array.from({ length: EV }, () => ({ type: '', u: null, x: 0, y: 0, t: 0 }));
    this.head = 0; this.n = 0;
    this.lastHits = new Map(); // uid -> u.hits at its last main attack (a slash with unchanged hits is the Divergent echo)
    this.stats = { punch: 0, blackflash: 0, follow: 0, placed: 0, upgraded: 0, sold: 0, dropped: 0 };
    const on = (name, fn) => battle.events.on(name, (d) => { try { fn(d); } catch (e) { /* never let the view break the sim */ } });
    this.unsub = [
      on('fx', (d) => this.onFx(d)),
      on('unitPlaced', (d) => d && d.unit && this.handles(d.unit) && this.push('placed', d.unit, d.unit.x, d.unit.y)),
      on('unitUpgraded', (d) => d && d.unit && this.handles(d.unit) && this.push('upgraded', d.unit, d.unit.x, d.unit.y)),
      on('unitSold', (d) => d && d.unit && this.handles(d.unit) && this.push('sold', d.unit, d.unit.x, d.unit.y)),
    ];
  }
  push(type, u, x, y) {
    if (this.n >= EV) { this.stats.dropped++; return; }
    const e = this.ring[(this.head + this.n++) % EV];
    e.type = type; e.u = u; e.x = x; e.y = y; e.t = this.b.time;
    if (this.stats[type] !== undefined) this.stats[type]++;
  }
  onFx(d) {
    if (!d || d.type !== 'slash') return;
    const u = this.unitAt(d.x1, d.y1); if (!u) return;
    const main = this.lastHits.get(u.uid) !== u.hits;
    if (main) this.lastHits.set(u.uid, u.hits);
    this.push(main ? (d.bf ? 'blackflash' : 'punch') : 'follow', u, d.x2, d.y2);
  }
  unitAt(x, y) {
    const us = this.b.units;
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.removed && u.x === x && u.y === y && this.handles(u)) return u; }
    return null;
  }
  /** Calls fn(event) for every queued event in order, then empties the queue. */
  drain(fn) {
    while (this.n > 0) { const e = this.ring[this.head]; this.head = (this.head + 1) % EV; this.n--; fn(e); e.u = null; }
  }
  /** Seconds (sim time) until this unit's next attack, whether it will be a Black Flash, and the target it will pick. */
  predict(u, out) {
    const b = this.b;
    let m = 1; try { m = b.spdMul(u); } catch (e) { m = 1; }
    out.t = u.cdT > 0 ? u.cdT / m : 0;
    out.interval = (u.baseSpa || 0.5) / m;
    const f = u.flags || {};
    out.bf = !!(f.bfEvery && (u.hits + 1) % f.bfEvery === 0);
    let t = null; try { t = b.pickTarget(u); } catch (e) { t = null; }
    out.target = t;
    return out;
  }
  dispose() { for (const f of this.unsub) f(); this.unsub.length = 0; this.n = 0; this.lastHits.clear(); this.b = null; }
}
